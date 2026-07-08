/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * SpaceIdentityService.sys.mjs
 *
 * A native Firefox module that extends ContextualIdentityService to provide
 * full "Space" management — isolated browsing environments with per-space
 * fingerprint profiles, proxy configurations, and persistent storage.
 *
 * This module replaces the default ContextualIdentity UI layer and adds:
 *   - UUID-based space identification
 *   - Deterministic fingerprint profile generation per space
 *   - Per-space proxy configuration
 *   - Rich metadata (color, icon, creation time)
 *   - JSON persistence in the profile directory
 *   - Observer notifications for UI reactivity
 *
 * Registration:
 *   This module is loaded as an ES module (.sys.mjs) in modern Firefox.
 *   Place it at: toolkit/components/contextualidentity/SpaceIdentityService.sys.mjs
 *   Register in: toolkit/components/contextualidentity/components.conf
 *
 * Usage from chrome JS:
 *   const { SpaceIdentityService } = ChromeUtils.importESModule(
 *     "resource://gre/modules/SpaceIdentityService.sys.mjs"
 *   );
 *   const space = SpaceIdentityService.create({ name: "Shopping" });
 */

// =============================================================================
// Imports
// =============================================================================

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ContextualIdentityService:
    "resource://gre/modules/ContextualIdentityService.sys.mjs",
});

// Firefox logging infrastructure
const log = console.createInstance({
  prefix: "SpaceIdentityService",
  maxLogLevel: "Warn", // Change to "Debug" for development
});

// =============================================================================
// Constants
// =============================================================================

/** Filename for persisted spaces data in the profile directory */
const SPACES_FILENAME = "spaces.json";

/** Current schema version for migration support */
const SCHEMA_VERSION = 1;

/** Maximum number of spaces a user can create */
const MAX_SPACES = 100;

/** Default colors available for spaces (match Firefox container colors + extras) */
const SPACE_COLORS = [
  "blue", "turquoise", "green", "yellow", "orange", "red",
  "pink", "purple", "toolbar", // toolbar = inherit theme color
];

/** Default icons for spaces */
const SPACE_ICONS = [
  "fingerprint", "briefcase", "dollar", "cart", "circle",
  "gift", "vacation", "food", "fruit", "pet",
  "tree", "chill", "fence",
];

/**
 * Platform/OS options for fingerprint generation.
 * Weights approximate real-world browser usage stats.
 */
const PLATFORM_PROFILES = [
  { platform: "Win32",       oscpu: "Windows NT 10.0; Win64; x64", weight: 0.65 },
  { platform: "MacIntel",    oscpu: "Intel Mac OS X 10.15",        weight: 0.20 },
  { platform: "Linux x86_64", oscpu: "Linux x86_64",               weight: 0.10 },
  { platform: "Win32",       oscpu: "Windows NT 11.0; Win64; x64", weight: 0.05 },
];

/** WebGL vendor/renderer pairs that look realistic */
const WEBGL_PROFILES = [
  { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (NVIDIA)", renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)",    renderer: "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (AMD)",    renderer: "ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)",  renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Intel)",  renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  { vendor: "Google Inc. (Apple)",  renderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)" },
  { vendor: "Google Inc. (Apple)",  renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)" },
];

/** Screen resolution options */
const SCREEN_PROFILES = [
  { width: 1920, height: 1080, outerWidth: 1920, outerHeight: 1040 },
  { width: 1366, height: 768,  outerWidth: 1366, outerHeight: 728 },
  { width: 2560, height: 1440, outerWidth: 2560, outerHeight: 1400 },
  { width: 1536, height: 864,  outerWidth: 1536, outerHeight: 824 },
  { width: 1440, height: 900,  outerWidth: 1440, outerHeight: 860 },
  { width: 1680, height: 1050, outerWidth: 1680, outerHeight: 1010 },
];

/** Font sets per platform */
const FONT_PROFILES = {
  Win32: [
    "Arial", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New",
    "Georgia", "Impact", "Lucida Console", "Segoe UI", "Tahoma", "Times New Roman",
    "Trebuchet MS", "Verdana",
  ],
  MacIntel: [
    "Arial", "Avenir", "Courier New", "Futura", "Geneva", "Georgia",
    "Helvetica", "Helvetica Neue", "Lucida Grande", "Menlo", "Monaco",
    "Palatino", "San Francisco", "Times New Roman", "Trebuchet MS",
  ],
  "Linux x86_64": [
    "Arial", "Courier New", "DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono",
    "Droid Sans", "FreeSans", "Georgia", "Liberation Mono", "Liberation Sans",
    "Liberation Serif", "Noto Sans", "Times New Roman", "Ubuntu",
  ],
};

