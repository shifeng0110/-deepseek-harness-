// dsh-livewall — client bundle (browser half).
// Format: window.__ModuleLoader__.load({ id, factory }) lazy-CJS as produced by
// the dsh client module system. Only platform seed modules are required:
// react, react/jsx-runtime, react-dom/client, @deepseek-ai/cordis,
// @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives.
//
// Provides:
//  - dynamic wallpaper engine (canvas rAF presets: stardust / aurora / glass;
//    media wallpapers: local video/image via /bg-assets, remote URL)
//  - light/dark adaptation via body[data-ds-dark-theme]
//  - settings section page "动态壁纸" (settings.section slot)
//
// Does NOT modify any harness source file.
window.__ModuleLoader__.load({
  id: "dsh-livewall",
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var jsxRuntime = require("react/jsx-runtime");
    var jsx = jsxRuntime.jsx;
    var jsxs = jsxRuntime.jsxs;
    var Fragment = jsxRuntime.Fragment;
    var useState = react.useState, useEffect = react.useEffect, useRef = react.useRef, useMemo = react.useMemo;

    var PACKAGE = "dsh-livewall";
    var NS = "livewall";
    var ASSET_PREFIX = "/bg-assets";

    // ---- tiny CSS injection (data-plugin-css tags, like shipped bundles) ----
    var STYLE_ID = PACKAGE + "/styles";
    var css = [
      ".lw-root{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}",
      "html.lw-active{background:transparent!important}",
      "body.lw-active{background:transparent!important}",
      ".lw-root canvas,.lw-root video,.lw-root img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}",
      ".lw-root .lw-dim{position:absolute;inset:0;pointer-events:none}",
      ".lw-page{display:flex;flex-direction:column;gap:14px;padding:2px 0 24px}",
      ".lw-field{display:flex;flex-direction:column;gap:6px}",
      ".lw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".lw-label{color:var(--dsw-alias-label-primary,#333);font-size:13px;line-height:18px}",
      ".lw-hint{color:var(--dsw-alias-label-secondary,#777);font-size:12px;line-height:16px}",
      ".lw-err{color:var(--dsw-alias-state-error-primary,#d33);font-size:12px;line-height:16px}",
      ".lw-ok{color:var(--dsw-alias-state-success-primary,#2a2);font-size:12px}",
      ".lw-input,.lw-select{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#333);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:6px 8px;font-size:13px;min-width:0}",
      ".lw-btn{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#333);border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:5px 10px;font-size:13px;cursor:pointer}",
      ".lw-btn:disabled{opacity:.5;cursor:default}",
      ".lw-chip{border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:10px;padding:8px 10px;cursor:pointer;background:transparent;color:var(--dsw-alias-label-primary,#333);font-size:13px;text-align:left}",
      ".lw-chip.lw-sel{border-color:var(--dsw-alias-brand-primary,#4176e6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4176e6) 12%,transparent)}",
      ".lw-range{accent-color:var(--dsw-alias-brand-primary,#4176e6)}",
      ".lw-filelist{display:flex;flex-wrap:wrap;gap:6px}",
      ".lw-file{border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;background:transparent;color:var(--dsw-alias-label-primary,#333)}",
      ".lw-sep{border-top:1px solid var(--dsw-alias-border-l2,#eee);margin:2px 0}"
    ].join("\n");
    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var tag = document.createElement("style");
      tag.id = STYLE_ID;
      tag.dataset.plugin = PACKAGE;
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // ---- tiny shared component helpers (React without external libs) ----
    function Field(props) {
      return jsx("div", { className: "lw-field", children: props.children });
    }
    function Slider(props) {
      return jsxs("div", { className: "lw-row", children: [
        jsx("span", { className: "lw-label", children: props.label }),
        jsx("input", { type: "range", className: "lw-range", min: props.min, max: props.max, step: props.step || 0.05, value: props.value, onChange: (e) => props.onChange(Number(e.target.value)) }),
        jsx("span", { className: "lw-hint", children: String(Math.round(props.value * 100) / 100) })
      ] });
    }

    // ---- presets ----
    var PRESETS = [
      { id: "off", kind: "none", name: "关闭" },
      { id: "stardust", kind: "canvas", name: "星尘粒子", light: { speed: 0.5, density: 0.6, opacity: 0.95, drift: 0.5 }, dark: { speed: 0.5, density: 0.6, opacity: 0.9, drift: 0.5 } },
      { id: "aurora", kind: "canvas", name: "极光渐变", light: { speed: 0.5, density: 0.5, opacity: 0.6, drift: 0.5 }, dark: { speed: 0.55, density: 0.5, opacity: 0.55, drift: 0.5 } },
      { id: "glass", kind: "canvas", name: "柔光斑", light: { speed: 0.4, density: 0.45, opacity: 0.75, drift: 0.4 }, dark: { speed: 0.5, density: 0.5, opacity: 0.55, drift: 0.4 } },
      { id: "video", kind: "media", name: "视频壁纸", media: "video" },
      { id: "image", kind: "media", name: "图片壁纸", media: "image" }
    ];

    function presetById(id) {
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
      return PRESETS[0];
    }

    var DEFAULTS = {
      enabled: false,
      presetId: "off",
      assetDir: "F:\\dpharnesstest\\bg-assets",
      params: {},
      source: "",
      sourceKind: ""
    };

    // resolve stored params merged over preset defaults for a palette
    function resolveParams(section, preset, dark) {
      var base = preset.kind === "canvas" ? (dark ? preset.dark : preset.light) : {};
      var out = {};
      for (var k in base) out[k] = base[k];
      var p = (section && section.params) || {};
      for (var k2 in p) out[k2] = p[k2];
      out.panelAlpha = clampNum(p.panelAlpha, 0, 1, 0.8);
      out.wallOpacity = clampNum(p.wallOpacity, 0, 1, 1);
      return out;
    }
    function clampNum(v, min, max, dft) {
      if (typeof v !== "number" || !isFinite(v)) return dft;
      return Math.min(max, Math.max(min, v));
    }

    // ---- color helpers ----
    function hexToRgba(hex, alpha) {
      var m = /^#?([0-9a-f]{3,8})$/i.exec(String(hex || "").trim());
      if (!m) return hex;
      var h = m[1];
      if (h.length === 3 || h.length === 4) {
        var s = h; h = "";
        for (var i = 0; i < s.length; i++) h += s[i] + s[i];
      }
      if (h.length === 8) h = h.slice(0, 6); // drop any embedded alpha nibble
      var n = parseInt(h, 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
    }
    function withAlpha(hex, alpha) {
      if (!hex) return undefined;
      return hexToRgba(hex, alpha);
    }
    // semantic background tokens actually consumed by panels; we translate each
    // by the panel alpha while a wallpaper is on.
    var BG_TOKENS = [
      "--dsw-alias-bg-base", "--dsw-alias-bg-layer-1", "--dsw-alias-bg-layer-2",
      "--dsw-alias-bg-module-platform", "--dsw-specific-sidebar-fill"
    ];

    // ---- wallpaper engine singleton ----
    var engine = {
      root: null,
      mediaEl: null,
      mediaType: null,
      raf: 0,
      lastT: 0,
      canvas: null,
      ctx2d: null,
      particles: [],
      mode: "none", // none | canvas | media
      preset: null,
      params: {},
      dark: false,
      dim: null,
      activeUrl: "",
      paused: false,
      error: null,
      _soundTimer: 0
    };

    function isDarkNow() {
      return document.body ? document.body.hasAttribute("data-ds-dark-theme") : false;
    }

    function buildMediaUrl(source) {
      if (!source) return "";
      if (/^https?:\/\//i.test(source)) return source;
      var name = String(source).split(/[\\/]/).pop();
      return ASSET_PREFIX + "/" + encodeURIComponent(name);
    }

    function mountRoot() {
      if (engine.root) return engine.root;
      var root = document.createElement("div");
      root.className = "lw-root";
      root.id = PACKAGE + "-root";
      document.body.appendChild(root);
      document.documentElement.classList.add("lw-active");
      document.body.classList.add("lw-active");
      engine.root = root;
      engine.dim = document.createElement("div");
      engine.dim.className = "lw-dim";
      root.appendChild(engine.dim);
      return root;
    }
    function clearRoot() {
      stopSoundRetry();
      if (engine.raf) { cancelAnimationFrame(engine.raf); engine.raf = 0; }
      if (engine._resize) { window.removeEventListener("resize", engine._resize); engine._resize = null; }
      if (engine._vis) { document.removeEventListener("visibilitychange", engine._vis); engine._vis = null; }
      if (engine._visMedia) { document.removeEventListener("visibilitychange", engine._visMedia); engine._visMedia = null; }
      if (engine.clearMediaEl) { engine.clearMediaEl(); }
      if (engine.mediaEl) {
        try { engine.mediaEl.pause(); } catch (e) {}
        engine.mediaEl.remove();
        engine.mediaEl = null;
      }
      if (engine.canvas) { engine.canvas.remove(); engine.canvas = null; engine.ctx2d = null; }
      engine.particles = [];
      engine.mode = "none";
      engine.error = null;
    }
    function destroy() {
      clearRoot();
      if (engine.dim) { engine.dim.remove(); engine.dim = null; }
      if (engine.root) { engine.root.remove(); engine.root = null; }
      document.documentElement.classList.remove("lw-active");
      document.body.classList.remove("lw-active");
      resetTransparency();
      engine.baseTokens = null;
      engine.paused = false;
    }

    var TOKEN_STYLE_ID = PACKAGE + "/tokens";
    // Capture the ORIGINAL (stylesheet/theme) hex value of each bg token once
    // per theme; re-captured when the theme (dark flag) changes. Subsequent
    // translates use these originals, so a theme reconcile writing opaque
    // inline tokens can never poison the base map.
    function baseTokens() {
      var dark = isDarkNow();
      if (engine.baseTokens && engine.baseDark === dark) return engine.baseTokens;
      // drop previous overrides (inline props + !important rules) so the read
      // reflects the pristine theme values for the current theme
      resetTransparency();
      var cs = getComputedStyle(document.body);
      var map = {};
      for (var i = 0; i < BG_TOKENS.length; i++) {
        var v = cs.getPropertyValue(BG_TOKENS[i]).trim();
        if (v && /^#([0-9a-f]{3,8})$/i.test(v)) map[BG_TOKENS[i]] = v;
      }
      engine.baseTokens = map;
      engine.baseDark = dark;
      return map;
    }
    function applyTransparency(alpha) {
      var a = clampNum(typeof alpha === "number" ? alpha : NaN, 0, 1, 0.85);
      var tokens = baseTokens();
      var rules = [];
      for (var i = 0; i < BG_TOKENS.length; i++) {
        var name = BG_TOKENS[i];
        var hex = tokens[name];
        if (!hex) continue;
        var rgba = withAlpha(hex, a);
        document.body.style.setProperty(name, rgba);
        rules.push("body{" + name + ":" + rgba + " !important;}");
      }
      if (rules.length) {
        var tag = document.getElementById(TOKEN_STYLE_ID);
        if (!tag) {
          tag = document.createElement("style");
          tag.id = TOKEN_STYLE_ID;
          tag.dataset.plugin = PACKAGE;
          document.head.appendChild(tag);
        }
        tag.textContent = rules.join("\n");
      }
    }
    function resetTransparency() {
      for (var i = 0; i < BG_TOKENS.length; i++) {
        document.body.style.removeProperty(BG_TOKENS[i]);
      }
      var tag = document.getElementById(TOKEN_STYLE_ID);
      if (tag) { tag.remove(); }
    }

    // palette + particle state builder per canvas frame
    function applyPalette(canvas, ctx, dark, preset) {
      var light = preset.light, darkP = preset.dark;
      var mode = (dark ? darkP : light) || preset.light || {};
      return mode;
    }

    // ---- canvas renderers ----
    function resizeCanvas() {
      var canvas = engine.canvas;
      if (!canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      engine.ctx2d = ctx;
    }

    function startCanvas(preset, params, dark) {
      clearRoot();
      var root = mountRoot();
      var canvas = document.createElement("canvas");
      root.appendChild(canvas);
      engine.canvas = canvas;
      engine.mode = "canvas";
      engine.preset = preset;
      engine.params = params;
      engine.dark = dark;
      resizeCanvas();
      var onResize = function () { resizeCanvas(); };
      window.addEventListener("resize", onResize);
      engine._resize = onResize;
      var paused = false;
      var onVis = function () {
        paused = document.hidden;
        if (paused && engine.raf) { cancelAnimationFrame(engine.raf); engine.raf = 0; }
        else if (!paused && !engine.raf) loop(performance.now());
      };
      document.addEventListener("visibilitychange", onVis);
      engine._vis = onVis;
      function loop(t) {
        engine.raf = requestAnimationFrame(loop);
        if (!engine.ctx2d || !engine.canvas || engine.mode !== "canvas") return;
        var dt = engine.lastT ? (t - engine.lastT) / 1000 : 0;
        engine.lastT = t;
        var w = engine.canvas.clientWidth || window.innerWidth;
        var h = engine.canvas.clientHeight || window.innerHeight;
        drawFrame(preset, params, dark, engine.ctx2d, w, h, t / 1000, dt);
      }
      engine.raf = requestAnimationFrame(loop);
    }

    function easeHex(hex, target, k) {
      // simple gradient mixing between two hex colors
      var a = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      var b = /^#?([0-9a-f]{6})$/i.exec(target || "");
      if (!a || !b) return target;
      var an = parseInt(a[1], 16), bn = parseInt(b[1], 16);
      var mix = function (sh, sl) { return Math.round(((sh >> sl) & 255) * (1 - k) + ((bn >> sl) & 255) * k); };
      return "rgb(" + mix(an, 16) + "," + mix(an, 8) + "," + mix(an, 0) + ")";
    }

    function drawFrame(preset, params, dark, ctx, w, h, time, dt) {
      ctx.clearRect(0, 0, w, h);
      if (preset.id === "stardust") drawStardust(ctx, w, h, time, dt, params, dark);
      else if (preset.id === "aurora") drawAurora(ctx, w, h, time, params, dark);
      else if (preset.id === "glass") drawGlass(ctx, w, h, time, params, dark);
    }

    function drawStardust(ctx, w, h, time, dt, params, dark) {
      var density = params.density != null ? params.density : 0.5;
      var speed = params.speed != null ? params.speed : 0.5;
      var count = Math.round((w * h) / 6000 * density);
      count = Math.max(30, Math.min(count, 560));
      if (engine.particles.length !== count) {
        engine.particles = [];
        for (var i = 0; i < count; i++) {
          engine.particles.push({ x: Math.random() * w, y: Math.random() * h, r: 0.7 + Math.random() * 2.1, vy: (0.15 + Math.random() * 0.6) * speed * 60, tw: Math.random() * Math.PI * 2 });
        }
      }
      var twinkle = (t) => (Math.sin(t) + 1) / 2;
      for (var j = 0; j < engine.particles.length; j++) {
        var p = engine.particles[j];
        p.y -= p.vy * (dt || 0.016);
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        var alpha = (0.35 + 0.65 * twinkle(time * 0.8 + p.tw)) * (params.opacity != null ? params.opacity : 0.9);
        var col = dark ? "220,228,255" : "55,95,185";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + col + "," + (alpha).toFixed(3) + ")";
        ctx.fill();
      }
      // occasional shooting star
      if (Math.random() < 0.004 * (speed || 0.5)) {
        var sx = Math.random() * w * 0.7 + w * 0.3;
        var sy = Math.random() * h * 0.3;
        var len = 80 + Math.random() * 90;
        var grad = ctx.createLinearGradient(sx, sy, sx - len, sy + len * 0.35);
        grad.addColorStop(0, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - len, sy + len * 0.35);
        ctx.stroke();
      }
    }

    function drawAurora(ctx, w, h, time, params, dark) {
      var speed = params.speed != null ? params.speed : 0.5;
      var bands = dark
        ? ["#0e2a52", "#12466e", "#1d5f8f", "#2f7fb5", "#4f8fd6"]
        : ["#3f6fd8", "#5f8ce6", "#8fb5f0", "#b9d2f7", "#dce9fc"];
      var t = time * (0.18 + speed * 0.3);
      ctx.globalCompositeOperation = "screen";
      var count = 4 + Math.round(dark ? 2 : 1);
      var ampBoost = dark ? 1 : 1.25;
      for (var i = 0; i < count; i++) {
        var baseY = h * (0.25 + 0.22 * Math.sin(t * 0.4 + i * 1.7));
        var amp = h * (0.1 + 0.14 * Math.sin(t * 0.7 + i * 2.3) + 0.08 * Math.sin(t * 1.1 + i)) * ampBoost;
        var grad = ctx.createLinearGradient(0, baseY - amp * 1.4, 0, baseY + amp);
        var c = bands[i % bands.length];
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, withAlpha(c, (dark ? 0.5 : 0.62) * (params.opacity != null ? params.opacity : 0.75)));
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        var cx = w / 2 + Math.sin(t * 0.25 + i * 2) * w * 0.2;
        ctx.moveTo(0, baseY);
        for (var x = 0; x <= w; x += 6) {
          var y = baseY + Math.sin(x * 0.006 + t * 0.9 + i * 2.4) * amp * 0.5 + Math.sin(x * 0.002 - t * 0.5 + i) * amp * 0.4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, baseY + amp);
        ctx.lineTo(0, baseY + amp);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function drawGlass(ctx, w, h, time, params, dark) {
      ctx.clearRect(0, 0, w, h);
      var speed = params.speed != null ? params.speed : 0.5;
      var opacity = params.opacity != null ? params.opacity : 0.4;
      var spots = dark ? ["rgba(90,140,255,", "rgba(120,190,255,", "rgba(150,120,255,"] : ["rgba(60,120,255,", "rgba(110,160,255,", "rgba(150,130,255,", "rgba(90,180,235,"];
      var t = time * (0.12 + speed * 0.2);
      for (var i = 0; i < (dark ? 3 : 4); i++) {
        var x = w * (0.5 + 0.38 * Math.sin(t * 0.4 + i * 2.1));
        var y = h * (0.5 + 0.32 * Math.cos(t * 0.3 + i * 1.3));
        var r = Math.min(w, h) * (0.36 + 0.14 * Math.sin(t * 0.5 + i));
        var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, spots[i % spots.length] + (opacity * (dark ? 0.6 : 0.95)).toFixed(3) + ")");
        grad.addColorStop(0.55, spots[i % spots.length] + (opacity * (dark ? 0.22 : 0.4)).toFixed(3) + ")");
        grad.addColorStop(1, spots[i % spots.length] + "0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    }

    function startMedia(preset, params, source) {
      clearRoot();
      var root = mountRoot();
      var isVideo = preset.id === "video";
      var el = isVideo ? document.createElement("video") : document.createElement("img");
      el.className = "lw-media";
      if (isVideo) {
        el.autoplay = true;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.setAttribute("playsinline", "");
      }
      var url = buildMediaUrl(source);
      if (!url) { engine.error = "未设置素材"; return; }
      engine.activeUrl = url;
      engine.mediaEl = el;
      engine.mediaType = isVideo ? "video" : "image";
      engine.mode = "media";
      engine.preset = preset;
      var soundOn = isVideo && !!(params && params.soundOn);
      el.muted = !soundOn;
      // guard against media error storms: mark element failed and stop once
      var failedOnce = false;
      var onError = function () {
        if (failedOnce) return;
        failedOnce = true;
        engine.error = (isVideo ? "视频" : "图片") + "加载失败(编码不支持或文件不存在):" + url;
        clearMediaEl();
      };
      function clearMediaEl() {
        if (engine.mediaEl) { try { engine.mediaEl.pause(); } catch (e) {} engine.mediaEl.remove(); engine.mediaEl = null; }
        if (engine.mediaType) engine.mode = "none";
        engine.mediaType = null;
      }
      engine.clearMediaEl = clearMediaEl;
      el.addEventListener("error", onError);
      el.src = url;
      root.appendChild(el);
      var onVis = function () {
        if (isVideo && engine.mediaEl && engine.mediaEl === el) {
          if (document.hidden) { try { el.pause(); } catch (e) {} }
          else { try { el.play().catch(function () {}); } catch (e) {} }
        }
      };
      document.addEventListener("visibilitychange", onVis);
      engine._visMedia = onVis;
      if (isVideo) {
        el.play().catch(function () {});
        // Autoplay-with-audio needs a user gesture / media engagement: when the
        // sound preference is on, keep retrying unmuted playback (including on
        // the next real user interaction) until the browser lets it through.
        // Once the element is actually playing, retries stop.
        startSoundRetry(el, soundOn);
      }
    }

    // Unmute + (re)try playback until the browser accepts it (autoplay
    // policy), then stop. Called on preset/media start and on the live
    // soundOn toggle.
    function startSoundRetry(el, soundOn) {
      stopSoundRetry();
      if (!soundOn || !el) return;
      el.muted = false;
      var tries = 0;
      var attempt = function () {
        if (!engine.mediaEl || engine.mediaEl !== el || engine.mode !== "media") { stopSoundRetry(); return; }
        if (!engine.params || !engine.params.soundOn) { stopSoundRetry(); return; }
        // keep unmuting unconditionally: a *playing* video resumes audio the
        // moment muted goes false, and a *paused* one needs play() (which the
        // autoplay policy may reject until a user gesture, hence retries)
        el.muted = false;
        if (el.paused || el.ended) {
          var pr = el.play();
          if (pr) pr.catch(function () {});
        }
        tries++;
        if (tries > 120) stopSoundRetry(); // give up after ~3 minutes
      };
      var onGesture = function () {
        document.removeEventListener("pointerdown", onGesture);
        document.removeEventListener("keydown", onGesture);
        document.removeEventListener("touchstart", onGesture);
        attempt();
      };
      document.addEventListener("pointerdown", onGesture);
      document.addEventListener("keydown", onGesture);
      document.addEventListener("touchstart", onGesture);
      engine._soundCleanup = function () {
        document.removeEventListener("pointerdown", onGesture);
        document.removeEventListener("keydown", onGesture);
        document.removeEventListener("touchstart", onGesture);
      };
      attempt();
      engine._soundTimer = setInterval(attempt, 1500);
    }
    function stopSoundRetry() {
      if (engine._soundTimer) { clearInterval(engine._soundTimer); engine._soundTimer = 0; }
      if (engine._soundCleanup) { try { engine._soundCleanup(); } catch (e) {} engine._soundCleanup = null; }
    }
    function clearMediaEl() {
      if (engine.mediaEl) { try { engine.mediaEl.pause(); } catch (e) {} engine.mediaEl.remove(); engine.mediaEl = null; }
      if (engine.mediaType) engine.mode = "none";
      engine.mediaType = null;
    }

    // main update from settings: (re)mount per enabled/preset/params
    function applyConfig(section) {
      if (!section) return;
      var enabled = !!section.enabled && section.presetId !== "off";
      if (!enabled) { destroy(); return; }
      var preset = presetById(section.presetId);
      var dark = isDarkNow();
      var params = resolveParams(section, preset, dark);
      engine.params = params;
      applyWallOpacity(params.wallOpacity);
      if (engine.root && engine.preset === preset && engine.mode !== "none") {
        // same kind: just refresh params / source if changed
        applyTransparency(params.panelAlpha);
        if (engine.mode === "canvas") { engine.dark = dark; return; }
        if (engine.mode === "media" && preset.kind === "media") {
          if (engine.activeUrl !== buildMediaUrl(section.source) || engine.mediaType !== preset.media) {
            startMedia(preset, {}, section.source);
          } else if (engine.mediaEl) {
            var so = !!(section.params && section.params.soundOn);
            if (!so) {
              engine.mediaEl.muted = true;
              stopSoundRetry();
            } else {
              startSoundRetry(engine.mediaEl, so);
            }
          }
          return;
        }
      }
      if (preset.kind === "canvas") {
        startCanvas(preset, params, dark);
        applyTransparency(params.panelAlpha);
        applyWallOpacity(params.wallOpacity);
      } else if (preset.kind === "media") {
        startMedia(preset, {}, section.source);
        applyTransparency(params.panelAlpha);
        applyWallOpacity(params.wallOpacity);
      } else {
        destroy();
      }
    }

    // apply the overall "wallpaper opacity" to the layer (canvas + media)
    function applyWallOpacity(wallOpacity) {
      if (!engine.root) return;
      var v = clampNum(typeof wallOpacity === "number" ? wallOpacity : NaN, 0, 1, 1);
      engine.root.style.opacity = String(v);
    }

    // keep engine params updated live when only panel/wall alpha or canvas params change
    function refreshFromSection(section) {
      if (!section || !section.enabled || section.presetId === "off") { destroy(); return; }
      var preset = presetById(section.presetId);
      var dark = isDarkNow();
      var params = resolveParams(section, preset, dark);
      engine.params = params;
      if (engine.root) {
        applyTransparency(params.panelAlpha);
        applyWallOpacity(params.wallOpacity);
      }
      if (engine.mode === "canvas") { engine.dark = dark; }
      else if (engine.mode === "media") {
        var url = buildMediaUrl(section.source);
        if (engine.mediaEl && engine.activeUrl !== url) {
          startMedia(preset, {}, section.source);
        }
      } else if (preset.kind === "canvas") {
        startCanvas(preset, params, dark);
        applyTransparency(params.panelAlpha);
        applyWallOpacity(params.wallOpacity);
      } else if (preset.kind === "media") {
        startMedia(preset, {}, section.source);
        applyTransparency(params.panelAlpha);
        applyWallOpacity(params.wallOpacity);
      }
    }

    // theme change hook (from our own setInterval-free subscription; body attr)
    function watchTheme(cb) {
      if (!window.MutationObserver) return function () {};
      var mo = new MutationObserver(function () { cb(); });
      mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
      return function () { mo.disconnect(); };
    }

    // ---- settings store: thin wrapper around the bind scope snapshot ----
    function makeStore(scope) {
      var listeners = [];
      var snapshot = { value: undefined, revision: -1, status: "loading", writable: false };
      function emit() { for (var i = 0; i < listeners.length; i++) listeners[i](); }
      return {
        subscribe: function (fn) {
          listeners.push(fn);
          var un = scope ? scope.subscribe(function () {
            var s = scope.getSnapshot();
            snapshot = { value: s.value, revision: s.revision, status: s.status, writable: s.writable };
            emit();
          }) : function () {};
          var s0 = scope && scope.getSnapshot();
          if (s0) snapshot = { value: s0.value, revision: s0.revision, status: s0.status, writable: s0.writable };
          return function () { un(); var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
        },
        getSnapshot: function () { return snapshot; },
        get scope() { return scope; }
      };
    }

    // ---- settings section component ----
    function LivewallPage(props) {
      var store = props.store;
      var snap = react.useSyncExternalStore(store.subscribe, store.getSnapshot);
      var sec = snap.value || DEFAULTS;
      var scope = store.scope;
      var [draftDir, setDraftDir] = useState(sec.assetDir || "");
      var [draftUrl, setDraftUrl] = useState(sec.sourceKind === "url" ? (sec.source || "") : "");
      var [list, setList] = useState([]);
      var [listMsg, setListMsg] = useState("");
      var [err, setErr] = useState("");
      var [busy, setBusy] = useState(false);
      var [uploading, setUploading] = useState(false);
      useEffect(function () { setDraftDir(sec.assetDir || ""); }, [sec.assetDir]);
      useEffect(function () {
        if (sec.enabled && sec.presetId !== "off" && engine.error) setErr(engine.error);
      }, [sec.enabled, sec.presetId]);
      var dark = typeof document !== "undefined" && isDarkNow();
      var preset = presetById(sec.presetId || "off");
      var params = useMemo(function () {
        return resolveParams(sec, preset, dark);
      }, [sec, preset, dark, sec.params]);

      function setField(f, v) {
        setErr("");
        if (scope) scope.set(f, v).catch(function (e) { setErr(String(e && e.message || e)); });
      }
      function enable(on, pid) {
        setField("enabled", !!on);
        if (pid) setField("presetId", pid);
      }
      function setParam(k, v) {
        var next = Object.assign({}, (sec.params || {}), { [k]: v });
        setField("params", next);
      }
      function choosePreset(pid) {
        setField("enabled", pid !== "off");
        setField("presetId", pid);
        if (pid !== "off" && pid !== "video" && pid !== "image") setField("source", "");
      }
      function chooseFile(name) {
        var kind = /\.(mp4|webm|mov)$/i.test(name) ? "video" : "image";
        setField("source", name);
        setField("sourceKind", "file");
        if (sec.presetId !== "video" && sec.presetId !== "image") {
          setField("presetId", kind);
          setField("enabled", true);
        } else {
          setField("presetId", kind === "video" ? "video" : "image");
          setField("enabled", true);
        }
      }
      function applyUrl() {
        var u = draftUrl.trim();
        if (!u) { setErr("请输入视频/图片 URL"); return; }
        setField("source", u);
        setField("sourceKind", "url");
        setField("presetId", /\.(mp4|webm|mov)(\?|$)/i.test(u) ? "video" : "image");
        setField("enabled", true);
      }
      function saveDir() {
        var d = draftDir.trim();
        if (!d) { setErr("目录不能为空"); return; }
        setField("assetDir", d);
        setListMsg("目录已保存(刷新素材列表生效)");
      }
      function refreshList() {
        setBusy(true); setListMsg(""); setErr("");
        fetch(ASSET_PREFIX + "/list")
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.ok) { setList(j.files || []); setListMsg("目录:" + j.dir); }
            else { setErr("列出素材失败:" + JSON.stringify(j)); setList([]); }
          })
          .catch(function (e) { setErr("无法访问素材列表:" + String(e && e.message || e)); setList([]); })
          .finally(function () { setBusy(false); });
      }
      function upload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var okExt = /\.(mp4|webm|mov|gif|png|jpg|jpeg|webp|apng|avif)$/i.test(file.name);
        if (!okExt) { setErr("不支持该文件类型"); return; }
        setUploading(true); setErr("");
        fetch(ASSET_PREFIX + "/upload?name=" + encodeURIComponent(file.name), { method: "PUT", body: file })
          .then(function (r) { return r.text(); })
          .then(function (txt) {
            if (/^ok/i.test(txt)) { setListMsg("已上传 " + file.name); refreshList(); }
            else setErr("上传失败:" + txt);
          })
          .catch(function (err2) { setErr("上传失败:" + String(err2 && err2.message || err2)); })
          .finally(function () { setUploading(false); });
      }
      var isMediaSel = sec.presetId === "video" || sec.presetId === "image";

      return jsxs("div", { className: "lw-page", children: [
        err ? jsx("div", { className: "lw-err", children: "⚠ " + err }) : null,
        listMsg && !err ? jsx("div", { className: "lw-ok", children: listMsg }) : null,
        jsx(Field, { children: jsxs("div", { className: "lw-row", children: [
          jsx("input", { type: "checkbox", checked: !!sec.enabled && sec.presetId !== "off", onChange: function (ev) { choosePreset(ev.target.checked ? (sec.presetId !== "off" ? sec.presetId : "stardust") : "off"); } }),
          jsx("span", { className: "lw-label", children: "启用动态壁纸" })
        ] }) }),
        jsxs("div", { className: "lw-field", children: [
          jsx("div", { className: "lw-label", children: "壁纸预设" }),
          jsxs("div", { className: "lw-row", children: PRESETS.map(function (p) {
            return jsx("button", { className: "lw-chip" + (sec.presetId === p.id ? " lw-sel" : ""), onClick: function () { choosePreset(p.id); }, children: p.name, key: p.id });
          }) })
        ] }),
        sec.enabled && sec.presetId !== "off" ? jsxs("div", { className: "lw-field", children: [
          jsx("div", { className: "lw-sep" }),
          jsx(Slider, { label: "壁纸不透明度", min: 0, max: 1, value: params.wallOpacity, onChange: function (v) { setParam("wallOpacity", v); } }),
          jsx(Slider, { label: "面板不透明度(0=全透,1=实心)", min: 0, max: 1, value: params.panelAlpha, onChange: function (v) { setParam("panelAlpha", v); } }),
          preset.kind === "canvas" ? jsxs("div", { className: "lw-field", children: [
            jsx(Slider, { label: "速度", min: 0.05, max: 2, value: params.speed, onChange: function (v) { setParam("speed", v); } }),
            jsx(Slider, { label: "密度", min: 0.05, max: 1, value: params.density, onChange: function (v) { setParam("density", v); } }),
            jsx(Slider, { label: "浓度/亮度", min: 0.1, max: 1, value: params.opacity, onChange: function (v) { setParam("opacity", v); } })
          ] }) : null,
          isMediaSel ? jsxs("div", { className: "lw-field", children: [
            jsx("div", { className: "lw-label", children: "素材文件(本地)" }),
            jsxs("div", { className: "lw-row", children: [
              jsx("button", { className: "lw-btn", disabled: busy, onClick: refreshList, children: "刷新素材列表" }),
              jsx("label", { className: "lw-btn", style: { display: "inline-block" }, children: [uploading ? "上传中…" : "上传文件", jsx("input", { type: "file", accept: "video/mp4,video/webm,image/*,.mp4,.webm,.mov,.gif,.apng", style: { display: "none" }, onChange: upload }) ] })
            ] }),
            list.length ? jsxs("div", { className: "lw-filelist", children: list.map(function (f) {
              return jsx("button", { className: "lw-file", title: f.name + " (" + Math.round(f.size / 1024) + " KB)", onClick: function () { chooseFile(f.name); }, children: f.name, key: f.name });
            }) }) : jsx("div", { className: "lw-hint", children: "素材列表为空——点刷新;或把 mp4/webm/图片文件放进素材目录后刷新" }),
            jsx("div", { className: "lw-label", style: { marginTop: 6 }, children: "或粘贴网络直链" }),
            jsxs("div", { className: "lw-row", children: [
              jsx("input", { className: "lw-input", style: { flex: 1 }, placeholder: "https://…/video.mp4 或图片 url", value: draftUrl, onChange: function (e2) { setDraftUrl(e2.target.value); } }),
              jsx("button", { className: "lw-btn", onClick: applyUrl, children: "应用 URL" })
            ] }),
            sec.presetId === "video" ? jsxs("div", { className: "lw-row", style: { marginTop: 4 }, children: [
              jsx("input", { type: "checkbox", checked: !!(sec.params && sec.params.soundOn), onChange: function (ev) { setParam("soundOn", ev.target.checked); } }),
              jsx("span", { className: "lw-label", children: "启用壁纸声音" }),
              jsx("span", { className: "lw-hint", children: "(浏览器自动播放策略:开声音后若仍无声,点击页面任意处一次即可)" })
            ] }) : null
          ] }) : null
        ] }) : null,
        jsx(Field, { children: jsxs("div", { className: "lw-field", children: [
          jsx("div", { className: "lw-label", children: "素材目录(可改绝对路径,保存后立即生效)" }),
          jsxs("div", { className: "lw-row", children: [
            jsx("input", { className: "lw-input", style: { flex: 1 }, value: draftDir, onChange: function (e2) { setDraftDir(e2.target.value); } }),
            jsx("button", { className: "lw-btn", onClick: saveDir, children: "保存目录" })
          ] }),
          jsx("div", { className: "lw-hint", children: "支持 mp4 / webm / mov / gif / png / jpg / webp。HEVC(H.265)多数浏览器不支持,建议 H.264 的 mp4 或 VP9 的 webm。" })
        ] }) })
      ] });
    }

    // ---- client apply ----
    var inject = ["slots", "locale", "settingsScope"];

    function apply(ctx) {
      ensureStyle();
      var scope = ctx.settingsScope.bind({ namespace: NS });
      var store = makeStore(scope);
      var themeUnwatch = watchTheme(function () {
        // theme (dark flag) flipped: drop the cached base token colors so the
        // next translate reads the new theme's palette, then re-apply
        engine.baseTokens = null;
        engine.baseDark = null;
        refreshFromSection(scope.getSnapshot().value);
      });

      // engine never shows until the user enables it; apply once when the
      // scope becomes ready (initial hydration)
      var appliedOnce = false;
      function hydrate() {
        var snap = scope.getSnapshot();
        if (snap.status === "ready" && snap.value) {
          if (!appliedOnce) { appliedOnce = true; refreshFromSection(snap.value); }
          else { applyConfig(snap.value); }
        }
      }
      var un = scope.subscribe(hydrate);
      // if the scope was already ready at bind time, subscribe() will not
      // replay the current snapshot — hydrate once explicitly.
      hydrate();

      // clean on dispose (HMR / unload)
      ctx.effect(function () {
        return function () {
          un && un();
          themeUnwatch && themeUnwatch();
          destroy();
        };
      }, "dsh-livewall: engine teardown");

      // Register the settings section page directly, exactly like the shipped
      // settings plugins (dsh-client-ui-settings-models): by the time this
      // entry applies, ui-settings-general has already declared
      // "settings.section" (module-graph ordering), so no event gate is needed.
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "livewall",
          order: 60,
          label: function () { return "动态壁纸"; },
          inject: function () {
            return { store: store };
          }
        }, LivewallPage);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.PRESETS = PRESETS;
    exports.DEFAULTS = DEFAULTS;
    return module.exports;
  }
});
