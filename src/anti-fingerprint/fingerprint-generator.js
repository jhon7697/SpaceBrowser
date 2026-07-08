/**
 * SpaceBrowser — Fingerprint Generator
 *
 * Generates a complete, realistic, and deterministic fingerprint profile
 * for each space. The profile is seeded from the space's UUID so it's
 * consistent across sessions but unique per space.
 *
 * All randomness is derived from a seeded PRNG (xorshift128+) — given
 * the same spaceId, the same profile is always generated.
 */

/**
 * Seeded PRNG — xorshift128+
 * Fast, good statistical properties, deterministic from seed.
 */
class SeededRNG {
  /**
   * @param {number} seed — 32-bit integer seed
   */
  constructor(seed) {
    // Initialize state from seed using splitmix64-style seeding
    this.s0 = seed >>> 0;
    this.s1 = (seed * 0x6c078965 + 1) >>> 0;
    if (this.s0 === 0 && this.s1 === 0) {
      this.s0 = 1; // Avoid zero state
    }
    // Warm up — discard first 20 values
    for (let i = 0; i < 20; i++) this.next();
  }

  /**
   * Generate next random 32-bit unsigned integer
   * @returns {number}
   */
  next() {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return (this.s0 + this.s1) >>> 0;
  }

  /** Float in [0, 1) */
  float() {
    return this.next() / 0x100000000;
  }

  /** Integer in [min, max] inclusive */
  int(min, max) {
    return min + (this.next() % (max - min + 1));
  }

  /** Pick a random element from an array */
  pick(arr) {
    return arr[this.next() % arr.length];
  }