// =============================================================================
// Deterministic PRNG (seeded, for reproducible fingerprint generation)
// =============================================================================

/**
 * Mulberry32 — a simple 32-bit seeded PRNG.
 * Given the same seed, it always produces the same sequence.
 * This ensures a Space's fingerprint is deterministic from its UUID.
 */
class SeededRandom {
  #state;

  /**
   * @param {string} seed — any string (we use the Space UUID)
   */
  constructor(seed) {
    this.#state = this.#hashString(seed);
  }

  /** Convert a string to a 32-bit integer hash (FNV-1a) */
  #hashString(str) {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    return hash >>> 0;
  }

  /** Return next float in [0, 1) */
  next() {
    let t = (this.#state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Return integer in [min, max) */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** Pick a random element from an array */
  pick(array) {
    return array[this.nextInt(0, array.length)];
  }

  /** Pick from weighted array of { ..., weight } objects */
  pickWeighted(items) {
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
    let r = this.next() * totalWeight;
    for (const item of items) {
      r -= item.weight || 1;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Generate a float with subtle noise around a base value */
  noise(base, maxDeviation) {
    return base + (this.next() * 2 - 1) * maxDeviation;
  }
}

// =============================================================================
// Fingerprint Generator
// =============================================================================

/**
 * Generate a complete, deterministic fingerprint profile from a UUID seed.
 *
 * The profile is consistent: e.g., a Windows platform gets Windows fonts,
 * Windows-style WebGL renderers, etc. This avoids the #1 detection vector
 * for anti-fingerprint tools: inconsistent profiles.
 *
 * @param {string} uuid — the Space's UUID, used as PRNG seed
 * @returns {object} — complete fingerprint profile
 */
function generateFingerprintProfile(uuid) {
  const rng = new SeededRandom(uuid);

  // 1. Pick a platform (weighted by real-world market share)
  const platformProfile = rng.pickWeighted(PLATFORM_PROFILES);
  const platform = platformProfile.platform;

  // 2. Pick a WebGL profile consistent with the platform
  const webglCandidates = platform === "MacIntel"
    ? WEBGL_PROFILES.filter(p => p.renderer.includes("Apple") || p.renderer.includes("Intel"))
    : platform.includes("Linux")
      ? WEBGL_PROFILES.filter(p => p.renderer.includes("NVIDIA") || p.renderer.includes("AMD"))
      : WEBGL_PROFILES; // Windows gets anything
  const webgl = rng.pick(webglCandidates.length ? webglCandidates : WEBGL_PROFILES);

  // 3. Pick screen resolution
  const screen = rng.pick(SCREEN_PROFILES);

  // 4. Pick fonts consistent with platform
  const platformFonts = FONT_PROFILES[platform] || FONT_PROFILES["Win32"];
  // Randomly drop 1-3 fonts to create uniqueness
  const fonts = platformFonts.filter(() => rng.next() > 0.15);

  // 5. Hardware characteristics
  const hardwareConcurrency = rng.pick([2, 4, 4, 8, 8, 8, 12, 16]);
  const deviceMemory = rng.pick([2, 4, 4, 8, 8, 8, 16]);

  // 6. Canvas noise seed (used in our patched CanvasRenderingContext2D)
  // This is a 32-bit integer that determines the subtle pixel noise added
  // to canvas operations, making each Space's canvas fingerprint unique
  const canvasNoiseSeed = rng.nextInt(0, 0xffffffff);

  // 7. Audio noise parameters (subtle variations in AudioContext output)
  const audioNoiseSeed = rng.nextInt(0, 0xffffffff);
  const audioSampleRate = rng.pick([44100, 48000, 48000, 48000]); // 48kHz most common

  // 8. Timezone offset (optional — can be overridden per space)
  // null means "use system timezone"
  const timezoneOffset = null;

  // 9. Language/locale (optional override)
  const languages = null; // null = use system default

  // 10. User-Agent construction
  // We use a recent Firefox version to look normal
  const firefoxVersion = rng.pick(["128.0", "127.0", "126.0", "125.0"]);
  const userAgent = buildUserAgent(platformProfile, firefoxVersion);

  return {
    // Identification
    version: 1,
    generatedFrom: uuid,

    // Navigator properties
    userAgent,
    platform,
    oscpu: platformProfile.oscpu,
    hardwareConcurrency,
    deviceMemory,
    languages, // null = system default

    // Screen
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.width,
      availHeight: screen.outerHeight,
      colorDepth: 24,
      pixelDepth: 24,
      outerWidth: screen.outerWidth,
      outerHeight: screen.outerHeight,
    },

    // WebGL
    webgl: {
      vendor: webgl.vendor,
      renderer: webgl.renderer,
      // Subtle parameter variations
      maxTextureSize: rng.pick([8192, 16384, 16384]),
      maxViewportDims: rng.pick([[16384, 16384], [32768, 32768]]),
      maxRenderbufferSize: rng.pick([8192, 16384]),
    },

    // Canvas
    canvas: {
      noiseSeed: canvasNoiseSeed,
      // Noise amplitude — very subtle to avoid detection
      noiseAmplitude: 0.02,
    },

    // Audio
    audio: {
      noiseSeed: audioNoiseSeed,
      sampleRate: audioSampleRate,
      noiseAmplitude: 0.0001,
    },

    // Fonts
    fonts: fonts,

    // Timezone
    timezoneOffset,
  };
}

/**
 * Build a realistic User-Agent string.
 */
function buildUserAgent(platformProfile, firefoxVersion) {
  const { oscpu } = platformProfile;

  // Firefox UA format: Mozilla/5.0 (OSCPU; rv:VERSION) Gecko/GECKOTRAIL Firefox/VERSION
  return `Mozilla/5.0 (${oscpu}; rv:${firefoxVersion}) Gecko/20100101 Firefox/${firefoxVersion}`;
}

// =============================================================================
// Space Data Model
// =============================================================================

/**
 * Validate and normalize a Space object.
 * Throws on invalid input.
 *
 * @param {object} data — raw space data
 * @returns {object} — validated, normalized space
 */
function validateSpace(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Space data must be an object");
  }

  const space = {};

  // ID: UUID v4
  if (data.id && typeof data.id === "string" && /^[0-9a-f-]{36}$/i.test(data.id)) {
    space.id = data.id.toLowerCase();
  } else {
    throw new Error(`Invalid space ID: ${data.id}`);
  }

  // userContextId: integer >= 1 (maps to Firefox's container ID)
  if (typeof data.userContextId === "number" && data.userContextId >= 1) {
    space.userContextId = data.userContextId;
  } else {
    throw new Error(`Invalid userContextId: ${data.userContextId}`);
  }

  // Name: non-empty string, max 64 chars
  if (typeof data.name === "string" && data.name.trim().length > 0) {
    space.name = data.name.trim().slice(0, 64);
  } else {
    throw new Error("Space name must be a non-empty string");
  }

  // Color: must be from allowed list
  space.color = SPACE_COLORS.includes(data.color) ? data.color : "blue";

  // Icon: must be from allowed list
  space.icon = SPACE_ICONS.includes(data.icon) ? data.icon : "fingerprint";

  // Fingerprint profile: generated or provided
  if (data.fingerprintProfile && typeof data.fingerprintProfile === "object") {
    space.fingerprintProfile = data.fingerprintProfile;
  } else {
    space.fingerprintProfile = generateFingerprintProfile(space.id);
  }

  // Proxy configuration (optional)
  if (data.proxyConfig && typeof data.proxyConfig === "object") {
    space.proxyConfig = validateProxyConfig(data.proxyConfig);
  } else {
    space.proxyConfig = null; // No proxy = direct connection
  }

  // Timestamps
  space.createdAt = data.createdAt || Date.now();
  space.updatedAt = data.updatedAt || Date.now();

  // Active flag
  space.isActive = typeof data.isActive === "boolean" ? data.isActive : true;

  return space;
}

/**
 * Validate proxy configuration.
 */
function validateProxyConfig(config) {
  const PROXY_TYPES = ["http", "https", "socks4", "socks5", "direct"];

  if (!PROXY_TYPES.includes(config.type)) {
    throw new Error(`Invalid proxy type: ${config.type}`);
  }

  if (config.type === "direct") {
    return { type: "direct" };
  }

  if (!config.host || typeof config.host !== "string") {
    throw new Error("Proxy host is required");
  }

  const port = parseInt(config.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proxy port: ${config.port}`);
  }

  return {
    type: config.type,
    host: config.host.trim(),
    port,
    username: config.username || null,
    password: config.password || null,
    proxyDNS: config.proxyDNS !== false, // Default: proxy DNS too
  };
}

// =============================================================================
// SpaceIdentityService
// =============================================================================

/**
 * Main service class. Manages the lifecycle of Spaces (create, read, update,
 * delete) and persists them to disk. Integrates with Firefox's
 * ContextualIdentityService for tab/cookie isolation.
 *
 * Observer topics emitted:
 *   - "spacebrowser-space-created"  — data: space JSON
 *   - "spacebrowser-space-updated"  — data: space JSON
 *   - "spacebrowser-space-deleted"  — data: spaceId
 *   - "spacebrowser-space-switched" — data: spaceId
 *   - "spacebrowser-spaces-loaded"  — data: null
 */
class SpaceIdentityServiceClass {
  /** @type {Map<string, object>} UUID -> Space */
  #spaces = new Map();

  /** @type {Map<number, string>} userContextId -> UUID (reverse lookup) */
  #contextIdToUuid = new Map();

  /** @type {number} Next available userContextId */
  #nextContextId = 100; // Start high to avoid conflicts with default containers

  /** @type {string|null} Currently active space UUID */
  #activeSpaceId = null;

  /** @type {boolean} Whether data has been loaded from disk */
  #initialized = false;

  /** @type {nsIFile} Path to the spaces.json file */
  #dataFile = null;

  /** @type {number} Debounce timer for saving */
  #saveTimer = null;

  /** Debounce delay for saves (ms) */
  #saveDelay = 1000;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize the service. Must be called before any operations.
   * Loads persisted spaces from the profile directory.
   */
  async init() {
    if (this.#initialized) {
      return;
    }

    log.debug("Initializing SpaceIdentityService");

    try {
      // Determine the path to spaces.json in the profile directory
      this.#dataFile = PathUtils.join(PathUtils.profileDir, SPACES_FILENAME);

      // Load existing spaces
      await this.#load();

      // Register with ContextualIdentityService to keep containers in sync
      this.#syncWithContextualIdentities();

      this.#initialized = true;
      log.info(`SpaceIdentityService initialized with ${this.#spaces.size} spaces`);

      Services.obs.notifyObservers(null, "spacebrowser-spaces-loaded", null);
    } catch (err) {
      log.error("Failed to initialize SpaceIdentityService", err);
      // Initialize with empty state rather than crashing
      this.#spaces = new Map();
      this.#contextIdToUuid = new Map();
      this.#initialized = true;
    }
  }

  /**
   * Ensure initialized. Throws if not.
   */
  #ensureInit() {
    if (!this.#initialized) {
      throw new Error(
        "SpaceIdentityService not initialized. Call init() first."
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new Space.
   *
   * @param {object} options
   * @param {string} options.name — display name (required)
   * @param {string} [options.color="blue"] — color from SPACE_COLORS
   * @param {string} [options.icon="fingerprint"] — icon from SPACE_ICONS
   * @param {object} [options.proxyConfig=null] — proxy settings
   * @param {object} [options.fingerprintProfile] — override auto-generated profile
   * @returns {object} — the created Space
   */
  create({ name, color = "blue", icon = "fingerprint", proxyConfig = null, fingerprintProfile = null }) {
    this.#ensureInit();

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Space name is required");
    }

    if (this.#spaces.size >= MAX_SPACES) {
      throw new Error(`Maximum number of spaces (${MAX_SPACES}) reached`);
    }

    // Generate UUID
    const id = Services.uuid.generateUUID().toString().slice(1, -1); // strip {}

    // Assign a unique userContextId for Firefox container mapping
    const userContextId = this.#nextContextId++;

    // Build the space object
    const spaceData = {
      id,
      userContextId,
      name: name.trim(),
      color,
      icon,
      proxyConfig,
      fingerprintProfile: fingerprintProfile || generateFingerprintProfile(id),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: true,
    };

    const space = validateSpace(spaceData);

    // Register with Firefox's ContextualIdentityService
    // This creates the actual container that isolates cookies, storage, etc.
    try {
      lazy.ContextualIdentityService.create(
        space.name,
        space.icon,
        space.color
        // Note: Firefox's service auto-assigns userContextId.
        // We track our own mapping.
      );
    } catch (err) {
      log.warn("Failed to create ContextualIdentity (may already exist)", err);
    }

    // Store
    this.#spaces.set(id, space);
    this.#contextIdToUuid.set(userContextId, id);

    // Persist
    this.#scheduleSave();

    // Notify observers (UI will react to this)
    Services.obs.notifyObservers(
      null,
      "spacebrowser-space-created",
      JSON.stringify(space)
    );

    log.info(`Created space "${space.name}" (${id})`);
    return structuredClone(space);
  }

  /**
   * Get a Space by UUID.
   *
   * @param {string} id — Space UUID
   * @returns {object|null} — Space or null if not found
   */
  get(id) {
    this.#ensureInit();
    const space = this.#spaces.get(id);
    return space ? structuredClone(space) : null;
  }

  /**
   * Get a Space by its userContextId (Firefox container ID).
   *
   * @param {number} userContextId
   * @returns {object|null}
   */
  getByContextId(userContextId) {
    this.#ensureInit();
    const uuid = this.#contextIdToUuid.get(userContextId);
    return uuid ? this.get(uuid) : null;
  }

  /**
   * List all spaces.
   *
   * @param {object} [options]
   * @param {boolean} [options.activeOnly=false] — only return active spaces
   * @returns {object[]} — array of Space objects
   */
  list({ activeOnly = false } = {}) {
    this.#ensureInit();
    let spaces = Array.from(this.#spaces.values());
    if (activeOnly) {
      spaces = spaces.filter(s => s.isActive);
    }
    // Sort by creation time (oldest first)
    spaces.sort((a, b) => a.createdAt - b.createdAt);
    return spaces.map(s => structuredClone(s));
  }

  /**
   * Update a Space's properties.
   *
   * @param {string} id — Space UUID
   * @param {object} updates — properties to update
   * @returns {object} — updated Space
   */
  update(id, updates) {
    this.#ensureInit();

    const space = this.#spaces.get(id);
    if (!space) {
      throw new Error(`Space not found: ${id}`);
    }

    // Apply updates (only allowed fields)
    if (updates.name !== undefined) {
      if (typeof updates.name !== "string" || !updates.name.trim()) {
        throw new Error("Space name must be a non-empty string");
      }
      space.name = updates.name.trim().slice(0, 64);
    }

    if (updates.color !== undefined) {
      if (!SPACE_COLORS.includes(updates.color)) {
        throw new Error(`Invalid color: ${updates.color}`);
      }
      space.color = updates.color;
    }

    if (updates.icon !== undefined) {
      if (!SPACE_ICONS.includes(updates.icon)) {
        throw new Error(`Invalid icon: ${updates.icon}`);
      }
      space.icon = updates.icon;
    }

    if (updates.proxyConfig !== undefined) {
      space.proxyConfig = updates.proxyConfig
        ? validateProxyConfig(updates.proxyConfig)
        : null;
    }

    if (updates.isActive !== undefined) {
      space.isActive = Boolean(updates.isActive);
    }

    // Regenerate fingerprint if explicitly requested
    if (updates.regenerateFingerprint) {
      space.fingerprintProfile = generateFingerprintProfile(
        Services.uuid.generateUUID().toString().slice(1, -1)
      );
    }

    // Allow full fingerprint profile override
    if (updates.fingerprintProfile && typeof updates.fingerprintProfile === "object") {
      space.fingerprintProfile = updates.fingerprintProfile;
    }

    space.updatedAt = Date.now();

    this.#scheduleSave();

    Services.obs.notifyObservers(
      null,
      "spacebrowser-space-updated",
      JSON.stringify(space)
    );

    log.info(`Updated space "${space.name}" (${id})`);
    return structuredClone(space);
  }

  /**
   * Delete a Space permanently.
   *
   * @param {string} id — Space UUID
   * @returns {boolean} — true if deleted
   */
  delete(id) {
    this.#ensureInit();

    const space = this.#spaces.get(id);
    if (!space) {
      log.warn(`Attempted to delete non-existent space: ${id}`);
      return false;
    }

    // Remove from Firefox's ContextualIdentityService
    try {
      lazy.ContextualIdentityService.remove(space.userContextId);
    } catch (err) {
      log.warn("Failed to remove ContextualIdentity", err);
    }

    // Remove from our maps
    this.#spaces.delete(id);
    this.#contextIdToUuid.delete(space.userContextId);

    // If this was the active space, clear it
    if (this.#activeSpaceId === id) {
      this.#activeSpaceId = null;
    }

    this.#scheduleSave();

    Services.obs.notifyObservers(null, "spacebrowser-space-deleted", id);

    log.info(`Deleted space "${space.name}" (${id})`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Space Switching
  // ---------------------------------------------------------------------------

  /**
   * Switch the active space. New tabs will open in this space's container.
   *
   * @param {string} id — Space UUID (or null to switch to "no space")
   */
  switchTo(id) {
    this.#ensureInit();

    if (id !== null) {
      const space = this.#spaces.get(id);
      if (!space) {
        throw new Error(`Space not found: ${id}`);
      }
    }

    this.#activeSpaceId = id;

    Services.obs.notifyObservers(null, "spacebrowser-space-switched", id);

    log.info(`Switched to space: ${id || "(none)"}`);
  }

  /**
   * Get the currently active space.
   *
   * @returns {object|null} — active Space or null
   */
  getActiveSpace() {
    this.#ensureInit();
    return this.#activeSpaceId ? this.get(this.#activeSpaceId) : null;
  }

  /**
   * Get the currently active space ID.
   *
   * @returns {string|null}
   */
  get activeSpaceId() {
    return this.#activeSpaceId;
  }

  // ---------------------------------------------------------------------------
  // Fingerprint Access
  // ---------------------------------------------------------------------------

  /**
   * Get the fingerprint profile for a given userContextId.
   * This is the primary interface used by our patched RFP service.
   *
   * @param {number} userContextId — Firefox container ID
   * @returns {object|null} — fingerprint profile or null
   */
  getFingerprintForContext(userContextId) {
    this.#ensureInit();
    const uuid = this.#contextIdToUuid.get(userContextId);
    if (!uuid) return null;
    const space = this.#spaces.get(uuid);
    return space ? space.fingerprintProfile : null;
  }

  /**
   * Get the proxy configuration for a given userContextId.
   *
   * @param {number} userContextId
   * @returns {object|null}
   */
  getProxyForContext(userContextId) {
    this.#ensureInit();
    const uuid = this.#contextIdToUuid.get(userContextId);
    if (!uuid) return null;
    const space = this.#spaces.get(uuid);
    return space ? space.proxyConfig : null;
  }

  // ---------------------------------------------------------------------------
  // Import / Export
  // ---------------------------------------------------------------------------

  /**
   * Export all spaces as a JSON string.
   * Useful for backup and transfer between machines.
   *
   * @returns {string} — JSON string
   */
  exportSpaces() {
    this.#ensureInit();
    const data = {
      version: SCHEMA_VERSION,
      exportedAt: Date.now(),
      spaces: this.list(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import spaces from a JSON string.
   * Merges with existing spaces (skips duplicates by UUID).
   *
   * @param {string} json — exported JSON string
   * @returns {number} — number of spaces imported
   */
  importSpaces(json) {
    this.#ensureInit();

    let data;
    try {
      data = JSON.parse(json);
    } catch (err) {
      throw new Error("Invalid JSON for space import");
    }

    if (!data.spaces || !Array.isArray(data.spaces)) {
      throw new Error("Invalid space export format");
    }

    let imported = 0;
    for (const spaceData of data.spaces) {
      // Skip if a space with this UUID already exists
      if (this.#spaces.has(spaceData.id)) {
        log.debug(`Skipping import of existing space: ${spaceData.id}`);
        continue;
      }

      if (this.#spaces.size >= MAX_SPACES) {
        log.warn("Max spaces reached during import, stopping");
        break;
      }

      try {
        // Assign a new userContextId (the exported one might conflict)
        spaceData.userContextId = this.#nextContextId++;
        const space = validateSpace(spaceData);
        this.#spaces.set(space.id, space);
        this.#contextIdToUuid.set(space.userContextId, space.id);
        imported++;
      } catch (err) {
        log.warn(`Failed to import space: ${err.message}`);
      }
    }

    if (imported > 0) {
      this.#scheduleSave();
    }

    log.info(`Imported ${imported} spaces`);
    return imported;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Load spaces from the profile directory.
   */
  async #load() {
    try {
      const exists = await IOUtils.exists(this.#dataFile);
      if (!exists) {
        log.debug("No spaces.json found, starting fresh");
        return;
      }

      const json = await IOUtils.readUTF8(this.#dataFile);
      const data = JSON.parse(json);

      if (!data || data.version !== SCHEMA_VERSION) {
        log.warn(`Unknown schema version: ${data?.version}, attempting migration`);
        // Future: handle migrations here
      }

      if (!Array.isArray(data.spaces)) {
        log.warn("Invalid spaces data, starting fresh");
        return;
      }

      let maxContextId = this.#nextContextId;
      for (const spaceData of data.spaces) {
        try {
          const space = validateSpace(spaceData);
          this.#spaces.set(space.id, space);
          this.#contextIdToUuid.set(space.userContextId, space.id);
          maxContextId = Math.max(maxContextId, space.userContextId + 1);
        } catch (err) {
          log.warn(`Skipping invalid space during load: ${err.message}`);
        }
      }

      this.#nextContextId = maxContextId;
      this.#activeSpaceId = data.activeSpaceId || null;

      log.debug(`Loaded ${this.#spaces.size} spaces from disk`);
    } catch (err) {
      log.error("Failed to load spaces.json", err);
    }
  }

  /**
   * Save spaces to the profile directory.
   */
  async #save() {
    try {
      const data = {
        version: SCHEMA_VERSION,
        savedAt: Date.now(),
        activeSpaceId: this.#activeSpaceId,
        nextContextId: this.#nextContextId,
        spaces: Array.from(this.#spaces.values()),
      };

      const json = JSON.stringify(data, null, 2);
      await IOUtils.writeUTF8(this.#dataFile, json, { tmpPath: `${this.#dataFile}.tmp` });
      log.debug(`Saved ${this.#spaces.size} spaces to disk`);
    } catch (err) {
      log.error("Failed to save spaces.json", err);
    }
  }

  /**
   * Schedule a debounced save. Multiple rapid changes (e.g., bulk import)
   * will coalesce into a single write.
   */
  #scheduleSave() {
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
    }
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.#save();
    }, this.#saveDelay);
  }

  // ---------------------------------------------------------------------------
  // ContextualIdentity Sync
  // ---------------------------------------------------------------------------

  /**
   * Ensure our spaces are registered with Firefox's ContextualIdentityService.
   * This is called at init time to sync state.
   */
  #syncWithContextualIdentities() {
    for (const space of this.#spaces.values()) {
      try {
        const existing = lazy.ContextualIdentityService.getPublicIdentityFromId(
          space.userContextId
        );
        if (!existing) {
          // Re-create the container if it was lost
          lazy.ContextualIdentityService.create(
            space.name,
            space.icon,
            space.color
          );
          log.debug(`Re-created container for space "${space.name}"`);
        }
      } catch (err) {
        // Not critical — container will be created when needed
        log.debug(`Container sync skipped for "${space.name}": ${err.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Get available colors for the UI.
   * @returns {string[]}
   */
  get availableColors() {
    return [...SPACE_COLORS];
  }

  /**
   * Get available icons for the UI.
   * @returns {string[]}
   */
  get availableIcons() {
    return [...SPACE_ICONS];
  }

  /**
   * Get the total number of spaces.
   * @returns {number}
   */
  get count() {
    return this.#spaces.size;
  }

  /**
   * Check if we're at the space limit.
   * @returns {boolean}
   */
  get isFull() {
    return this.#spaces.size >= MAX_SPACES;
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * Singleton instance. All chrome JS accesses this same instance.
 *
 * Usage:
 *   const { SpaceIdentityService } = ChromeUtils.importESModule(
 *     "resource://gre/modules/SpaceIdentityService.sys.mjs"
 *   );
 *
 *   await SpaceIdentityService.init();
 *   const space = SpaceIdentityService.create({ name: "Work" });
 */
export const SpaceIdentityService = new SpaceIdentityServiceClass();

// =============================================================================
// XPCOM Registration (for legacy code paths that use Services.*)
// =============================================================================

/**
 * XPCOM component info for registration in components.conf:
 *
 * Classes = [
 *   {
 *     'cid': '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}',
 *     'contract_ids': ['@mozilla.org/space-identity-service;1'],
 *     'esModule': 'resource://gre/modules/SpaceIdentityService.sys.mjs',
 *     'constructor': 'SpaceIdentityServiceClass',
 *   },
 * ]
 *
 * This allows access via:
 *   Cc["@mozilla.org/space-identity-service;1"].getService()
 *
 * But the preferred access pattern is the ESModule import above.
 */
