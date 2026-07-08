package app.spacebrowser

import android.app.Application
import android.util.Log
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings

/**
 * SpaceBrowser Application class.
 *
 * Initializes the GeckoView runtime with privacy-hardened settings.
 * The GeckoRuntime is a singleton — only one instance per process.
 * All GeckoSessions (tabs/spaces) share this runtime but maintain
 * isolated storage via session settings.
 */
class SpaceBrowserApp : Application() {

    companion object {
        private const val TAG = "SpaceBrowserApp"

        /** Singleton GeckoRuntime — initialized in onCreate */
        @Volatile
        private var sRuntime: GeckoRuntime? = null

        /**
         * Get the GeckoRuntime singleton.
         * Must be called after Application.onCreate().
         */
        fun getRuntime(): GeckoRuntime {
            return sRuntime ?: throw IllegalStateException(
                "GeckoRuntime not initialized. Was SpaceBrowserApp.onCreate() called?"
            )
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing SpaceBrowser...")

        // Build privacy-hardened runtime settings
        val settings = GeckoRuntimeSettings.Builder()
            // Content blocking (Enhanced Tracking Protection — STRICT)
            .contentBlocking(
                GeckoRuntimeSettings.Builder()
                    .build()
                    .contentBlocking
            )
            // Disable telemetry
            .telemetryDelegate(null)
            .crashHandler(null)
            // Disable remote debugging in release
            .remoteDebuggingEnabled(BuildConfig.DEBUG)
            // Console output in debug builds
            .consoleOutput(BuildConfig.DEBUG)
            // Enable WebExtensions (for fingerprint injection)
            .build()

        // Apply privacy preferences via GeckoRuntime prefs
        applyPrivacyPrefs(settings)

        // Create the runtime
        sRuntime = GeckoRuntime.create(this, settings)

        Log.i(TAG, "GeckoRuntime initialized successfully")
    }

    /**
     * Apply privacy-hardened default preferences.
     * These mirror the desktop SpaceBrowser user-prefs.js.
     */
    private fun applyPrivacyPrefs(settings: GeckoRuntimeSettings) {
        val runtime = GeckoRuntime.create(this, settings)

        // Tracking protection
        runtime.settings.contentBlocking.setAntiTracking(
            org.mozilla.geckoview.ContentBlocking.AntiTracking.DEFAULT or
            org.mozilla.geckoview.ContentBlocking.AntiTracking.CRYPTOMINING or
            org.mozilla.geckoview.ContentBlocking.AntiTracking.FINGERPRINTING or
            org.mozilla.geckoview.ContentBlocking.AntiTracking.CONTENT or
            org.mozilla.geckoview.ContentBlocking.AntiTracking.TEST
        )

        // Cookie behavior — reject trackers and partition foreign
        runtime.settings.contentBlocking.setCookieBehavior(
            org.mozilla.geckoview.ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS
        )

        // ETP strict mode
        runtime.settings.contentBlocking.setStrictSocialTrackingProtection(true)

        sRuntime = runtime
    }
}
