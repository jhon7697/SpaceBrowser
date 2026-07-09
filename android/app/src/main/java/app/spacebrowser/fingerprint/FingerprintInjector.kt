package app.spacebrowser.fingerprint

import android.util.Log
import app.spacebrowser.model.FingerprintProfile
import app.spacebrowser.model.Space
import org.mozilla.geckoview.GeckoSession

/**
 * FingerprintInjector — injects anti-fingerprint JavaScript into pages
 * via ProgressDelegate.onPageStart.
 */
class FingerprintInjector {

    companion object {
        private const val TAG = "FingerprintInjector"
    }

    fun attachToSession(session: GeckoSession, space: Space) {
        // Inject fingerprint overrides when page starts loading
        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                injectOverrides(session, space.fingerprintProfile)
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                // no-op
            }
        }
    }

    private fun injectOverrides(session: GeckoSession, fp: FingerprintProfile) {
        val script = buildOverrideScript(fp)
        try {
            session.loadUri("javascript:void((function(){$script})())")
        } catch (e: Exception) {
            Log.w(TAG, "JS injection failed: ${e.message}")
        }
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
availWidth:{get:function(){return ${fp.screenAvailWidth};}},
availHeight:{get:function(){return ${fp.screenAvailHeight};}},
colorDepth:{get:function(){return ${fp.colorDepth};}},
pixelDepth:{get:function(){return ${fp.colorDepth};}}
});}catch(e){}
try{Object.defineProperty(window,'devicePixelRatio',{get:function(){return ${fp.pixelRatio};},configurable:true});}catch(e){}
var cs=${fp.canvasNoiseSeed},ca=${fp.canvasNoiseAmplitude},s0=cs>>>0,s1=((cs*0x6c078965)+1)>>>0;
if(s0===0&&s1===0)s0=1;
function cr(){var a=s0,b=s1;s0=b;a^=a<<23;a^=a>>>17;a^=b;a^=b>>>26;s1=a;return((s0+s1)>>>0)/0x100000000;}
var oTD=HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL=function(){var c=this.getContext('2d');if(c){try{var d=c.getImageData(0,0,this.width,this.height),p=d.data;for(var i=0;i<p.length;i+=4){p[i]=Math.max(0,Math.min(255,p[i]+Math.floor((cr()-0.5)*255*ca)));p[i+1]=Math.max(0,Math.min(255,p[i+1]+Math.floor((cr()-0.5)*255*ca)));p[i+2]=Math.max(0,Math.min(255,p[i+2]+Math.floor((cr()-0.5)*255*ca)));}c.putImageData(d,0,0);}catch(e){}}return oTD.apply(this,arguments);};
function pGL(p){var o=p.getParameter;p.getParameter=function(x){if(x===0x9245||x===0x1F00)return '${escapeJs(fp.webglVendor)}';if(x===0x9246||x===0x1F01)return '${escapeJs(fp.webglRenderer)}';return o.call(this,x);};}
try{pGL(WebGLRenderingContext.prototype);}catch(e){}
try{pGL(WebGL2RenderingContext.prototype);}catch(e){}
try{Object.defineProperty(window,'RTCPeerConnection',{value:undefined,writable:false,configurable:false});}catch(e){}
var af=new Set([$fontsJson]);
if(document.fonts&&document.fonts.check){var oc=document.fonts.check.bind(document.fonts);document.fonts.check=function(f,t){var m=f.match(/(?:\d+(?:px|pt|em|rem)\s+)?['"]?([^'"]+)['"]?/);if(m&&!af.has(m[1].trim()))return false;return oc(f,t||'');};}
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
