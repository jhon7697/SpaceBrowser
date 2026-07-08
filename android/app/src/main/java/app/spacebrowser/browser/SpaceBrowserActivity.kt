package app.spacebrowser.browser

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import app.spacebrowser.R
import app.spacebrowser.databinding.ActivityBrowserBinding
import app.spacebrowser.model.Space
import app.spacebrowser.space.SpaceChangeListener
import app.spacebrowser.space.SpaceEvent
import app.spacebrowser.space.SpaceManager
import app.spacebrowser.ui.CreateSpaceDialog
import app.spacebrowser.ui.SpaceSwitcherSheet
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.AllowOrDeny

/**
 * SpaceBrowserActivity — main browser activity.
 *
 * Features:
 * - Full GeckoView browser with URL bar
 * - Space indicator (color dot + name) in toolbar
 * - Tab management per space
 * - Bottom toolbar (back, forward, tabs, spaces, menu)
 * - Page load progress bar
 */
class SpaceBrowserActivity : AppCompatActivity(), SpaceChangeListener {

    private lateinit var binding: ActivityBrowserBinding
    private lateinit var spaceManager: SpaceManager
    private lateinit var sessionManager: SpaceSessionManager

    private var currentTab: SpaceSessionManager.Tab? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBrowserBinding.inflate(layoutInflater)
        setContentView(binding.root)

        spaceManager = SpaceManager.getInstance(this)
        sessionManager = SpaceSessionManager()

        spaceManager.addListener(this)

        setupToolbar()
        setupBottomBar()
        setupUrlBar()

        // Create default space if none exist
        if (spaceManager.count == 0) {
            spaceManager.create("Default", app.spacebrowser.model.SpaceColor.BLUE)
        }

        // Open a tab in the active space
        val activeSpace = spaceManager.getActive()
        if (activeSpace != null) {
            openNewTab(activeSpace)
        }

