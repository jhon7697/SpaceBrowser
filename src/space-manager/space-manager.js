/**
 * SpaceBrowser — Space Manager
 *
 * Core module for creating, deleting, listing, and switching browsing spaces.
 * Each space maps to a Firefox contextual identity (container) and holds a
 * unique fingerprint profile for anti-fingerprinting.
 *
 * Depends on: SpaceStore (space-store.js), FingerprintGenerator (fingerprint-generator.js)
 */

/**
 * Generate a UUID v4 string.
 * Uses crypto.getRandomValues for secure randomness.
 * @returns {string} UUID v4 (e.g., "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
 */
function generateUUID() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version (4) and variant (10xx) bits per RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Available colors for Firefox containers
 * These are the only colors Firefox accepts for contextualIdentities.
 */
const CONTAINER_COLORS = [
  'blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple',
  'toolbar',
];

/**
 * Available icons for Firefox containers
 */
const CONTAINER_ICONS = [
  'fingerprint', 'briefcase', 'dollar', 'cart', 'circle', 'gift', 'vacation',
  'food', 'fruit', 'pet', 'tree', 'chill', 'fence',
];

/**
 * SpaceManager — high-level API for managing spaces.
 */
const SpaceManager = {
  /**
   * Create a new space with optional name, color, and icon.
   * Generates a UUID, creates a Firefox container, generates a fingerprint profile,
   * and persists the space config.
   *
   * @param {Object} options
   * @param {string} [options.name] — display name (default: "Space N")
   * @param {string} [options.color] — container color (default: random)
   * @param {string} [options.icon] — container icon (default: "fingerprint")
   * @returns {Promise<Object>} the created space config
   */
  async create({ name, color, icon } = {}) {
    const spaceId = generateUUID();
    const spaces = await SpaceStore.getAll();
    const spaceCount = Object.keys(spaces).length;

    // Defaults
    const spaceName = name || `Space ${spaceCount + 1}`;
    const spaceColor = color || CONTAINER_COLORS[spaceCount % CONTAINER_COLORS.length];
    const spaceIcon = icon || 'fingerprint';

    // Create Firefox container (contextual identity)
    const container = await browser.contextualIdentities.create({
      name: `🚀 ${spaceName}`,
      color: spaceColor,
      icon: spaceIcon,
    });

    // Generate unique fingerprint profile for this space
    const fingerprint = FingerprintGenerator.generate(spaceId);

    // Build space config
    const space = {
      id: spaceId,
      name: spaceName,
      color: spaceColor,
      icon: spaceIcon,
      cookieStoreId: container.cookieStoreId,
      fingerprint,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    // Persist
    await SpaceStore.save(space);

    // If this is the first space, make it active
    if (spaceCount === 0) {
      await SpaceStore.setActiveSpaceId(spaceId);
    }

    console.log(`[SpaceManager] Created space "${spaceName}" (${spaceId}) → container ${container.cookieStoreId}`);
    return space;
  },

  /**
   * Delete a space — removes the container, clears all associated data,
   * and removes the space config from storage.
   *
   * @param {string} spaceId
   * @returns {Promise<boolean>} true if deleted
   */
  async delete(spaceId) {
    const space = await SpaceStore.get(spaceId);
    if (!space) {
      console.warn(`[SpaceManager] Space not found: ${spaceId}`);
      return false;
    }

    // Clear all browsing data for this container
    try {
      await browser.browsingData.removeCookies({
        cookieStoreId: space.cookieStoreId,
      });
    } catch (e) {
      // browsingData.removeCookies with cookieStoreId may not be supported on all versions
      console.warn(`[SpaceManager] Could not clear cookies for container: ${e.message}`);
    }

    // Remove the Firefox container itself
    try {
      await browser.contextualIdentities.remove(space.cookieStoreId);
    } catch (e) {
      console.warn(`[SpaceManager] Could not remove container: ${e.message}`);
    }

    // Close all tabs in this container
    try {
      const tabs = await browser.tabs.query({ cookieStoreId: space.cookieStoreId });
      if (tabs.length > 0) {
        await browser.tabs.remove(tabs.map((t) => t.id));
      }
    } catch (e) {
      console.warn(`[SpaceManager] Could not close tabs: ${e.message}`);
    }

    // Remove from storage
    await SpaceStore.remove(spaceId);

    console.log(`[SpaceManager] Deleted space "${space.name}" (${spaceId})`);
    return true;
  },

  /**
   * List all spaces as an array sorted by creation time.
   * @returns {Promise<Array<Object>>}
   */
  async list() {
    const spaces = await SpaceStore.getAll();
    return Object.values(spaces).sort((a, b) => a.createdAt - b.createdAt);
  },

  /**
   * Switch the active space. New tabs will open in this space's container.
   * @param {string} spaceId
   * @returns {Promise<Object>} the activated space
   */
  async switchTo(spaceId) {
    const space = await SpaceStore.get(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    await SpaceStore.setActiveSpaceId(spaceId);

    // Update last used timestamp
    space.lastUsedAt = Date.now();
    await SpaceStore.save(space);

    console.log(`[SpaceManager] Switched to space "${space.name}" (${spaceId})`);
    return space;
  },

  /**
   * Get the currently active space config
   * @returns {Promise<Object|null>}
   */
  async getActive() {
    const activeId = await SpaceStore.getActiveSpaceId();
    if (!activeId) return null;
    return SpaceStore.get(activeId);
  },

  /**
   * Open a new tab in a specific space's container
   * @param {string} spaceId
   * @param {string} [url] — URL to open (default: new tab)
   * @returns {Promise<Object>} the created tab
   */
  async openTab(spaceId, url) {
    const space = await SpaceStore.get(spaceId);
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }

    const tabOptions = {
      cookieStoreId: space.cookieStoreId,
    };
    if (url) {
      tabOptions.url = url;
    }

    const tab = await browser.tabs.create(tabOptions);

    // Update last used
    space.lastUsedAt = Date.now();
    await SpaceStore.save(space);

    return tab;
  },

  /**
   * Get the number of open tabs in each space
   * @returns {Promise<Object>} map of spaceId → tab count
   */
  async getTabCounts() {
    const spaces = await SpaceStore.getAll();
    const counts = {};

    for (const [spaceId, space] of Object.entries(spaces)) {
      try {
        const tabs = await browser.tabs.query({ cookieStoreId: space.cookieStoreId });
        counts[spaceId] = tabs.length;
      } catch {
        counts[spaceId] = 0;
      }
    }
    return counts;
  },

  /**
   * Find which space a tab belongs to (by its cookieStoreId)
   * @param {number} tabId
   * @returns {Promise<Object|null>} space config or null
   */
  async getSpaceForTab(tabId) {
    const tab = await browser.tabs.get(tabId);
    if (!tab.cookieStoreId) return null;

    const spaces = await SpaceStore.getAll();
    for (const space of Object.values(spaces)) {
      if (space.cookieStoreId === tab.cookieStoreId) {
        return space;
      }
    }
    return null;
  },

  /**
   * Rename a space
   * @param {string} spaceId
   * @param {string} newName
   * @returns {Promise<Object>} updated space
   */
  async rename(spaceId, newName) {
    const space = await SpaceStore.get(spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);

    space.name = newName;
    await SpaceStore.save(space);

    // Update the Firefox container name too
    try {
      await browser.contextualIdentities.update(space.cookieStoreId, {
        name: `🚀 ${newName}`,
      });
    } catch (e) {
      console.warn(`[SpaceManager] Could not update container name: ${e.message}`);
    }

    return space;
  },

  /**
   * Export a single space's config (for sharing/backup)
   * @param {string} spaceId
   * @returns {Promise<Object>}
   */
  async exportSpace(spaceId) {
    const space = await SpaceStore.get(spaceId);
    if (!space) throw new Error(`Space not found: ${spaceId}`);

    return {
      id: space.id,
      name: space.name,
      color: space.color,
      icon: space.icon,
      fingerprint: space.fingerprint,
      createdAt: space.createdAt,
    };
  },

  /**
   * Import a space from an exported config.
   * Creates a new container and adopts the fingerprint profile.
   * @param {Object} exported — previously exported space config
   * @returns {Promise<Object>} the imported space
   */
  async importSpace(exported) {
    if (!exported || !exported.id || !exported.fingerprint) {
      throw new Error('Invalid space export data');
    }

    // Check for duplicate
    const existing = await SpaceStore.get(exported.id);
    if (existing) {
      throw new Error(`Space with ID ${exported.id} already exists`);
    }

    // Create new container
    const container = await browser.contextualIdentities.create({
      name: `🚀 ${exported.name || 'Imported Space'}`,
      color: exported.color || 'purple',
      icon: exported.icon || 'fingerprint',
    });

    const space = {
      id: exported.id,
      name: exported.name || 'Imported Space',
      color: exported.color || 'purple',
      icon: exported.icon || 'fingerprint',
      cookieStoreId: container.cookieStoreId,
      fingerprint: exported.fingerprint,
      createdAt: exported.createdAt || Date.now(),
      lastUsedAt: Date.now(),
    };

    await SpaceStore.save(space);
    console.log(`[SpaceManager] Imported space "${space.name}" (${space.id})`);
    return space;
  },
};

// Export for background script
if (typeof globalThis !== 'undefined') {
  globalThis.SpaceManager = SpaceManager;
}
