package app.spacebrowser.browser

import android.util.Log
import app.spacebrowser.SpaceBrowserApp
import app.spacebrowser.fingerprint.FingerprintInjector
import app.spacebrowser.model.Space
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import org.mozilla.geckoview.StorageController

/**
 * SpaceSessionManager — manages GeckoSessions per Space.
 *
 * Each Space gets fully isolated GeckoSession instances with:
 * - Separate cookie/storage partition (via contextId)
 * - Custom User-Agent per space
 * - Anti-fingerprint JavaScript injection
 * - Independent session lifecycle
 *
 * GeckoView's contextId parameter provides cookie and storage isolation
 * similar to Firefox's Container Tabs.
 */
class SpaceSessionManager {

    companion object {
        private const val TAG = "SpaceSessionManager"
    }

    /**
     * Tab — a single browsing tab within a Space.
     */
    data class Tab(
        val id: String = java.util.UUID.randomUUID().toString(),
        val session: GeckoSession,
        val spaceId: String,
        var title: String = "New Tab",
        var url: String = "about:blank",
        var isActive: Boolean = false
    )

    /** Map of spaceId → list of tabs */
    private val spaceTabs = mutableMapOf<String, MutableList<Tab>>()

    /** The fingerprint injector */
    private val fingerprintInjector = FingerprintInjector()

    /**
     * Create a new GeckoSession for a Space with full isolation.
     *
     * @param space The Space to create a session for
     * @return A new Tab with configured session
     */
    fun createSession(space: Space): Tab {
        val runtime = SpaceBrowserApp.getRuntime()

        // Build session settings with isolation
        val settings = GeckoSessionSettings.Builder()
            // contextId provides cookie/storage isolation (like Firefox containers)
            // Different contextId = completely separate cookie jar
            .contextId(space.id)
            // Override User-Agent for this space
            .userAgentOverride(space.fingerprintProfile.userAgent)
            // Viewport settings
            .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
            // Allow JavaScript
            .allowJavascript(true)
            // Suspend on background
            .suspendMediaWhenInactive(true)
            .build()

        val session = GeckoSession(settings)

        // Inject anti-fingerprint scripts when pages load
        fingerprintInjector.attachToSession(session, space)

        // Open the session with the runtime
        session.open(runtime)

        // Create tab
        val tab = Tab(
            session = session,
            spaceId = space.id
        )

        // Store in our tab map
        val tabs = spaceTabs.getOrPut(space.id) { mutableListOf() }
        tabs.add(tab)

        Log.i(TAG, "Created session for space '${space.name}' (tabs: ${tabs.size})")
        return tab
    }

    /**
     * Get all tabs for a Space.
     */
    fun getTabsForSpace(spaceId: String): List<Tab> {
        return spaceTabs[spaceId]?.toList() ?: emptyList()
    }

    /**
     * Get tab count for a Space.
     */
    fun getTabCount(spaceId: String): Int {
        return spaceTabs[spaceId]?.size ?: 0
    }

    /**
     * Close a specific tab.
     */
    fun closeTab(tab: Tab) {
        try {
            tab.session.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing session: ${e.message}")
        }

        spaceTabs[tab.spaceId]?.remove(tab)
        Log.i(TAG, "Closed tab in space ${tab.spaceId}")
    }

    /**
     * Close all tabs for a Space (when deleting a space).
     */
    fun closeAllTabs(spaceId: String) {
        val tabs = spaceTabs.remove(spaceId) ?: return
        tabs.forEach { tab ->
            try {
                tab.session.close()
            } catch (e: Exception) {
                Log.w(TAG, "Error closing session: ${e.message}")
            }
        }
        Log.i(TAG, "Closed ${tabs.size} tabs for space $spaceId")
    }

    /**
     * Clear all browsing data for a Space.
     */
    fun clearSpaceData(spaceId: String) {
        val runtime = SpaceBrowserApp.getRuntime()
        runtime.storageController.clearDataForSessionContext(spaceId)
        Log.i(TAG, "Cleared all data for space $spaceId")
    }

    /**
     * Navigate a tab to a URL.
     */
    fun navigate(tab: Tab, url: String) {
        val loadUri = if (!url.contains("://") && !url.startsWith("about:")) {
            // Treat as search query or add https://
            if (url.contains(".") && !url.contains(" ")) {
                "https://$url"
            } else {
                "https://duckduckgo.com/?q=${java.net.URLEncoder.encode(url, "UTF-8")}"
            }
        } else {
            url
        }

        tab.session.loadUri(loadUri)
        tab.url = loadUri
    }

    /**
     * Pause all sessions (when app goes to background).
     */
    fun pauseAll() {
        spaceTabs.values.flatten().forEach { tab ->
            try {
                tab.session.setActive(false)
            } catch (e: Exception) {
                // Session may already be closed
            }
        }
    }

    /**
     * Resume a specific tab's session.
     */
    fun resumeTab(tab: Tab) {
        tab.session.setActive(true)
    }

    /**
     * Get total tab count across all spaces.
     */
    val totalTabCount: Int
        get() = spaceTabs.values.sumOf { it.size }
}