        updateSpaceIndicator()
    }

    // ═══════════════════════════════════════════════════════
    // Setup
    // ═══════════════════════════════════════════════════════

    private fun setupToolbar() {
        // Space indicator click → open space switcher
        binding.spaceIndicator.setOnClickListener {
            showSpaceSwitcher()
        }
    }

    private fun setupBottomBar() {
        binding.btnBack.setOnClickListener {
            currentTab?.session?.goBack()
        }

        binding.btnForward.setOnClickListener {
            currentTab?.session?.goForward()
        }

        binding.btnTabs.setOnClickListener {
            val activeSpace = spaceManager.getActive()
            if (activeSpace != null) {
                val count = sessionManager.getTabCount(activeSpace.id)
                Toast.makeText(this, "${count} tab(s) in ${activeSpace.name}", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnSpaces.setOnClickListener {
            showSpaceSwitcher()
        }

        binding.btnNewTab.setOnClickListener {
            val activeSpace = spaceManager.getActive()
            if (activeSpace != null) {
                openNewTab(activeSpace)
            }
        }
    }

    private fun setupUrlBar() {
        binding.urlBar.setOnEditorActionListener { v, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                val url = v.text.toString().trim()
                if (url.isNotEmpty() && currentTab != null) {
                    sessionManager.navigate(currentTab!!, url)
                }
                binding.urlBar.clearFocus()
                true
            } else false
        }

        binding.btnReload.setOnClickListener {
            currentTab?.session?.reload()
        }
    }

    // ═══════════════════════════════════════════════════════
    // Tab Management
    // ═══════════════════════════════════════════════════════

    private fun openNewTab(space: Space, url: String? = null) {
        val tab = sessionManager.createSession(space)

        // Set up delegates
        tab.session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean
            ) {
                if (tab == currentTab) {
                    binding.urlBar.setText(url ?: "")
                    tab.url = url ?: "about:blank"
                }
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                binding.btnBack.alpha = if (canGoBack) 1.0f else 0.3f
            }

            override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) {
                binding.btnForward.alpha = if (canGoForward) 1.0f else 0.3f
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest
            ): GeckoResult<AllowOrDeny>? {
                return GeckoResult.fromValue(AllowOrDeny.ALLOW)
            }
        }

        tab.session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                if (tab == currentTab) {
                    binding.progressBar.visibility = View.VISIBLE
                    binding.progressBar.isIndeterminate = true
                }
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                if (tab == currentTab) {
                    binding.progressBar.visibility = View.GONE
                }
            }

            override fun onProgressChange(session: GeckoSession, progress: Int) {
                if (tab == currentTab) {
                    binding.progressBar.isIndeterminate = false
                    binding.progressBar.progress = progress
                }
            }
        }

        tab.session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(session: GeckoSession, title: String?) {
                tab.title = title ?: "Untitled"
            }
        }

        // Display this tab
        switchToTab(tab)

        // Navigate to URL or default homepage
        if (url != null) {
            sessionManager.navigate(tab, url)
        } else {
            sessionManager.navigate(tab, "https://duckduckgo.com")
        }
    }

    private fun switchToTab(tab: SpaceSessionManager.Tab) {
        // Deactivate previous tab
        currentTab?.let {
            it.isActive = false
            it.session.setActive(false)
        }

        // Activate new tab
        currentTab = tab
        tab.isActive = true
        tab.session.setActive(true)

        // Attach to GeckoView
        binding.geckoView.setSession(tab.session)

        // Update URL bar
        binding.urlBar.setText(tab.url)
    }

    // ═══════════════════════════════════════════════════════
    // Space Management
    // ═══════════════════════════════════════════════════════

    private fun showSpaceSwitcher() {
        val sheet = SpaceSwitcherSheet(
            spaces = spaceManager.list(),
            activeSpaceId = spaceManager.getActiveId(),
            tabCounts = spaceManager.list().associate {
                it.id to sessionManager.getTabCount(it.id)
            },
            onSpaceSelected = { space ->
                spaceManager.switchTo(space.id)
                // Open a new tab in the switched space if none exist
                if (sessionManager.getTabCount(space.id) == 0) {
                    openNewTab(space)
                } else {
                    // Switch to the first tab in the space
                    val tabs = sessionManager.getTabsForSpace(space.id)
                    if (tabs.isNotEmpty()) {
                        switchToTab(tabs.first())
                    }
                }
            },
            onCreateSpace = {
                showCreateSpaceDialog()
            },
            onDeleteSpace = { space ->
                sessionManager.closeAllTabs(space.id)
                sessionManager.clearSpaceData(space.id)
                spaceManager.delete(space.id)
            }
        )
        sheet.show(supportFragmentManager, "spaces")
    }

    private fun showCreateSpaceDialog() {
        CreateSpaceDialog(
            onCreateSpace = { name, color ->
                val space = spaceManager.create(name, color)
                spaceManager.switchTo(space.id)
                openNewTab(space)
            }
        ).show(supportFragmentManager, "create_space")
    }

    private fun updateSpaceIndicator() {
        val activeSpace = spaceManager.getActive()
        if (activeSpace != null) {
            binding.spaceDot.visibility = View.VISIBLE
            binding.spaceName.text = activeSpace.name
            try {
                binding.spaceDot.setColorFilter(Color.parseColor(activeSpace.color.hex))
            } catch (e: Exception) {
                binding.spaceDot.setColorFilter(Color.parseColor("#37ADFF"))
            }
        } else {
            binding.spaceName.text = "No Space"
            binding.spaceDot.visibility = View.GONE
        }
    }

    // ═══════════════════════════════════════════════════════
    // SpaceChangeListener
    // ═══════════════════════════════════════════════════════

    override fun onSpaceChanged(event: SpaceEvent, space: Space) {
        runOnUiThread {
            updateSpaceIndicator()
        }
    }

    // ═══════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════

    override fun onPause() {
        super.onPause()
        sessionManager.pauseAll()
    }

    override fun onResume() {
        super.onResume()
        currentTab?.let { sessionManager.resumeTab(it) }
    }

    override fun onDestroy() {
        super.onDestroy()
        spaceManager.removeListener(this)
    }

    @Deprecated("Use onBackPressedDispatcher")
    override fun onBackPressed() {
        // Try to go back in the current tab first
        currentTab?.session?.goBack() ?: super.onBackPressed()
    }
}
