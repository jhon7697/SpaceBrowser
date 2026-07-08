package app.spacebrowser.space

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import app.spacebrowser.model.FingerprintProfile
import app.spacebrowser.model.Space
import app.spacebrowser.model.SpaceColor
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.UUID

/**
 * SpaceManager — manages the lifecycle of browsing Spaces.
 *
 * Handles creation, deletion, listing, switching, and persistence.
 * Each Space maps to isolated GeckoSession storage.
 *
 * Thread-safe singleton pattern with SharedPreferences persistence.
 */
class SpaceManager private constructor(private val context: Context) {

    companion object {
        private const val TAG = "SpaceManager"
        private const val PREFS_NAME = "spacebrowser_spaces"
        private const val KEY_SPACES = "spaces_json"
        private const val KEY_ACTIVE_ID = "active_space_id"
        private const val MAX_SPACES = 100

        @Volatile
        private var instance: SpaceManager? = null

        fun getInstance(context: Context): SpaceManager {
            return instance ?: synchronized(this) {
                instance ?: SpaceManager(context.applicationContext).also { instance = it }
            }
        }
    }

    private val gson = Gson()
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** In-memory cache of spaces */
    private val spaces = mutableMapOf<String, Space>()

    /** Currently active space ID */
    private var activeSpaceId: String? = null

    /** Listeners for space changes */
    private val listeners = mutableListOf<SpaceChangeListener>()

    init {
        loadFromDisk()
    }

    // ═══════════════════════════════════════════════════════
    // CRUD Operations
    // ═══════════════════════════════════════════════════════

    /**
     * Create a new Space.
     *
     * @param name Display name
     * @param color Space color
     * @return The created Space
     * @throws IllegalStateException if max spaces reached
     */
    fun create(
        name: String,
        color: SpaceColor = SpaceColor.BLUE,
        icon: String = "fingerprint"
    ): Space {
        if (spaces.size >= MAX_SPACES) {
            throw IllegalStateException("Maximum number of spaces ($MAX_SPACES) reached")
        }

        val trimmedName = name.trim().take(64)
        require(trimmedName.isNotEmpty()) { "Space name cannot be empty" }

        val space = Space(
            id = UUID.randomUUID().toString(),
            name = trimmedName,
            color = color,
            icon = icon
        )

        spaces[space.id] = space

        // If this is the first space, make it active
        if (spaces.size == 1) {
            activeSpaceId = space.id
        }

        saveToDisk()
        notifyListeners(SpaceEvent.CREATED, space)

        Log.i(TAG, "Created space '${space.name}' (${space.id})")
        return space
    }

    /**
     * Get a Space by ID.
     */
    fun get(id: String): Space? = spaces[id]

    /**
     * List all spaces, sorted by creation time.
     */
    fun list(): List<Space> {
        return spaces.values.sortedBy { it.createdAt }
    }

    /**
     * Update a Space's properties.
     */
    fun update(id: String, name: String? = null, color: SpaceColor? = null): Space {
        val space = spaces[id] ?: throw IllegalArgumentException("Space not found: $id")

        name?.trim()?.take(64)?.let { if (it.isNotEmpty()) space.name = it }
        color?.let { space.color = it }

        saveToDisk()
        notifyListeners(SpaceEvent.UPDATED, space)

        return space
    }

    /**
     * Delete a Space and all its data.
     */
    fun delete(id: String): Boolean {
        val space = spaces.remove(id) ?: return false

        if (activeSpaceId == id) {
            activeSpaceId = spaces.values.firstOrNull()?.id
        }

        saveToDisk()
        notifyListeners(SpaceEvent.DELETED, space)

        Log.i(TAG, "Deleted space '${space.name}' ($id)")
        return true
    }

    // ═══════════════════════════════════════════════════════
    // Space Switching
    // ═══════════════════════════════════════════════════════

    /**
     * Switch the active space.
     */
    fun switchTo(id: String): Space {
        val space = spaces[id] ?: throw IllegalArgumentException("Space not found: $id")

        activeSpaceId = id
        space.lastUsedAt = System.currentTimeMillis()

        saveToDisk()
        notifyListeners(SpaceEvent.SWITCHED, space)

        Log.i(TAG, "Switched to space '${space.name}'")
        return space
    }

    /**
     * Get the currently active Space.
     */
    fun getActive(): Space? {
        return activeSpaceId?.let { spaces[it] }
    }

    /**
     * Get the active space ID.
     */
    fun getActiveId(): String? = activeSpaceId

    // ═══════════════════════════════════════════════════════
    // Persistence
    // ═══════════════════════════════════════════════════════

    private fun saveToDisk() {
        try {
            val json = gson.toJson(spaces.values.toList())
            prefs.edit()
                .putString(KEY_SPACES, json)
                .putString(KEY_ACTIVE_ID, activeSpaceId)
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save spaces", e)
        }
    }

    private fun loadFromDisk() {
        try {
            val json = prefs.getString(KEY_SPACES, null)
            if (json != null) {
                val type = object : TypeToken<List<Space>>() {}.type
                val loaded: List<Space> = gson.fromJson(json, type)
                spaces.clear()
                loaded.forEach { spaces[it.id] = it }
            }
            activeSpaceId = prefs.getString(KEY_ACTIVE_ID, null)

            Log.i(TAG, "Loaded ${spaces.size} spaces from disk")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load spaces", e)
            spaces.clear()
        }
    }

    // ═══════════════════════════════════════════════════════
    // Import / Export
    // ═══════════════════════════════════════════════════════

    /**
     * Export all spaces as JSON string.
     */
    fun exportAll(): String {
        val data = mapOf(
            "version" to 1,
            "exportedAt" to System.currentTimeMillis(),
            "spaces" to spaces.values.toList()
        )
        return gson.toJson(data)
    }

    /**
     * Import spaces from JSON. Skips duplicates by UUID.
     * @return Number of spaces imported
     */
    fun importSpaces(json: String): Int {
        val data = gson.fromJson(json, Map::class.java) ?: return 0
        @Suppress("UNCHECKED_CAST")
        val spaceList = data["spaces"] as? List<Map<String, Any>> ?: return 0

        var imported = 0
        for (spaceMap in spaceList) {
            val id = spaceMap["id"] as? String ?: continue
            if (spaces.containsKey(id)) continue
            if (spaces.size >= MAX_SPACES) break

            try {
                val spaceJson = gson.toJson(spaceMap)
                val space = gson.fromJson(spaceJson, Space::class.java)
                spaces[space.id] = space
                imported++
            } catch (e: Exception) {
                Log.w(TAG, "Failed to import space: ${e.message}")
            }
        }

        if (imported > 0) saveToDisk()
        return imported
    }

    // ═══════════════════════════════════════════════════════
    // Listeners
    // ═══════════════════════════════════════════════════════

    fun addListener(listener: SpaceChangeListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: SpaceChangeListener) {
        listeners.remove(listener)
    }

    private fun notifyListeners(event: SpaceEvent, space: Space) {
        listeners.forEach { it.onSpaceChanged(event, space) }
    }

    /** Space count */
    val count: Int get() = spaces.size

    /** Check if at max capacity */
    val isFull: Boolean get() = spaces.size >= MAX_SPACES
}

enum class SpaceEvent { CREATED, UPDATED, DELETED, SWITCHED }

interface SpaceChangeListener {
    fun onSpaceChanged(event: SpaceEvent, space: Space)
}
