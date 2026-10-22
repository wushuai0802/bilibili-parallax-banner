import {createBanner} from './banner.js';
import {normalizeTheme, themeVariant} from './theme-model.js';
import {bannerHeight} from './layout.js';

const mounted = new WeakMap();
const abortError = () => new DOMException('Theme operation was cancelled', 'AbortError');
const attributes = ['state', 'variant', 'mode', 'name', 'input-kind'].map(name => `data-theme-${name}`);

export class ThemeBanner {
  constructor(root, source, options = {}) {
    if (!root || root.nodeType !== 1) throw new TypeError('Theme root must be an element');
    if (mounted.has(root)) throw new Error('Theme already mounted; destroy the previous controller first');
    if (options.signal?.aborted) throw abortError();
    if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout < 100 || options.timeout > 120000)) throw new TypeError('Theme timeout must be in [100, 120000]');
    this.root = root;
    this.win = root.ownerDocument.defaultView;
    this.doc = root.ownerDocument;
    this.options = options;
    this.baseUrl = options.baseUrl ?? this.doc.baseURI;
    this.destroyed = false;
    this.state = 'loading';
    this.variant = null;
    this.mode = 'still';
    this.selectedMode = options.mode ?? 'default';
    this.userPaused = false;
    this.visible = true;
    this.focused = true;
    this.suspended = false;
    this.frame = 0;
    this.resumeTimer = 0;
    this.sourceGeneration = 0;
    this.variantGeneration = 0;
    this.cleanups = [];
    this.saved = new Map(attributes.map(name => [name, root.getAttribute(name)]));
    this.reduced = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.fine = this.win.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    this._checkMode(this.selectedMode);
    mounted.set(root, this);
    this._bind();
    this.ready = this.setTheme(source, {baseUrl: this.baseUrl});
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  _emit(type, extra = {}) {
    if (this.destroyed) return;
    this.root.dispatchEvent(new this.win.CustomEvent(`theme:${type}`, {detail: {
      state: this.state, variant: this.variant, mode: this.mode, name: this.theme?.name, ...extra,
    }}));
  }

  _state(value) {
    if (this.destroyed) return;
    this.state = value;
    this.root.dataset.themeState = value;
    this._emit('state');
  }

  _bind() {
    const resize = () => {
      if (!this.theme || this.loadingSource || this.destroyed) return;
      const width = this.root.clientWidth || this.root.getBoundingClientRect().width;
      if (!width) return;
      const variant = themeVariant(this.theme, width);
      if (variant !== this.variant) {
        this.variantJob = this._switchVariant(variant, this.sourceGeneration);
        this.variantJob.catch(() => {});
        this.ready = this._waitVariants(this.sourceGeneration);
        this.ready.catch(() => {});
      } else if (this.banner) this._layout(width);
    };
    if (this.win.ResizeObserver) {
      this.observer = new this.win.ResizeObserver(resize);
      this.observer.observe(this.root);
    } else this._listen(this.win, 'resize', resize, {passive: true});
    this._listen(this.reduced, 'change', () => this._applyMode());
    this._listen(this.fine, 'change', () => this._applyMode());
    this._listen(this.root, 'banner:visibility', event => {
      this.visible = event.detail.visible;
      if (this.visible) this._applyMode(); else this._stop();
    });
    this._listen(this.root, 'banner:interaction', event => {
      if (event.detail.phase === 'start') this._takeOver();
      else if (this.temporaryMode) this._resumeLater();
    });
    this._listen(this.root, 'pointerenter', event => {if (event.pointerType === 'mouse') this._takeOver();});
    this._listen(this.root, 'pointerleave', event => {if (event.pointerType === 'mouse' && this.temporaryMode) this._resumeLater();});
    this._listen(this.doc, 'visibilitychange', () => {if (this.doc.hidden) this._stop(); else this._applyMode();});
    this._listen(this.win, 'blur', () => {this.focused = false; this._stop();});
    this._listen(this.win, 'focus', () => {this.focused = true; this._applyMode();});
    this._listen(this.win, 'pagehide', event => {
      this.suspended = true; this._stop(); this.banner?.pause();
      if (!event.persisted) this.destroy();
    });
    this._listen(this.win, 'pageshow', event => {if (event.persisted) {this.suspended = false; this._applyMode();}});
    if (this.options.signal) this._listen(this.options.signal, 'abort', () => this.destroy(), {once: true});
  }

  async _json(url, parentSignal) {
    if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Theme JSON requires HTTP(S); use createTheme with inline configs for offline previews');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (parentSignal.aborted) throw abortError();
    parentSignal.addEventListener('abort', abort, {once: true});
    const timer = this.win.setTimeout(abort, this.options.timeout ?? 10000);
    let rejectAbort;
    const aborted = new Promise((_, reject) => {rejectAbort = reject;});
    const rejectCancelled = () => rejectAbort(parentSignal.aborted ? abortError() : new Error('Theme resource request timed out'));
    controller.signal.addEventListener('abort', rejectCancelled, {once: true});
    try {
      const request = Promise.resolve().then(async () => {
        const response = await fetch(url, {signal: controller.signal, credentials: 'omit', cache: 'no-cache'});
        if (!response.ok) throw new Error(`Theme resource request failed (${response.status})`);
        return response.json();
      });
      const data = await Promise.race([request, aborted]);
      if (controller.signal.aborted) throw parentSignal.aborted ? abortError() : new Error('Theme resource request timed out');
      return data;
    } catch (error) {
      if (parentSignal.aborted) throw abortError();
      if (controller.signal.aborted) throw new Error('Theme resource request timed out');
      throw error;
    } finally {
      this.win.clearTimeout(timer);
      parentSignal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', rejectCancelled);
    }
  }

  setTheme(source, options = {}) {
    if (this.destroyed) return Promise.reject(abortError());
    this.sourceAbort?.abort(); this.variantAbort?.abort(); this._stop();
    this.banner?.pause();
    this.sourceAbort = new AbortController();
    this.loadingSource = true;
    const generation = ++this.sourceGeneration, signal = this.sourceAbort.signal;
    this._state('loading');
    const job = (async () => {
      try {
        let baseUrl = options.baseUrl ?? this.baseUrl;
        let input = source;
        if (typeof source === 'string' || source instanceof URL) {
          const url = new URL(source, baseUrl);
          input = await this._json(url, signal); baseUrl = url.href;
        }
        if (signal.aborted || this.destroyed || generation !== this.sourceGeneration) throw abortError();
        this.theme = normalizeTheme(input);
        this.baseUrl = baseUrl;
        this.root.dataset.themeName = this.theme.name;
        this.loadingSource = false;
        const width = this.root.clientWidth || this.root.getBoundingClientRect().width || 1;
        this.variantJob = this._switchVariant(themeVariant(this.theme, width), generation);
        this.variantJob.catch(() => {});
        return await this._waitVariants(generation);
      } catch (error) {
        if (generation === this.sourceGeneration && !this.destroyed && error.name !== 'AbortError') {
          this.loadingSource = false; this._state('error'); this._emit('error', {message: error.message});
        }
        throw error;
      }
    })();
    job.catch(() => {});
    this.ready = job;
    return job;
  }

  async _waitVariants(generation) {
    // Follow a newer container layout without publishing a stale variant.
    while (true) {
      const pending = this.variantJob;
      try {await pending;} catch (error) {if (pending === this.variantJob) throw error;}
      if (this.destroyed || generation !== this.sourceGeneration) throw abortError();
      if (pending === this.variantJob) return this;
    }
  }

  async _switchVariant(name, sourceGeneration) {
    this.variantAbort?.abort(); this._stop(); this.banner?.destroy(); this.banner = null;
    this.variantAbort = new AbortController();
    const signal = this.variantAbort.signal, generation = ++this.variantGeneration;
    this.variant = name;
    this.visible = true;
    this.root.dataset.themeVariant = name;
    this._state('loading');
    const current = () => !this.destroyed && !signal.aborted && generation === this.variantGeneration && sourceGeneration === this.sourceGeneration;
    try {
      const definition = this.theme.variants[name];
      const manifest = new URL(definition.manifest ?? '.', this.baseUrl);
      const config = definition.config ?? await this._json(manifest, signal);
      if (!current()) throw abortError();
      this.banner = createBanner(this.root, {...config, baseUrl: config.baseUrl ?? manifest.href});
      const instance = this.banner;
      await instance.ready;
      if (!current()) throw abortError();
      this._state(instance.state);
      this._layout(); this._applyMode(); this._emit('variant'); this._emit('ready');
      return this;
    } catch (error) {
      if (current() && error.name !== 'AbortError') {this._state('error'); this._emit('error', {message: error.message});}
      throw error;
    }
  }

  _layout(width = this.root.clientWidth || this.root.getBoundingClientRect().width) {
    if (this.banner && width) this._emit('layout', {width, height: bannerHeight(this.banner.config, width)});
  }

  _checkMode(value) {
    if (!['default', 'auto', 'pointer', 'still'].includes(value)) throw new TypeError('Unknown theme mode');
  }

  setMode(value) {
    this._checkMode(value); this.selectedMode = value; this.userPaused = false;
    this._applyMode();
  }

  _profile() {return this.theme?.motion[this.fine.matches ? 'fine' : 'coarse'];}

  _applyMode(preserveTakeover = false) {
    if (this.destroyed) return;
    this._stop();
    if (!preserveTakeover) this.temporaryMode = false;
    const selected = this.selectedMode === 'default' ? this._profile()?.mode ?? 'still' : this.selectedMode;
    this.mode = this.reduced.matches || this.userPaused || (this.banner && !this.banner.motionAllowed()) ? 'still' : this.temporaryMode ? 'pointer' : selected;
    this.root.dataset.themeMode = this.mode;
    this.root.dataset.themeInputKind = this.fine.matches ? 'mouse' : 'touch';
    if (this.mode === 'still') this.banner?.pause(); else this.banner?.resume();
    this._emit('mode');
    if (this.mode === 'auto' && this._canAnimate()) {
      this.started = this.win.performance.now(); this.lastFrame = -Infinity;
      this.banner.setProgress(0);
      this.frame = this.win.requestAnimationFrame(now => this._animate(now));
    }
  }

  _canAnimate() {
    return this.banner && ['ready', 'degraded'].includes(this.state) && this.banner.motionAllowed() &&
      !this.doc.hidden && this.visible && this.focused && !this.suspended && !this.destroyed;
  }

  _animate(now) {
    this.frame = 0;
    if (this.mode !== 'auto' || !this._canAnimate()) return;
    const profile = this._profile();
    if (now - this.lastFrame >= 1000 / profile.fps - .5) {
      this.banner.setProgress(Math.sin((now - this.started) * 2 * Math.PI / this.theme.motion.period) * profile.amplitude);
      this.lastFrame = now;
    }
    this.frame = this.win.requestAnimationFrame(time => this._animate(time));
  }

  _takeOver() {
    if (this.mode !== 'auto' || this.reduced.matches || !this._canAnimate()) return;
    this.temporaryMode = true; this._applyMode(true);
  }

  _resumeLater() {
    this.win.clearTimeout(this.resumeTimer);
    this.resumeTimer = this.win.setTimeout(() => this._applyMode(), this.theme.motion.resumeDelay);
  }

  _stop() {
    this.win.cancelAnimationFrame(this.frame); this.frame = 0;
    this.win.clearTimeout(this.resumeTimer); this.resumeTimer = 0;
  }

  pause() {this.userPaused = true; this._applyMode();}
  resume() {this.userPaused = false; this._applyMode();}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.state = 'destroyed';
    this._stop(); this.sourceAbort?.abort(); this.variantAbort?.abort(); this.banner?.destroy();
    this.observer?.disconnect(); this.cleanups.splice(0).forEach(cleanup => cleanup());
    for (const [name, value] of this.saved) if (value === null) this.root.removeAttribute(name); else this.root.setAttribute(name, value);
    mounted.delete(this.root);
  }
}

export function createTheme(root, theme, options) {
  const element = typeof root === 'string' ? document.querySelector(root) : root;
  return new ThemeBanner(element, theme, options);
}

export async function loadTheme(root, url, options) {
  const instance = createTheme(root, url, options);
  try {await instance.ready; return instance;} catch (error) {instance.destroy(); throw error;}
}
