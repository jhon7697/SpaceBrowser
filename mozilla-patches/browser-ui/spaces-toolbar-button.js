/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * SpacesToolbarButton.sys.mjs — Toolbar button for quick space management.
 *
 * Location in Firefox source: browser/components/spaces/SpacesToolbarButton.sys.mjs
 *
 * This creates a toolbar button that:
 *   - Shows the current active space name + color dot
 *   - Click to open the full Spaces panel
 *   - Has a dropdown arrow for quick space switching
 *   - Updates reactively when spaces change
 *
 * The button sits in the main toolbar, to the right of the URL bar.
 * It's registered in browser.xhtml's toolbar palette and CustomizableUI.
 *
 * Registration (in browser/components/customizableui/CustomizableUI.sys.mjs):
 *   Add 'spaces-toolbar-button' to AREA_NAVBAR default placements.
 *
 * Integration (in browser/base/content/browser.js):
 *   ChromeUtils.importESModule("resource:///modules/SpacesToolbarButton.sys.mjs");
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SpaceIdentityService:
    "resource://gre/modules/SpaceIdentityService.sys.mjs",
  CustomizableUI:
    "resource:///modules/CustomizableUI.sys.mjs",
});

// Color mapping (same as Firefox container colors)
const COLOR_HEX = {
  blue: "#37adff",
  turquoise: "#00c79a",
  green: "#51cd00",
  yellow: "#ffcb00",
  orange: "#ff9f00",
  red: "#ff613d",
  pink: "#ff4bda",
  purple: "#af51f5",
  toolbar: "#7c7c7d",
};

const WIDGET_ID = "spaces-toolbar-button";

/**
 * SpacesToolbarButton — manages the toolbar widget lifecycle.
 */
