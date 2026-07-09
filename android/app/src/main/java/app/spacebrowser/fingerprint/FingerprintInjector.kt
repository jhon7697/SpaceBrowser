package app.spacebrowser.fingerprint

import android.util.Log
import app.spacebrowser.model.FingerprintProfile

/**
 * FingerprintInjector — builds anti-fingerprint override JS.
 *
 * Note: JS injection happens in SpaceBrowserActivity's ProgressDelegate
 * to avoid overwriting the delegate. This class just generates the script.
 */
class FingerprintInjector {

    companion object {
        private const val TAG = "FingerprintInjector"
    }

    fun buildOverrideScript(fp: FingerprintProfile): String {
        val fontsJson = fp.fonts.joinToString(",") { "'${escapeJs(it)}'" }
        val languagesJson = fp.languages.joinToString(",") { "'${escapeJs(it)}'" }

        return """
(function(){
'use strict';
try{Object.defineProperties(Object.getPrototypeOf(navigator),{
userAgent:{get:function(){return '${escapeJs(fp.userAgent)}';}},
platform:{get:function(){return '${escapeJs(fp.platform)}';}},
hardwareConcurrency:{get:function(){return ${fp.hardwareConcurrency};}},
deviceMemory:{get:function(){return ${fp.deviceMemory};}},
language:{get:function(){return '${escapeJs(fp.language)}';}},
languages:{get:function(){return Object.freeze([$languagesJson]);}}
});}catch(e){}
try{Object.defineProperties(Object.getPrototypeOf(screen),{
width:{get:function(){return ${fp.screenWidth};}},
height:{get:function(){return ${fp.screenHeight};}},
colorDepth:{get:function(){return ${fp.colorDepth};}},
pixelDepth:{get:function(){return ${fp.colorDepth};}}
});}catch(e){}
function pGL(p){var o=p.getParameter;p.getParameter=function(x){if(x===0x9245||x===0x1F00)return '${escapeJs(fp.webglVendor)}';if(x===0x9246||x===0x1F01)return '${escapeJs(fp.webglRenderer)}';return o.call(this,x);};}
try{pGL(WebGLRenderingContext.prototype);}catch(e){}
try{pGL(WebGL2RenderingContext.prototype);}catch(e){}
try{Object.defineProperty(window,'RTCPeerConnection',{value:undefined,writable:false,configurable:false});}catch(e){}
})();
""".trimIndent()
    }

    private fun escapeJs(str: String): String {
        return str.replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
    }
}
