const modes = new Set(['pointer', 'auto', 'still']);
function keys(value, allowed, label) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value ?? {})) if (!allowed.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}

function number(value, fallback, min, max, label) {
  const result = value ?? fallback;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) throw new TypeError(`${label} must be in [${min}, ${max}]`);
  return result;
}

export function normalizeTheme(input) {
  if (!input || input.version !== 1) throw new TypeError('Unsupported theme contract version');
  if (typeof input.name !== 'string' || !input.name.trim()) throw new TypeError('Theme requires a name');
  const motion = input.motion ?? {};
  keys(motion, ['period', 'resumeDelay', 'fine', 'coarse'], 'motion');
  const profile = (kind, defaults) => {
    const value = motion[kind] ?? {};
    keys(value, ['mode', 'amplitude', 'fps'], `motion.${kind}`);
    const mode = value.mode ?? defaults.mode;
    if (!modes.has(mode)) throw new TypeError(`motion.${kind}.mode is unsupported`);
    return {mode, amplitude: number(value.amplitude, defaults.amplitude, 0, 1, `motion.${kind}.amplitude`),
      fps: number(value.fps, defaults.fps, 1, defaults.maxFps, `motion.${kind}.fps`)};
  };
  const variants = {};
  for (const name of ['desktop', 'mobile']) {
    const value = input.variants?.[name];
    if (!value || (!value.config && (typeof value.manifest !== 'string' || !value.manifest.trim()))) throw new TypeError(`Missing ${name} manifest or inline config`);
    variants[name] = {...value};
  }
  const breakpoint = number(input.breakpoint, 767, 1, 9999, 'breakpoint');
  if (!Number.isInteger(breakpoint)) throw new TypeError('breakpoint must be an integer');
  return {...input, breakpoint, variants, motion: {
    period: number(motion.period, 8000, 1000, 120000, 'motion.period'),
    resumeDelay: number(motion.resumeDelay, 1800, 0, 10000, 'motion.resumeDelay'),
    fine: profile('fine', {mode: 'pointer', amplitude: .85, fps: 60, maxFps: 60}),
    coarse: profile('coarse', {mode: 'auto', amplitude: .55, fps: 30, maxFps: 30}),
  }};
}

export const themeVariant = (theme, width) => width <= theme.breakpoint ? 'mobile' : 'desktop';
