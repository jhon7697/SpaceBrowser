package app.spacebrowser.fingerprint

import android.util.Log
import app.spacebrowser.model.FingerprintProfile
import app.spacebrowser.model.Space
import org.mozilla.geckoview.GeckoSession

/**
 * FingerprintInjector — injects anti-fingerprint JavaScript into pages.
 *
 * Uses GeckoSession's content delegate to inject override scripts at
 * page load time. The injected JS overrides browser APIs to return
 * per-space fingerprint values.
 *
 * This is the Android equivalent of the desktop content script
 * (fingerprint-injector.js), adapted for GeckoView's API.
 */
class FingerprintInjector {

    companion object {
        private const val TAG = "FingerprintInjector"
    }

    /**
     * Attach fingerprint injection to a GeckoSession.
     * Injects override JS every time a page loads.
     */
    fun attachToSession(session: GeckoSession, space: Space) {
        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                // Inject fingerprint overrides at page start
                injectOverrides(session, space.fingerprintProfile)
            }

            override fun onTitleChange(session: GeckoSession, title: String?) {
                // Title changes are handled by the activity
            }
        }
    }

    /**
     * Inject fingerprint override JavaScript into a session.
     */
    private fun injectOverrides(session: GeckoSession, fp: FingerprintProfile) {
        val script = buildOverrideScript(fp)

        session.loadUri("javascript:void(0)")
        // Use evaluateJavascript for proper injection
        try {
            session.loadUri(
                "javascript:void((function(){$script})())"
            )
        } catch (e: Exception) {
            // Fallback: use WebExtension messaging if JS URI doesn't work
            Log.w(TAG, "JS injection fallback needed: ${e.message}")
        }
    }

    /**
     * Build the full fingerprint override script.
     * This is a self-executing function that overrides all fingerprint APIs.
     *
     * Ported from desktop fingerprint-injector.js.
     */
    fun buildOverrideScript(fp: FingerprintProfile): String {
        val fontsJson = fp.fonts.joinToString(",") { "\"$it\"" }
        val languagesJson = fp.languages.joinToString(",") { "\"$it\"" }

        return """
(function() {
  'use strict';

  // ═══ NAVIGATOR OVERRIDES ═══
  var navProps = {
    userAgent: { get: function() { return '${escapeJs(fp.userAgent)}'; } },
    platform: { get: function() { return '${escapeJs(fp.platform)}'; } },
    hardwareConcurrency: { get: function() { return ${fp.hardwareConcurrency}; } },
    deviceMemory: { get: function() { return ${fp.deviceMemory}; } },
    maxTouchPoints: { get: function() { return 0; } },
    language: { get: function() { return '${escapeJs(fp.language)}'; } },
    languages: { get: function() { return Object.freeze([$languagesJson]); } }
  };
  try { Object.defineProperties(Object.getPrototypeOf(navigator), navProps); } catch(e) {}

  // ═══ SCREEN OVERRIDES ═══
  var screenProps = {
    width: { get: function() { return ${fp.screenWidth}; } },
    height: { get: function() { return ${fp.screenHeight}; } },
    availWidth: { get: function() { return ${fp.screenAvailWidth}; } },
    availHeight: { get: function() { return ${fp.screenAvailHeight}; } },
    colorDepth: { get: function() { return ${fp.colorDepth}; } },
    pixelDepth: { get: function() { return ${fp.colorDepth}; } }
  };
  try { Object.defineProperties(Object.getPrototypeOf(screen), screenProps); } catch(e) {}
  try { Object.defineProperty(window, 'devicePixelRatio', { get: function() { return ${fp.pixelRatio}; }, configurable: true }); } catch(e) {}

  // ═══ CANVAS NOISE ═══
  var cSeed = ${fp.canvasNoiseSeed};
  var cAmp = ${fp.canvasNoiseAmplitude};
  var cs0 = cSeed >>> 0;
  var cs1 = ((cSeed * 0x6c078965) + 1) >>> 0;
  if (cs0 === 0 && cs1 === 0) cs0 = 1;
  function cRng() {
    var s1 = cs0; var s0 = cs1; cs0 = s0;
    s1 ^= s1 << 23; s1 ^= s1 >>> 17; s1 ^= s0; s1 ^= s0 >>> 26; cs1 = s1;
    return ((cs0 + cs1) >>> 0) / 0x100000000;
  }
  var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function() {
    var ctx = this.getContext('2d');
    if (ctx) {
      try {
        var d = ctx.getImageData(0, 0, this.width, this.height);
        var p = d.data;
        for (var i = 0; i < p.length; i += 4) {
          p[i] = Math.max(0, Math.min(255, p[i] + Math.floor((cRng() - 0.5) * 255 * cAmp)));
          p[i+1] = Math.max(0, Math.min(255, p[i+1] + Math.floor((cRng() - 0.5) * 255 * cAmp)));
          p[i+2] = Math.max(0, Math.min(255, p[i+2] + Math.floor((cRng() - 0.5) * 255 * cAmp)));
        }
        ctx.putImageData(d, 0, 0);
      } catch(e) {}
    }
    return origToDataURL.apply(this, arguments);
  };

  // ═══ WEBGL OVERRIDES ═══
  function patchGL(proto) {
    var orig = proto.getParameter;
    proto.getParameter = function(p) {
      if (p === 0x9245) return '${escapeJs(fp.webglVendor)}';
      if (p === 0x9246) return '${escapeJs(fp.webglRenderer)}';
      if (p === 0x1F00) return '${escapeJs(fp.webglVendor)}';
      if (p === 0x1F01) return '${escapeJs(fp.webglRenderer)}';
      return orig.call(this, p);
    };
  }
  try { patchGL(WebGLRenderingContext.prototype); } catch(e) {}
  try { patchGL(WebGL2RenderingContext.prototype); } catch(e) {}

  // ═══ AUDIO NOISE ═══
  var aSeed = ${fp.audioNoiseSeed};
  var aAmp = ${fp.audioNoiseAmplitude};
  var as0 = aSeed >>> 0;
  var as1 = ((aSeed * 0x6c078965) + 1) >>> 0;
  if (as0 === 0 && as1 === 0) as0 = 1;
  function aRng() {
    var s1 = as0; var s0 = as1; as0 = s0;
    s1 ^= s1 << 23; s1 ^= s1 >>> 17; s1 ^= s0; s1 ^= s0 >>> 26; as1 = s1;
    return ((as0 + as1) >>> 0) / 0x100000000 - 0.5;
  }
  var origGCD = AudioBuffer.prototype.getChannelData;
  var noisedBufs = new WeakMap();
  AudioBuffer.prototype.getChannelData = function(ch) {
    var data = origGCD.call(this, ch);
    if (!noisedBufs.has(this)) noisedBufs.set(this, new Set());
    var chs = noisedBufs.get(this);
    if (!chs.has(ch)) {
      for (var i = 0; i < data.length; i++) data[i] += aRng() * aAmp;
      chs.add(ch);
    }
    return data;
  };

  // ═══ WEBRTC BLOCK ═══
  try { Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, writable: false, configurable: false }); } catch(e) {}
  try { Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined, writable: false, configurable: false }); } catch(e) {}

  // ═══ FONT PROTECTION ═══
  var allowedFonts = new Set([$fontsJson]);
  if (document.fonts && document.fonts.check) {
    var origCheck = document.fonts.check.bind(document.fonts);
    document.fonts.check = function(font, text) {
      var m = font.match(/(?:\d+(?:px|pt|em|rem)\s+)?['"]?([^'"]+)['"]?/);
      if (m && !allowedFonts.has(m[1].trim())) return false;
      return origCheck(font, text || '');
    };
  }

  // ═══ HIDE OVERRIDES ═══
  var nStr = 'function () { [native code] }';
  function hide(o,p) { try { if(typeof o[p]==='function') o[p].toString=function(){return nStr;}; } catch(e){} }
  hide(HTMLCanvasElement.prototype, 'toDataURL');
  hide(AudioBuffer.prototype, 'getChannelData');
})();
""".trimIndent()
    }

    /** Escape a string for safe JS injection */
    private fun escapeJs(str: String): String {
        return str.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
    }

    /**
     * Get the override script as a standalone JS file content.
     * Used when loading as a WebExtension content script.
     */
    fun getContentScriptSource(fp: FingerprintProfile): String {
        return buildOverrideScript(fp)
    }
}
