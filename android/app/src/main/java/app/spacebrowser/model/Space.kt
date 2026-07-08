package app.spacebrowser.model

import java.util.UUID

/**
 * Space — a fully isolated browsing environment.
 *
 * Each Space has its own cookies, sessions, storage, cache, and a unique
 * anti-fingerprint profile. No data is shared between Spaces.
 */
data class Space(
    /** Unique identifier (UUID v4) */
    val id: String = UUID.randomUUID().toString(),

    /** Display name */
    var name: String,

    /** Color for visual identification */
    var color: SpaceColor = SpaceColor.BLUE,

    /** Icon identifier */
    var icon: String = "fingerprint",

    /** Unique fingerprint profile for anti-detection */
    val fingerprintProfile: FingerprintProfile = FingerprintProfile.generate(id),

    /** Optional proxy configuration */
    var proxyConfig: ProxyConfig? = null,

    /** Creation timestamp */
    val createdAt: Long = System.currentTimeMillis(),

    /** Last used timestamp */
    var lastUsedAt: Long = System.currentTimeMillis(),

    /** Whether this space is active */
    var isActive: Boolean = true
)

/**
 * Available colors for Spaces.
 * Match Firefox container colors and desktop SpaceBrowser.
 */
enum class SpaceColor(val hex: String, val displayName: String) {
    BLUE("#37ADFF", "Blue"),
    TURQUOISE("#00C79A", "Turquoise"),
    GREEN("#51CD00", "Green"),
    YELLOW("#FFCB00", "Yellow"),
    ORANGE("#FF9F00", "Orange"),
    RED("#FF613D", "Red"),
    PINK("#FF4BDA", "Pink"),
    PURPLE("#AF51F5", "Purple");

    companion object {
        fun fromName(name: String): SpaceColor {
            return entries.find { it.name.equals(name, ignoreCase = true) } ?: BLUE
        }
    }
}

/**
 * Proxy configuration for a Space.
 */
data class ProxyConfig(
    val type: ProxyType = ProxyType.DIRECT,
    val host: String = "",
    val port: Int = 0,
    val username: String? = null,
    val password: String? = null,
    val proxyDNS: Boolean = true
)

enum class ProxyType {
    DIRECT, HTTP, HTTPS, SOCKS4, SOCKS5
}
