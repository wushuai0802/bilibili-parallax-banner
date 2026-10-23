export const VERSION: string;
export interface BannerLayer {
  id?: string; src: string; type?: 'image' | 'video'; required?: boolean;
  fit?: 'canvas' | 'contain'; position?: [number,number];
  name?: string;
  scale?: number; offset?: [number,number]; initial?: [number,number];
  opacity?: number; rotate?: number; blur?: number; requireAlpha?: boolean;
}
export interface BannerConfig {
  version?: 1; mode?: 'aligned' | 'bilibili';
  baseWidth?: number; baseHeight?: number; pixelRatio?: number; baseUrl?: string;
  description?: string; poster?: string; mobilePoster?: string; posterPosition?: string; background?: string; taper?: boolean; loadTimeout?: number;
  height?: {aspectRatio?: number; min?: number; max?: number; ratio?: number; mobile?: number; breakpoint?: number};
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

export type ThemeMode = 'pointer' | 'auto' | 'still';
export interface ThemeRegion { id: string; layerId: string; rect: [number,number,number,number]; }
export interface ThemeTextZone { id: string; rect: [number,number,number,number]; }
export interface ThemeVariant {
  manifest?: string; config?: BannerConfig; viewports?: number[];
  protectedRegions?: ThemeRegion[]; textZones?: ThemeTextZone[];
}
export interface ThemeProfile { mode?: ThemeMode; amplitude?: number; fps?: number; }
export interface BannerTheme {
  version: 1; name: string; revision?: string; breakpoint?: number; minimumMargin?: number;
  artwork?: {author: string; source: string; license: string};
  motion?: {period?: number; resumeDelay?: number; fine?: ThemeProfile; coarse?: ThemeProfile};
  preview?: {brand?: string; title?: string; subtitle?: string; eyebrow?: string; proofWidths?: number[]};
  variants: {desktop: ThemeVariant; mobile: ThemeVariant};
}
export interface ThemeOptions {baseUrl?: string; signal?: AbortSignal; timeout?: number; mode?: ThemeMode | 'default';}
export class ThemeBanner {
  constructor(root: HTMLElement, source: BannerTheme | string | URL, options?: ThemeOptions);
  readonly ready: Promise<ThemeBanner>;
  readonly state: 'loading' | 'ready' | 'degraded' | 'error' | 'destroyed';
  readonly mode: ThemeMode;
  readonly variant: 'desktop' | 'mobile' | null;
  readonly theme?: BannerTheme;
  setTheme(source: BannerTheme | string | URL, options?: {baseUrl?: string}): Promise<ThemeBanner>;
  setMode(mode: ThemeMode | 'default'): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}
export function createTheme(root: string | HTMLElement, theme: BannerTheme, options?: ThemeOptions): ThemeBanner;
export function loadTheme(root: string | HTMLElement, url: string | URL, options?: ThemeOptions): Promise<ThemeBanner>;
