/**
 * SpaceBrowser — Fingerprint Injector (Content Script)
 *
 * Injected into EVERY page at document_start (before any page JS runs).
 * Receives the fingerprint profile for the current space from the background
 * script and overrides all fingerprint-revealing APIs.
 *
 * Key technique: We inject overrides into the page's MAIN world via a
 * <script> tag so the overrides apply to the page's own JS context,
 * not just the content script's isolated world.
 */

(async function () {
  'use strict';

  // Request fingerprint profile from background script
  let profile = null;
  try {
    profile = await browser.runtime.sendMessage({ type: 'GET_FINGERPRINT' });
  } catch (e) {
    // Extension context invalidated or no response — bail silently
    return;
  }

  if (!profile) return; // No active space, no spoofing

  // Build the override script that runs in the page's main world
  const overrideCode = buildOverrideScript(profile);

  // Inject into the page's main world
  const script = document.createElement('script');
  script.textContent = overrideCode;
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // Clean up — code already executed

  /**
   * Build a self-executing JS string that overrides fingerprint APIs.
   * Everything is inlined since it runs in the page context, not ours.
   */
  function buildOverrideScript(fp) {
    return `(function() {
      'use strict';

      // ═══════════════════════════════════════════════════════════
      // NAVIGATOR OVERRIDES
      // ═══════════════════════════════════════════════════════════

      const navOverrides = ${JSON.stringify(fp.navigator)};

      const navProps = {
        userAgent: { get: () => navOverrides.userAgent },
        platform: { get: () => navOverrides.platform },
        vendor: { get: () => navOverrides.vendor },
        hardwareConcurrency: { get: () => navOverrides.hardwareConcurrency },
        deviceMemory: { get: () => navOverrides.deviceMemory },
        maxTouchPoints: { get: () => navOverrides.maxTouchPoints },
        language: { get: () => ${JSON.stringify(fp.language.primary)} },
        languages: { get: () => Object.freeze(${JSON.stringify(fp.language.all)}) },
      };

      try {
        Object.defineProperties(Object.getPrototypeOf(navigator), navProps);
      } catch(e) {}

      // ═══════════════════════════════════════════════════════════
      // SCREEN OVERRIDES
      // ═══════════════════════════════════════════════════════════

      const screenData = ${JSON.stringify(fp.screen)};

      const screenProps = {
        width: { get: () => screenData.width },
        height: { get: () => screenData.height },
        availWidth: { get: () => screenData.availWidth },
        availHeight: { get: () => screenData.availHeight },
        colorDepth: { get: () => screenData.colorDepth },
        pixelDepth: { get: () => screenData.colorDepth },
      };

      try {
        Object.defineProperties(Object.getPrototypeOf(screen), screenProps);
      } catch(e) {}

      try {
        Object.defineProperty(window, 'devicePixelRatio', {
          get: () => ${fp.screen.pixelRatio},
          configurable: true,
        });
      } catch(e) {}

      // ═══════════════════════════════════════════════════════════
      // CANVAS FINGERPRINT NOISE
      // ═══════════════════════════════════════════════════════════

      // Seeded PRNG for deterministic canvas noise
      const canvasSeed = ${fp.canvas.noiseSeed};
      const canvasIntensity = ${fp.canvas.noiseIntensity};

      let cs0 = canvasSeed >>> 0;
      let cs1 = (canvasSeed * 0x6c078965 + 1) >>> 0;
      if (cs0 === 0 && cs1 === 0) cs0 = 1;

      function cRng() {
        let s1 = cs0;
        const s0 = cs1;
        cs0 = s0;
        s1 ^= s1 << 23;
        s1 ^= s1 >>> 17;
        s1 ^= s0;
        s1 ^= s0 >>> 26;
        cs1 = s1;
        return ((cs0 + cs1) >>> 0) / 0x100000000;
      }

      // Override toDataURL
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const data = imageData.data;
          // Add subtle noise to pixel data
          for (let i = 0; i < data.length; i += 4) {
            // Only modify color channels, not alpha
            data[i]     = Math.max(0, Math.min(255, data[i]     + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.apply(this, arguments);
      };

      // Override toBlob
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        // Trigger noise via toDataURL first
        this.toDataURL();
        return origToBlob.call(this, callback, type, quality);
      };

      // Override getImageData to add noise on read
      const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      let noiseApplied = new WeakSet();
      CanvasRenderingContext2D.prototype.getImageData = function() {
        const imageData = origGetImageData.apply(this, arguments);
        if (!noiseApplied.has(this.canvas)) {
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            data[i]     = Math.max(0, Math.min(255, data[i]     + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + Math.floor((cRng() - 0.5) * 255 * canvasIntensity)));
          }
          noiseApplied.add(this.canvas);
        }
        return imageData;
      };

      // ═══════════════════════════════════════════════════════════
      // WEBGL FINGERPRINT OVERRIDE
      // ═══════════════════════════════════════════════════════════

      const webglData = ${JSON.stringify(fp.webgl)};

      function patchWebGL(proto) {
        const origGetParameter = proto.getParameter;
        proto.getParameter = function(param) {
          // RENDERER (0x1F01) and VENDOR (0x1F00)
          if (param === 0x1F01) return webglData.renderer;
          if (param === 0x1F00) return webglData.vendor;
          return origGetParameter.call(this, param);
        };

        const origGetExtension = proto.getExtension;
        proto.getExtension = function(name) {
          const ext = origGetExtension.call(this, name);
          if (name === 'WEBGL_debug_renderer_info' && ext) {
            // Override the extension constants
            return new Proxy(ext, {
              get(target, prop) {
                if (prop === 'UNMASKED_VENDOR_WEBGL') return 0x9245;
                if (prop === 'UNMASKED_RENDERER_WEBGL') return 0x9246;
                return target[prop];
              }
            });
          }
          return ext;
        };

        // Also override getParameter for the debug info extension constants
        const origGetParam2 = proto.getParameter;
        proto.getParameter = function(param) {
          if (param === 0x9245) return webglData.vendor;
          if (param === 0x9246) return webglData.renderer;
          if (param === 0x1F01) return webglData.renderer;
          if (param === 0x1F00) return webglData.vendor;
          return origGetParam2.call(this, param);
        };
      }

      try { patchWebGL(WebGLRenderingContext.prototype); } catch(e) {}
      try { patchWebGL(WebGL2RenderingContext.prototype); } catch(e) {}

      // ═══════════════════════════════════════════════════════════
      // AUDIO CONTEXT FINGERPRINT NOISE
      // ═══════════════════════════════════════════════════════════

      const audioSeed = ${fp.audio.noiseSeed};
      const audioNoise = ${fp.audio.noiseAmount};

      let as0 = audioSeed >>> 0;
      let as1 = (audioSeed * 0x6c078965 + 1) >>> 0;
      if (as0 === 0 && as1 === 0) as0 = 1;

      function aRng() {
        let s1 = as0;
        const s0 = as1;
        as0 = s0;
        s1 ^= s1 << 23;
        s1 ^= s1 >>> 17;
        s1 ^= s0;
        s1 ^= s0 >>> 26;
        as1 = s1;
        return ((as0 + as1) >>> 0) / 0x100000000 - 0.5;
      }

      // Override AudioBuffer.getChannelData to add noise
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      const noisedBuffers = new WeakMap();
      AudioBuffer.prototype.getChannelData = function(channel) {
        const data = origGetChannelData.call(this, channel);
        const key = this.toString() + channel;
        if (!noisedBuffers.has(this)) {
          noisedBuffers.set(this, new Set());
        }
        const channels = noisedBuffers.get(this);
        if (!channels.has(channel)) {
          for (let i = 0; i < data.length; i++) {
            data[i] += aRng() * audioNoise;
          }
          channels.add(channel);
        }
        return data;
      };

      // ═══════════════════════════════════════════════════════════
      // TIMEZONE OVERRIDE
      // ═══════════════════════════════════════════════════════════

      const targetTZ = ${JSON.stringify(fp.timezone)};
      const targetOffset = ${fp.timezoneOffset};

      // Override Date.prototype.getTimezoneOffset
      const origGetTZOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = function() {
        return targetOffset;
      };

      // Override Intl.DateTimeFormat to use our timezone
      const OrigDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(locales, options) {
        const opts = Object.assign({}, options || {});
        if (!opts.timeZone) {
          opts.timeZone = targetTZ;
        }
        return new OrigDateTimeFormat(locales, opts);
      };
      Intl.DateTimeFormat.prototype = OrigDateTimeFormat.prototype;
      Object.setPrototypeOf(Intl.DateTimeFormat, OrigDateTimeFormat);
      Intl.DateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;

      // ═══════════════════════════════════════════════════════════
      // WEBRTC IP LEAK PREVENTION
      // ═══════════════════════════════════════════════════════════

      ${fp.webrtc.mode === 'block' ? `
      // Block WebRTC entirely to prevent IP leaks
      Object.defineProperty(window, 'RTCPeerConnection', {
        value: undefined,
        writable: false,
        configurable: false,
      });
      Object.defineProperty(window, 'webkitRTCPeerConnection', {
        value: undefined,
        writable: false,
        configurable: false,
      });
      Object.defineProperty(window, 'mozRTCPeerConnection', {
        value: undefined,
        writable: false,
        configurable: false,
      });
      ` : '// WebRTC proxy mode — not yet implemented'}

      // ═══════════════════════════════════════════════════════════
      // FONT ENUMERATION PROTECTION
      // ═══════════════════════════════════════════════════════════

      const allowedFonts = new Set(${JSON.stringify(fp.fonts)});

      // Override document.fonts.check to only report our allowed fonts
      if (document.fonts && document.fonts.check) {
        const origCheck = document.fonts.check.bind(document.fonts);
        document.fonts.check = function(font, text) {
          // Extract font family from CSS font shorthand
          const match = font.match(/(?:\\d+(?:px|pt|em|rem)\\s+)?['"]?([^'"]+)['"]?/);
          if (match) {
            const family = match[1].trim();
            if (!allowedFonts.has(family)) {
              return false;
            }
          }
          return origCheck(font, text || '');
        };
      }

      // ═══════════════════════════════════════════════════════════
      // PROTECTION AGAINST OVERRIDE DETECTION
      // ═══════════════════════════════════════════════════════════

      // Make our overrides undetectable by toString checks
      const nativeFnStr = 'function () { [native code] }';

      function hideOverride(obj, prop) {
        try {
          const fn = obj[prop];
          if (typeof fn === 'function') {
            fn.toString = () => nativeFnStr;
          }
        } catch(e) {}
      }

      hideOverride(HTMLCanvasElement.prototype, 'toDataURL');
      hideOverride(HTMLCanvasElement.prototype, 'toBlob');
      hideOverride(CanvasRenderingContext2D.prototype, 'getImageData');
      hideOverride(AudioBuffer.prototype, 'getChannelData');
      hideOverride(Date.prototype, 'getTimezoneOffset');

      // Prevent detection via iframe checks — apply same overrides
      const origCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = origCreateElement.call(this, tag);
        if (tag.toLowerCase() === 'iframe') {
          const origAppend = el.appendChild;
          // Note: iframes in same origin will inherit overrides
          // Cross-origin iframes are already isolated
        }
        return el;
      };

    })();`;
  }
})();
