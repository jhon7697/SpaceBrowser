/* SpaceBrowser — Default User Preferences
 *
 * Location in Firefox source: browser/app/profile/spacebrowser.js
 * (Appended to or replaces sections of firefox.js)
 *
 * These preferences are baked into SpaceBrowser and set on first run.
 * They configure the browser for maximum privacy and enable Spaces by default.
 */

// =============================================================================
// SPACES — Core Feature
// =============================================================================

// Enable container tabs (contextual identities) — required for Spaces
pref("privacy.userContext.enabled", true);
pref("privacy.userContext.ui.enabled", true);
pref("privacy.userContext.newTabContainerOnLeftClick.enabled", true);

// Auto-open new tabs in the active Space
pref("spacebrowser.spaces.openNewTabInActiveSpace", true);

// Show Space indicator on tabs
pref("spacebrowser.spaces.showTabIndicator", true);

// Enable per-space fingerprint resistance (our custom feature)
pref("spacebrowser.spaces.perSpaceFingerprinting", true);

// Maximum number of spaces
pref("spacebrowser.spaces.maxSpaces", 100);

// =============================================================================
// PRIVACY — Hardened Defaults
// =============================================================================

// Enhanced Tracking Protection — STRICT mode
pref("browser.contentblocking.category", "strict");
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.trackingprotection.cryptomining.enabled", true);
pref("privacy.trackingprotection.fingerprinting.enabled", true);

// Cookie behavior — block third-party cookies
pref("network.cookie.cookieBehavior", 5); // BEHAVIOR_REJECT_TRACKER_AND_PARTITION_FOREIGN

// Do Not Track header
pref("privacy.donottrackheader.enabled", true);

// Global Privacy Control
pref("privacy.globalprivacycontrol.enabled", true);
pref("privacy.globalprivacycontrol.functionality.enabled", true);

// HTTPS-Only Mode
pref("dom.security.https_only_mode", true);
pref("dom.security.https_only_mode_ever_enabled", true);

// DNS over HTTPS (DoH) — enable by default
pref("network.trr.mode", 2); // TRR first, fall back to native
pref("network.trr.uri", "https://mozilla.cloudflare-dns.com/dns-query");

// WebRTC — prevent IP leaks
pref("media.peerconnection.ice.default_address_only", true);
pref("media.peerconnection.ice.no_host", true);
pref("media.peerconnection.ice.proxy_only_if_behind_proxy", true);

// Resist fingerprinting at the global level (our per-space system overrides this)
pref("privacy.resistFingerprinting", false); // We use per-space RFP instead
pref("spacebrowser.resistFingerprinting.perSpace", true);

// Disable battery API (fingerprinting vector)
pref("dom.battery.enabled", false);

// Disable Gamepad API (fingerprinting vector)
pref("dom.gamepad.enabled", false);

// Disable Sensor APIs (fingerprinting vectors)
pref("device.sensors.enabled", false);

// Clear data on shutdown (optional — users can toggle)
pref("privacy.sanitize.sanitizeOnShutdown", false);
pref("privacy.clearOnShutdown.cache", true);

// =============================================================================
// TELEMETRY — All Disabled
// =============================================================================

pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("toolkit.telemetry.bhrPing.enabled", false);
pref("toolkit.telemetry.firstShutdownPing.enabled", false);
pref("toolkit.telemetry.newProfilePing.enabled", false);
pref("toolkit.telemetry.reportingpolicy.firstRun", false);
pref("toolkit.telemetry.shutdownPingSender.enabled", false);
pref("toolkit.telemetry.updatePing.enabled", false);
pref("toolkit.telemetry.server", "data:,");

// Health report
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);

// Crash reporter
pref("breakpad.reportURL", "");
pref("browser.tabs.crashReporting.sendReport", false);
pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);

// Studies & experiments
pref("app.shield.optoutstudies.enabled", false);
pref("app.normandy.enabled", false);
pref("app.normandy.api_url", "");

// Coverage ping
pref("toolkit.coverage.opt-out", true);
pref("toolkit.coverage.endpoint.base", "");

// =============================================================================
// DISABLED FEATURES — Strip Firefox Bloat
// =============================================================================

// Pocket
pref("extensions.pocket.enabled", false);
pref("extensions.pocket.api", "");
pref("extensions.pocket.site", "");

// Firefox Accounts / Sync (users can re-enable if wanted)
pref("identity.fxaccounts.enabled", false);

// Firefox Suggest / Sponsored content
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.topsites", false);

// Discovery / recommendations
pref("browser.discovery.enabled", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.newtabpage.activity-stream.feeds.snippets", false);

// Updater (we handle our own updates)
pref("app.update.enabled", false);
pref("app.update.auto", false);

// =============================================================================
// UI — SpaceBrowser Defaults
// =============================================================================

// Dark theme by default
pref("extensions.activeThemeID", "firefox-compact-dark@mozilla.org");

// Compact density
pref("browser.compactmode.show", true);
pref("browser.uidensity", 1); // compact

// Show Spaces toolbar button by default
pref("spacebrowser.toolbar.showSpacesButton", true);

// Tab bar — show container color on tabs
pref("privacy.userContext.decoration.enabled", true);

// Disable "What's New" page after updates
pref("browser.startup.homepage_override.mstone", "ignore");

// Disable default browser check
pref("browser.shell.checkDefaultBrowser", false);

// =============================================================================
// NETWORKING
// =============================================================================

// Per-space proxy support (our custom feature)
pref("spacebrowser.proxy.perSpaceEnabled", true);

// Prefetch — disable (privacy)
pref("network.prefetch-next", false);
pref("network.dns.disablePrefetch", true);
pref("network.http.speculative-parallel-limit", 0);

// =============================================================================
// SECURITY
// =============================================================================

// Safe browsing (keep enabled — it's a security feature, not tracking)
pref("browser.safebrowsing.malware.enabled", true);
pref("browser.safebrowsing.phishing.enabled", true);

// Disable safe browsing download checks (sends hashes to Google)
pref("browser.safebrowsing.downloads.enabled", false);
pref("browser.safebrowsing.downloads.remote.enabled", false);
