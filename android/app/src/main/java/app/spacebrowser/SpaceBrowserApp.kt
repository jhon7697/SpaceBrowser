package app.spacebrowser

import android.app.Application
import android.util.Log
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings

class SpaceBrowserApp : Application() {

    companion object {
        private const val TAG = "SpaceBrowserApp"

        @Volatile
        private var sRuntime: GeckoRuntime? = null

        fun getRuntime(): GeckoRuntime {
            return sRuntime ?: throw IllegalStateException("GeckoRuntime not initialized")
        }

        fun isRuntimeReady(): Boolean = sRuntime != null
    }

    override fun onCreate() {
        super.onCreate()
        try {
            Log.i(TAG, "Initializing GeckoRuntime...")
            val settings = GeckoRuntimeSettings.Builder()
                .remoteDebuggingEnabled(BuildConfig.DEBUG)
                .consoleOutput(BuildConfig.DEBUG)
                .build()

            sRuntime = GeckoRuntime.create(this, settings)
            Log.i(TAG, "GeckoRuntime initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize GeckoRuntime", e)
        }
    }
}
