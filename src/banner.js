import {VERSION, alignedScale, clamp, fromBilibiliSplitLayer, layerState, layoutScale, normalizeConfig, resolveAssetUrl} from './model.js';
export {VERSION, fromBilibiliSplitLayer};

const mounted = new WeakMap();

export class ParallaxBanner {
  constructor(root, input) {
    if (!root || root.nodeType !== 1) throw new TypeError('Banner root must be an element');
    if (mounted.has(root)) throw new Error('Banner already mounted; destroy the previous instance first');
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
    this.state = 'loading';
    this.destroyed = false;
    this.frame = 0;
    this.returning = null;
    this.touchGesture = null;
    this.touchPointers = new Set();
    this.width = 0;
    this.height = 0;
    this._saved = {height: root.style.height, background: root.style.backgroundColor, touchAction: root.style.touchAction,
      hadClass: root.classList.contains('lpb'), state: root.getAttribute('data-banner-state')};
    this.stage = this.doc.createElement('div');
    this.stage.className = 'lpb__stage';
    this.stage.setAttribute('aria-hidden', 'true');
    if (this.config.description) {
      this.stage.removeAttribute('aria-hidden');
      this.stage.setAttribute('role', 'img');
      this.stage.setAttribute('aria-label', this.config.description);
    }
    this.root.classList.add('lpb');
    if (this.config.interaction.touch === 'drag') this.root.style.touchAction = 'pan-y pinch-zoom';
    this.root.style.backgroundColor = this.config.background;
    this.root.append(this.stage);
    this._poster();
    if (this.config.taper) {
      this.taper = this.doc.createElement('div');
      this.taper.className = 'lpb__taper';
      this.taper.setAttribute('aria-hidden', 'true');
      this.root.append(this.taper);
    }
    this.reducedQuery = this.win.matchMedia('(prefers-reduced-motion: reduce)');
    this.pointerQuery = this.win.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    this.motionAllowed = () => this.config.interaction.enabled && !this.reducedQuery.matches && (this.pointerQuery.matches || this.config.interaction.touch === 'drag');
    this._bind();
    this._resize();
    mounted.set(root, this);
    this._setState('loading');
    this.ready = this._load();
  }

  _emit(type, detail) {
    this.root.dispatchEvent(new this.win.CustomEvent(`banner:${type}`, {detail}));
  }

  _setState(state, extra = {}) {
    if (this.destroyed) return;
    this.state = state;
    this.root.setAttribute('data-banner-state', state);
    this._emit('state', {state, ...extra});
  }

