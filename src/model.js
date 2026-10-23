export const VERSION = '1.4.0';
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function finite(value, fallback, name, low = -10000, high = 10000) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new TypeError(`${name} must be a finite number in [${low}, ${high}]`);
  }
  return value;
}

function pair(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${name} must be [x, y]`);
  return value.map((item, index) => finite(item, 0, `${name}[${index}]`));
}

function curve(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 4 || value.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new TypeError(`${name} must be four bezier coordinates`);
  }
  if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) throw new TypeError(`${name} x coordinates must be in [0, 1]`);
  return value;
}

function channel(value = {}, defaults, name) {
  const wrap = value.wrap ?? 'clamp';
  if (!['clamp', 'alternate'].includes(wrap)) throw new TypeError(`${name}.wrap is unsupported`);
  return {
    initial: Array.isArray(defaults.initial) ? pair(value.initial, defaults.initial, name) : finite(value.initial, defaults.initial, name),
    offset: Array.isArray(defaults.offset) ? pair(value.offset, defaults.offset, name) : finite(value.offset, defaults.offset, name),
    curve: curve(value.offsetCurve, name), wrap,
  };
}

export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Banner config must be an object');
  if (input.version !== undefined && input.version !== 1) throw new TypeError('Unsupported banner config version');
  if (!Array.isArray(input.layers) || input.layers.length < 1 || input.layers.length > 32) throw new TypeError('Use 1 to 32 layers');
  const mode = input.mode ?? 'aligned';
  if (!['aligned', 'bilibili'].includes(mode)) throw new TypeError('Unknown layout mode');
  const height = input.height ?? {};
  const min = finite(height.min, 155, 'height.min', 1, 2000);
  const max = finite(height.max, 240, 'height.max', min, 2000);
  const touch = input.interaction?.touch ?? 'none';
  if (!['none', 'drag'].includes(touch)) throw new TypeError('interaction.touch must be none or drag');
  const config = {
    version: 1, mode,
    baseWidth: finite(input.baseWidth, 1920, 'baseWidth', 1, 20000),
    baseHeight: finite(input.baseHeight, 180, 'baseHeight', 1, 4000),
    pixelRatio: finite(input.pixelRatio, 2, 'pixelRatio', 0.1, 8),
    baseUrl: input.baseUrl,
    description: String(input.description ?? ''),
    poster: input.poster,
    mobilePoster: input.mobilePoster,
    posterPosition: input.posterPosition ?? '50% 50%',
    background: input.background ?? '#173d42',
    taper: input.taper !== false,
    loadTimeout: finite(input.loadTimeout, 10000, 'loadTimeout', 100, 120000),
    height: {...(height.aspectRatio === undefined ? {} : {aspectRatio: finite(height.aspectRatio, 4, 'height.aspectRatio', 0.5, 100)}),
      min, max, ratio: finite(height.ratio, 0.09375, 'height.ratio', 0.01, 2),
      mobile: finite(height.mobile, 144, 'height.mobile', 1, 2000), breakpoint: finite(height.breakpoint, 640, 'height.breakpoint', 0, 3000)},
    interaction: {enabled: input.interaction?.enabled !== false,
      touch,
      strength: finite(input.interaction?.strength, 1, 'interaction.strength', 0, 3),
      resetDuration: finite(input.interaction?.resetDuration, 200, 'interaction.resetDuration', 0, 2000)},
  };
  const ids = new Set();
  config.layers = input.layers.map((layer, index) => {
    const id = String(layer.id ?? `layer-${index}`);
    if (ids.has(id)) throw new TypeError(`Duplicate layer id: ${id}`);
    ids.add(id);
    if (typeof layer.src !== 'string' || !layer.src.trim()) throw new TypeError(`Missing src for ${id}`);
    const type = layer.type ?? (/\.(mp4|webm)(?:[?#]|$)/i.test(layer.src) ? 'video' : 'image');
    if (!['video', 'image'].includes(type)) throw new TypeError(`Unsupported media type for ${id}`);
    const fit = layer.fit ?? 'canvas';
    if (!['canvas', 'contain'].includes(fit) || (fit === 'contain' && mode !== 'aligned')) throw new TypeError(`Unsupported fit for ${id}`);
    const position = pair(layer.position, [.5, .5], `${id}.position`);
    if (position.some(value => value < 0 || value > 1)) throw new TypeError(`${id}.position must be in [0, 1]`);
    return {
      ...layer, id, type, fit, position, required: layer.required ?? index === 0,
      scale: finite(layer.scale, 1, `${id}.scale`, 0.01, 10),
      offset: pair(layer.offset, [0, 0], `${id}.offset`),
      initial: pair(layer.initial, [0, 0], `${id}.initial`),
      opacity: finite(layer.opacity, 1, `${id}.opacity`, 0, 1),
      rotate: finite(layer.rotate, 0, `${id}.rotate`),
      blur: finite(layer.blur, 0, `${id}.blur`, 0, 100),
    };
  });
  return config;
}

export function resolveAssetUrl(src, baseUrl) {
  const url = new URL(src, baseUrl);
  if (!['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) && !(url.protocol === 'data:' && /^data:image\//i.test(src))) {
    throw new TypeError('Unsupported asset URL protocol');
  }
  return url.href;
}

export function bezierAt(progress, points) {
  if (!points) return progress;
  const sign = progress < 0 ? -1 : 1;
  const x = clamp(Math.abs(progress), 0, 1);
  const [x1, y1, x2, y2] = points;
  const cubic = (t, a, b) => 3 * (1-t) ** 2 * t * a + 3 * (1-t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (cubic(t, x1, x2) < x) low = t; else high = t;
  }
  return sign * cubic((low + high) / 2, y1, y2);
}

export function layerState(layer, progress, referenceScale = 1) {
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
    if (motion.opacity.wrap === 'alternate') { const n = ((opacity % 2) + 2) % 2; opacity = n <= 1 ? n : 2 - n; }
  }
  if (motion?.blur) {
    blur = motion.blur.initial + motion.blur.offset * sample(motion.blur);
    if (motion.blur.wrap === 'alternate') blur = Math.abs(blur);
  }
  return {
    x: (initial[0] + offset[0] * (translation ? sample(translation) : progress)) * factor,
    y: (initial[1] + offset[1] * (translation ? sample(translation) : progress)) * factor,
    scale: Math.max(0.01, 1 + (motion?.scale?.offset ?? 0) * sample(motion?.scale)),
    rotate: layer.rotate + (motion?.rotate?.offset ?? 0) * sample(motion?.rotate),
    opacity: clamp(opacity, 0, 1), blur: Math.max(0, blur),
  };
}

// The shared canvas scale preserves alignment between transparent layers.
export function alignedScale(config, width, height) {
  const reference = height / config.baseHeight;
  let paddingX = 1, paddingY = 1;
  let minimumScale = 1;
  for (const layer of config.layers) {
    if (layer.fit === 'contain') continue;
    const strength = config.interaction.strength;
    paddingX = Math.max(paddingX, (Math.abs(layer.initial[0]) + Math.abs(layer.offset[0]) * strength) * reference * layer.scale + 1);
    paddingY = Math.max(paddingY, (Math.abs(layer.initial[1]) + Math.abs(layer.offset[1]) * strength) * reference * layer.scale + 1);
    minimumScale = Math.min(minimumScale, layer.scale);
  }
  return Math.max((width + 2 * paddingX) / config.baseWidth, (height + 2 * paddingY) / config.baseHeight) / minimumScale;
}

export function layoutScale(config, layer, width, height, shared) {
  if (layer.fit === 'contain') return Math.min(width / config.baseWidth, height / config.baseHeight);
  return shared ?? (config.mode === 'aligned' ? alignedScale(config, width, height) : height / config.baseHeight);
}

export function fromBilibiliSplitLayer(input, options = {}) {
  const envelope = typeof input === 'string' ? JSON.parse(input) : input;
  const data = envelope?.data ?? envelope;
  const parsed = typeof data.split_layer === 'string' ? JSON.parse(data.split_layer) : (data.split_layer ?? data);
  if (String(parsed.version) !== '1' || !Array.isArray(parsed.layers)) throw new TypeError('Only Bilibili split_layer version 1 is supported');
  if (parsed.extensions && Object.keys(parsed.extensions).length) throw new TypeError('split_layer extensions require an application adapter');
  return normalizeConfig({
    ...options, version: 1, mode: 'bilibili', baseHeight: 155, pixelRatio: 1,
    poster: options.poster ?? data.pic,
    layers: parsed.layers.map((item, index) => {
      const resource = item.resources?.[0];
      if (!resource?.src) throw new TypeError(`Missing resource in layer ${index}`);
      const scale = channel(item.scale, {initial: 1, offset: 0}, 'scale');
      const translate = channel(item.translate, {initial: [0,0], offset: [0,0]}, 'translate');
      const rotate = channel(item.rotate, {initial: 0, offset: 0}, 'rotate');
      const blur = channel(item.blur, {initial: 0, offset: 0}, 'blur');
      const opacity = channel(item.opacity, {initial: 1, offset: 0}, 'opacity');
      return {id: `bili-${item.id ?? index}`, name: item.name, src: resource.src,
        required: index === 0, scale: scale.initial, initial: translate.initial, offset: translate.offset,
        rotate: rotate.initial, opacity: opacity.initial, blur: blur.initial,
        motion: {scale, translate, rotate, blur, opacity}};
    }),
  });
}
