# Phase 3: SpaceBrowser for Android — GeckoView Edition

## Table of Contents

1. [What is GeckoView?](#what-is-geckoview)
2. [System Requirements](#system-requirements)
3. [Project Structure](#project-structure)
4. [Setting Up the Project](#setting-up-the-project)
5. [How GeckoView Sessions Work](#how-geckoview-sessions-work)
6. [Building & Running](#building--running)
7. [Anti-Fingerprint on Android](#anti-fingerprint-on-android)
8. [Space Isolation Model](#space-isolation-model)
9. [Creating APK/AAB for Distribution](#creating-apkaab-for-distribution)
10. [Signing & Release](#signing--release)

---

## 1. What is GeckoView?

**GeckoView** is Mozilla's embeddable Gecko rendering engine for Android. It's the same engine that powers Firefox, packaged as an Android library that you can embed in any Android app — like a WebView replacement, but with the full power of Gecko.

### Why GeckoView for SpaceBrowser?

| Feature | Android WebView | GeckoView |
|---------|----------------|-----------|
| Engine | Chromium (system-provided) | Gecko (bundled) |
| Extension API | ❌ None | ✅ WebExtension API subset |
| Content script injection | ❌ Limited | ✅ Full support |
| Session isolation | ❌ Shared state | ✅ Per-session storage |
| Tracking protection | ❌ None built-in | ✅ Enhanced Tracking Protection |
| User agent control | ⚠️ Hacky | ✅ First-class API |
| Engine updates | Tied to OS updates | Bundled with app |

GeckoView gives us:
- **WebExtension API** — we can load our anti-fingerprint extension directly
- **Per-session isolation** — each `GeckoSession` can have its own storage, cookies, and settings
- **Content process isolation** — Gecko's Fission architecture for site isolation
- **Privacy-first defaults** — Enhanced Tracking Protection, cookie partitioning, etc.

### How It Ships

GeckoView is distributed as an AAR via Mozilla's Maven repository. When you add it as a dependency, the full Gecko engine (~50MB) is bundled into your APK. This means:
- Your APK will be ~60-80MB (vs ~5MB for a WebView-based app)
- You control the engine version (not dependent on OS updates)
- Consistent behavior across all Android versions ≥ API 24

---

## 2. System Requirements

### Development Machine

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 10 / macOS 12 / Ubuntu 20.04 | Latest stable |
| **RAM** | 8 GB | 16 GB+ |
| **Disk** | 20 GB free | 50 GB+ free |
| **CPU** | Any x86_64 | 4+ cores |

### Software

| Software | Version | Notes |
|----------|---------|-------|
| **Android Studio** | Hedgehog (2023.1.1)+ | Latest stable recommended |
| **JDK** | 17 | Bundled with Android Studio |
| **Android SDK** | API 34 | compileSdk and targetSdk |
| **Android NDK** | Not required | GeckoView handles native code |
| **Kotlin** | 1.9.22+ | Via Gradle plugin |
| **Gradle** | 8.4+ | Via wrapper |

### Target Device / Emulator

- **Minimum API**: 24 (Android 7.0 Nougat)
- **Target API**: 34 (Android 14)
- **Architecture**: arm64-v8a, armeabi-v7a, x86_64, x86
- **RAM**: 2 GB+ recommended

---

## 3. Project Structure

```
android/
├── build.gradle                    # Root build file
├── settings.gradle                 # Project settings
├── gradle.properties               # Gradle config
├── app/
│   ├── build.gradle                # App-level build file
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml
│           ├── java/app/spacebrowser/
│           │   ├── SpaceBrowserApp.kt          # Application class
│           │   ├── model/
│           │   │   ├── Space.kt                # Space data model
│           │   │   └── FingerprintProfile.kt   # Fingerprint profile
│           │   ├── space/
│           │   │   └── SpaceManager.kt         # Space CRUD + persistence
│           │   ├── browser/
│           │   │   ├── SpaceBrowserActivity.kt # Main browser UI
│           │   │   └── SpaceSessionManager.kt  # GeckoSession management
│           │   ├── fingerprint/
│           │   │   └── FingerprintInjector.kt  # JS injection for anti-FP
│           │   └── ui/
│           │       ├── SpaceSwitcherSheet.kt   # Bottom sheet for spaces
│           │       └── CreateSpaceDialog.kt    # New space dialog
│           └── res/
│               ├── layout/
│               │   ├── activity_browser.xml
│               │   ├── item_space.xml
│               │   ├── bottom_sheet_spaces.xml
│               │   └── dialog_create_space.xml
│               └── values/
│                   ├── themes.xml
│                   ├── colors.xml
│                   └── strings.xml
```

---

## 4. Setting Up the Project

### Step 1: Clone and Open

```bash
cd spacebrowser/android
# Open this directory in Android Studio
```

### Step 2: Gradle Sync

Android Studio will automatically download:
- GeckoView AAR (~50MB per architecture)
- Material Design 3 components
- Kotlin runtime and coroutines

### Step 3: Mozilla Maven Repository

The project is configured to pull GeckoView from Mozilla's Maven repo:

```groovy
// In settings.gradle
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven { url "https://maven.mozilla.org/maven2/" }
    }
}
```

### Step 4: GeckoView Version

We use `geckoview-omni`, which bundles all CPU architectures:

```groovy
implementation "org.mozilla.geckoview:geckoview-omni:128.0.20240701000000"
```

For release builds, use architecture-specific variants to reduce APK size:
- `geckoview-arm64-v8a` — 64-bit ARM (most modern devices)
- `geckoview-armeabi-v7a` — 32-bit ARM
- `geckoview-x86_64` — x86 emulators

---

## 5. How GeckoView Sessions Work

GeckoView's architecture maps perfectly to SpaceBrowser's isolation model:

```
┌─────────────────────────────────────────────┐
│              GeckoRuntime                    │
│           (one per app process)              │
│                                             │
│  ┌──────────────┐  ┌──────────────┐         │
│  │ GeckoSession  │  │ GeckoSession  │  ...   │
│  │ (Space: Work) │  │ (Space: Play) │        │
│  │               │  │               │        │
│  │ • Own cookies │  │ • Own cookies │        │
│  │ • Own storage │  │ • Own storage │        │
│  │ • Own cache   │  │ • Own cache   │        │
│  │ • Own UA      │  │ • Own UA      │        │
│  │ • Own ETP     │  │ • Own ETP     │        │
│  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                 │
│  ┌──────▼───────┐  ┌──────▼───────┐         │
│  │  GeckoView    │  │  GeckoView    │        │
│  │  (UI widget)  │  │  (UI widget)  │        │
│  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────┘
```

### Key Concepts

- **GeckoRuntime**: Singleton — one per application. Manages the Gecko engine lifecycle.
- **GeckoSession**: Represents a browsing session (like a tab). Each session has its own:
  - Cookie store
  - DOM storage
  - HTTP cache
  - Session settings (user agent, tracking protection level)
- **GeckoView**: The Android `View` widget that renders a `GeckoSession`.
- **SessionSettings**: Configuration per session — user agent, tracking protection, etc.

### Session Lifecycle

```kotlin
// Create a session
val session = GeckoSession(GeckoSessionSettings.Builder()
    .useTrackingProtection(true)
    .userAgentOverride("Mozilla/5.0 ...")
    .build())

// Open it (connects to GeckoRuntime)
session.open(runtime)

// Attach to a GeckoView for rendering
geckoView.setSession(session)

// Navigate
session.loadUri("https://example.com")

// When done
session.close()
```

### Isolation Between Spaces

Each space creates sessions with **unique `SessionSettings`**:
- Different `userAgentOverride`
- Different context ID (for cookie isolation)
- Different storage partition

Combined with our anti-fingerprint JavaScript injection, each space presents a completely different browser identity.

---

## 6. Building & Running

### Debug Build

```bash
# From android/ directory
./gradlew assembleDebug

# Install on connected device/emulator
./gradlew installDebug

# Or run directly from Android Studio (▶ button)
```

### Run on Emulator

1. Create an AVD in Android Studio (API 28+, x86_64 recommended)
2. Boot the emulator
3. Click ▶ Run in Android Studio

### Run on Physical Device

1. Enable Developer Options on device
2. Enable USB Debugging
3. Connect via USB
4. Select device in Android Studio
5. Click ▶ Run

---

## 7. Anti-Fingerprint on Android

Our anti-fingerprint system works on Android through two mechanisms:

### Method 1: Built-in WebExtension (Primary)

GeckoView supports loading WebExtensions programmatically:

```kotlin
runtime.webExtensionController.installBuiltIn("resource://android/assets/extensions/fingerprint-guard/")
```

We bundle a WebExtension in the APK's assets that:
- Injects content scripts at `document_start`
- Overrides `navigator`, `screen`, canvas, WebGL, audio, timezone APIs
- Uses the same deterministic PRNG (Mulberry32) as the desktop version

### Method 2: JavaScript Injection via ContentDelegate (Fallback)

If WebExtension loading fails, we inject JavaScript directly:

```kotlin
session.contentDelegate = object : GeckoSession.ContentDelegate {
    override fun onPageStart(session: GeckoSession, url: String) {
        session.loadUri("javascript:${fingerprintOverrideCode}")
    }
}
```

### Cross-Platform Consistency

The fingerprint profiles are generated using the same algorithm on both platforms:
- Same UUID → same seed → same PRNG sequence → same fingerprint
- A space created on desktop and imported to Android will have identical fingerprints
- The `Mulberry32` PRNG is implemented identically in both JavaScript and Kotlin

---

## 8. Space Isolation Model

```
┌──────────────────────────────────────────────┐
│              Space "Shopping"                 │
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐   │
│  │  GeckoSession    │  │  Fingerprint      │  │
│  │  Isolation       │  │  Profile          │  │
│  │                  │  │                   │  │
│  │  • Cookies       │  │  • User Agent     │  │
│  │  • localStorage  │  │  • Canvas noise   │  │
│  │  • IndexedDB     │  │  • WebGL vendor   │  │
│  │  • HTTP cache    │  │  • Screen res     │  │
│  │  • Session data  │  │  • Timezone       │  │
│  │                  │  │  • Fonts          │  │
│  │  Provided by     │  │  • Audio noise    │  │
│  │  GeckoView       │  │                   │  │
│  └─────────────────┘  │  Provided by       │  │
│                        │  SpaceBrowser      │  │
│                        └──────────────────┘   │
│                                              │
│  spaceId: "a1b2c3d4-e5f6-..."               │
│  color: 🔵 Blue                              │
└──────────────────────────────────────────────┘
```

---

## 9. Creating APK/AAB for Distribution

### APK (Direct Distribution)

```bash
# Debug APK
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Release APK (unsigned)
./gradlew assembleRelease
# Output: app/build/outputs/apk/release/app-release-unsigned.apk
```

### AAB (Google Play)

```bash
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### APK Splits by Architecture (Reduce Size)

In `app/build.gradle`:

```groovy
android {
    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a", "x86_64"
            universalApk true
        }
    }
}
```

This produces separate APKs per architecture (~30MB each vs ~80MB universal).

---

## 10. Signing & Release

### Generate a Keystore

```bash
keytool -genkey -v \
  -keystore spacebrowser-release.jks \
  -keyalg RSA -keysize 2048 \
  -validity 10000 \
  -alias spacebrowser
```

### Configure Signing in Gradle

Create `android/keystore.properties` (DO NOT commit this):

```properties
storePassword=your_store_password
keyPassword=your_key_password
keyAlias=spacebrowser
storeFile=../spacebrowser-release.jks
```

In `app/build.gradle`:

```groovy
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### Sign and Build

```bash
# Signed release APK
./gradlew assembleRelease

# Signed AAB for Play Store
./gradlew bundleRelease
```

### Distribution Channels

1. **GitHub Releases** — Upload signed APKs for direct download
2. **F-Droid** — Open-source app store (requires reproducible builds)
3. **Google Play** — Upload AAB to Play Console
4. **Side-loading** — Share APK directly

---

## Next Steps

- **Phase 4**: iOS version using WKWebView (limited but possible)
- **Phase 5**: Sync service for spaces across desktop ↔ Android
- **Phase 6**: Built-in VPN/proxy per space
