# SpaceBrowser — Mozilla Patches Integration Guide

This directory contains all the files needed to transform Firefox into SpaceBrowser.
Follow this guide to apply them to a fresh `mozilla-unified` source tree.

## Prerequisites

- Cloned `mozilla-unified` repo (see `../PHASE2-BUILD-GUIDE.md`)
- Checked out an ESR branch (e.g., `esr128`)

Set the variables:
```bash
PATCHES="$(pwd)"                           # This directory
FIREFOX="$HOME/spacebrowser/mozilla-unified"  # Firefox source
```

---

## Step 1: Branding

Create the SpaceBrowser branding directory:

```bash
mkdir -p "$FIREFOX/browser/branding/spacebrowser/pref"
mkdir -p "$FIREFOX/browser/branding/spacebrowser/locales/en-US"

cp "$PATCHES/branding/configure.sh"                          "$FIREFOX/browser/branding/spacebrowser/"
cp "$PATCHES/branding/pref/firefox-branding.js"              "$FIREFOX/browser/branding/spacebrowser/pref/"
cp "$PATCHES/branding/locales/en-US/brand.properties"        "$FIREFOX/browser/branding/spacebrowser/locales/en-US/"
cp "$PATCHES/branding/locales/en-US/brand.ftl"               "$FIREFOX/browser/branding/spacebrowser/locales/en-US/"
```

You'll also need icon files. For now, copy Firefox's nightly icons as placeholders:
```bash
cp "$FIREFOX/browser/branding/nightly/"*.png "$FIREFOX/browser/branding/spacebrowser/" 2>/dev/null || true
cp "$FIREFOX/browser/branding/nightly/"*.ico "$FIREFOX/browser/branding/spacebrowser/" 2>/dev/null || true
cp "$FIREFOX/browser/branding/nightly/"*.svg "$FIREFOX/browser/branding/spacebrowser/" 2>/dev/null || true
```

Create `moz.build` for branding:
```bash
cat > "$FIREFOX/browser/branding/spacebrowser/moz.build" << 'EOF'
# SpaceBrowser branding
DIRS += ["locales"]
EOF
```

---

## Step 2: Build Configuration

```bash
cp "$PATCHES/mozconfig" "$FIREFOX/.mozconfig"
```

Review `.mozconfig` and adjust for your system (core count, paths, etc.).

---

## Step 3: SpaceIdentityService (Core Module)

This is the heart of SpaceBrowser — the native service managing spaces.

```bash
cp "$PATCHES/space-identity-service.jsm" \
   "$FIREFOX/toolkit/components/contextualidentity/SpaceIdentityService.sys.mjs"
```

### Register the module:

Edit `$FIREFOX/toolkit/components/contextualidentity/moz.build`:
```python
# Add to EXTRA_JS_MODULES:
EXTRA_JS_MODULES += [
    'ContextualIdentityService.sys.mjs',
    'SpaceIdentityService.sys.mjs',    # ← ADD THIS
]
```

### Make it available as a resource:

The module is automatically available as:
```
resource://gre/modules/SpaceIdentityService.sys.mjs
```

Because `toolkit/components/contextualidentity/` modules are installed
to `dist/bin/modules/` by the existing `moz.build`.

---

## Step 4: Browser UI — Spaces Panel & Toolbar Button

Create the Spaces component directory:

```bash
mkdir -p "$FIREFOX/browser/components/spaces"

cp "$PATCHES/browser-ui/spaces-panel.js"          "$FIREFOX/browser/components/spaces/SpacesPanel.sys.mjs"
cp "$PATCHES/browser-ui/spaces-panel.css"          "$FIREFOX/browser/components/spaces/spaces-panel.css"
cp "$PATCHES/browser-ui/spaces-panel.xhtml"        "$FIREFOX/browser/components/spaces/spaces-panel.xhtml"
cp "$PATCHES/browser-ui/spaces-toolbar-button.js"  "$FIREFOX/browser/components/spaces/SpacesToolbarButton.sys.mjs"
```

### Create `moz.build`:

```bash
cat > "$FIREFOX/browser/components/spaces/moz.build" << 'EOF'
# SpaceBrowser — Spaces Panel and Toolbar Button

EXTRA_JS_MODULES += [
    'SpacesPanel.sys.mjs',
    'SpacesToolbarButton.sys.mjs',
]

JAR_MANIFESTS += ['jar.mn']
EOF
```

