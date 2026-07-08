# SpaceBrowser Phase 2 — Building from Firefox Source

## Overview

Phase 2 forks Mozilla Firefox (Gecko engine) and bakes Spaces natively into the
browser. Instead of layering an extension on top, we modify the browser's core
to support per-Space fingerprint profiles, proxy routing, and a first-class
Spaces UI in the chrome.

**Expected first-build time: 1–3 hours** (depending on hardware).
Incremental rebuilds after code changes typically take 2–10 minutes.

---

## 1. System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| OS | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |
| Disk | 40 GB free | 80 GB+ (build artifacts are large) |
| RAM | 8 GB | 16 GB+ (32 GB ideal) |
| CPU | 4 cores | 8+ cores (parallel build) |
| Network | Broadband (source clone ~2 GB) | — |

> **macOS** and **Windows (WSL2)** work but are slower and less tested.
> We strongly recommend a dedicated Linux build machine or VM.

---

## 2. Install Dependencies (Ubuntu/Debian)

```bash
# Essential build tools
sudo apt update && sudo apt install -y \
  build-essential \
  python3 python3-pip python3-dev \
  mercurial \
  git \
  curl wget \
  unzip zip \
  pkg-config \
  m4 \
  autoconf2.13 \
  libgtk-3-dev \
  libglib2.0-dev \
  libdbus-glib-1-dev \
  libxt-dev \
  libx11-xcb-dev \
  libpulse-dev \
  libasound2-dev \
  yasm nasm \
  nodejs npm \
  clang lld \
  llvm \
  cbindgen \
  rustup || true

# Install Rust (Firefox requires a specific version; bootstrap handles it)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Mercurial (latest via pip for best compatibility)
pip3 install --user mercurial
```

> **Note:** Mozilla's `./mach bootstrap` will install anything missing.
> The list above covers 95% of what's needed to avoid bootstrap prompts.

---

## 3. Clone mozilla-unified

Mozilla uses Mercurial for their main repository. We clone the `mozilla-unified`
repo which tracks all release channels.

```bash
# Create workspace
mkdir -p ~/spacebrowser && cd ~/spacebrowser

# Clone (this downloads ~2 GB — go grab coffee)
hg clone https://hg.mozilla.org/mozilla-unified
cd mozilla-unified

# Check out the latest ESR (Extended Support Release) for stability
# ESR gives us a stable base with long support windows
hg update -r 'last(esr128)'

# Alternatively, use a specific release tag:
# hg update -r 'FIREFOX_128_0_RELEASE'
```

### Why ESR?

ESR branches receive security patches for ~1 year with minimal feature churn.
This gives us a stable foundation to patch against without constant merge
conflicts from Nightly changes.

---

## 4. Apply SpaceBrowser Patches

Copy the SpaceBrowser patch files into the source tree:

```bash
# From the spacebrowser project root (where this guide lives)
PATCH_DIR="$(pwd)/mozilla-patches"
FIREFOX_SRC="$HOME/spacebrowser/mozilla-unified"

# See mozilla-patches/README.md for the complete integration guide
# Quick version:
cp "$PATCH_DIR/mozconfig" "$FIREFOX_SRC/.mozconfig"

# Copy branding
cp -r "$PATCH_DIR/branding" "$FIREFOX_SRC/browser/branding/spacebrowser"

# Copy Space identity service
cp "$PATCH_DIR/space-identity-service.jsm" \
   "$FIREFOX_SRC/toolkit/components/contextualidentity/SpaceIdentityService.sys.mjs"

# Copy browser UI files
cp "$PATCH_DIR/browser-ui/spaces-panel.js" \
   "$FIREFOX_SRC/browser/components/spaces/SpacesPanel.sys.mjs"
cp "$PATCH_DIR/browser-ui/spaces-panel.css" \
   "$FIREFOX_SRC/browser/components/spaces/spaces-panel.css"
cp "$PATCH_DIR/browser-ui/spaces-panel.xhtml" \
   "$FIREFOX_SRC/browser/components/spaces/spaces-panel.xhtml"
cp "$PATCH_DIR/browser-ui/spaces-toolbar-button.js" \
   "$FIREFOX_SRC/browser/components/spaces/SpacesToolbarButton.sys.mjs"

# Copy default prefs
cp "$PATCH_DIR/user-prefs.js" \
   "$FIREFOX_SRC/browser/app/profile/spacebrowser.js"
```

See `mozilla-patches/README.md` for the full integration guide including
source modifications required for registration and linking.

---

## 5. Set Up .mozconfig

The `.mozconfig` file controls what gets built. We provide one at
`mozilla-patches/mozconfig` — it's already copied above.

