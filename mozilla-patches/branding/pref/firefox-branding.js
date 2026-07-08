/* SpaceBrowser Branding Preferences
 *
 * Location in Firefox source: browser/branding/spacebrowser/pref/firefox-branding.js
 *
 * These preferences override Firefox defaults with SpaceBrowser branding.
 * They are loaded very early in the startup process.
 */

// Application identity
pref("app.update.url", "");  // We handle our own updates
pref("app.update.enabled", false);
pref("app.update.auto", false);

// Homepage
pref("browser.startup.homepage", "about:home");
pref("startup.homepage_welcome_url", "https://spacebrowser.app/welcome");
pref("startup.homepage_welcome_url.additional", "");

// New tab page
pref("browser.newtabpage.activity-stream.default.sites", "");

// Branding URLs
pref("app.support.baseURL", "https://spacebrowser.app/support/");
pref("app.feedback.baseURL", "https://spacebrowser.app/feedback/");
pref("app.releaseNotesURL", "https://spacebrowser.app/releases/%VERSION%/");

// Disable Firefox-specific features
pref("browser.shell.checkDefaultBrowser", false);
pref("browser.shell.defaultBrowserCheckCount", 0);
pref("browser.defaultbrowser.notificationbar", false);
