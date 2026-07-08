# 🚀 SpaceBrowser

**Fully isolated browsing spaces with anti-fingerprinting.** Each space is like a completely separate browser — zero cookie, session, or data sharing between spaces. Websites cannot detect they're the same browser.

## What is a Space?

A **Space** is a fully isolated browsing environment:

- 🔒 **Own cookies, sessions, localStorage, cache** — nothing shared between spaces
- 🆔 **Unique ID** — each space has a UUID v4 identifier
- 🎭 **Anti-fingerprinting** — every space has a unique browser fingerprint:
  - Canvas fingerprint (deterministic noise)
  - WebGL vendor/renderer
  - Audio context fingerprint
  - Screen resolution & color depth
  - User-Agent & platform
  - Timezone & language
  - Font enumeration
  - Hardware concurrency & device memory
  - WebRTC IP leak prevention

## How It Works

Built as a **Firefox WebExtension** that extends Firefox's Container Tabs:

1. Each Space creates a Firefox **contextual identity** (container) for full cookie/session isolation
2. A **fingerprint profile** is generated per space using a seeded PRNG — same space ID = same fingerprint every time
3. A **content script** injects fingerprint overrides into every page before any JS runs
4. **HTTP headers** (User-Agent) are modified per-container via webRequest API

## Project Structure

```
spacebrowser/
├── manifest.json                          # Extension manifest
├── src/
│   ├── background.js                     # Central coordinator
│   ├── space-manager/
│   │   ├── space-manager.js              # Create/delete/switch spaces
│   │   └── space-store.js                # Persistence layer
│   ├── anti-fingerprint/
│   │   ├── fingerprint-generator.js      # Generate unique fingerprints per space
│   │   └── fingerprint-injector.js       # Content script — injects overrides
│   └── ui/
│       ├── spaces-sidebar.html           # Sidebar panel
│       ├── spaces-sidebar.css            # Dark theme styles
│       └── spaces-sidebar.js             # Sidebar controller
└── icons/                                # Extension icons (add your own)
```

## Installation (Development)

1. Open Firefox
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Select `manifest.json` from this directory
5. The SpaceBrowser sidebar icon appears — click it or press `Ctrl+Shift+S`

### Prerequisites

- Firefox 67+ (contextualIdentities API support)
- Enable containers: `about:config` → `privacy.userContext.enabled` = `true`

## Usage

1. **Create a Space** — Click `+` in the sidebar, name it, pick a color
2. **Switch Spaces** — Click any space card to make it active
3. **New Tab in Space** — Click the `+` button on a space card
4. **Delete Space** — Hover a card, click `✕` (deletes all data in that space)

## Anti-Fingerprinting Details

Each space's fingerprint is **deterministic** — generated from the space's UUID using a seeded PRNG (xorshift128+). This means:

- Same space = same fingerprint every session
- Different spaces = completely different fingerprints
- Fingerprints use **real-world values** (actual GPU names, real screen resolutions, etc.)

### What's spoofed:

| API | Method |
|-----|--------|
| Canvas | Deterministic pixel noise on toDataURL/toBlob/getImageData |
| WebGL | Fake vendor/renderer via getParameter + debug extension |
| Audio | Noise injection on AudioBuffer.getChannelData |
| Navigator | userAgent, platform, vendor, hardwareConcurrency, deviceMemory |
| Screen | width, height, colorDepth, pixelRatio |
| Timezone | getTimezoneOffset + Intl.DateTimeFormat |
| Fonts | document.fonts.check filtered to space-specific subset |
| WebRTC | RTCPeerConnection blocked to prevent IP leaks |

### Anti-detection

- All overridden functions return `[native code]` on `.toString()` checks
- Overrides apply to all frames (iframes included)
- Content script runs at `document_start` before any page JS

## Roadmap

- [ ] Phase 1: Firefox WebExtension (current — prototype)
- [ ] Phase 2: Fork Firefox — bake spaces into the browser natively
- [ ] Phase 3: Android version using GeckoView
- [ ] Proxy/VPN per space
- [ ] Space import/export with full data
- [ ] Space templates (pre-configured fingerprints)
- [ ] Keyboard shortcuts per space

## License

MIT
