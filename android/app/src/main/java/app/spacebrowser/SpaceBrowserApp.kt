package app.spacebrowser

import android.app.Application
import android.util.Log
import org.mozilla.geckoview.ContentBlocking
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings

class SpaceBrowserApp : Application() {

    companion object {
        private const val TAG = "SpaceBrowserApp"

        @Volatile
        private var sRuntime: GeckoRuntime? = null

        fun getRuntime(): GeckoRuntime {
            return sRuntime ?: throw IllegalStateException(
                "GeckoRuntime not initialized"
            )
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Initializing SpaceBrowser...")

        val settings = GeckoRuntimeSettings.Builder()
            .contentBlocking(
                ContentBlocking.Settings.Builder()
                    .antiTracking(
                        ContentBlocking.AntiTracking.DEFAULT or
                        ContentBlocking.AntiTracking.CRYPTOMINING or
                        ContentBlocking.AntiTracking.FINGERPRINTING
                    )
                    .cookieBehavior(ContentBlocking.CookieBehavior.ACCEPT_FIRST_PARTY_AND_ISOLATE_OTHERS)
                    .strictSocialTrackingProtection(true)
                    .build()
            )
            .remoteDebuggingEnabled(BuildConfig.DEBUG)
            .consoleOutput(BuildConfig.DEBUG)
            .build()

        sRuntime = GeckoRuntime.create(this, settings)
        Log.i(TAG, "GeckoRuntime initialized")
    }
}