### Create `jar.mn` (maps files to chrome:// URLs):

```bash
cat > "$FIREFOX/browser/components/spaces/jar.mn" << 'EOF'
browser.jar:
    content/browser/spaces/spaces-panel.xhtml     (spaces-panel.xhtml)
    content/browser/spaces/spaces-panel.css        (spaces-panel.css)
EOF
```

### Register in parent moz.build:

Edit `$FIREFOX/browser/components/moz.build`:
```python
# Add 'spaces' to the DIRS list:
DIRS += [
    # ... existing entries ...
    'spaces',           # ← ADD THIS
    'sessionstore',
    # ...
]
```

---

## Step 5: Initialize Spaces at Browser Startup

Edit `$FIREFOX/browser/base/content/browser.js` to initialize the Spaces
toolbar button when a window opens. Find the `delayedStartupFinished` function
(around line ~1800) and add:

```javascript
// === SPACEBROWSER: Initialize Spaces UI ===
ChromeUtils.importESModule(
  "resource:///modules/SpacesToolbarButton.sys.mjs"
).SpacesToolbarButton.init();
// === END SPACEBROWSER ===
```

### Register sidebar panel:

Edit `$FIREFOX/browser/components/sidebar/sidebar.json` (or equivalent
sidebar registration file) to add our Spaces panel:

```json
{
  "viewSpacesPanel": {
    "url": "chrome://browser/content/spaces/spaces-panel.xhtml",
    "title": "Spaces",
    "icon": "chrome://browser/skin/spaces-16.svg"
  }
}
```

---

## Step 6: Default Preferences

```bash
# Append SpaceBrowser prefs to Firefox's default prefs
cat "$PATCHES/user-prefs.js" >> "$FIREFOX/browser/app/profile/firefox.js"
```

Or to keep them separate (cleaner for maintenance):
```bash
cp "$PATCHES/user-prefs.js" "$FIREFOX/browser/app/profile/spacebrowser.js"
```

Then edit `$FIREFOX/browser/app/profile/moz.build` to include the new file:
```python
FINAL_TARGET_PP_FILES.browser += [
    'firefox.js',
    'spacebrowser.js',    # ← ADD THIS
]
```

---

## Step 7: Fingerprint Resistance Patches (C++)

The file `resist-fingerprinting-per-space.patch` is a **detailed guide** showing
exactly what C++ code to modify. It covers 7 core files:

1. `toolkit/components/resistfingerprinting/nsRFPService.h` — Add per-space profile cache
2. `toolkit/components/resistfingerprinting/nsRFPService.cpp` — Implement profile lookup + canvas noise
3. `dom/canvas/CanvasRenderingContext2D.cpp` — Per-space canvas noise
4. `dom/canvas/WebGLContextState.cpp` — Per-space WebGL vendor/renderer
5. `dom/media/webaudio/AudioNodeEngine.cpp` — Per-space audio noise
6. `netwerk/protocol/http/nsHttpChannel.cpp` — Per-space User-Agent header
7. `dom/base/Navigator.cpp` — Per-space navigator properties

### How to apply:

The patch file is a **pseudo-patch with inline documentation**. It's not a raw
`git diff` — it's designed to be read and applied manually:

1. Open the patch file alongside each Firefox source file
2. Find the functions described in the comments
3. Apply the modifications shown in the `+` lines
4. Build and test incrementally: `./mach build <component>`

This manual approach is necessary because:
- Firefox's codebase changes between versions
- Line numbers shift across ESR releases
- The comments explain the "why" so you can adapt to code changes

### Build order for C++ changes:

```bash
# After modifying nsRFPService (step 1-2):
./mach build toolkit/components/resistfingerprinting

# After modifying Canvas (step 3):
./mach build dom/canvas

# After modifying WebGL (step 4):
./mach build dom/canvas

# After modifying Audio (step 5):
./mach build dom/media

# After modifying HTTP handler (step 6):
./mach build netwerk

# After modifying Navigator (step 7):
./mach build dom/base

# Full rebuild to catch any linking issues:
./mach build
```

---

## Step 8: Build & Run

```bash
cd "$FIREFOX"

# Bootstrap (installs toolchains, dependencies)
./mach bootstrap

# Build (1-3 hours first time)
./mach build

# Run
./mach run
```

---

## Verification Checklist

