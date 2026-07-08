/**
 * SpaceBrowser — Background Script
 *
 * Central coordinator that:
 * 1. Initializes the extension and creates a default space on first run
 * 2. Intercepts new tab creation to route tabs into the active space
 * 3. Responds to fingerprint profile requests from content scripts
 * 4. Modifies HTTP headers (User-Agent) per space
 * 5. Handles messages from the sidebar UI
 */

// Load dependencies (loaded via manifest background.scripts order)
// SpaceStore, SpaceManager, FingerprintGenerator are on globalThis

/**
 * ═══════════════════════════════════════════════════════════════
 * INITIALIZATION
 * ═══════════════════════════════════════════════════════════════
 */
async function init() {
  console.log('[SpaceBrowser] Initializing...');

  // Check if this is first run
  const spaces = await SpaceStore.getAll();
  if (Object.keys(spaces).length === 0) {
    console.log('[SpaceBrowser] First run — creating default space');
    await SpaceManager.create({ name: 'Default', color: 'blue', icon: 'circle' });
  }

  const activeSpace = await SpaceManager.getActive();
  console.log(`[SpaceBrowser] Active space: ${activeSpace ? activeSpace.name : 'none'}`);

  // Set up browser action to toggle sidebar
  browser.browserAction.onClicked.addListener(() => {
    browser.sidebarAction.toggle();
  });

  console.log('[SpaceBrowser] Ready.');
}

init().catch((err) => console.error('[SpaceBrowser] Init failed:', err));

/**
 * ═══════════════════════════════════════════════════════════════
 * TAB ROUTING — Force new tabs into the active space's container
 * ═══════════════════════════════════════════════════════════════
 */
browser.tabs.onCreated.addListener(async (tab) => {
  try {
    const settings = await SpaceStore.getSettings();
    if (!settings.openNewTabInActiveSpace) return;

    const activeSpace = await SpaceManager.getActive();
    if (!activeSpace) return;

    // Only redirect if the tab is in the default container (no container)
    // and not already in a space container
    if (tab.cookieStoreId === 'firefox-default') {
      // Close the default tab and open in the correct container
      const url = tab.url || tab.pendingUrl || 'about:newtab';

      // Don't redirect privileged URLs
      if (url.startsWith('about:') || url.startsWith('moz-extension:')) return;

      await browser.tabs.remove(tab.id);
      await browser.tabs.create({
        url,
        cookieStoreId: activeSpace.cookieStoreId,
        index: tab.index,
        active: tab.active,
      });
    }
  } catch (e) {
    // Ignore errors for tabs that were already closed
    if (!e.message.includes('Invalid tab ID')) {
      console.warn('[SpaceBrowser] Tab routing error:', e.message);
    }
  }
});

/**
 * ═══════════════════════════════════════════════════════════════
 * FINGERPRINT DELIVERY — Respond to content script requests
 * ═══════════════════════════════════════════════════════════════
 */

// Cache: cookieStoreId → fingerprint profile
const fingerprintCache = new Map();

browser.runtime.onMessage.addListener(async (message, sender) => {
  // ── Content script requesting fingerprint for its tab ──
  if (message.type === 'GET_FINGERPRINT') {
    if (!sender.tab) return null;

    const cookieStoreId = sender.tab.cookieStoreId;
    if (!cookieStoreId || cookieStoreId === 'firefox-default') return null;

    // Check cache
    if (fingerprintCache.has(cookieStoreId)) {
      return fingerprintCache.get(cookieStoreId);
    }

    // Find the space for this container
    const spaces = await SpaceStore.getAll();
    for (const space of Object.values(spaces)) {
      if (space.cookieStoreId === cookieStoreId) {
        fingerprintCache.set(cookieStoreId, space.fingerprint);
        return space.fingerprint;
      }
    }
    return null;
  }

  // ── Sidebar UI messages ──
  if (message.type === 'SPACE_CREATE') {
    return SpaceManager.create(message.options || {});
  }

  if (message.type === 'SPACE_DELETE') {
    fingerprintCache.delete(message.cookieStoreId);
    return SpaceManager.delete(message.spaceId);
  }

  if (message.type === 'SPACE_LIST') {
    return SpaceManager.list();
  }

  if (message.type === 'SPACE_SWITCH') {
    return SpaceManager.switchTo(message.spaceId);
  }

  if (message.type === 'SPACE_OPEN_TAB') {
    return SpaceManager.openTab(message.spaceId, message.url);
  }

  if (message.type === 'SPACE_RENAME') {
    return SpaceManager.rename(message.spaceId, message.name);
  }

  if (message.type === 'SPACE_EXPORT') {
    return SpaceManager.exportSpace(message.spaceId);
  }

  if (message.type === 'SPACE_IMPORT') {
    return SpaceManager.importSpace(message.data);
  }

  if (message.type === 'SPACE_GET_ACTIVE') {
    return SpaceManager.getActive();
  }

  if (message.type === 'SPACE_TAB_COUNTS') {
    return SpaceManager.getTabCounts();
  }

  if (message.type === 'CACHE_CLEAR') {
    fingerprintCache.clear();
    return true;
  }

  return null;
});

/**
 * ═══════════════════════════════════════════════════════════════
 * HTTP HEADER MODIFICATION — Spoof User-Agent per space
 * ═══════════════════════════════════════════════════════════════
 */

// Map cookieStoreId → User-Agent string
const uaCache = new Map();

async function getUAForContainer(cookieStoreId) {
  if (uaCache.has(cookieStoreId)) return uaCache.get(cookieStoreId);

  const spaces = await SpaceStore.getAll();
  for (const space of Object.values(spaces)) {
    if (space.cookieStoreId === cookieStoreId) {
      const ua = space.fingerprint?.navigator?.userAgent;
      if (ua) {
        uaCache.set(cookieStoreId, ua);
        return ua;
      }
    }
  }
  return null;
}

browser.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    if (!details.cookieStoreId || details.cookieStoreId === 'firefox-default') {
      return {};
    }

    const ua = await getUAForContainer(details.cookieStoreId);
    if (!ua) return {};

    const headers = details.requestHeaders.map((header) => {
      if (header.name.toLowerCase() === 'user-agent') {
        return { name: header.name, value: ua };
      }
      return header;
    });

    return { requestHeaders: headers };
  },
  { urls: ['<all_urls>'] },
  ['blocking', 'requestHeaders']
);

/**
 * ═══════════════════════════════════════════════════════════════
 * CLEANUP — When a container is removed externally
 * ═══════════════════════════════════════════════════════════════
 */
browser.contextualIdentities.onRemoved.addListener(async (changeInfo) => {
  const removedId = changeInfo.contextualIdentity.cookieStoreId;
  fingerprintCache.delete(removedId);
  uaCache.delete(removedId);

  // Clean up our space data if it matches
  const spaces = await SpaceStore.getAll();
  for (const [spaceId, space] of Object.entries(spaces)) {
    if (space.cookieStoreId === removedId) {
      await SpaceStore.remove(spaceId);
      console.log(`[SpaceBrowser] Cleaned up orphaned space: ${space.name}`);
    }
  }
});
