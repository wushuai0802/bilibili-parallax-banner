var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/banner.js
var banner_exports = {};
__export(banner_exports, {
  ParallaxBanner: () => ParallaxBanner,
  ThemeBanner: () => ThemeBanner,
  VERSION: () => VERSION,
  createBanner: () => createBanner,
  createTheme: () => createTheme,
  fromBilibiliSplitLayer: () => fromBilibiliSplitLayer,
  loadBanner: () => loadBanner,
  loadTheme: () => loadTheme
});
module.exports = __toCommonJS(banner_exports);

// src/model.js
var VERSION = "1.4.0";
var clamp = (value, low, high) => Math.min(high, Math.max(low, value));
function finite(value, fallback, name, low = -1e4, high = 1e4) {
  if (value === void 0) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new TypeError(`${name} must be a finite number in [${low}, ${high}]`);
  }
  return value;
}
function pair(value, fallback, name) {
  if (value === void 0) return fallback;
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${name} must be [x, y]`);
  return value.map((item, index) => finite(item, 0, `${name}[${index}]`));
}
function curve(value, name) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length !== 4 || value.some((x) => typeof x !== "number" || !Number.isFinite(x))) {
    throw new TypeError(`${name} must be four bezier coordinates`);
  }
  if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) throw new TypeError(`${name} x coordinates must be in [0, 1]`);
  return value;
}
function channel(value = {}, defaults, name) {
  const wrap = value.wrap ?? "clamp";
  if (!["clamp", "alternate"].includes(wrap)) throw new TypeError(`${name}.wrap is unsupported`);
  return {
    initial: Array.isArray(defaults.initial) ? pair(value.initial, defaults.initial, name) : finite(value.initial, defaults.initial, name),
    offset: Array.isArray(defaults.offset) ? pair(value.offset, defaults.offset, name) : finite(value.offset, defaults.offset, name),
    curve: curve(value.offsetCurve, name),
    wrap
  };
}
function normalizeConfig(input) {
  if (!input || typeof input !== "object") throw new TypeError("Banner config must be an object");
  if (input.version !== void 0 && input.version !== 1) throw new TypeError("Unsupported banner config version");
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > 32) throw new TypeError("Use 1 to 32 layers");
  const mode = input.mode ?? "aligned";
  if (!["aligned", "bilibili"].includes(mode)) throw new TypeError("Unknown layout mode");
  const height = input.height ?? {};
  const min = finite(height.min, 155, "height.min", 1, 2e3);
  const max = finite(height.max, 240, "height.max", min, 2e3);
  const touch = input.interaction?.touch ?? "none";
  if (!["none", "drag"].includes(touch)) throw new TypeError("interaction.touch must be none or drag");
  const config = {
    version: 1,
    mode,
    baseWidth: finite(input.baseWidth, 1920, "baseWidth", 1, 2e4),
    baseHeight: finite(input.baseHeight, 180, "baseHeight", 1, 4e3),
    pixelRatio: finite(input.pixelRatio, 2, "pixelRatio", 0.1, 8),
    baseUrl: input.baseUrl,
    description: String(input.description ?? ""),
    poster: input.poster,
    mobilePoster: input.mobilePoster,
    posterPosition: input.posterPosition ?? "50% 50%",
    background: input.background ?? "#173d42",
    taper: input.taper !== false,
    loadTimeout: finite(input.loadTimeout, 1e4, "loadTimeout", 100, 12e4),
    height: {
      ...height.aspectRatio === void 0 ? {} : { aspectRatio: finite(height.aspectRatio, 4, "height.aspectRatio", 0.5, 100) },
      min,
      max,
      ratio: finite(height.ratio, 0.09375, "height.ratio", 0.01, 2),
      mobile: finite(height.mobile, 144, "height.mobile", 1, 2e3),
      breakpoint: finite(height.breakpoint, 640, "height.breakpoint", 0, 3e3)
    },
    interaction: {
      enabled: input.interaction?.enabled !== false,
      touch,
      strength: finite(input.interaction?.strength, 1, "interaction.strength", 0, 3),
      resetDuration: finite(input.interaction?.resetDuration, 200, "interaction.resetDuration", 0, 2e3)
    }
  };
  const ids = /* @__PURE__ */ new Set();
  config.layers = input.layers.map((layer, index) => {
    const id = String(layer.id ?? `layer-${index}`);
    if (ids.has(id)) throw new TypeError(`Duplicate layer id: ${id}`);
    ids.add(id);
    if (typeof layer.src !== "string" || !layer.src.trim()) throw new TypeError(`Missing src for ${id}`);
    const type = layer.type ?? (/\.(mp4|webm)(?:[?#]|$)/i.test(layer.src) ? "video" : "image");
    if (!["video", "image"].includes(type)) throw new TypeError(`Unsupported media type for ${id}`);
    const fit = layer.fit ?? "canvas";
    if (!["canvas", "contain"].includes(fit) || fit === "contain" && mode !== "aligned") throw new TypeError(`Unsupported fit for ${id}`);
    const position = pair(layer.position, [0.5, 0.5], `${id}.position`);
    if (position.some((value) => value < 0 || value > 1)) throw new TypeError(`${id}.position must be in [0, 1]`);
    return {
      ...layer,
      id,
      type,
      fit,
      position,
      required: layer.required ?? index === 0,
      scale: finite(layer.scale, 1, `${id}.scale`, 0.01, 10),
      offset: pair(layer.offset, [0, 0], `${id}.offset`),
      initial: pair(layer.initial, [0, 0], `${id}.initial`),
      opacity: finite(layer.opacity, 1, `${id}.opacity`, 0, 1),
      rotate: finite(layer.rotate, 0, `${id}.rotate`),
      blur: finite(layer.blur, 0, `${id}.blur`, 0, 100)
    };
  });
  return config;
}
function resolveAssetUrl(src, baseUrl) {
  const url = new URL(src, baseUrl);
  if (!["http:", "https:", "file:", "blob:"].includes(url.protocol) && !(url.protocol === "data:" && /^data:image\//i.test(src))) {
    throw new TypeError("Unsupported asset URL protocol");
  }
  return url.href;
}
function bezierAt(progress, points) {
  if (!points) return progress;
  const sign = progress < 0 ? -1 : 1;
  const x = clamp(Math.abs(progress), 0, 1);
  const [x1, y1, x2, y2] = points;
  const cubic = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (cubic(t, x1, x2) < x) low = t;
    else high = t;
  }
  return sign * cubic((low + high) / 2, y1, y2);
}
function layerState(layer, progress, referenceScale = 1) {
  const motion = layer.motion;
  const sample = (entry) => bezierAt(progress, entry?.curve);
  const translation = motion?.translate;
  const initial = translation?.initial ?? layer.initial;
  const offset = translation?.offset ?? layer.offset;
  const factor = referenceScale * layer.scale;
  let opacity = layer.opacity;
  let blur = layer.blur;
  if (motion?.opacity) {
    opacity = motion.opacity.initial + motion.opacity.offset * sample(motion.opacity);
    if (motion.opacity.wrap === "alternate") {
      const n = (opacity % 2 + 2) % 2;
      opacity = n <= 1 ? n : 2 - n;
    }
  }
  if (motion?.blur) {
    blur = motion.blur.initial + motion.blur.offset * sample(motion.blur);
    if (motion.blur.wrap === "alternate") blur = Math.abs(blur);
  }
  return {
    x: (initial[0] + offset[0] * (translation ? sample(translation) : progress)) * factor,
    y: (initial[1] + offset[1] * (translation ? sample(translation) : progress)) * factor,
    scale: Math.max(0.01, 1 + (motion?.scale?.offset ?? 0) * sample(motion?.scale)),
    rotate: layer.rotate + (motion?.rotate?.offset ?? 0) * sample(motion?.rotate),
    opacity: clamp(opacity, 0, 1),
    blur: Math.max(0, blur)
  };
}
function alignedScale(config, width, height) {
  const reference = height / config.baseHeight;
  let paddingX = 1, paddingY = 1;
  let minimumScale = 1;
  for (const layer of config.layers) {
    if (layer.fit === "contain") continue;
    const strength = config.interaction.strength;
    paddingX = Math.max(paddingX, (Math.abs(layer.initial[0]) + Math.abs(layer.offset[0]) * strength) * reference * layer.scale + 1);
    paddingY = Math.max(paddingY, (Math.abs(layer.initial[1]) + Math.abs(layer.offset[1]) * strength) * reference * layer.scale + 1);
    minimumScale = Math.min(minimumScale, layer.scale);
  }
  return Math.max((width + 2 * paddingX) / config.baseWidth, (height + 2 * paddingY) / config.baseHeight) / minimumScale;
}
function layoutScale(config, layer, width, height, shared) {
  if (layer.fit === "contain") return Math.min(width / config.baseWidth, height / config.baseHeight);
  return shared ?? (config.mode === "aligned" ? alignedScale(config, width, height) : height / config.baseHeight);
}
function fromBilibiliSplitLayer(input, options = {}) {
  const envelope = typeof input === "string" ? JSON.parse(input) : input;
  const data = envelope?.data ?? envelope;
  const parsed = typeof data.split_layer === "string" ? JSON.parse(data.split_layer) : data.split_layer ?? data;
  if (String(parsed.version) !== "1" || !Array.isArray(parsed.layers)) throw new TypeError("Only Bilibili split_layer version 1 is supported");
  if (parsed.extensions && Object.keys(parsed.extensions).length) throw new TypeError("split_layer extensions require an application adapter");
  return normalizeConfig({
    ...options,
    version: 1,
    mode: "bilibili",
    baseHeight: 155,
    pixelRatio: 1,
    poster: options.poster ?? data.pic,
    layers: parsed.layers.map((item, index) => {
      const resource = item.resources?.[0];
      if (!resource?.src) throw new TypeError(`Missing resource in layer ${index}`);
      const scale = channel(item.scale, { initial: 1, offset: 0 }, "scale");
      const translate = channel(item.translate, { initial: [0, 0], offset: [0, 0] }, "translate");
      const rotate = channel(item.rotate, { initial: 0, offset: 0 }, "rotate");
      const blur = channel(item.blur, { initial: 0, offset: 0 }, "blur");
      const opacity = channel(item.opacity, { initial: 1, offset: 0 }, "opacity");
      return {
        id: `bili-${item.id ?? index}`,
        name: item.name,
        src: resource.src,
        required: index === 0,
        scale: scale.initial,
        initial: translate.initial,
        offset: translate.offset,
        rotate: rotate.initial,
        opacity: opacity.initial,
        blur: blur.initial,
        motion: { scale, translate, rotate, blur, opacity }
      };
    })
  });
}

// src/layout.js
function bannerHeight(config, width) {
  const rule = config.height;
  if (rule.aspectRatio !== void 0) return width / rule.aspectRatio;
  return width <= rule.breakpoint ? rule.mobile : clamp(width * rule.ratio, rule.min, rule.max);
}

// src/theme-model.js
var modes = /* @__PURE__ */ new Set(["pointer", "auto", "still"]);
function keys(value, allowed, label) {
  if (value !== void 0 && (!value || typeof value !== "object" || Array.isArray(value))) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value ?? {})) if (!allowed.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}
function number(value, fallback, min, max, label) {
  const result = value ?? fallback;
  if (typeof result !== "number" || !Number.isFinite(result) || result < min || result > max) throw new TypeError(`${label} must be in [${min}, ${max}]`);
  return result;
}
function normalizeTheme(input) {
  if (!input || input.version !== 1) throw new TypeError("Unsupported theme contract version");
  if (typeof input.name !== "string" || !input.name.trim()) throw new TypeError("Theme requires a name");
  const motion = input.motion ?? {};
  keys(motion, ["period", "resumeDelay", "fine", "coarse"], "motion");
  const profile = (kind, defaults) => {
    const value = motion[kind] ?? {};
    keys(value, ["mode", "amplitude", "fps"], `motion.${kind}`);
    const mode = value.mode ?? defaults.mode;
    if (!modes.has(mode)) throw new TypeError(`motion.${kind}.mode is unsupported`);
    return {
      mode,
      amplitude: number(value.amplitude, defaults.amplitude, 0, 1, `motion.${kind}.amplitude`),
      fps: number(value.fps, defaults.fps, 1, defaults.maxFps, `motion.${kind}.fps`)
    };
  };
  const variants = {};
  for (const name of ["desktop", "mobile"]) {
    const value = input.variants?.[name];
    if (!value || !value.config && (typeof value.manifest !== "string" || !value.manifest.trim())) throw new TypeError(`Missing ${name} manifest or inline config`);
    variants[name] = { ...value };
  }
  const breakpoint = number(input.breakpoint, 767, 1, 9999, "breakpoint");
  if (!Number.isInteger(breakpoint)) throw new TypeError("breakpoint must be an integer");
  return { ...input, breakpoint, variants, motion: {
    period: number(motion.period, 8e3, 1e3, 12e4, "motion.period"),
    resumeDelay: number(motion.resumeDelay, 1800, 0, 1e4, "motion.resumeDelay"),
    fine: profile("fine", { mode: "pointer", amplitude: 0.85, fps: 60, maxFps: 60 }),
    coarse: profile("coarse", { mode: "auto", amplitude: 0.55, fps: 30, maxFps: 30 })
  } };
}
var themeVariant = (theme, width) => width <= theme.breakpoint ? "mobile" : "desktop";

// src/theme.js
var mounted = /* @__PURE__ */ new WeakMap();
var abortError = () => new DOMException("Theme operation was cancelled", "AbortError");
var attributes = ["state", "variant", "mode", "name", "input-kind"].map((name) => `data-theme-${name}`);
var ThemeBanner = class {
  constructor(root, source, options = {}) {
    if (!root || root.nodeType !== 1) throw new TypeError("Theme root must be an element");
    if (mounted.has(root)) throw new Error("Theme already mounted; destroy the previous controller first");
    if (options.signal?.aborted) throw abortError();
    if (options.timeout !== void 0 && (!Number.isFinite(options.timeout) || options.timeout < 100 || options.timeout > 12e4)) throw new TypeError("Theme timeout must be in [100, 120000]");
    this.root = root;
    this.win = root.ownerDocument.defaultView;
    this.doc = root.ownerDocument;
    this.options = options;
    this.baseUrl = options.baseUrl ?? this.doc.baseURI;
    this.destroyed = false;
    this.state = "loading";
    this.variant = null;
    this.mode = "still";
    this.selectedMode = options.mode ?? "default";
    this.userPaused = false;
    this.visible = true;
    this.focused = true;
    this.suspended = false;
    this.frame = 0;
    this.resumeTimer = 0;
    this.sourceGeneration = 0;
    this.variantGeneration = 0;
    this.cleanups = [];
    this.saved = new Map(attributes.map((name) => [name, root.getAttribute(name)]));
    this.reduced = this.win.matchMedia("(prefers-reduced-motion: reduce)");
    this.fine = this.win.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    this._checkMode(this.selectedMode);
    mounted.set(root, this);
    this._bind();
    this.ready = this.setTheme(source, { baseUrl: this.baseUrl });
  }
  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }
  _emit(type, extra = {}) {
    if (this.destroyed) return;
    this.root.dispatchEvent(new this.win.CustomEvent(`theme:${type}`, { detail: {
      state: this.state,
      variant: this.variant,
      mode: this.mode,
      name: this.theme?.name,
      ...extra
    } }));
  }
  _state(value) {
    if (this.destroyed) return;
    this.state = value;
    this.root.dataset.themeState = value;
    this._emit("state");
  }
  _bind() {
    const resize = () => {
      if (!this.theme || this.loadingSource || this.destroyed) return;
      const width = this.root.clientWidth || this.root.getBoundingClientRect().width;
      if (!width) return;
      const variant = themeVariant(this.theme, width);
      if (variant !== this.variant) {
        this.variantJob = this._switchVariant(variant, this.sourceGeneration);
        this.variantJob.catch(() => {
        });
        this.ready = this._waitVariants(this.sourceGeneration);
        this.ready.catch(() => {
        });
      } else if (this.banner) this._layout(width);
    };
    if (this.win.ResizeObserver) {
      this.observer = new this.win.ResizeObserver(resize);
      this.observer.observe(this.root);
    } else this._listen(this.win, "resize", resize, { passive: true });
    this._listen(this.reduced, "change", () => this._applyMode());
    this._listen(this.fine, "change", () => this._applyMode());
    this._listen(this.root, "banner:visibility", (event) => {
      this.visible = event.detail.visible;
      if (this.visible) this._applyMode();
      else this._stop();
    });
    this._listen(this.root, "banner:interaction", (event) => {
      if (event.detail.phase === "start") this._takeOver();
      else if (this.temporaryMode) this._resumeLater();
    });
    this._listen(this.root, "pointerenter", (event) => {
      if (event.pointerType === "mouse") this._takeOver();
    });
    this._listen(this.root, "pointerleave", (event) => {
      if (event.pointerType === "mouse" && this.temporaryMode) this._resumeLater();
    });
    this._listen(this.doc, "visibilitychange", () => {
      if (this.doc.hidden) this._stop();
      else this._applyMode();
    });
    this._listen(this.win, "blur", () => {
      this.focused = false;
      this._stop();
    });
    this._listen(this.win, "focus", () => {
      this.focused = true;
      this._applyMode();
    });
    this._listen(this.win, "pagehide", (event) => {
      this.suspended = true;
      this._stop();
      this.banner?.pause();
      if (!event.persisted) this.destroy();
    });
    this._listen(this.win, "pageshow", (event) => {
      if (event.persisted) {
        this.suspended = false;
        this._applyMode();
      }
    });
    if (this.options.signal) this._listen(this.options.signal, "abort", () => this.destroy(), { once: true });
  }
  async _json(url, parentSignal) {
    if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Theme JSON requires HTTP(S); use createTheme with inline configs for offline previews");
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (parentSignal.aborted) throw abortError();
    parentSignal.addEventListener("abort", abort, { once: true });
    const timer = this.win.setTimeout(abort, this.options.timeout ?? 1e4);
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
      rejectAbort = reject;
    });
    const rejectCancelled = () => rejectAbort(parentSignal.aborted ? abortError() : new Error("Theme resource request timed out"));
    controller.signal.addEventListener("abort", rejectCancelled, { once: true });
    try {
      const request = Promise.resolve().then(async () => {
        const response = await fetch(url, { signal: controller.signal, credentials: "omit", cache: "no-cache" });
        if (!response.ok) throw new Error(`Theme resource request failed (${response.status})`);
        return response.json();
      });
      const data = await Promise.race([request, aborted]);
      if (controller.signal.aborted) throw parentSignal.aborted ? abortError() : new Error("Theme resource request timed out");
      return data;
    } catch (error) {
      if (parentSignal.aborted) throw abortError();
      if (controller.signal.aborted) throw new Error("Theme resource request timed out");
      throw error;
    } finally {
      this.win.clearTimeout(timer);
      parentSignal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", rejectCancelled);
    }
  }
  setTheme(source, options = {}) {
    if (this.destroyed) return Promise.reject(abortError());
    this.sourceAbort?.abort();
    this.variantAbort?.abort();
    this._stop();
    this.banner?.pause();
    this.sourceAbort = new AbortController();
    this.loadingSource = true;
    const generation = ++this.sourceGeneration, signal = this.sourceAbort.signal;
    this._state("loading");
    const job = (async () => {
      try {
        let baseUrl = options.baseUrl ?? this.baseUrl;
        let input = source;
        if (typeof source === "string" || source instanceof URL) {
          const url = new URL(source, baseUrl);
          input = await this._json(url, signal);
          baseUrl = url.href;
        }
        if (signal.aborted || this.destroyed || generation !== this.sourceGeneration) throw abortError();
        this.theme = normalizeTheme(input);
        this.baseUrl = baseUrl;
        this.root.dataset.themeName = this.theme.name;
        this.loadingSource = false;
        const width = this.root.clientWidth || this.root.getBoundingClientRect().width || 1;
        this.variantJob = this._switchVariant(themeVariant(this.theme, width), generation);
        this.variantJob.catch(() => {
        });
        return await this._waitVariants(generation);
      } catch (error) {
        if (generation === this.sourceGeneration && !this.destroyed && error.name !== "AbortError") {
          this.loadingSource = false;
          this._state("error");
          this._emit("error", { message: error.message });
        }
        throw error;
      }
    })();
    job.catch(() => {
    });
    this.ready = job;
    return job;
  }
  async _waitVariants(generation) {
    while (true) {
      const pending = this.variantJob;
      try {
        await pending;
      } catch (error) {
        if (pending === this.variantJob) throw error;
      }
      if (this.destroyed || generation !== this.sourceGeneration) throw abortError();
      if (pending === this.variantJob) return this;
    }
  }
  async _switchVariant(name, sourceGeneration) {
    this.variantAbort?.abort();
    this._stop();
    this.banner?.destroy();
    this.banner = null;
    this.variantAbort = new AbortController();
    const signal = this.variantAbort.signal, generation = ++this.variantGeneration;
    this.variant = name;
    this.visible = true;
    this.root.dataset.themeVariant = name;
    this._state("loading");
    const current = () => !this.destroyed && !signal.aborted && generation === this.variantGeneration && sourceGeneration === this.sourceGeneration;
    try {
      const definition = this.theme.variants[name];
      const manifest = new URL(definition.manifest ?? ".", this.baseUrl);
      const config = definition.config ?? await this._json(manifest, signal);
      if (!current()) throw abortError();
      this.banner = createBanner(this.root, { ...config, baseUrl: config.baseUrl ?? manifest.href });
      const instance = this.banner;
      await instance.ready;
      if (!current()) throw abortError();
      this._state(instance.state);
      this._layout();
      this._applyMode();
      this._emit("variant");
      this._emit("ready");
      return this;
    } catch (error) {
      if (current() && error.name !== "AbortError") {
        this._state("error");
        this._emit("error", { message: error.message });
      }
      throw error;
    }
  }
  _layout(width = this.root.clientWidth || this.root.getBoundingClientRect().width) {
    if (this.banner && width) this._emit("layout", { width, height: bannerHeight(this.banner.config, width) });
  }
  _checkMode(value) {
    if (!["default", "auto", "pointer", "still"].includes(value)) throw new TypeError("Unknown theme mode");
  }
  setMode(value) {
    this._checkMode(value);
    this.selectedMode = value;
    this.userPaused = false;
    this._applyMode();
  }
  _profile() {
    return this.theme?.motion[this.fine.matches ? "fine" : "coarse"];
  }
  _applyMode(preserveTakeover = false) {
    if (this.destroyed) return;
    this._stop();
    if (!preserveTakeover) this.temporaryMode = false;
    const selected = this.selectedMode === "default" ? this._profile()?.mode ?? "still" : this.selectedMode;
    this.mode = this.reduced.matches || this.userPaused || this.banner && !this.banner.motionAllowed() ? "still" : this.temporaryMode ? "pointer" : selected;
    this.root.dataset.themeMode = this.mode;
    this.root.dataset.themeInputKind = this.fine.matches ? "mouse" : "touch";
    if (this.mode === "still") this.banner?.pause();
    else this.banner?.resume();
    this._emit("mode");
    if (this.mode === "auto" && this._canAnimate()) {
      this.started = this.win.performance.now();
      this.lastFrame = -Infinity;
      this.banner.setProgress(0);
      this.frame = this.win.requestAnimationFrame((now) => this._animate(now));
    }
  }
  _canAnimate() {
    return this.banner && ["ready", "degraded"].includes(this.state) && this.banner.motionAllowed() && !this.doc.hidden && this.visible && this.focused && !this.suspended && !this.destroyed;
  }
  _animate(now) {
    this.frame = 0;
    if (this.mode !== "auto" || !this._canAnimate()) return;
    const profile = this._profile();
    if (now - this.lastFrame >= 1e3 / profile.fps - 0.5) {
      this.banner.setProgress(Math.sin((now - this.started) * 2 * Math.PI / this.theme.motion.period) * profile.amplitude);
      this.lastFrame = now;
    }
    this.frame = this.win.requestAnimationFrame((time) => this._animate(time));
  }
  _takeOver() {
    if (this.mode !== "auto" || this.reduced.matches || !this._canAnimate()) return;
    this.temporaryMode = true;
    this._applyMode(true);
  }
  _resumeLater() {
    this.win.clearTimeout(this.resumeTimer);
    this.resumeTimer = this.win.setTimeout(() => this._applyMode(), this.theme.motion.resumeDelay);
  }
  _stop() {
    this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.win.clearTimeout(this.resumeTimer);
    this.resumeTimer = 0;
  }
  pause() {
    this.userPaused = true;
    this._applyMode();
  }
  resume() {
    this.userPaused = false;
    this._applyMode();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.state = "destroyed";
    this._stop();
    this.sourceAbort?.abort();
    this.variantAbort?.abort();
    this.banner?.destroy();
    this.observer?.disconnect();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const [name, value] of this.saved) if (value === null) this.root.removeAttribute(name);
    else this.root.setAttribute(name, value);
    mounted.delete(this.root);
  }
};
function createTheme(root, theme, options) {
  const element = typeof root === "string" ? document.querySelector(root) : root;
  return new ThemeBanner(element, theme, options);
}
async function loadTheme(root, url, options) {
  const instance = createTheme(root, url, options);
  try {
    await instance.ready;
    return instance;
  } catch (error) {
    instance.destroy();
    throw error;
  }
}

// src/banner.js
var mounted2 = /* @__PURE__ */ new WeakMap();
var ParallaxBanner = class {
  constructor(root, input) {
    if (!root || root.nodeType !== 1) throw new TypeError("Banner root must be an element");
    if (mounted2.has(root)) throw new Error("Banner already mounted; destroy the previous instance first");
    this.config = normalizeConfig(input);
    this.root = root;
    this.win = root.ownerDocument.defaultView;
    this.doc = root.ownerDocument;
    this.baseUrl = this.config.baseUrl ?? this.doc.baseURI;
    for (const layer of this.config.layers) resolveAssetUrl(layer.src, this.baseUrl);
    if (this.config.poster) resolveAssetUrl(this.config.poster, this.baseUrl);
    if (this.config.mobilePoster) resolveAssetUrl(this.config.mobilePoster, this.baseUrl);
    this.layers = [];
    this.cleanups = [];
    this.progress = 0;
    this.tracking = false;
    this.userPaused = false;
    this.visible = true;
    this.state = "loading";
    this.destroyed = false;
    this.frame = 0;
    this.returning = null;
    this.touchGesture = null;
    this.touchPointers = /* @__PURE__ */ new Set();
    this.width = 0;
    this.height = 0;
    this._saved = {
      height: root.style.height,
      background: root.style.backgroundColor,
      touchAction: root.style.touchAction,
      hadClass: root.classList.contains("lpb"),
      state: root.getAttribute("data-banner-state")
    };
    this.stage = this.doc.createElement("div");
    this.stage.className = "lpb__stage";
    this.stage.setAttribute("aria-hidden", "true");
    if (this.config.description) {
      this.stage.removeAttribute("aria-hidden");
      this.stage.setAttribute("role", "img");
      this.stage.setAttribute("aria-label", this.config.description);
    }
    this.root.classList.add("lpb");
    if (this.config.interaction.touch === "drag") this.root.style.touchAction = "pan-y pinch-zoom";
    this.root.style.backgroundColor = this.config.background;
    this.root.append(this.stage);
    this._poster();
    if (this.config.taper) {
      this.taper = this.doc.createElement("div");
      this.taper.className = "lpb__taper";
      this.taper.setAttribute("aria-hidden", "true");
      this.root.append(this.taper);
    }
    this.reducedQuery = this.win.matchMedia("(prefers-reduced-motion: reduce)");
    this.pointerQuery = this.win.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    this.motionAllowed = () => this.config.interaction.enabled && !this.reducedQuery.matches && (this.pointerQuery.matches || this.config.interaction.touch === "drag");
    this._bind();
    this._resize();
    mounted2.set(root, this);
    this._setState("loading");
    this.ready = this._load();
  }
  _emit(type, detail) {
    this.root.dispatchEvent(new this.win.CustomEvent(`banner:${type}`, { detail }));
  }
  _setState(state, extra = {}) {
    if (this.destroyed) return;
    this.state = state;
    this.root.setAttribute("data-banner-state", state);
    this._emit("state", { state, ...extra });
  }
  _poster() {
    if (!this.config.poster && !this.config.mobilePoster) return;
    const img = this.doc.createElement("img");
    img.className = "lpb__poster";
    img.alt = "";
    img.loading = "eager";
    img.fetchPriority = "high";
    img.decoding = "async";
    img.style.objectPosition = this.config.posterPosition;
    img.src = resolveAssetUrl(this.config.poster ?? this.config.mobilePoster, this.baseUrl);
    this.stage.append(img);
    this.poster = img;
    img.addEventListener("error", () => this._emit("error", { layerId: "poster", message: "Poster failed to load" }), { once: true });
  }
  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }
  _bind() {
    this._listen(this.root, "pointerdown", (event) => this._startTouch(event), { passive: true });
    this._listen(this.root, "pointermove", (event) => {
      if (event.pointerType === "touch") {
        this._moveTouch(event);
        return;
      }
      if (!this.motionAllowed() || this.userPaused || !this.visible || !["ready", "degraded"].includes(this.state)) return;
      const rect = this.root.getBoundingClientRect();
      if (!rect.width || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (!this.tracking) {
        this.entryX = event.clientX;
        this.tracking = true;
      }
      this.returning = null;
      this.progress = clamp((event.clientX - this.entryX) / rect.width, -1, 1);
      this._schedule();
    }, { passive: true });
    this._listen(this.root, "pointerleave", (event) => {
      if (event.pointerType !== "touch") this._returnHome();
    });
    this._listen(this.root, "pointerup", (event) => this._finishTouch(event));
    this._listen(this.root, "pointercancel", (event) => {
      this._finishTouch(event, true);
      this._returnHome();
    });
    this._listen(this.root, "lostpointercapture", (event) => this._finishTouch(event, true));
    this._listen(this.win, "pointerdown", (event) => {
      if (event.pointerType !== "touch" || !this.touchPointers.size) return;
      this.touchPointers.add(event.pointerId);
      if (this.touchPointers.size > 1 && this.touchGesture) this._finishTouch({ pointerId: this.touchGesture.id }, true);
    }, { passive: true });
    const releaseTouch = (event) => {
      if (event.pointerType !== "touch") return;
      this._finishTouch(event);
      this.touchPointers.delete(event.pointerId);
    };
    this._listen(this.win, "pointerup", releaseTouch, { passive: true });
    this._listen(this.win, "pointercancel", releaseTouch, { passive: true });
    this._listen(this.win, "blur", () => this._reset());
    const preferenceChange = () => {
      if (!this.motionAllowed()) this._reset();
      this._sizeLayers();
      this._syncVideos();
      this._emit("motion", { enabled: this.motionAllowed() });
    };
    this._listen(this.reducedQuery, "change", preferenceChange);
    this._listen(this.pointerQuery, "change", preferenceChange);
    this._listen(this.doc, "visibilitychange", () => {
      if (this.doc.hidden) this._reset();
      this._syncVideos();
    });
    if (this.win.ResizeObserver) {
      this.resizeObserver = new this.win.ResizeObserver(() => this._resize());
      this.resizeObserver.observe(this.root);
    } else this._listen(this.win, "resize", () => this._resize(), { passive: true });
    if (this.win.IntersectionObserver) {
      this.intersectionObserver = new this.win.IntersectionObserver((entries) => {
        const before = this.visible;
        this.visible = entries[0]?.isIntersecting !== false;
        if (!this.visible) this._reset();
        this._syncVideos();
        if (before !== this.visible) this._emit("visibility", { visible: this.visible });
      });
      this.intersectionObserver.observe(this.root);
    }
  }
  _startTouch(event) {
    if (event.pointerType !== "touch" || event.isPrimary === false || this.touchPointers.size || this.config.interaction.touch !== "drag" || !this.motionAllowed() || this.userPaused || !this.visible || !["ready", "degraded"].includes(this.state)) return;
    this.touchPointers.add(event.pointerId);
    this.touchGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, progress: this.progress, axis: null };
  }
  _moveTouch(event) {
    const gesture = this.touchGesture;
    if (!gesture || gesture.id !== event.pointerId || !this.motionAllowed() || this.userPaused) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        gesture.axis = "vertical";
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      gesture.axis = "horizontal";
      try {
        this.root.setPointerCapture?.(event.pointerId);
      } catch {
      }
      this._emit("interaction", { phase: "start", pointerType: "touch" });
    }
    if (gesture.axis !== "horizontal") return;
    this.tracking = true;
    this.returning = null;
    this.progress = clamp(gesture.progress + dx / Math.max(1, this.root.getBoundingClientRect().width * 0.55), -1, 1);
    this._schedule();
  }
  _finishTouch(event, cancelled = false) {
    const gesture = this.touchGesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    this.touchGesture = null;
    try {
      if (this.root.hasPointerCapture?.(event.pointerId)) this.root.releasePointerCapture(event.pointerId);
    } catch {
    }
    this._returnHome();
    if (gesture.axis === "horizontal") this._emit("interaction", { phase: "end", pointerType: "touch", cancelled });
  }
  _resize() {
    if (this.destroyed) return;
    const width = this.root.clientWidth || this.root.getBoundingClientRect().width;
    if (!width) return;
    const rule = this.config.height;
    const height = bannerHeight(this.config, width);
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.root.style.height = `${height}px`;
    if (this.poster) {
      const source = width <= rule.breakpoint ? this.config.mobilePoster ?? this.config.poster : this.config.poster ?? this.config.mobilePoster;
      const url = resolveAssetUrl(source, this.baseUrl);
      if (this.poster.src !== url) this.poster.src = url;
    }
    this._sizeLayers();
    this._schedule();
  }
  _sizeLayers() {
    const config = this.config;
    const reference = this.height / config.baseHeight;
    const shared = config.mode === "aligned" ? alignedScale(config, this.width, this.height) : reference;
    for (const layer of this.layers) {
      layer.wrap.hidden = Boolean(config.mobilePoster && this.width <= config.height.breakpoint && config.interaction.touch !== "drag");
      layer.layoutScale = layoutScale(config, layer, this.width, this.height, shared);
      const logicalWidth = layer.naturalWidth / config.pixelRatio;
      const logicalHeight = layer.naturalHeight / config.pixelRatio;
      const width = logicalWidth * layer.layoutScale * layer.scale;
      const height = logicalHeight * layer.layoutScale * layer.scale;
      layer.element.style.width = `${width}px`;
      layer.element.style.height = `${height}px`;
      if (layer.fit === "contain") {
        layer.element.style.position = "absolute";
        layer.element.style.left = `${(this.width - width) * layer.position[0]}px`;
        layer.element.style.top = `${(this.height - height) * layer.position[1]}px`;
      }
    }
  }
  async _load() {
    const results = await Promise.allSettled(this.config.layers.map((layer, index) => this._loadLayer(layer, index)));
    if (this.destroyed) return this;
    const failed = results.flatMap((result, index) => result.status === "rejected" ? [this.config.layers[index]] : []);
    const fatal = failed.some((layer) => layer.required);
    if (fatal) {
      this.layers.forEach((layer) => layer.wrap.remove());
      this.layers = [];
      this._setState("error", { failedLayerIds: failed.map((layer) => layer.id) });
    } else {
      this.layers.sort((a, b) => a.index - b.index);
      this.layers.forEach((layer) => this.stage.append(layer.wrap));
      this._sizeLayers();
      this._paint();
      this._setState(failed.length ? "degraded" : "ready", { failedLayerIds: failed.map((layer) => layer.id) });
      this._syncVideos();
    }
    this._emit("ready", { state: this.state, loadedLayers: this.layers.length, failedLayerIds: failed.map((layer) => layer.id) });
    return this;
  }
  _loadLayer(definition, index) {
    return new Promise((resolve, reject) => {
      const element = this.doc.createElement(definition.type === "video" ? "video" : "img");
      const wrap = this.doc.createElement("div");
      wrap.className = "lpb__layer";
      wrap.dataset.layerId = definition.id;
      element.className = "lpb__media";
      element.draggable = false;
      if (definition.type === "video") {
        element.muted = true;
        element.loop = true;
        element.playsInline = true;
        element.preload = "metadata";
      } else {
        element.alt = "";
        element.decoding = "async";
        element.loading = "eager";
        if (index === 0 && !this.poster) element.fetchPriority = "high";
      }
      wrap.append(element);
      let settled = false;
      const onLoad = () => finish();
      const onError = () => finish(new Error("Media failed to load"));
      const eventType = definition.type === "video" ? "loadedmetadata" : "load";
      const timer = this.win.setTimeout(() => finish(new Error("Media loading timed out")), this.config.loadTimeout);
      const cleanup = () => {
        this.win.clearTimeout(timer);
        element.removeEventListener(eventType, onLoad);
        element.removeEventListener("error", onError);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          if (!this.destroyed) this._emit("error", { layerId: definition.id, message: error.message });
          if (definition.type === "video") {
            element.pause();
            element.removeAttribute("src");
          }
          reject(error);
          return;
        }
        const naturalWidth = element.naturalWidth || element.videoWidth;
        const naturalHeight = element.naturalHeight || element.videoHeight;
        if (!naturalWidth || !naturalHeight) {
          reject(new Error("Media has no dimensions"));
          return;
        }
        if (this.config.mode === "aligned" && (naturalWidth !== this.config.baseWidth * this.config.pixelRatio || naturalHeight !== this.config.baseHeight * this.config.pixelRatio)) {
          this._emit("error", { layerId: definition.id, message: "Layer dimensions do not match the aligned canvas" });
          reject(new Error("Layer dimensions do not match the aligned canvas"));
          return;
        }
        this.layers.push({ ...definition, element, wrap, index, naturalWidth, naturalHeight });
        resolve();
      };
      this.cleanups.push(() => finish(new Error("Banner destroyed")));
      element.addEventListener(eventType, onLoad, { once: true });
      element.addEventListener("error", onError, { once: true });
      try {
        element.src = resolveAssetUrl(definition.src, this.baseUrl);
      } catch (error) {
        finish(error);
      }
    });
  }
  _schedule() {
    if (this.frame || this.destroyed || this.doc.hidden || !this.visible) return;
    this.frame = this.win.requestAnimationFrame((now) => {
      this.frame = 0;
      if (this.destroyed) return;
      if (this.returning) {
        const elapsed = now - this.returning.start;
        const fraction = clamp(elapsed / this.config.interaction.resetDuration, 0, 1);
        this.progress = this.returning.from * (1 - fraction);
        if (fraction === 1) this.returning = null;
      }
      this._paint();
      if (this.returning) this._schedule();
    });
  }
  _paint() {
    const reference = this.height / this.config.baseHeight;
    const progress = this.progress * this.config.interaction.strength;
    for (const layer of this.layers) {
      const value = layerState(layer, progress, layer.fit === "contain" ? layer.layoutScale : reference);
      layer.element.style.transform = `translate3d(${value.x.toFixed(3)}px,${value.y.toFixed(3)}px,0) rotate(${value.rotate}deg) scale(${value.scale})`;
      layer.element.style.opacity = String(value.opacity);
      layer.element.style.filter = value.blur > 1e-4 ? `blur(${value.blur}px)` : "";
    }
    this.root.classList.toggle("lpb--moving", Boolean(this.tracking || this.returning));
  }
  _returnHome() {
    this.tracking = false;
    if (!this.progress || !this.motionAllowed() || !this.config.interaction.resetDuration) {
      this._reset();
      return;
    }
    this.returning = { from: this.progress, start: this.win.performance.now() };
    this._schedule();
  }
  _reset() {
    const gesture = this.touchGesture;
    this.touchGesture = null;
    this.touchPointers.clear();
    if (gesture) try {
      if (this.root.hasPointerCapture?.(gesture.id)) this.root.releasePointerCapture(gesture.id);
    } catch {
    }
    this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.progress = 0;
    this.tracking = false;
    this.returning = null;
    this._paint();
  }
  _syncVideos() {
    const playing = this.motionAllowed() && !this.userPaused && this.visible && !this.doc.hidden && !this.destroyed;
    for (const layer of this.layers) {
      if (layer.type !== "video") continue;
      if (playing) Promise.resolve(layer.element.play()).catch(() => {
        if (!this.destroyed) this._emit("error", { layerId: layer.id, message: "Video autoplay unavailable; poster frame remains visible" });
      });
      else layer.element.pause();
    }
  }
  pause() {
    if (this.destroyed) return;
    this.userPaused = true;
    this._reset();
    this._syncVideos();
  }
  resume() {
    if (this.destroyed) return;
    this.userPaused = false;
    this._syncVideos();
  }
  setProgress(value) {
    if (this.destroyed || !this.motionAllowed() || this.userPaused) return;
    this.returning = null;
    this.progress = clamp(Number(value) || 0, -1, 1);
    this._schedule();
  }
  destroy() {
    if (this.destroyed) return;
    this._reset();
    this.destroyed = true;
    this.state = "destroyed";
    this.win.cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    for (const layer of this.layers) if (layer.type === "video") {
      layer.element.pause();
      layer.element.removeAttribute("src");
      layer.element.load();
    }
    this.stage.remove();
    this.taper?.remove();
    this.root.classList.remove("lpb--moving");
    if (!this._saved.hadClass) this.root.classList.remove("lpb");
    this.root.style.height = this._saved.height;
    this.root.style.backgroundColor = this._saved.background;
    this.root.style.touchAction = this._saved.touchAction;
    if (this._saved.state === null) this.root.removeAttribute("data-banner-state");
    else this.root.setAttribute("data-banner-state", this._saved.state);
    mounted2.delete(this.root);
  }
};
function createBanner(root, config) {
  const element = typeof root === "string" ? document.querySelector(root) : root;
  return new ParallaxBanner(element, config);
}
async function loadBanner(root, manifestUrl, options = {}) {
  const element = typeof root === "string" ? document.querySelector(root) : root;
  if (!element) throw new TypeError("Banner root not found");
  const url = new URL(manifestUrl, element.ownerDocument.baseURI);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("JSON manifests require HTTP(S); use createBanner with an inline config for double-click previews");
  const response = await fetch(url, { signal: options.signal, credentials: "omit" });
  if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
  const data = await response.json();
  if (options.signal?.aborted) throw new DOMException("Banner loading was cancelled", "AbortError");
  return createBanner(element, { ...data, ...options, baseUrl: url.href });
}