After building, verify:

- [ ] Window title shows "SpaceBrowser" (not Firefox)
- [ ] About dialog shows SpaceBrowser branding
- [ ] Spaces toolbar button appears in the toolbar
- [ ] Clicking the Spaces button opens the dropdown
- [ ] Creating a new Space works (sidebar or dropdown)
- [ ] Switching spaces changes the toolbar button color/label
- [ ] New tabs open in the active Space's container
- [ ] Tabs in different Spaces have different cookies (test with a login)
- [ ] Canvas fingerprint differs between Spaces (use browserleaks.com)
- [ ] WebGL vendor/renderer differs between Spaces
- [ ] navigator.userAgent differs between Spaces
- [ ] navigator.platform differs between Spaces
- [ ] navigator.hardwareConcurrency differs between Spaces
- [ ] Screen dimensions differ between Spaces
- [ ] Audio fingerprint differs between Spaces
- [ ] WebRTC IP leak is blocked
- [ ] No telemetry pings sent (check with Wireshark/mitmproxy)
- [ ] Pocket is disabled
- [ ] Firefox Accounts UI is hidden

---

## File Summary

```
mozilla-patches/
├── README.md                              ← This file
├── mozconfig                              ← Build configuration
├── user-prefs.js                          ← Default preferences (privacy-hardened)
├── space-identity-service.jsm             ← Core Spaces module (1000+ lines)
├── resist-fingerprinting-per-space.patch  ← C++ patch guide (900+ lines)
├── branding/
│   ├── configure.sh                       ← Branding config
│   ├── pref/
│   │   └── firefox-branding.js            ← Branding prefs
│   └── locales/en-US/
│       ├── brand.properties               ← Brand strings (legacy)
│       └── brand.ftl                      ← Brand strings (Fluent)
└── browser-ui/
    ├── spaces-panel.js                    ← Native Spaces panel (800+ lines)
    ├── spaces-panel.css                   ← Panel styles (Proton theme)
    ├── spaces-panel.xhtml                 ← Panel markup (XUL/HTML)
    └── spaces-toolbar-button.js           ← Toolbar button + dropdown
```

## Total Code Written

- **SpaceIdentityService:** ~1,100 lines (JS) — space CRUD, fingerprint generation, persistence
- **RFP Patch Guide:** ~930 lines — 7 C++ files with detailed modification instructions
- **Spaces Panel:** ~870 lines (JS) + 490 lines (CSS) + 200 lines (XHTML)
- **Toolbar Button:** ~300 lines (JS)
- **Preferences:** ~160 lines
- **Build Guide:** ~350 lines

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    SpaceBrowser UI                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Toolbar Btn   │  │ Spaces Panel │  │ Tab Indicator │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘ │
│         │                  │                   │         │
│         └──────────────────┼───────────────────┘         │
│                            │                             │
│              ┌─────────────▼──────────────┐              │
│              │  SpaceIdentityService.mjs  │              │
│              │  (Create/Switch/Delete)     │              │
│              │  (Fingerprint Generation)   │              │
│              │  (Persistence → spaces.json)│              │
│              └─────────────┬──────────────┘              │
│                            │                             │
│              ┌─────────────▼──────────────┐              │
│              │ ContextualIdentityService  │              │
│              │ (Firefox Container Engine) │              │
│              │ Cookie/Storage Isolation   │              │
│              └─────────────┬──────────────┘              │
│                            │                             │
│    ┌───────────────────────┼────────────────────────┐    │
│    │              nsRFPService (C++)                │    │
│    │         Per-Space Fingerprint Profiles          │    │
│    │                                                 │    │
│    │  ┌─────────┐ ┌───────┐ ┌───────┐ ┌──────────┐ │    │
│    │  │ Canvas  │ │ WebGL │ │ Audio │ │Navigator │ │    │
│    │  │ Noise   │ │ Spoof │ │ Noise │ │  Props   │ │    │
│    │  └─────────┘ └───────┘ └───────┘ └──────────┘ │    │
│    │                                                 │    │
│    │  ┌──────────┐ ┌────────┐ ┌────────────────┐   │    │
│    │  │ Screen   │ │ Fonts  │ │ HTTP UA Header │   │    │
│    │  │ Override │ │ Filter │ │ Per-Container   │   │    │
│    │  └──────────┘ └────────┘ └────────────────┘   │    │
│    └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```
