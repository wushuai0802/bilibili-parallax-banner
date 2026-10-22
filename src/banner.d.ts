export const VERSION: string;
export interface BannerLayer {
  id?: string; src: string; type?: 'image' | 'video'; required?: boolean;
  fit?: 'canvas' | 'contain'; position?: [number,number];
  scale?: number; offset?: [number,number]; initial?: [number,number];
  opacity?: number; rotate?: number; blur?: number; requireAlpha?: boolean;
}
export interface BannerConfig {
  version?: 1; mode?: 'aligned' | 'bilibili';
  baseWidth?: number; baseHeight?: number; pixelRatio?: number; baseUrl?: string;
  description?: string; poster?: string; mobilePoster?: string; posterPosition?: string; background?: string; taper?: boolean; loadTimeout?: number;
  height?: {min?: number; max?: number; ratio?: number; mobile?: number; breakpoint?: number};
  interaction?: {enabled?: boolean; strength?: number; resetDuration?: number; touch?: 'none' | 'drag'};
  layers: BannerLayer[];
}
export class ParallaxBanner {
  constructor(root: HTMLElement, config: BannerConfig);
  readonly ready: Promise<ParallaxBanner>;
  readonly state: 'loading' | 'ready' | 'degraded' | 'error' | 'destroyed';
  pause(): void;
  resume(): void;
  setProgress(value: number): void;
  destroy(): void;
}
export function createBanner(root: string | HTMLElement, config: BannerConfig): ParallaxBanner;
export function loadBanner(root: string | HTMLElement, manifestUrl: string | URL, options?: Partial<BannerConfig> & {signal?: AbortSignal}): Promise<ParallaxBanner>;
export function fromBilibiliSplitLayer(input: string | object, options?: Partial<BannerConfig>): BannerConfig;
