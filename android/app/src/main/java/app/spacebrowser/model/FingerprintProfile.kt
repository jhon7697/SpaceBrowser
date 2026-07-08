package app.spacebrowser.model

/**
 * FingerprintProfile — deterministic browser fingerprint for a Space.
 *
 * Generated from the Space's UUID using a seeded PRNG (Mulberry32).
 * Same UUID → same fingerprint, every time, on every platform.
 * Cross-platform consistent with desktop SpaceBrowser.
 */
data class FingerprintProfile(
    /** Version for migration support */
    val version: Int = 1,

    // ── Navigator ──
    val userAgent: String,
    val platform: String,
    val oscpu: String,
    val hardwareConcurrency: Int,
    val deviceMemory: Int,

    // ── Screen ──
    val screenWidth: Int,
    val screenHeight: Int,
    val screenAvailWidth: Int,
    val screenAvailHeight: Int,
    val colorDepth: Int = 24,
    val pixelRatio: Float,

    // ── Canvas ──
    val canvasNoiseSeed: Long,
    val canvasNoiseAmplitude: Float = 0.02f,

    // ── WebGL ──
    val webglVendor: String,
    val webglRenderer: String,
    val maxTextureSize: Int,

    // ── Audio ──
    val audioNoiseSeed: Long,
    val audioSampleRate: Int,
    val audioNoiseAmplitude: Float = 0.0001f,

    // ── Fonts ──
    val fonts: List<String>,

    // ── Timezone (null = use system) ──
    val timezone: String? = null,
    val timezoneOffset: Int? = null,

    // ── Language ──
    val language: String = "en-US",
    val languages: List<String> = listOf("en-US", "en")
) {
    companion object {
        // ── Platform profiles (weighted by market share) ──
        private data class PlatformInfo(
            val platform: String,
            val oscpu: String,
            val weight: Float
        )

        private val PLATFORMS = listOf(
            PlatformInfo("Win32", "Windows NT 10.0; Win64; x64", 0.65f),
            PlatformInfo("MacIntel", "Intel Mac OS X 10.15", 0.20f),
            PlatformInfo("Linux x86_64", "Linux x86_64", 0.10f),
            PlatformInfo("Win32", "Windows NT 11.0; Win64; x64", 0.05f)
        )

        private data class WebGLInfo(val vendor: String, val renderer: String)

        private val WEBGL_PROFILES = listOf(
            WebGLInfo("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (Intel)", "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (Intel)", "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"),
            WebGLInfo("Google Inc. (Apple)", "ANGLE (Apple, Apple M1, OpenGL 4.1)"),
            WebGLInfo("Google Inc. (Apple)", "ANGLE (Apple, Apple M2, OpenGL 4.1)")
        )

        private data class ScreenInfo(val w: Int, val h: Int, val ah: Int)

        private val SCREENS = listOf(
            ScreenInfo(1920, 1080, 1040),
            ScreenInfo(1366, 768, 728),
            ScreenInfo(2560, 1440, 1400),
            ScreenInfo(1536, 864, 824),
            ScreenInfo(1440, 900, 860),
            ScreenInfo(1680, 1050, 1010)
        )

        private val HARDWARE_CONCURRENCY = listOf(2, 4, 4, 8, 8, 8, 12, 16)
        private val DEVICE_MEMORY = listOf(2, 4, 4, 8, 8, 8, 16)
        private val PIXEL_RATIOS = listOf(1.0f, 1.25f, 1.5f, 2.0f)
        private val FIREFOX_VERSIONS = listOf("128.0", "127.0", "126.0", "125.0")

        private val FONT_SETS = mapOf(
            "Win32" to listOf(
                "Arial", "Calibri", "Cambria", "Comic Sans MS", "Consolas",
                "Courier New", "Georgia", "Impact", "Lucida Console", "Segoe UI",
                "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"
            ),
            "MacIntel" to listOf(
                "Arial", "Avenir", "Courier New", "Futura", "Geneva", "Georgia",
                "Helvetica", "Helvetica Neue", "Lucida Grande", "Menlo", "Monaco",
                "Palatino", "Times New Roman", "Trebuchet MS"
            ),
            "Linux x86_64" to listOf(
                "Arial", "Courier New", "DejaVu Sans", "DejaVu Serif",
                "DejaVu Sans Mono", "Droid Sans", "FreeSans", "Georgia",
                "Liberation Mono", "Liberation Sans", "Liberation Serif",
                "Noto Sans", "Times New Roman", "Ubuntu"
            )
        )

        /**
         * Generate a deterministic fingerprint profile from a Space UUID.
         *
         * Uses Mulberry32 PRNG — same algorithm as desktop SpaceBrowser.
         * Same UUID produces identical profiles on Android and desktop.
         */
        fun generate(spaceId: String): FingerprintProfile {
            val rng = SeededRandom(spaceId)

            // Pick platform (weighted)
            val platformInfo = rng.pickWeighted(PLATFORMS) { it.weight }

            // Pick WebGL profile consistent with platform
            val webgl = rng.pick(WEBGL_PROFILES)

            // Pick screen
            val screen = rng.pick(SCREENS)

            // Pick Firefox version for UA
            val ffVersion = rng.pick(FIREFOX_VERSIONS)
            val userAgent = "Mozilla/5.0 (${platformInfo.oscpu}; rv:$ffVersion) Gecko/20100101 Firefox/$ffVersion"

            // Pick fonts (drop a few for uniqueness)
            val platformFonts = FONT_SETS[platformInfo.platform] ?: FONT_SETS["Win32"]!!
            val fonts = platformFonts.filter { rng.nextFloat() > 0.15f }

            return FingerprintProfile(
                userAgent = userAgent,
                platform = platformInfo.platform,
                oscpu = platformInfo.oscpu,
                hardwareConcurrency = rng.pick(HARDWARE_CONCURRENCY),
                deviceMemory = rng.pick(DEVICE_MEMORY),
                screenWidth = screen.w,
                screenHeight = screen.h,
                screenAvailWidth = screen.w,
                screenAvailHeight = screen.ah,
                pixelRatio = rng.pick(PIXEL_RATIOS),
                canvasNoiseSeed = rng.nextInt().toLong() and 0xFFFFFFFFL,
                webglVendor = webgl.vendor,
                webglRenderer = webgl.renderer,
                maxTextureSize = rng.pick(listOf(8192, 16384, 16384)),
                audioNoiseSeed = rng.nextInt().toLong() and 0xFFFFFFFFL,
                audioSampleRate = rng.pick(listOf(44100, 48000, 48000, 48000)),
                fonts = fonts
            )
        }
    }
}

