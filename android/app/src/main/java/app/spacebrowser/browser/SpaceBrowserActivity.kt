package app.spacebrowser.browser

import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import app.spacebrowser.SpaceBrowserApp
import app.spacebrowser.databinding.ActivityBrowserBinding
import app.spacebrowser.model.Space
import app.spacebrowser.model.SpaceColor
import app.spacebrowser.space.SpaceChangeListener
import app.spacebrowser.space.SpaceEvent
import app.spacebrowser.space.SpaceManager
import app.spacebrowser.ui.CreateSpaceDialog
import app.spacebrowser.ui.SpaceSwitcherSheet
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession

class SpaceBrowserActivity : AppCompatActivity(), SpaceChangeListener {

    companion object {
        private const val TAG = "SpaceBrowserActivity"
    }

    private lateinit var binding: ActivityBrowserBinding
    private lateinit var spaceManager: SpaceManager
    private lateinit var sessionManager: SpaceSessionManager

    private var currentTab: SpaceSessionManager.Tab? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check GeckoRuntime is ready
        if (!SpaceBrowserApp.isRuntimeReady()) {
            Log.e(TAG, "GeckoRuntime not ready, finishing activity")
            Toast.makeText(this, "Browser engine failed to start", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        binding = ActivityBrowserBinding.inflate(layoutInflater)
        setContentView(binding.root)

        spaceManager = SpaceManager.getInstance(this)
        sessionManager = SpaceSessionManager()
        spaceManager.addListener(this)

        setupToolbar()
        setupBottomBar()
        setupUrlBar()

        // Create default space if needed
        if (spaceManager.count == 0) {
            try {
                spaceManager.create("Default", SpaceColor.BLUE)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create default space", e)
            }
        }

        // Open tab in active space
        try {
            spaceManager.getActive()?.let { openNewTab(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open initial tab", e)
        }

        updateSpaceIndicator()
    }

    private fun setupToolbar() {
        binding.spaceIndicator.setOnClickListener { showSpaceSwitcher() }
    }

    private fun setupBottomBar() {
        binding.btnBack.setOnClickListener { currentTab?.session?.goBack() }
        binding.btnForward.setOnClickListener { currentTab?.session?.goForward() }
        binding.btnTabs.setOnClickListener {
            spaceManager.getActive()?.let { space ->
                val count = sessionManager.getTabCount(space.id)
                Toast.makeText(this, "$count tab(s) in ${space.name}", Toast.LENGTH_SHORT).show()
            }
        }
        binding.btnSpaces.setOnClickListener { showSpaceSwitcher() }
        binding.btnNewTab.setOnClickListener {
            spaceManager.getActive()?.let { openNewTab(it) }
        }
    }

    private fun setupUrlBar() {
        binding.urlBar.setOnEditorActionListener { v, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                val url = v.text.toString().trim()
                if (url.isNotEmpty()) {
                    currentTab?.let { sessionManager.navigate(it, url) }
                }
                binding.urlBar.clearFocus()
                true
            } else false
        }
        binding.btnReload.setOnClickListener { currentTab?.session?.reload() }
    }

    private fun openNewTab(space: Space, url: String? = null) {
        try {
            val tab = sessionManager.createSession(space)

            // Navigation delegate
            tab.session.navigationDelegate = object : GeckoSession.NavigationDelegate {
                override fun onLocationChange(
                    session: GeckoSession,
                    url: String?,
                    perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                    hasUserGesture: Boolean
                ) {
                    runOnUiThread {
                        if (tab == currentTab) {
                            binding.urlBar.setText(url ?: "")
                            tab.url = url ?: "about:blank"
                        }
                    }
                }

                override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                    runOnUiThread {
                        binding.btnBack.alpha = if (canGoBack) 1.0f else 0.3f
                    }
                }

                override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) {
                    runOnUiThread {
                        binding.btnForward.alpha = if (canGoForward) 1.0f else 0.3f
                    }
                }

                override fun onLoadRequest(
                    session: GeckoSession,
                    request: GeckoSession.NavigationDelegate.LoadRequest
                ): GeckoResult<AllowOrDeny> {
                    return GeckoResult.fromValue(AllowOrDeny.ALLOW)
                }
            }

            // Progress delegate
            tab.session.progressDelegate = object : GeckoSession.ProgressDelegate {
                override fun onPageStart(session: GeckoSession, url: String) {
                    runOnUiThread {
                        if (tab == currentTab) {
                            binding.progressBar.visibility = View.VISIBLE
                            binding.progressBar.isIndeterminate = true
                        }
                    }
                }

                override fun onPageStop(session: GeckoSession, success: Boolean) {
                    runOnUiThread {
                        if (tab == currentTab) {
                            binding.progressBar.visibility = View.GONE
                        }
                    }
                }

                override fun onProgressChange(session: GeckoSession, progress: Int) {
                    runOnUiThread {
                        if (tab == currentTab) {
                            binding.progressBar.isIndeterminate = false
                            binding.progressBar.progress = progress
                        }
                    }
                }
            }

            // Content delegate
            tab.session.contentDelegate = object : GeckoSession.ContentDelegate {
                override fun onTitleChange(session: GeckoSession, title: String?) {
                    tab.title = title ?: "Untitled"
                }
            }

            switchToTab(tab)
            sessionManager.navigate(tab, url ?: "https://duckduckgo.com")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to open new tab", e)
            Toast.makeText(this, "Failed to open tab: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun switchToTab(tab: SpaceSessionManager.Tab) {
        try {
            currentTab?.let {
                it.isActive = false
                try { it.session.setActive(false) } catch (_: Exception) {}
            }
            currentTab = tab
            tab.isActive = true
            tab.session.setActive(true)
            binding.geckoView.setSession(tab.session)
            binding.urlBar.setText(tab.url)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to switch tab", e)
        }
    }

    private fun showSpaceSwitcher() {
        try {
            val sheet = SpaceSwitcherSheet(
                spaces = spaceManager.list(),
                activeSpaceId = spaceManager.getActiveId(),
                tabCounts = spaceManager.list().associate { it.id to sessionManager.getTabCount(it.id) },
                onSpaceSelected = { space ->
                    spaceManager.switchTo(space.id)
                    val tabs = sessionManager.getTabsForSpace(space.id)
                    if (tabs.isNotEmpty()) switchToTab(tabs.first())
                    else openNewTab(space)
                },
                onCreateSpace = { showCreateSpaceDialog() },
                onDeleteSpace = { space ->
                    sessionManager.closeAllTabs(space.id)
                    sessionManager.clearSpaceData(space.id)
                    spaceManager.delete(space.id)
                }
            )
            sheet.show(supportFragmentManager, "spaces")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show space switcher", e)
        }
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
            } catch (_: Exception) {
                binding.spaceDot.setColorFilter(Color.parseColor("#37ADFF"))
            }
        } else {
            binding.spaceName.text = "No Space"
            binding.spaceDot.visibility = View.GONE
        }
    }

    override fun onSpaceChanged(event: SpaceEvent, space: Space) {
        runOnUiThread { updateSpaceIndicator() }
    }

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

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (currentTab != null) {
            currentTab!!.session.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
