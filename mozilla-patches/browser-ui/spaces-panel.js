/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * SpacesPanel.sys.mjs — Native browser chrome panel for managing Spaces.
 *
 * This is the equivalent of the Bookmarks panel or History panel — a first-class
 * browser UI component that integrates with the toolbar and provides full
 * space management capabilities.
 *
 * Location in Firefox source: browser/components/spaces/SpacesPanel.sys.mjs
 *
 * This module manages:
 *   - Rendering the spaces list in the panel
 *   - Create/delete/rename/switch space operations
 *   - Right-click context menu
 *   - Drag-and-drop reordering (future)
 *   - Import/export functionality
 *   - Tab count tracking per space
 *
 * It communicates with SpaceIdentityService for data and observes
 * space change notifications to keep the UI in sync.
 */

// =============================================================================
// Imports
// =============================================================================

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SpaceIdentityService:
    "resource://gre/modules/SpaceIdentityService.sys.mjs",
});

// =============================================================================
// SpacesPanel
// =============================================================================

export class SpacesPanel {
  /** @type {Window} The browser chrome window this panel belongs to */
  #window = null;

  /** @type {Document} The chrome document */
  #document = null;

  /** @type {Element} The panel element (XUL <panel>) */
  #panel = null;

  /** @type {Element} The space list container */
  #listContainer = null;

  /** @type {boolean} Whether the panel has been initialized */
  #initialized = false;

  /** @type {Map<string, number>} Space UUID → tab count cache */
  #tabCounts = new Map();

  // ---------------------------------------------------------------------------
  // Construction & Initialization
  // ---------------------------------------------------------------------------

  /**
   * @param {Window} window — the browser chrome window (not a content window)
   */
  constructor(window) {
    this.#window = window;
    this.#document = window.document;
  }