/**
 * Seeded PRNG — Mulberry32.
 *
 * Identical algorithm to desktop SpaceBrowser (JS and C++ versions).
 * Given the same seed string, produces the same sequence on all platforms.
 */
class SeededRandom(seed: String) {
    private var state: Int = fnv1aHash(seed)

    /** FNV-1a hash — convert string to 32-bit seed */
    private fun fnv1aHash(str: String): Int {
        var hash = 0x811c9dc5.toInt()
        for (c in str.replace("-", "")) {
            hash = hash xor c.code
            hash = (hash.toLong() * 0x01000193L).toInt()
        }
        return hash
    }

    /** Generate next random integer */
    fun nextInt(): Int {
        state += 0x6D2B79F5
        var t = state
        t = ((t.toLong() xor (t.ushr(15)).toLong()) * (t.toLong() or 1L)).toInt()
        t = (t.toLong() xor (t + ((t.toLong() xor (t.ushr(7)).toLong()) * (t.toLong() or 61L)).toInt()).toLong()).toInt()
        return t xor t.ushr(14)
    }

    /** Generate float in [0, 1) */
    fun nextFloat(): Float {
        return (nextInt().toLong() and 0xFFFFFFFFL).toFloat() / 4294967296f
    }

    /** Pick random element from list */
    fun <T> pick(list: List<T>): T {
        val index = (nextFloat() * list.size).toInt().coerceIn(0, list.size - 1)
        return list[index]
    }

    /** Pick from weighted list */
    fun <T> pickWeighted(items: List<T>, weight: (T) -> Float): T {
        val totalWeight = items.sumOf { weight(it).toDouble() }.toFloat()
        var r = nextFloat() * totalWeight
        for (item in items) {
            r -= weight(item)
            if (r <= 0) return item
        }
        return items.last()
    }
}