export const SpacesToolbarButton = {
  /** Whether the widget has been registered with CustomizableUI */
  _registered: false,

  /**
   * Initialize the toolbar button. Called once from browser.js at startup.
   */
  init() {
    if (this._registered) return;

    lazy.CustomizableUI.createWidget({
      id: WIDGET_ID,
      type: "custom",
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,

      // Position after the URL bar
      // (CustomizableUI will find the best position)
      defaultPosition: undefined,

      // Build the widget DOM for each browser window
      onBuild: (aDocument) => this._buildWidget(aDocument),
    });

    // Listen for space changes to update the button
    Services.obs.addObserver(this, "spacebrowser-space-switched");
    Services.obs.addObserver(this, "spacebrowser-space-created");
    Services.obs.addObserver(this, "spacebrowser-space-updated");
    Services.obs.addObserver(this, "spacebrowser-space-deleted");

    this._registered = true;
  },

  /**
   * Build the toolbar button DOM.
   *
   * Structure:
   *   <toolbarbutton id="spaces-toolbar-button">
   *     <hbox class="spaces-tb-content">
   *       <div class="spaces-tb-dot" style="background: #color"/>
   *       <label class="spaces-tb-label">Space Name</label>
   *       <dropmarker class="spaces-tb-arrow"/>
   *     </hbox>
   *   </toolbarbutton>
   *
   * @param {Document} doc — the chrome document
   * @returns {Element} the toolbarbutton element
   */
  _buildWidget(doc) {
    const btn = doc.createXULElement("toolbarbutton");
    btn.id = WIDGET_ID;
    btn.className = "toolbarbutton-1 chromeclass-toolbar-additional";
    btn.setAttribute("type", "menu");
    btn.setAttribute("label", "Spaces");
    btn.setAttribute("tooltiptext", "SpaceBrowser — Switch Space");
    btn.setAttribute("removable", "true");
    btn.setAttribute("overflows", "false");

    // ── Inner content ──
    const content = doc.createXULElement("hbox");
    content.className = "spaces-tb-content";
    content.setAttribute("align", "center");

    // Color dot indicator
    const dot = doc.createElement("div");
    dot.className = "spaces-tb-dot";
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.marginInlineEnd = "6px";
    dot.style.background = COLOR_HEX.blue;

    // Space name label
    const label = doc.createXULElement("label");
    label.className = "spaces-tb-label";
    label.setAttribute("value", "No Space");
    label.style.maxWidth = "120px";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";

    content.appendChild(dot);
    content.appendChild(label);
    btn.appendChild(content);

    // ── Dropdown menu (menupopup) ──
    const popup = doc.createXULElement("menupopup");
    popup.id = "spaces-toolbar-popup";
    popup.className = "spaces-toolbar-popup";

    // Populate on open
    popup.addEventListener("popupshowing", () => {
      this._populateDropdown(popup, doc);
    });

    btn.appendChild(popup);

    // Set initial state
    this._updateButtonState(btn, doc);

    return btn;
  },

  /**
   * Populate the dropdown menu with space items.
   *
   * @param {Element} popup — the menupopup element
   * @param {Document} doc — chrome document
   */
  async _populateDropdown(popup, doc) {
    // Clear existing items (except separators we'll add fresh)
    while (popup.firstChild) {
      popup.removeChild(popup.firstChild);
    }

    let spaces;
    try {
      await lazy.SpaceIdentityService.init();
      spaces = lazy.SpaceIdentityService.list({ activeOnly: true });
    } catch (e) {
      console.error("SpacesToolbarButton: Failed to list spaces", e);
      return;
    }

    const activeSpace = lazy.SpaceIdentityService.getActiveSpace();
    const activeId = activeSpace ? activeSpace.id : null;

    if (spaces.length === 0) {
      // Empty state
      const emptyItem = doc.createXULElement("menuitem");
      emptyItem.setAttribute("label", "No spaces — click to create");
      emptyItem.setAttribute("disabled", "true");
      popup.appendChild(emptyItem);
    } else {
      // List spaces
      for (const space of spaces) {
        const item = doc.createXULElement("menuitem");
        const isActive = space.id === activeId;

        item.setAttribute("label", `${isActive ? "✓ " : "   "}${space.name}`);
        item.setAttribute("tooltiptext", `Switch to ${space.name}`);
        item.className = isActive ? "spaces-dropdown-active" : "";

        // Set color indicator via inline style
        const color = COLOR_HEX[space.color] || COLOR_HEX.blue;
        item.style.borderInlineStart = `3px solid ${color}`;
        item.style.paddingInlineStart = "8px";

        // Click handler: switch to this space
        item.addEventListener("command", () => {
          lazy.SpaceIdentityService.switchTo(space.id);
        });

        popup.appendChild(item);
      }
    }

    // Separator
    popup.appendChild(doc.createXULElement("menuseparator"));

    // "New Space" item
    const newItem = doc.createXULElement("menuitem");
    newItem.setAttribute("label", "New Space...");
    newItem.setAttribute("accesskey", "N");
    newItem.addEventListener("command", () => {
      // Open the full Spaces panel to the create form
      this._openSpacesPanel(doc.defaultView);
    });
    popup.appendChild(newItem);

    // "Manage Spaces" item
    const manageItem = doc.createXULElement("menuitem");
    manageItem.setAttribute("label", "Manage Spaces...");
    manageItem.setAttribute("accesskey", "M");
    manageItem.addEventListener("command", () => {
      this._openSpacesPanel(doc.defaultView);
    });
    popup.appendChild(manageItem);
  },

  /**
   * Update the toolbar button to reflect the current active space.
   *
   * @param {Element} [btn] — the button element (found by ID if not provided)
   * @param {Document} [doc] — chrome document
   */
  async _updateButtonState(btn, doc) {
    if (!btn && doc) {
      btn = doc.getElementById(WIDGET_ID);
    }
    if (!btn) return;

    let activeSpace;
    try {
      await lazy.SpaceIdentityService.init();
      activeSpace = lazy.SpaceIdentityService.getActiveSpace();
    } catch (e) {
      return;
    }

    const dot = btn.querySelector(".spaces-tb-dot");
    const label = btn.querySelector(".spaces-tb-label");

    if (activeSpace) {
      const color = COLOR_HEX[activeSpace.color] || COLOR_HEX.blue;
      if (dot) dot.style.background = color;
      if (label) label.setAttribute("value", activeSpace.name);
      btn.setAttribute("tooltiptext", `Space: ${activeSpace.name}`);
    } else {
      if (dot) dot.style.background = "#666";
      if (label) label.setAttribute("value", "No Space");
      btn.setAttribute("tooltiptext", "SpaceBrowser — No active space");
    }
  },

  /**
   * Open the full Spaces sidebar/panel.
   *
   * @param {Window} win — the browser chrome window
   */
  _openSpacesPanel(win) {
    // Toggle the sidebar to our Spaces panel
    // This integrates with Firefox's SidebarUI
    win.SidebarUI.toggle("viewSpacesPanel");
  },

  /**
   * Observer notification handler.
   * Updates the toolbar button when spaces change.
   */
  observe(subject, topic, data) {
    if (
      topic === "spacebrowser-space-switched" ||
      topic === "spacebrowser-space-created" ||
      topic === "spacebrowser-space-updated" ||
      topic === "spacebrowser-space-deleted"
    ) {
      // Update all windows
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        const btn = win.document.getElementById(WIDGET_ID);
        if (btn) {
          this._updateButtonState(btn, win.document);
        }
      }
    }
  },

  /**
   * Cleanup — remove widget and observers.
   */
  uninit() {
    if (!this._registered) return;

    try {
      lazy.CustomizableUI.destroyWidget(WIDGET_ID);
    } catch (e) {}

    try {
      Services.obs.removeObserver(this, "spacebrowser-space-switched");
      Services.obs.removeObserver(this, "spacebrowser-space-created");
      Services.obs.removeObserver(this, "spacebrowser-space-updated");
      Services.obs.removeObserver(this, "spacebrowser-space-deleted");
    } catch (e) {}

    this._registered = false;
  },
};