  _poster() {
    if (!this.config.poster && !this.config.mobilePoster) return;
    const img = this.doc.createElement('img');
    img.className = 'lpb__poster';
    img.alt = '';
    img.loading = 'eager';
    img.fetchPriority = 'high';
    img.decoding = 'async';
    img.style.objectPosition = this.config.posterPosition;
    img.src = resolveAssetUrl(this.config.poster ?? this.config.mobilePoster, this.baseUrl);
    this.stage.append(img);
    this.poster = img;
    img.addEventListener('error', () => this._emit('error', {layerId: 'poster', message: 'Poster failed to load'}), {once: true});
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  _bind() {
    this._listen(this.root, 'pointerdown', event => this._startTouch(event), {passive: true});
    this._listen(this.root, 'pointermove', event => {
      if (event.pointerType === 'touch') {this._moveTouch(event); return;}
      if (!this.motionAllowed() || this.userPaused || !this.visible || !['ready', 'degraded'].includes(this.state)) return;
      const rect = this.root.getBoundingClientRect();
      if (!rect.width || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      if (!this.tracking) {this.entryX = event.clientX; this.tracking = true;}
      this.returning = null;
      this.progress = clamp((event.clientX - this.entryX) / rect.width, -1, 1);
      this._schedule();
    }, {passive: true});
    this._listen(this.root, 'pointerleave', event => {if (event.pointerType !== 'touch') this._returnHome();});
    this._listen(this.root, 'pointerup', event => this._finishTouch(event));
    this._listen(this.root, 'pointercancel', event => {this._finishTouch(event, true); this._returnHome();});
    this._listen(this.root, 'lostpointercapture', event => this._finishTouch(event, true));
    this._listen(this.win, 'pointerdown', event => {
      if (event.pointerType !== 'touch' || !this.touchPointers.size) return;
      this.touchPointers.add(event.pointerId);
      if (this.touchPointers.size > 1 && this.touchGesture) this._finishTouch({pointerId: this.touchGesture.id}, true);
    }, {passive: true});
    const releaseTouch = event => {
      if (event.pointerType !== 'touch') return;
      this._finishTouch(event);
      this.touchPointers.delete(event.pointerId);
    };
    this._listen(this.win, 'pointerup', releaseTouch, {passive: true});
    this._listen(this.win, 'pointercancel', releaseTouch, {passive: true});
    this._listen(this.win, 'blur', () => this._reset());
    const preferenceChange = () => {
      if (!this.motionAllowed()) this._reset();
      this._sizeLayers();
      this._syncVideos();
      this._emit('motion', {enabled: this.motionAllowed()});
    };
    this._listen(this.reducedQuery, 'change', preferenceChange);
    this._listen(this.pointerQuery, 'change', preferenceChange);
    this._listen(this.doc, 'visibilitychange', () => {
      if (this.doc.hidden) this._reset();
      this._syncVideos();
    });
    if (this.win.ResizeObserver) {
      this.resizeObserver = new this.win.ResizeObserver(() => this._resize());
      this.resizeObserver.observe(this.root);
    } else this._listen(this.win, 'resize', () => this._resize(), {passive: true});
    if (this.win.IntersectionObserver) {
      this.intersectionObserver = new this.win.IntersectionObserver(entries => {
        const before = this.visible;
        this.visible = entries[0]?.isIntersecting !== false;
        if (!this.visible) this._reset();
        this._syncVideos();
        if (before !== this.visible) this._emit('visibility', {visible: this.visible});
      });
      this.intersectionObserver.observe(this.root);
    }
  }

  _startTouch(event) {
    if (event.pointerType !== 'touch' || event.isPrimary === false || this.touchPointers.size || this.config.interaction.touch !== 'drag' || !this.motionAllowed() || this.userPaused || !this.visible || !['ready','degraded'].includes(this.state)) return;
    this.touchPointers.add(event.pointerId);
    this.touchGesture = {id: event.pointerId, x: event.clientX, y: event.clientY, progress: this.progress, axis: null};
  }

  _moveTouch(event) {
    const gesture = this.touchGesture;
    if (!gesture || gesture.id !== event.pointerId || !this.motionAllowed() || this.userPaused) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {gesture.axis = 'vertical'; return;}
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      gesture.axis = 'horizontal';
      try {this.root.setPointerCapture?.(event.pointerId);} catch { /* The browser may already own a cancelled pointer. */ }
      this._emit('interaction', {phase: 'start', pointerType: 'touch'});
    }
    if (gesture.axis !== 'horizontal') return;
    this.tracking = true;
    this.returning = null;
    this.progress = clamp(gesture.progress + dx / Math.max(1, this.root.getBoundingClientRect().width * .55), -1, 1);
    this._schedule();
  }

  _finishTouch(event, cancelled = false) {
    const gesture = this.touchGesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    this.touchGesture = null;
    try {if (this.root.hasPointerCapture?.(event.pointerId)) this.root.releasePointerCapture(event.pointerId);} catch { /* Pointer was released by the browser. */ }
    this._returnHome();
    if (gesture.axis === 'horizontal') this._emit('interaction', {phase: 'end', pointerType: 'touch', cancelled});
  }

  _resize() {
    if (this.destroyed) return;
    const width = this.root.clientWidth || this.root.getBoundingClientRect().width;
    if (!width) return;
    const rule = this.config.height;
    const height = width <= rule.breakpoint ? rule.mobile : clamp(width * rule.ratio, rule.min, rule.max);
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.root.style.height = `${height}px`;
    if (this.poster) {
      const source = width <= rule.breakpoint ? (this.config.mobilePoster ?? this.config.poster) : (this.config.poster ?? this.config.mobilePoster);
      const url = resolveAssetUrl(source, this.baseUrl);
      if (this.poster.src !== url) this.poster.src = url;
    }
    this._sizeLayers();
    this._schedule();
  }

  _sizeLayers() {
    const config = this.config;
    const reference = this.height / config.baseHeight;
    const shared = config.mode === 'aligned' ? alignedScale(config, this.width, this.height) : reference;
    for (const layer of this.layers) {
      layer.wrap.hidden = Boolean(config.mobilePoster && this.width <= config.height.breakpoint && config.interaction.touch !== 'drag');
      layer.layoutScale = layoutScale(config, layer, this.width, this.height, shared);
      const logicalWidth = layer.naturalWidth / config.pixelRatio;
      const logicalHeight = layer.naturalHeight / config.pixelRatio;
      const width = logicalWidth * layer.layoutScale * layer.scale;
      const height = logicalHeight * layer.layoutScale * layer.scale;
      layer.element.style.width = `${width}px`;
      layer.element.style.height = `${height}px`;
      if (layer.fit === 'contain') {
        layer.element.style.position = 'absolute';
        layer.element.style.left = `${(this.width - width) * layer.position[0]}px`;
        layer.element.style.top = `${(this.height - height) * layer.position[1]}px`;
      }
    }
  }

  async _load() {
    const results = await Promise.allSettled(this.config.layers.map((layer, index) => this._loadLayer(layer, index)));
    if (this.destroyed) return this;
    const failed = results.flatMap((result, index) => result.status === 'rejected' ? [this.config.layers[index]] : []);
    const fatal = failed.some(layer => layer.required);
    if (fatal) {
      this.layers.forEach(layer => layer.wrap.remove());
      this.layers = [];
      this._setState('error', {failedLayerIds: failed.map(layer => layer.id)});
    } else {
      this.layers.sort((a,b) => a.index - b.index);
      this.layers.forEach(layer => this.stage.append(layer.wrap));
      this._sizeLayers();
      this._paint();
      this._setState(failed.length ? 'degraded' : 'ready', {failedLayerIds: failed.map(layer => layer.id)});
      this._syncVideos();
    }
    this._emit('ready', {state: this.state, loadedLayers: this.layers.length, failedLayerIds: failed.map(layer => layer.id)});
    return this;
  }

  _loadLayer(definition, index) {
    return new Promise((resolve, reject) => {
      const element = this.doc.createElement(definition.type === 'video' ? 'video' : 'img');
      const wrap = this.doc.createElement('div');
      wrap.className = 'lpb__layer';
      wrap.dataset.layerId = definition.id;
      element.className = 'lpb__media';
      element.draggable = false;
      if (definition.type === 'video') {
        element.muted = true; element.loop = true; element.playsInline = true; element.preload = 'metadata';
      } else {
        element.alt = ''; element.decoding = 'async'; element.loading = 'eager';
        if (index === 0 && !this.poster) element.fetchPriority = 'high';
      }
      wrap.append(element);
      let settled = false;
      const onLoad = () => finish();
      const onError = () => finish(new Error('Media failed to load'));
      const eventType = definition.type === 'video' ? 'loadedmetadata' : 'load';
      const timer = this.win.setTimeout(() => finish(new Error('Media loading timed out')), this.config.loadTimeout);
      const cleanup = () => {
        this.win.clearTimeout(timer);
        element.removeEventListener(eventType, onLoad);
        element.removeEventListener('error', onError);
      };
      const finish = error => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          if (!this.destroyed) this._emit('error', {layerId: definition.id, message: error.message});
          if (definition.type === 'video') {element.pause(); element.removeAttribute('src');}
          reject(error); return;
        }
        const naturalWidth = element.naturalWidth || element.videoWidth;
        const naturalHeight = element.naturalHeight || element.videoHeight;
        if (!naturalWidth || !naturalHeight) {reject(new Error('Media has no dimensions')); return;}
        if (this.config.mode === 'aligned' && (naturalWidth !== this.config.baseWidth * this.config.pixelRatio || naturalHeight !== this.config.baseHeight * this.config.pixelRatio)) {
          this._emit('error', {layerId: definition.id, message: 'Layer dimensions do not match the aligned canvas'});
          reject(new Error('Layer dimensions do not match the aligned canvas')); return;
        }
        this.layers.push({...definition, element, wrap, index, naturalWidth, naturalHeight});
        resolve();
      };
      this.cleanups.push(() => finish(new Error('Banner destroyed')));
      element.addEventListener(eventType, onLoad, {once: true});
      element.addEventListener('error', onError, {once: true});
      try {element.src = resolveAssetUrl(definition.src, this.baseUrl);} catch (error) {finish(error);}
    });
  }

  _schedule() {
    if (this.frame || this.destroyed || this.doc.hidden || !this.visible) return;
    this.frame = this.win.requestAnimationFrame(now => {
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
      const value = layerState(layer, progress, layer.fit === 'contain' ? layer.layoutScale : reference);
      layer.element.style.transform = `translate3d(${value.x.toFixed(3)}px,${value.y.toFixed(3)}px,0) rotate(${value.rotate}deg) scale(${value.scale})`;
      layer.element.style.opacity = String(value.opacity);
      layer.element.style.filter = value.blur > 0.0001 ? `blur(${value.blur}px)` : '';
    }
    this.root.classList.toggle('lpb--moving', Boolean(this.tracking || this.returning));
  }

  _returnHome() {
    this.tracking = false;
    if (!this.progress || !this.motionAllowed() || !this.config.interaction.resetDuration) {this._reset(); return;}
    this.returning = {from: this.progress, start: this.win.performance.now()};
    this._schedule();
  }

  _reset() {
    const gesture = this.touchGesture;
    this.touchGesture = null;
    this.touchPointers.clear();
    if (gesture) try {if (this.root.hasPointerCapture?.(gesture.id)) this.root.releasePointerCapture(gesture.id);} catch { /* Already released. */ }
    this.win.cancelAnimationFrame(this.frame);
    this.frame = 0; this.progress = 0; this.tracking = false; this.returning = null;
    this._paint();
  }

  _syncVideos() {
    const playing = this.motionAllowed() && !this.userPaused && this.visible && !this.doc.hidden && !this.destroyed;
    for (const layer of this.layers) {
      if (layer.type !== 'video') continue;
      if (playing) Promise.resolve(layer.element.play()).catch(() => {
        if (!this.destroyed) this._emit('error', {layerId: layer.id, message: 'Video autoplay unavailable; poster frame remains visible'});
      }); else layer.element.pause();
    }
  }

  pause() {if (this.destroyed) return; this.userPaused = true; this._reset(); this._syncVideos();}
  resume() {if (this.destroyed) return; this.userPaused = false; this._syncVideos();}
  setProgress(value) {
    if (this.destroyed || !this.motionAllowed() || this.userPaused) return;
    this.returning = null; this.progress = clamp(Number(value) || 0, -1, 1); this._schedule();
  }

  destroy() {
    if (this.destroyed) return;
    this._reset();
    this.destroyed = true;
    this.state = 'destroyed';
    this.win.cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect(); this.intersectionObserver?.disconnect();
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    for (const layer of this.layers) if (layer.type === 'video') {layer.element.pause(); layer.element.removeAttribute('src'); layer.element.load();}
    this.stage.remove(); this.taper?.remove();
    this.root.classList.remove('lpb--moving');
    if (!this._saved.hadClass) this.root.classList.remove('lpb');
    this.root.style.height = this._saved.height;
    this.root.style.backgroundColor = this._saved.background;
    this.root.style.touchAction = this._saved.touchAction;
    if (this._saved.state === null) this.root.removeAttribute('data-banner-state'); else this.root.setAttribute('data-banner-state', this._saved.state);
    mounted.delete(this.root);
  }
}

export function createBanner(root, config) {
  const element = typeof root === 'string' ? document.querySelector(root) : root;
  return new ParallaxBanner(element, config);
}

export async function loadBanner(root, manifestUrl, options = {}) {
  const element = typeof root === 'string' ? document.querySelector(root) : root;
  if (!element) throw new TypeError('Banner root not found');
  const url = new URL(manifestUrl, element.ownerDocument.baseURI);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('JSON manifests require HTTP(S); use createBanner with an inline config for double-click previews');
  const response = await fetch(url, {signal: options.signal, credentials: 'omit'});
  if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
  const data = await response.json();
  return createBanner(element, {...data, ...options, baseUrl: url.href});
}
