/**
 * SpaceBrowser — Space Store
 *
 * Persistence layer for space configurations.
 * Uses browser.storage.local to store space data, settings, and fingerprint profiles.
 * All methods are async and return promises.
 */

const STORAGE_KEY_SPACES = 'spaces';
const STORAGE_KEY_ACTIVE = 'activeSpaceId';
const STORAGE_KEY_SETTINGS = 'settings';

/** Default settings applied on first run */
const DEFAULT_SETTINGS = {
  openNewTabInActiveSpace: true,
  showSpaceIndicator: true,
  defaultSpaceId: null,
};

/**
 * SpaceStore — CRUD operations for persisted space data.
 */
const SpaceStore = {
  /**
   * Retrieve all spaces as a map { spaceId: spaceConfig }
   * @returns {Promise<Object>}
   */
  async getAll() {
    const result = await browser.storage.local.get(STORAGE_KEY_SPACES);
    return result[STORAGE_KEY_SPACES] || {};
  },

  /**
   * Get a single space by its ID
   * @param {string} spaceId
   * @returns {Promise<Object|null>}
   */
  async get(spaceId) {
    const spaces = await this.getAll();
    return spaces[spaceId] || null;
  },

  /**
   * Save a space config. Overwrites if it already exists.
   * @param {Object} space — must include space.id
   * @returns {Promise<void>}
   */
  async save(space) {
    if (!space || !space.id) {
      throw new Error('Space must have an id');
    }
    const spaces = await this.getAll();
    spaces[space.id] = {
      ...space,
      lastModifiedAt: Date.now(),
    };
    await browser.storage.local.set({ [STORAGE_KEY_SPACES]: spaces });
  },

  /**
   * Remove a space from storage by ID
   * @param {string} spaceId
   * @returns {Promise<boolean>} true if the space existed and was removed
   */
  async remove(spaceId) {
    const spaces = await this.getAll();
    if (!spaces[spaceId]) return false;
    delete spaces[spaceId];
    await browser.storage.local.set({ [STORAGE_KEY_SPACES]: spaces });

    // If the removed space was active, clear active
    const activeId = await this.getActiveSpaceId();
    if (activeId === spaceId) {
      await this.setActiveSpaceId(null);
    }
    return true;
  },

  /**
   * Get the currently active space ID
   * @returns {Promise<string|null>}
   */
  async getActiveSpaceId() {
    const result = await browser.storage.local.get(STORAGE_KEY_ACTIVE);
    return result[STORAGE_KEY_ACTIVE] || null;
  },

  /**
   * Set the active space ID
   * @param {string|null} spaceId
   * @returns {Promise<void>}
   */
  async setActiveSpaceId(spaceId) {
    await browser.storage.local.set({ [STORAGE_KEY_ACTIVE]: spaceId });
  },

  /**
   * Get extension settings
   * @returns {Promise<Object>}
   */
  async getSettings() {
    const result = await browser.storage.local.get(STORAGE_KEY_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY_SETTINGS] || {}) };
  },

  /**
   * Update settings (shallow merge)
   * @param {Object} updates — partial settings to merge
   * @returns {Promise<void>}
   */
  async updateSettings(updates) {
    const current = await this.getSettings();
    const merged = { ...current, ...updates };
    await browser.storage.local.set({ [STORAGE_KEY_SETTINGS]: merged });
  },

  /**
   * Export all spaces as a JSON-serializable array (for backup/transfer).
   * Excludes cookieStoreId since that's installation-specific.
   * @returns {Promise<Array>}
   */
  async exportAll() {
    const spaces = await this.getAll();
    return Object.values(spaces).map((space) => ({
      id: space.id,
      name: space.name,
      color: space.color,
      icon: space.icon,
      fingerprint: space.fingerprint,
      createdAt: space.createdAt,
    }));
  },

  /**
   * Clear all space data (for reset/testing)
   * @returns {Promise<void>}
   */
  async clearAll() {
    await browser.storage.local.remove([
      STORAGE_KEY_SPACES,
      STORAGE_KEY_ACTIVE,
      STORAGE_KEY_SETTINGS,
    ]);
  },
};

// Export for use in background script and sidebar
if (typeof globalThis !== 'undefined') {
  globalThis.SpaceStore = SpaceStore;
}
