# SpaceBrowser — Technical Architecture

## Table of Contents
1. [Firefox Containers: How They Work](#firefox-containers-how-they-work)
2. [How SpaceBrowser Extends Containers](#how-spacebrowser-extends-containers)
3. [Space Isolation Model](#space-isolation-model)
4. [Anti-Fingerprint System Design](#anti-fingerprint-system-design)
5. [Space Management](#space-management)
6. [UI Design](#ui-design)
7. [Security Considerations](#security-considerations)
8. [Phase 2: GeckoView Fork Plan](#phase-2-geckoview-fork-plan)

---

## 1. Firefox Containers: How They Work

Firefox's **contextual identities** (marketed as "Container Tabs") provide cookie-level isolation between tab groups. Under the hood:

### What Firefox Isolates Per Container
- **Cookies** — each container has a unique `cookieStoreId` (e.g., `firefox-container-1`). Cookies set in one container are invisible to another.
- **localStorage / sessionStorage** — origin-keyed but further partitioned by `cookieStoreId` (since Firefox 86+ with State Partitioning / Total Cookie Protection).
- **indexedDB** — similarly partitioned.
- **HTTP cache** — partitioned by top-level origin + container (network partitioning).
- **HTTP Auth** — credentials don't leak across containers.

### What Firefox Does NOT Isolate Per Container
- **Browser fingerprint** — canvas, WebGL, audio, fonts, screen resolution, navigator properties are all identical across containers.
- **Extension state** — extensions see the same data regardless of container.
- **Installed fonts** — the system font list is shared.
- **TLS session tickets** — can theoretically be used to correlate.
- **DNS cache** — shared across all containers.

### API Surface
```javascript
// Create a container
browser.contextualIdentities.create({
  name: "Space-1",
  color: "blue",
  icon: "fingerprint"
});

// Open a tab in a container
browser.tabs.create({
  url: "https://example.com",
  cookieStoreId: "firefox-container-4"
});

// List all containers
browser.contextualIdentities.query({});

// Remove a container (and its cookies)
browser.contextualIdentities.remove(cookieStoreId);
```

---

## 2. How SpaceBrowser Extends Containers

SpaceBrowser treats each Firefox container as the **isolation primitive** and layers additional protections on top:

```
┌──────────────────────────────────────────────┐
│                  Space "Work"                 │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │  Container   │  │  Fingerprint Profile │   │
│  │  (cookies,   │  │  (canvas noise seed, │   │
│  │   storage,   │  │   WebGL vendor,      │   │
│  │   cache)     │  │   screen res, UA,    │   │
│  │              │  │   timezone, lang,    │   │
│  │  Provided by │  │   fonts, audio)      │   │
│  │  Firefox     │  │                      │   │
│  └─────────────┘  │  Provided by          │   │
│                    │  SpaceBrowser         │   │
│                    └──────────────────────┘   │
│                                              │
│  cookieStoreId: "firefox-container-42"       │
│  spaceId: "a1b2c3d4-e5f6-..."               │
└──────────────────────────────────────────────┘
```

### Mapping
| Concept | Firefox | SpaceBrowser |
|---------|---------|-------------|
| Isolation unit | Container (contextual identity) | Space |
| ID | `cookieStoreId` | `spaceId` (UUID v4) + `cookieStoreId` |
| Cookie isolation | ✅ Native | ✅ Inherited |
| Storage isolation | ✅ Native (with Total Cookie Protection) | ✅ Inherited |
| Fingerprint isolation | ❌ Not supported | ✅ Per-space fingerprint profile |
| UI | Container color/icon in tab bar | Full sidebar with space management |

---

## 3. Space Isolation Model

### 3.1 Data Isolation (via Firefox Containers)

Each space creates a dedicated container. Firefox handles:
- **Cookie jar** — completely separate per `cookieStoreId`
- **DOM Storage** — localStorage, sessionStorage partitioned
- **indexedDB** — partitioned by origin + container
- **Cache** — network cache partitioned by top-level site + container
- **Service Workers** — scoped per container

### 3.2 Fingerprint Isolation (via SpaceBrowser)

Each space generates a **fingerprint profile** at creation time. This profile is:
- **Deterministic** — same space always produces the same fingerprint (prevents detection via inconsistency)
- **Unique** — no two spaces share fingerprint values
- **Realistic** — values are drawn from real-world distributions to avoid statistical detection

The fingerprint profile is stored alongside the space config and injected via content script on every page load.

### 3.3 What Gets Spoofed

| Category | Properties | Method |
|----------|-----------|--------|
| **Canvas** | `toDataURL()`, `toBlob()`, `getImageData()` | Deterministic pixel noise based on space seed |
| **WebGL** | `VENDOR`, `RENDERER`, `UNMASKED_VENDOR`, `UNMASKED_RENDERER`, `VERSION`, `SHADING_LANGUAGE_VERSION`, extensions | Override `getParameter()` and `getExtension()` |
| **Audio** | `AudioContext` output, `OfflineAudioContext` | Add micro-variations to audio processing |
| **Screen** | `screen.width`, `screen.height`, `screen.availWidth`, `screen.availHeight`, `screen.colorDepth`, `devicePixelRatio` | Property override on `window.screen` |
| **Navigator** | `userAgent`, `platform`, `vendor`, `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints` | Property override on `navigator` |
| **Fonts** | `document.fonts`, font enumeration via canvas | Filtered font list per space |
| **Timezone** | `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Date.getTimezoneOffset()` | Override `Intl` and `Date` prototype |
| **Language** | `navigator.language`, `navigator.languages`, `Accept-Language` header | Property override + webRequest header modification |
| **WebRTC** | `RTCPeerConnection` local IP | Block or replace `RTCPeerConnection` |
| **User-Agent** | `User-Agent` HTTP header | `webRequest.onBeforeSendHeaders` |

### 3.4 Injection Strategy

Content scripts run at `document_start` with `"all_frames": true`:

```
Page Load → content script injected (document_start)
         → script creates overrides via Object.defineProperty
         → overrides applied to window/navigator/screen/etc.
         → page's own JS runs, sees spoofed values
```

The content script uses a **main world** execution context where possible. For Firefox, we use `exportFunction()` and `cloneInto()` (Firefox-specific APIs for content script → page scope bridging) or inject a `<script>` element before any other scripts run.

---

## 4. Anti-Fingerprint System Design

### 4.1 Fingerprint Profile Generation

When a new Space is created, `fingerprint-generator.js` produces a complete profile:

```javascript
{
  spaceId: "a1b2c3d4-...",
  seed: 0x1A2B3C4D,           // 32-bit seed for deterministic noise
  canvas: {
    noiseSeed: 0x5E6F7A8B,    // Seed for canvas pixel manipulation
    noiseIntensity: 0.02      // Subtle — avoid detection
  },
  webgl: {
    vendor: "Google Inc. (NVIDIA)",
    renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    version: "WebGL 1.0 (OpenGL ES 2.0 Chromium)",
    shadingVersion: "WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)"
  },
  audio: {
    noiseSeed: 0xABCD1234,
    noiseAmount: 0.0001
  },
  screen: {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    colorDepth: 24,
    pixelRatio: 1
  },
  navigator: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
    platform: "Win32",
    vendor: "",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0
  },
  fonts: ["Arial", "Verdana", "Times New Roman", ...],
  timezone: "America/New_York",
  timezoneOffset: 300,
  language: {
    primary: "en-US",
    all: ["en-US", "en"]
  },
  webrtc: {
    mode: "block"  // "block" | "proxy"
  }
}
```

### 4.2 Deterministic Noise

All noise is generated from the space's `seed` using a seeded PRNG (xorshift128+). This ensures:
- Same space → same fingerprint → no inconsistency detection
- Different spaces → different fingerprints → no correlation

### 4.3 Canvas Fingerprint Spoofing

Canvas fingerprinting works by drawing complex shapes/text and reading back pixel data. We intercept:

1. `HTMLCanvasElement.prototype.toDataURL` — add noise to pixel data before encoding
2. `HTMLCanvasElement.prototype.toBlob` — same noise injection
3. `CanvasRenderingContext2D.prototype.getImageData` — add noise to returned `ImageData`

The noise is applied by XOR-ing each pixel's least significant bits with PRNG output seeded from the space seed + canvas dimensions. This is:
- Invisible to the human eye (< 1 LSB change per channel)
- Deterministic (same canvas content + same space = same output)
- Unique per space (different seed = different noise)

### 4.4 WebGL Fingerprint Spoofing

WebGL fingerprinting reads GPU vendor/renderer strings and measures rendering output. We override:

- `getParameter(VENDOR)` → return spoofed vendor
- `getParameter(RENDERER)` → return spoofed renderer
- `getParameter(UNMASKED_VENDOR_WEBGL)` → spoofed
- `getParameter(UNMASKED_RENDERER_WEBGL)` → spoofed
- Extension enumeration — return a consistent subset

### 4.5 Audio Context Fingerprinting

The `AudioContext` / `OfflineAudioContext` produces measurable output differences across machines. We:
- Override `OfflineAudioContext.prototype.startRendering` to add noise to the output buffer
- Noise is seeded per-space for consistency

### 4.6 Font Enumeration Protection

Websites enumerate fonts by measuring text rendering width/height with different `font-family` values. We:
- Override `document.fonts.check()` to return results matching a curated list per space
- (Phase 2: intercept CSS font loading at the engine level)

### 4.7 Header-Level Spoofing

Some fingerprint signals are in HTTP headers:
- `User-Agent` — modified via `webRequest.onBeforeSendHeaders`
- `Accept-Language` — modified to match space's language settings

The background script listens for requests from tabs in each space's container and rewrites headers accordingly.

---

## 5. Space Management

### 5.1 Lifecycle

```
Create Space
  → Generate UUID v4
  → Generate fingerprint profile
  → Create Firefox container (contextualIdentities.create)
  → Store space config (browser.storage.local)
  → Update sidebar UI

Delete Space
  → Remove all cookies for container
  → Clear container storage (browsingData API)
  → Remove Firefox container
  → Remove space config from storage
  → Update sidebar UI

Switch Space
  → Set active space in memory
  → New tabs open in active space's container
  → Sidebar highlights active space
```

### 5.2 Storage Schema

Spaces are stored in `browser.storage.local`:

```javascript
{
  "spaces": {
    "a1b2c3d4-...": {
      "id": "a1b2c3d4-...",
      "name": "Work",
      "color": "blue",
      "icon": "briefcase",
      "cookieStoreId": "firefox-container-42",
      "fingerprint": { /* full profile */ },
      "createdAt": 1700000000000,
      "lastUsedAt": 1700100000000
    },
    "e5f6a7b8-...": { ... }
  },
  "activeSpaceId": "a1b2c3d4-...",
  "settings": {
    "defaultSpace": "a1b2c3d4-...",
    "openNewTabInActiveSpace": true,
    "showSpaceIndicator": true
  }
}
```

### 5.3 Import/Export

Spaces can be exported as JSON (excluding cookies/storage data — those are browser-internal). The export includes:
- Space name, color, icon
- Fingerprint profile
- Settings

This allows migrating space identities between installations while maintaining consistent fingerprints.

---

## 6. UI Design

### 6.1 Sidebar (Primary Interface)

The sidebar is the main interface for managing spaces. It opens via:
- Browser action (toolbar button)
- Keyboard shortcut (Ctrl+Shift+S)

```
┌──────────────────────────┐
│  🚀 SpaceBrowser         │
│  ─────────────────────── │
│                          │
│  SPACES                  │
│                          │
│  ● Work          [3] ▶  │  ← Active space (highlighted)
│  ○ Personal      [1]    │
│  ○ Shopping      [0]    │
│  ○ Banking       [0]    │
│                          │
│  ─────────────────────── │
│  [+ New Space]           │
│                          │
│  ─────────────────────── │
│  ⚙ Settings              │
│  📥 Import / 📤 Export    │
└──────────────────────────┘
```

Each space entry shows:
- Color dot (matches container color)
- Space name
- Number of open tabs in that space
- Click to switch / right-click for options (rename, delete, export)

### 6.2 Tab Indicators

When a tab belongs to a space, its container tab strip shows the space color (native Firefox container UI). SpaceBrowser doesn't need to modify this — it inherits from the container system.

### 6.3 New Tab Behavior

When a space is active, new tabs (Ctrl+T, middle-click links) open in that space's container. This is done by intercepting `tabs.onCreated` and reopening the tab in the correct container if needed.

---

## 7. Security Considerations

### 7.1 Content Script Detection

Websites may try to detect content script modifications by:
- Checking if native functions have been overridden (`toString()` comparison)
- Measuring timing differences from proxy/wrapper overhead
- Comparing fingerprint values against known hardware capabilities

**Mitigations:**
- Override `Function.prototype.toString` to return original source for wrapped functions
- Keep wrapper overhead minimal (< 1ms)
- Generate realistic fingerprint combinations (don't pair a mobile UA with 4K resolution)

### 7.2 Extension Detection

Sites can try to detect the extension via:
- Probing for extension resources (`chrome-extension://` URLs)
- Checking for side effects of content scripts

**Mitigations:**
- No `web_accessible_resources` in manifest
- Content scripts don't add DOM elements or expose globals
- All communication uses `window.postMessage` with random event names

### 7.3 Cross-Space Leaks

Even with containers, some leaks are theoretically possible:
- **HSTS super-cookies** — mitigated by Firefox's container-scoped HSTS (Firefox 91+)
- **Alt-Svc fingerprinting** — partially mitigated by network partitioning
- **TLS session resumption** — Phase 2 (requires engine modification)
- **Spectre-class attacks** — out of scope (OS/hardware level)

---

## 8. Phase 2: GeckoView Fork Plan

The WebExtension prototype has limitations that can only be solved by modifying the engine:

### What Requires Engine Changes
1. **Process isolation** — each space in its own OS process
2. **Network stack separation** — separate DNS cache, TLS session state, connection pool per space
3. **Native fingerprint spoofing** — modify canvas/WebGL/audio at the C++ level (undetectable by JS)
4. **Font isolation** — restrict font enumeration at the platform integration layer
5. **GPU process isolation** — separate GPU contexts per space

### GeckoView Modification Points
- `netwerk/` — Network stack (DNS, cache, connections)
- `dom/canvas/` — Canvas rendering
- `dom/media/webaudio/` — AudioContext
- `gfx/gl/` — WebGL
- `widget/` — Screen/display info
- `intl/` — Timezone/locale

### Build System
```
mozilla-central/
├── mobile/android/geckoview/  ← GeckoView module
├── browser/                    ← Desktop Firefox (reference)
└── spacebrowser/               ← Our modifications
    ├── components/
    │   ├── SpaceManager.jsm
    │   ├── FingerprintService.jsm
    │   └── SpaceNetworkIsolation.cpp
    └── app/
        └── SpaceBrowserActivity.java  (Android)
```

This architecture document will be updated as the project evolves.
