package app.spacebrowser.browser

import android.util.Log
import app.spacebrowser.SpaceBrowserApp
import app.spacebrowser.fingerprint.FingerprintInjector
import app.spacebrowser.model.Space
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSessionSettings
import java.util.UUID

class SpaceSessionManager {

    companion object {
        private const val TAG = "SpaceSessionManager"
    }

    data class Tab(
        val id: String = UUID.randomUUID().toString(),
        val session: GeckoSession,
        val spaceId: String,
        var title: String = "New Tab",
        var url: String = "about:blank",
        var isActive: Boolean = false
    )

    private val spaceTabs = mutableMapOf<String, MutableList<Tab>>()
    private val fingerprintInjector = FingerprintInjector()

    fun createSession(space: Space): Tab {
        val runtime = SpaceBrowserApp.getRuntime()

        val settings = GeckoSessionSettings.Builder()
            .contextId(space.id)
            .userAgentOverride(space.fingerprintProfile.userAgent)
            .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
            .allowJavascript(true)
            .suspendMediaWhenInactive(true)
            .build()

        val session = GeckoSession(settings)

        // Fingerprint injection via ProgressDelegate
        fingerprintInjector.attachToSession(session, space)

        session.open(runtime)

        val tab = Tab(session = session, spaceId = space.id)
        val tabs = spaceTabs.getOrPut(space.id) { mutableListOf() }
        tabs.add(tab)

        Log.i(TAG, "Created session for space '${space.name}' (tabs: ${tabs.size})")
        return tab
    }

    fun getTabsForSpace(spaceId: String): List<Tab> =
        spaceTabs[spaceId]?.toList() ?: emptyList()

    fun getTabCount(spaceId: String): Int =
        spaceTabs[spaceId]?.size ?: 0

    fun closeTab(tab: Tab) {
        try { tab.session.close() } catch (_: Exception) {}
        spaceTabs[tab.spaceId]?.remove(tab)
    }

    fun closeAllTabs(spaceId: String) {
        spaceTabs.remove(spaceId)?.forEach { tab ->
            try { tab.session.close() } catch (_: Exception) {}
        }
    }

    fun clearSpaceData(spaceId: String) {
        SpaceBrowserApp.getRuntime().storageController.clearDataForSessionContext(spaceId)
    }

    fun navigate(tab: Tab, url: String) {
        val loadUri = when {
            url.startsWith("about:") || url.contains("://") -> url
            url.contains(".") && !url.contains(" ") -> "https://$url"
            else -> "https://duckduckgo.com/?q=${java.net.URLEncoder.encode(url, "UTF-8")}"
        }
        tab.session.loadUri(loadUri)
        tab.url = loadUri
    }

    fun pauseAll() {
        spaceTabs.values.flatten().forEach { tab ->
            try { tab.session.setActive(false) } catch (_: Exception) {}
        }
    }

    fun resumeTab(tab: Tab) {
        tab.session.setActive(true)
    }

    val totalTabCount: Int
        get() = spaceTabs.values.sumOf { it.size }
}