Key settings:
- Custom SpaceBrowser branding
- Contextual identities enabled by default
- Telemetry, crash reporter, and updater disabled
- Optimized release build
- Pocket and other unnecessary features disabled

Review and adjust for your environment:

```bash
cat "$FIREFOX_SRC/.mozconfig"
# Edit if needed — e.g., change -j flag for your core count
```

---

## 6. Bootstrap the Build System

```bash
cd "$FIREFOX_SRC"

# Let mach install remaining dependencies
# Select option 1 (Firefox for Desktop) when prompted
./mach bootstrap

# This installs:
# - Correct Rust toolchain
# - cbindgen, node, etc.
# - System packages it detects as missing
```

---

## 7. Build SpaceBrowser

```bash
cd "$FIREFOX_SRC"

# Full build (1-3 hours first time)
./mach build

# Watch for errors. Common fixes:
# - Missing packages: re-run ./mach bootstrap
# - OOM: reduce parallelism with `mk_add_options MOZ_PARALLEL_BUILD=4` in .mozconfig
# - Rust errors: ./mach bootstrap will fix toolchain version
```

### Build Tips

```bash
# Speed up rebuilds — only rebuild changed components
./mach build faster

# Build just one component (e.g., after changing our Spaces code)
./mach build toolkit/components/contextualidentity
./mach build browser/components/spaces

# Clean build (nuclear option — full rebuild)
./mach clobber && ./mach build
```

---

## 8. Run SpaceBrowser

```bash
# Launch with a fresh profile
./mach run

# Launch with a specific profile
./mach run --profile /path/to/profile

# Launch with debugging
./mach run --debug --debugger gdb

# Launch with Browser Toolbox enabled (for chrome JS debugging)
./mach run --jsdebugger
```

The browser should launch with SpaceBrowser branding, the Spaces toolbar
button, and containers enabled by default.

---

## 9. Create Distributable Packages

```bash
# Create a .tar.bz2 / .dmg / .exe installer
./mach package

# Output location:
# Linux:   obj-*/dist/spacebrowser-*.tar.bz2
# macOS:   obj-*/dist/SpaceBrowser-*.dmg
# Windows: obj-*/dist/install/sea/spacebrowser-*.installer.exe

# Create a .deb package (Linux)
./mach package
# Then use the tarball to create a .deb:
# (We'll provide a packaging script in Phase 3)
```

### Distribution Checklist

- [ ] Test on clean Ubuntu 22.04 install
- [ ] Test on clean Ubuntu 24.04 install
- [ ] Verify branding (window title, about dialog, icons)
- [ ] Verify Spaces panel opens and works
- [ ] Verify per-Space fingerprinting (use our test suite)
- [ ] Verify proxy routing per Space
- [ ] Verify no telemetry is sent (use mitmproxy)
- [ ] Verify updater is disabled
- [ ] Run Firefox's own test suite: `./mach test`

---

## 10. Development Workflow

### Making Changes

1. Edit source files in `mozilla-unified/`
2. `./mach build faster` (incremental rebuild, 1-5 min)
3. `./mach run` to test
4. When happy, create patches with `hg diff > my-change.patch`

### Useful Commands

```bash
# Run specific tests
./mach test browser/components/spaces/

# Run linter
./mach lint browser/components/spaces/

# Search the source
./mach searchfox "ContextualIdentityService"

# Open SearchFox in browser (Mozilla's code search)
# https://searchfox.org/mozilla-central/search

# View build log
cat obj-*/config.log
```

### Keeping Up with Firefox ESR

```bash
# Pull latest ESR changes
hg pull -u
hg update -r 'last(esr128)'

# Reapply our patches (resolve conflicts as needed)
# We'll automate this with a rebase script in Phase 3
```

---

## Troubleshooting

### "ERROR: Cannot find a suitable C++ compiler"
```bash
sudo apt install clang lld
```

### "ERROR: Rust compiler not found"
```bash
rustup install stable
./mach bootstrap
```

### Build runs out of memory
Add to `.mozconfig`:
```
mk_add_options MOZ_PARALLEL_BUILD=4  # Reduce parallel jobs
```

### "node: command not found"
```bash
sudo apt install nodejs npm
# Or use nvm for a specific version
```

### Incremental build fails after pull
```bash
./mach clobber  # Clean everything
./mach build    # Full rebuild
```

---

## Next Steps

Once you have a working build:

1. **Test Spaces UI** — Create spaces, switch between them, verify tab isolation
2. **Test fingerprinting** — Use our fingerprint test suite from Phase 1
3. **Test proxy routing** — Configure per-Space proxies
4. **Profile performance** — Ensure our changes don't regress browser perf
5. **Package and distribute** — Create installers for testers

See `mozilla-patches/README.md` for details on how each patch integrates
with the Firefox source tree.