  /** Shuffle an array (Fisher-Yates) and return a copy */
  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Derive a 32-bit seed from a UUID string.
 * Simple hash — we just need uniqueness, not cryptographic strength.
 * @param {string} uuid
 * @returns {number}
 */
function uuidToSeed(uuid) {
  let hash = 0;
  const str = uuid.replace(/-/g, '');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ─── DATA POOLS ───────────────────────────────────────────────────────────────
// Real-world values to pick from so fingerprints look natural

const USER_AGENTS = [
  // Windows + Firefox
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0', platform: 'Win32', vendor: '' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0', platform: 'Win32', vendor: '' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0', platform: 'Win32', vendor: '' },
  // Windows + Chrome
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  // macOS + Firefox
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0', platform: 'MacIntel', vendor: '' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0', platform: 'MacIntel', vendor: '' },
  // macOS + Chrome
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', platform: 'MacIntel', vendor: 'Google Inc.' },
  // Linux + Firefox
  { ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', platform: 'Linux x86_64', vendor: '' },
  { ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', platform: 'Linux x86_64', vendor: '' },
];

const WEBGL_PROFILES = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Mozilla', renderer: 'Mozilla' },  // Firefox's default (privacy.resistFingerprinting)
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
  { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
];

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080, availHeight: 1040 },
  { width: 1920, height: 1080, availHeight: 1050 },
  { width: 2560, height: 1440, availHeight: 1400 },
  { width: 1366, height: 768, availHeight: 728 },
  { width: 1536, height: 864, availHeight: 824 },
  { width: 1440, height: 900, availHeight: 860 },
  { width: 1680, height: 1050, availHeight: 1010 },
  { width: 1280, height: 720, availHeight: 680 },
  { width: 3840, height: 2160, availHeight: 2120 },
  { width: 2560, height: 1080, availHeight: 1040 },
];

const TIMEZONES = [
  { tz: 'America/New_York', offset: 300 },
  { tz: 'America/Chicago', offset: 360 },
  { tz: 'America/Denver', offset: 420 },
  { tz: 'America/Los_Angeles', offset: 480 },
  { tz: 'America/Toronto', offset: 300 },
  { tz: 'Europe/London', offset: 0 },
  { tz: 'Europe/Berlin', offset: -60 },
  { tz: 'Europe/Paris', offset: -60 },
  { tz: 'Asia/Tokyo', offset: -540 },
  { tz: 'Asia/Shanghai', offset: -480 },
  { tz: 'Asia/Kolkata', offset: -330 },
  { tz: 'Australia/Sydney', offset: -600 },
  { tz: 'Pacific/Auckland', offset: -720 },
];

const LANGUAGES = [
  { primary: 'en-US', all: ['en-US', 'en'] },
  { primary: 'en-GB', all: ['en-GB', 'en'] },
  { primary: 'en-US', all: ['en-US', 'en', 'fr'] },
  { primary: 'de-DE', all: ['de-DE', 'de', 'en-US', 'en'] },
  { primary: 'fr-FR', all: ['fr-FR', 'fr', 'en-US', 'en'] },
  { primary: 'es-ES', all: ['es-ES', 'es', 'en'] },
  { primary: 'pt-BR', all: ['pt-BR', 'pt', 'en'] },
  { primary: 'ja-JP', all: ['ja-JP', 'ja', 'en'] },
  { primary: 'zh-CN', all: ['zh-CN', 'zh', 'en'] },
  { primary: 'ko-KR', all: ['ko-KR', 'ko', 'en'] },
];

/** Common fonts — we'll select a realistic subset per space */
const ALL_FONTS = [
  'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Georgia',
  'Trebuchet MS', 'Courier New', 'Lucida Console', 'Tahoma', 'Impact',
  'Comic Sans MS', 'Palatino Linotype', 'Book Antiqua', 'Garamond',
  'Century Gothic', 'Calibri', 'Cambria', 'Consolas', 'Segoe UI',
  'Candara', 'Franklin Gothic Medium', 'Lucida Sans Unicode',
  'Arial Black', 'MS Sans Serif', 'MS Serif',
];

const HARDWARE_CONCURRENCY = [2, 4, 6, 8, 10, 12, 16];
const DEVICE_MEMORY = [2, 4, 8, 16];
const COLOR_DEPTHS = [24, 32];
const PIXEL_RATIOS = [1, 1.25, 1.5, 2];

// ─── GENERATOR ────────────────────────────────────────────────────────────────

const FingerprintGenerator = {
  /**
   * Generate a complete fingerprint profile for a space.
   * Deterministic — same spaceId always produces the same profile.
   *
   * @param {string} spaceId — UUID v4 of the space
   * @returns {Object} fingerprint profile
   */
  generate(spaceId) {
    const seed = uuidToSeed(spaceId);
    const rng = new SeededRNG(seed);

    // Pick a consistent user-agent profile
    const uaProfile = rng.pick(USER_AGENTS);

    // Pick WebGL profile
    const webglProfile = rng.pick(WEBGL_PROFILES);

    // Pick screen resolution
    const screenProfile = rng.pick(SCREEN_RESOLUTIONS);

    // Pick timezone
    const tzProfile = rng.pick(TIMEZONES);

    // Pick language
    const langProfile = rng.pick(LANGUAGES);

    // Select a subset of fonts (15-22 fonts from the pool)
    const fontCount = rng.int(15, 22);
    const shuffledFonts = rng.shuffle(ALL_FONTS);
    const fonts = shuffledFonts.slice(0, fontCount).sort();

    return {
      seed,

      // Canvas fingerprint noise
      canvas: {
        noiseSeed: rng.next() >>> 0,
        noiseIntensity: 0.01 + rng.float() * 0.03, // 1-4% intensity
      },

      // WebGL identity
      webgl: {
        vendor: webglProfile.vendor,
        renderer: webglProfile.renderer,
        version: 'WebGL 1.0',
        shadingVersion: 'WebGL GLSL ES 1.0',
      },

      // Audio context noise
      audio: {
        noiseSeed: rng.next() >>> 0,
        noiseAmount: 0.00001 + rng.float() * 0.0001,
      },

      // Screen dimensions
      screen: {
        width: screenProfile.width,
        height: screenProfile.height,
        availWidth: screenProfile.width,
        availHeight: screenProfile.availHeight,
        colorDepth: rng.pick(COLOR_DEPTHS),
        pixelRatio: rng.pick(PIXEL_RATIOS),
      },

      // Navigator properties
      navigator: {
        userAgent: uaProfile.ua,
        platform: uaProfile.platform,
        vendor: uaProfile.vendor,
        hardwareConcurrency: rng.pick(HARDWARE_CONCURRENCY),
        deviceMemory: rng.pick(DEVICE_MEMORY),
        maxTouchPoints: 0,
      },

      // Font list
      fonts,

      // Timezone
      timezone: tzProfile.tz,
      timezoneOffset: tzProfile.offset,

      // Language
      language: langProfile,

      // WebRTC handling
      webrtc: {
        mode: 'block', // "block" = disable RTCPeerConnection, "proxy" = future TURN relay
      },
    };
  },
};

// Export for use in background script
if (typeof globalThis !== 'undefined') {
  globalThis.FingerprintGenerator = FingerprintGenerator;
  globalThis.SeededRNG = SeededRNG;
}
