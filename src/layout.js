import {clamp, layoutScale, layerState} from './model.js';

export function bannerHeight(config, width) {
  const rule = config.height;
  if (rule.aspectRatio !== undefined) return width / rule.aspectRatio;
  return width <= rule.breakpoint ? rule.mobile : clamp(width * rule.ratio, rule.min, rule.max);
}

export function protectedBounds(config, layer, rect, width, height, progress) {
  const scale = layoutScale(config, layer, width, height), factor = scale * layer.scale;
  const w = config.baseWidth * factor, h = config.baseHeight * factor;
  const position = layer.fit === 'contain' ? layer.position : [.5, .5];
  const cx = (width - w) * position[0] + w / 2, cy = (height - h) * position[1] + h / 2;
  const state = layerState(layer, progress * config.interaction.strength, layer.fit === 'contain' ? scale : height / config.baseHeight);
  const angle = state.rotate * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const [x, y, rw, rh] = rect;
  const points = [[x, y], [x + rw, y], [x, y + rh], [x + rw, y + rh]].map(([px, py]) => {
    const dx = (px - config.baseWidth / 2) * factor * state.scale, dy = (py - config.baseHeight / 2) * factor * state.scale;
    return [cx + dx * cos - dy * sin + state.x, cy + dx * sin + dy * cos + state.y];
  });
  if (!points.flat().every(Number.isFinite)) throw new Error('Subject transforms must be finite');
  return {left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])),
    top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1]))};
}