  /**
   * Initialize the panel. Call once after the browser window is fully loaded.
   * Sets up DOM references, event listeners, and observers.
   */
  async init() {
    if (this.#initialized) return;

    // Ensure SpaceIdentityService is ready
    await lazy.SpaceIdentityService.init();

    // Get DOM references from spaces-panel.xhtml (loaded via overlay)
    this.#panel = this.#document.getElementById("spacesPanel");
    this.#listContainer = this.#document.getElementById("spacesPanelList");

    if (!this.#panel || !this.#listContainer) {
      console.error("SpacesPanel: Required DOM elements not found. " +
                     "Ensure spaces-panel.xhtml is loaded.");
      return;
    }

    // Set up event listeners
    this.#setupEventListeners();

    // Observe space changes
    this.#setupObservers();

    // Initial render
    this.#render();

    // Start tracking tab counts
    this.#updateTabCounts();

    this.#initialized = true;
    console.log("SpacesPanel initialized");
  }

  // ---------------------------------------------------------------------------
  // Panel Visibility
  // ---------------------------------------------------------------------------

  /**
   * Open/toggle the Spaces panel, anchored to the toolbar button.
   *
   * @param {Element} anchorElement — the toolbar button to anchor to
   */
  toggle(anchorElement) {
    if (!this.#initialized) {
      console.warn("SpacesPanel: Not initialized yet");
      return;
    }

    if (this.#panel.state === "open") {
      this.#panel.hidePopup();
    } else {
      // Re-render before showing (ensures fresh data)
      this.#render();

      // Open as a popup panel anchored to the button
      this.#panel.openPopup(anchorElement, "bottomleft topleft", 0, 0, false);
    }
  }

  /**
   * Close the panel if open.
   */
  close() {
    if (this.#panel && this.#panel.state === "open") {
      this.#panel.hidePopup();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render the complete spaces list.
   * Called on init, when spaces change, and before panel opens.
   */
  #render() {
    if (!this.#listContainer) return;

    const spaces = lazy.SpaceIdentityService.list();
    const activeId = lazy.SpaceIdentityService.activeSpaceId;

    // Clear existing content
    while (this.#listContainer.firstChild) {
      this.#listContainer.firstChild.remove();
    }

    if (spaces.length === 0) {
      // Empty state
      const emptyMsg = this.#createElement("div", {
        class: "spaces-empty-message",
      });
      emptyMsg.textContent = "No Spaces yet. Create one to get started!";
      this.#listContainer.appendChild(emptyMsg);
      return;
    }

    // Render each space as a list item
    for (const space of spaces) {
      const item = this.#renderSpaceItem(space, space.id === activeId);
      this.#listContainer.appendChild(item);
    }
  }

  /**
   * Render a single space list item.
   *
   * Structure:
   *   <div class="spaces-item [active]">
   *     <span class="spaces-item-dot" style="background: COLOR" />
   *     <span class="spaces-item-name">NAME</span>
   *     <span class="spaces-item-tab-count">N tabs</span>
   *     <button class="spaces-item-menu-btn">⋮</button>
   *   </div>
   *
   * @param {object} space — Space data object
   * @param {boolean} isActive — whether this is the current active space
   * @returns {Element}
   */
  #renderSpaceItem(space, isActive) {
    const item = this.#createElement("div", {
      class: `spaces-item${isActive ? " active" : ""}`,
      "data-space-id": space.id,
      "data-user-context-id": space.userContextId,
    });

    // Color dot
    const dot = this.#createElement("span", {
      class: "spaces-item-dot",
    });
    dot.style.backgroundColor = this.#getColorValue(space.color);
    item.appendChild(dot);

    // Icon
    const icon = this.#createElement("span", {
      class: `spaces-item-icon identity-icon-${space.icon}`,
    });
    item.appendChild(icon);

    // Name
    const name = this.#createElement("span", {
      class: "spaces-item-name",
    });
    name.textContent = space.name;
    item.appendChild(name);

    // Tab count
    const tabCount = this.#tabCounts.get(space.id) || 0;
    const count = this.#createElement("span", {
      class: "spaces-item-tab-count",
    });
    count.textContent = `${tabCount} tab${tabCount !== 1 ? "s" : ""}`;
    item.appendChild(count);

    // Menu button (three dots)
    const menuBtn = this.#createElement("button", {
      class: "spaces-item-menu-btn",
      title: "Space options",
    });
    menuBtn.textContent = "⋮";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#showContextMenu(e, space);
    });
    item.appendChild(menuBtn);

    // Click to switch to this space
    item.addEventListener("click", () => {
      this.#switchToSpace(space.id);
    });

    // Right-click for context menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.#showContextMenu(e, space);
    });

    return item;
  }

  // ---------------------------------------------------------------------------
  // Space Operations
  // ---------------------------------------------------------------------------

  /**
   * Switch the active space and open a new tab in it.
   *
   * @param {string} spaceId — UUID of the space to switch to
   */
  #switchToSpace(spaceId) {
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    // Switch the active space
    lazy.SpaceIdentityService.switchTo(spaceId);

    // Open a new tab in this space's container
    const gBrowser = this.#window.gBrowser;
    gBrowser.addTab("about:newtab", {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      userContextId: space.userContextId,
    });

    // Re-render to update active state
    this.#render();

    // Close the panel
    this.close();
  }

  /**
   * Show the "Create Space" dialog.
   * Uses a simple inline form in the panel.
   */
  showCreateForm() {
    const form = this.#document.getElementById("spacesCreateForm");
    const nameInput = this.#document.getElementById("spacesCreateNameInput");
    const colorSelect = this.#document.getElementById("spacesCreateColorSelect");

    if (!form) {
      console.error("SpacesPanel: Create form not found in DOM");
      return;
    }

    // Reset form
    if (nameInput) nameInput.value = "";
    if (colorSelect) colorSelect.value = "blue";

    // Show form, hide list
    form.hidden = false;
    if (nameInput) nameInput.focus();
  }

  /**
   * Handle the "Create Space" form submission.
   */
  #handleCreateSubmit() {
    const nameInput = this.#document.getElementById("spacesCreateNameInput");
    const colorSelect = this.#document.getElementById("spacesCreateColorSelect");
    const iconSelect = this.#document.getElementById("spacesCreateIconSelect");
    const form = this.#document.getElementById("spacesCreateForm");

    const name = nameInput?.value?.trim();
    if (!name) {
      // Shake the input to indicate error
      nameInput?.classList.add("error-shake");
      setTimeout(() => nameInput?.classList.remove("error-shake"), 500);
      return;
    }

    try {
      const space = lazy.SpaceIdentityService.create({
        name,
        color: colorSelect?.value || "blue",
        icon: iconSelect?.value || "fingerprint",
      });

      console.log(`Created space: ${space.name} (${space.id})`);

      // Hide form, re-render list
      if (form) form.hidden = true;
      this.#render();

      // Auto-switch to the new space
      this.#switchToSpace(space.id);
    } catch (err) {
      console.error("Failed to create space:", err);
      // Show error in UI
      const errorEl = this.#document.getElementById("spacesCreateError");
      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      }
    }
  }

  /**
   * Delete a space after confirmation.
   *
   * @param {string} spaceId — UUID of the space to delete
   */
  #deleteSpace(spaceId) {
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    const tabCount = this.#tabCounts.get(spaceId) || 0;
    const msg = tabCount > 0
      ? `Delete "${space.name}"? This will close ${tabCount} tab(s) in this space.`
      : `Delete "${space.name}"?`;

    // Use the browser's built-in prompt service for confirmation
    const prompts = Services.prompt;
    const confirmed = prompts.confirm(
      this.#window,
      "Delete Space",
      msg
    );

    if (!confirmed) return;

    // Close all tabs in this space's container
    if (tabCount > 0) {
      this.#closeTabsInSpace(spaceId);
    }

    // Delete the space
    lazy.SpaceIdentityService.delete(spaceId);

    // Re-render
    this.#render();
  }

  /**
   * Rename a space.
   *
   * @param {string} spaceId — UUID
   */
  #renameSpace(spaceId) {
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    const newName = Services.prompt.prompt(
      this.#window,
      "Rename Space",
      "New name:",
      { value: space.name },
      null,
      { value: false }
    );

    // prompt returns false if cancelled
    if (newName === null || newName === false) return;

    const name = typeof newName === "object" ? newName.value : newName;
    if (!name || !name.trim()) return;

    try {
      lazy.SpaceIdentityService.update(spaceId, { name: name.trim() });
      this.#render();
    } catch (err) {
      console.error("Failed to rename space:", err);
    }
  }

  /**
   * Regenerate a space's fingerprint profile.
   *
   * @param {string} spaceId — UUID
   */
  #regenerateFingerprint(spaceId) {
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    const confirmed = Services.prompt.confirm(
      this.#window,
      "Regenerate Fingerprint",
      `Generate a new fingerprint for "${space.name}"?\n\n` +
      "This will change how websites identify this space. " +
      "Existing sessions may be invalidated."
    );

    if (!confirmed) return;

    try {
      lazy.SpaceIdentityService.update(spaceId, { regenerateFingerprint: true });
      this.#render();
    } catch (err) {
      console.error("Failed to regenerate fingerprint:", err);
    }
  }

  /**
   * Close all tabs belonging to a space.
   *
   * @param {string} spaceId — UUID
   */
  #closeTabsInSpace(spaceId) {
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    const gBrowser = this.#window.gBrowser;
    const tabsToClose = [];

    for (const tab of gBrowser.tabs) {
      if (tab.userContextId === space.userContextId) {
        tabsToClose.push(tab);
      }
    }

    for (const tab of tabsToClose) {
      gBrowser.removeTab(tab);
    }
  }

  // ---------------------------------------------------------------------------
  // Context Menu
  // ---------------------------------------------------------------------------

  /**
   * Show a context menu for a space item.
   *
   * Uses Firefox's native popup menu system (XUL <menupopup>).
   *
   * @param {Event} event — the click/contextmenu event
   * @param {object} space — the Space data object
   */
  #showContextMenu(event, space) {
    // Remove any existing context menu
    const existingMenu = this.#document.getElementById("spacesContextMenu");
    if (existingMenu) existingMenu.remove();

    // Create the context menu
    const menu = this.#document.createXULElement("menupopup");
    menu.id = "spacesContextMenu";

    const items = [
      {
        label: "Open New Tab in Space",
        icon: "tab",
        action: () => this.#switchToSpace(space.id),
      },
      { type: "separator" },
      {
        label: "Rename Space…",
        icon: "edit",
        action: () => this.#renameSpace(space.id),
      },
      {
        label: "Change Color…",
        icon: "color",
        action: () => this.#showColorPicker(space.id),
      },
      {
        label: "Regenerate Fingerprint",
        icon: "fingerprint",
        action: () => this.#regenerateFingerprint(space.id),
      },
      { type: "separator" },
      {
        label: "Close All Tabs",
        icon: "close",
        action: () => this.#closeTabsInSpace(space.id),
        disabled: (this.#tabCounts.get(space.id) || 0) === 0,
      },
      { type: "separator" },
      {
        label: "Delete Space…",
        icon: "delete",
        class: "spaces-context-danger",
        action: () => this.#deleteSpace(space.id),
      },
    ];

    for (const itemDef of items) {
      if (itemDef.type === "separator") {
        menu.appendChild(this.#document.createXULElement("menuseparator"));
        continue;
      }

      const menuitem = this.#document.createXULElement("menuitem");
      menuitem.setAttribute("label", itemDef.label);
      if (itemDef.class) menuitem.setAttribute("class", itemDef.class);
      if (itemDef.disabled) menuitem.setAttribute("disabled", "true");
      menuitem.addEventListener("command", itemDef.action);
      menu.appendChild(menuitem);
    }

    // Add to document and show
    this.#document.getElementById("mainPopupSet").appendChild(menu);
    menu.openPopupAtScreen(event.screenX, event.screenY, true);
  }

  /**
   * Show a color picker popup for changing a space's color.
   *
   * @param {string} spaceId — UUID
   */
  #showColorPicker(spaceId) {
    const colors = lazy.SpaceIdentityService.availableColors;
    const space = lazy.SpaceIdentityService.get(spaceId);
    if (!space) return;

    // Create a small popup with color swatches
    const existingPicker = this.#document.getElementById("spacesColorPicker");
    if (existingPicker) existingPicker.remove();

    const popup = this.#document.createXULElement("panel");
    popup.id = "spacesColorPicker";
    popup.setAttribute("type", "arrow");

    const container = this.#document.createElement("div");
    container.className = "spaces-color-picker";

    for (const color of colors) {
      const swatch = this.#document.createElement("button");
      swatch.className = `spaces-color-swatch${color === space.color ? " selected" : ""}`;
      swatch.style.backgroundColor = this.#getColorValue(color);
      swatch.title = color;
      swatch.addEventListener("click", () => {
        try {
          lazy.SpaceIdentityService.update(spaceId, { color });
          popup.hidePopup();
          this.#render();
        } catch (err) {
          console.error("Failed to update color:", err);
        }
      });
      container.appendChild(swatch);
    }

    popup.appendChild(container);
    this.#document.getElementById("mainPopupSet").appendChild(popup);

    // Find the space item to anchor to
    const item = this.#listContainer.querySelector(
      `[data-space-id="${spaceId}"]`
    );
    if (item) {
      popup.openPopup(item, "after_end", 0, 0, false);
    }
  }

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------

  /**
   * Export all spaces to a JSON file.
   * Uses the native file picker dialog.
   */
  async exportSpaces() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(this.#window, "Export Spaces", Ci.nsIFilePicker.modeSave);
    fp.defaultString = "spacebrowser-spaces.json";
    fp.appendFilter("JSON Files", "*.json");
    fp.defaultExtension = "json";

    const result = await new Promise(resolve => fp.open(resolve));
    if (result !== Ci.nsIFilePicker.returnOK &&
        result !== Ci.nsIFilePicker.returnReplace) {
      return;
    }

    try {
      const json = lazy.SpaceIdentityService.exportSpaces();
      await IOUtils.writeUTF8(fp.file.path, json);
      console.log(`Exported spaces to ${fp.file.path}`);
    } catch (err) {
      console.error("Failed to export spaces:", err);
      Services.prompt.alert(
        this.#window,
        "Export Failed",
        `Could not export spaces: ${err.message}`
      );
    }
  }

  /**
   * Import spaces from a JSON file.
   */
  async importSpaces() {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(this.#window, "Import Spaces", Ci.nsIFilePicker.modeOpen);
    fp.appendFilter("JSON Files", "*.json");
    fp.defaultExtension = "json";

    const result = await new Promise(resolve => fp.open(resolve));
    if (result !== Ci.nsIFilePicker.returnOK) {
      return;
    }

    try {
      const json = await IOUtils.readUTF8(fp.file.path);
      const count = lazy.SpaceIdentityService.importSpaces(json);

      Services.prompt.alert(
        this.#window,
        "Import Complete",
        `Imported ${count} space(s).`
      );

      this.#render();
    } catch (err) {
      console.error("Failed to import spaces:", err);
      Services.prompt.alert(
        this.#window,
        "Import Failed",
        `Could not import spaces: ${err.message}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tab Count Tracking
  // ---------------------------------------------------------------------------

  /**
   * Count tabs in each space's container.
   */
  #updateTabCounts() {
    this.#tabCounts.clear();

    const gBrowser = this.#window.gBrowser;
    if (!gBrowser) return;

    const spaces = lazy.SpaceIdentityService.list();
    const contextIdMap = new Map();
    for (const space of spaces) {
      contextIdMap.set(space.userContextId, space.id);
      this.#tabCounts.set(space.id, 0);
    }

    for (const tab of gBrowser.tabs) {
      const spaceId = contextIdMap.get(tab.userContextId);
      if (spaceId) {
        this.#tabCounts.set(spaceId, (this.#tabCounts.get(spaceId) || 0) + 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  #setupEventListeners() {
    // Create button
    const createBtn = this.#document.getElementById("spacesCreateBtn");
    if (createBtn) {
      createBtn.addEventListener("click", () => this.showCreateForm());
    }

    // Create form submit
    const submitBtn = this.#document.getElementById("spacesCreateSubmitBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => this.#handleCreateSubmit());
    }

    // Create form cancel
    const cancelBtn = this.#document.getElementById("spacesCreateCancelBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        const form = this.#document.getElementById("spacesCreateForm");
        if (form) form.hidden = true;
      });
    }

    // Create form name input — submit on Enter
    const nameInput = this.#document.getElementById("spacesCreateNameInput");
    if (nameInput) {
      nameInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.#handleCreateSubmit();
        }
      });
    }

    // Import/Export buttons
    const importBtn = this.#document.getElementById("spacesImportBtn");
    if (importBtn) {
      importBtn.addEventListener("click", () => this.importSpaces());
    }

    const exportBtn = this.#document.getElementById("spacesExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportSpaces());
    }

    // Track tab changes for tab counts
    const gBrowser = this.#window.gBrowser;
    if (gBrowser) {
      gBrowser.tabContainer.addEventListener("TabOpen", () => {
        this.#updateTabCounts();
        if (this.#panel?.state === "open") this.#render();
      });
      gBrowser.tabContainer.addEventListener("TabClose", () => {
        // Delay slightly so the tab is actually removed
        this.#window.setTimeout(() => {
          this.#updateTabCounts();
          if (this.#panel?.state === "open") this.#render();
        }, 100);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Observers
  // ---------------------------------------------------------------------------

  /**
   * Set up observers for space change notifications.
   * This keeps the panel in sync when spaces are modified by other code.
   */
  #setupObservers() {
    const topics = [
      "spacebrowser-space-created",
      "spacebrowser-space-updated",
      "spacebrowser-space-deleted",
      "spacebrowser-space-switched",
    ];

    for (const topic of topics) {
      Services.obs.addObserver({
        observe: (subject, topic, data) => {
          // Re-render if the panel is open
          if (this.#panel?.state === "open") {
            this.#updateTabCounts();
            this.#render();
          }
        },
      }, topic);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Create an HTML element with attributes.
   *
   * @param {string} tag — element tag name
   * @param {object} attrs — attribute key-value pairs
   * @returns {Element}
   */
  #createElement(tag, attrs = {}) {
    const el = this.#document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  /**
   * Convert a space color name to a CSS color value.
   * Matches Firefox's container color scheme.
   *
   * @param {string} colorName
   * @returns {string} — CSS color value
   */
  #getColorValue(colorName) {
    const colors = {
      blue: "#37adff",
      turquoise: "#00c79a",
      green: "#51cd00",
      yellow: "#ffcb00",
      orange: "#ff9f00",
      red: "#ff613d",
      pink: "#ff4bda",
      purple: "#af51f5",
      toolbar: "var(--toolbar-color, #aaa)",
    };
    return colors[colorName] || colors.blue;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Clean up when the browser window is closing.
   */
  destroy() {
    // Remove observers, clear references
    this.#panel = null;
    this.#listContainer = null;
    this.#window = null;
    this.#document = null;
    this.#tabCounts.clear();
    this.#initialized = false;
  }
}

// =============================================================================
// Window Integration
// =============================================================================

/**
 * Initialize SpacesPanel for a browser window.
 *
 * This function is called from browser.js during window startup.
 * It creates the SpacesPanel instance and attaches it to the window.
 *
 * To integrate, add to browser/base/content/browser.js in the
 * delayedStartup() function:
 *
 *   const { SpacesPanel } = ChromeUtils.importESModule(
 *     "resource:///modules/SpacesPanel.sys.mjs"
 *   );
 *   window.gSpacesPanel = new SpacesPanel(window);
 *   window.gSpacesPanel.init();
 */
