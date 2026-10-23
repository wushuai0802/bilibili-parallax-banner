import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION,normalizeConfig} from '../../src/model.js';
import {scriptJson,xml,put,json} from './files.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));

function initialStyles(theme) {
  const rule=name=>{
    const definition=theme.variants[name],config=normalizeConfig(definition.config);
    const poster=`${name}/${config.poster}`;
    if(config.height.aspectRatio!==undefined)return `height:auto;min-height:0;max-height:none;aspect-ratio:${config.height.aspectRatio};background:${config.background} url(${JSON.stringify(poster)}) center/cover no-repeat;`;
    return `height:auto;min-height:${config.height.min}px;max-height:${config.height.max}px;aspect-ratio:${1/config.height.ratio};background:${config.background} url(${JSON.stringify(poster)}) center/cover no-repeat;`;
  };
  let css=`#banner{${rule('desktop')}}@media(max-width:${theme.breakpoint}px){#banner{${rule('mobile')}}}`;
  for(const name of ['desktop','mobile']) {
    const height=theme.variants[name].config.height;
    if(height.aspectRatio===undefined&&height.breakpoint>0)css+=`@media ${name==='desktop'?`(min-width:${theme.breakpoint+1}px) and `:''}(max-width:${Math.min(name==='mobile'?theme.breakpoint:10000,height.breakpoint)}px){#banner{height:${height.mobile}px;min-height:0;max-height:none;aspect-ratio:auto}}`;
  }
  return css;
}

export async function writePreview(directory,theme) {
  const engine=await readFile(join(root,'dist/banner.min.js'),'utf8'),engineCss=await readFile(join(root,'dist/banner.css'),'utf8');
  const code=await readFile(join(root,'templates/preview/preview.js'),'utf8'),css=await readFile(join(root,'templates/preview/preview.css'),'utf8');
  const title=theme.preview?.title||theme.name;
  const body=`<header><span id="brand" class="brand">${xml(theme.preview?.brand||theme.name)}</span><span class="tag">LAYERED VISUAL PREVIEW</span></header>
<section id="banner" class="hero" data-banner-preview aria-label="${xml(title)}"><div class="scene-title"><small id="preview-eyebrow"></small><h1 id="preview-title"></h1><p id="preview-subtitle"></p></div></section>
<div class="tools"><div class="mode-group" role="group" aria-label="预览模式"><button type="button" data-mode="pointer" aria-pressed="false">鼠标视差</button><button type="button" data-mode="auto" aria-pressed="false">自动演示</button><button type="button" data-mode="still" aria-pressed="false">静态预览</button></div><span id="status" class="status" role="status">正在准备画面…</span></div>
<section class="info"><div><div class="eyebrow">A JOURNEY THROUGH THE LAYERS</div><h2>让视线，走进画面。</h2><p>电脑左右移动鼠标查看视差；手机默认轻量自动演示，横向拖动可接管画面，上下滑动正常浏览。</p></div><ol id="layer-list"></ol></section>
<details class="reference"><summary>素材来源与预览说明</summary><p>作者：${xml(theme.artwork.author)}<br>来源：${xml(theme.artwork.source)}<br>素材许可：${xml(theme.artwork.license)}</p><p>此页面使用实际网页组件；构图检查图属于模型渲染，浏览器截图在浏览器验收中单独提供。</p></details>
<footer><span>${xml(theme.name)} · v${VERSION}</span><a href="https://github.com/wushuai0802/bilibili-parallax-banner" rel="noopener noreferrer" target="_blank">Layered Banner Component</a></footer>`;
  const head=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xml(title)} · Banner预览</title>`;
  const initial=initialStyles(theme);
  const version=`${VERSION}-${theme.revision}`;
  await put(directory,'preview.config.js',`window.BANNER_THEME=${scriptJson(theme)};\nwindow.BANNER_THEME_BASE=new URL('./theme.json',document.currentScript.src).href;\n`);
  await put(directory,'preview.js',code);await put(directory,'preview.css',css);
  await put(directory,'engine.min.js',engine);await put(directory,'engine.css',engineCss);
  await put(directory,'index.html',`<!doctype html><html lang="zh-CN"><head>${head}<link rel="stylesheet" href="./engine.css?v=${version}"><link rel="stylesheet" href="./preview.css?v=${version}"><style>${initial}</style></head><body>${body}<script src="./engine.min.js?v=${version}"></script><script src="./preview.config.js?v=${version}"></script><script src="./preview.js?v=${version}"></script></body></html>\n`);
  await put(directory,'embed.html',`<!doctype html><html lang="zh-CN"><head>${head}<link rel="stylesheet" href="./engine.css?v=${version}"><style>body{margin:0}${initial}</style></head><body><div id="banner"></div><script src="./engine.min.js?v=${version}"></script><script>LayeredBanner.loadTheme('#banner','./theme.json').then(function(controller){window.siteBanner=controller;}).catch(function(error){console.error('Banner unavailable',error);});</script></body></html>\n`);
  const offline=structuredClone(theme);
  for(const [name,variant] of Object.entries(offline.variants)) {
    for(const entry of [...variant.config.layers,{get src(){return variant.config.poster;},set src(value){variant.config.poster=value;}}]) {
      const buffer=await readFile(join(directory,name,entry.src));
      entry.src=`data:image/webp;base64,${buffer.toString('base64')}`;
    }
  }
  const offlineInitial=initial.replace(/url\([^)]*\)/g,'none');
  await put(directory,'artifacts/offline.html',`<!doctype html><html lang="zh-CN"><head>${head}<style>${engineCss}\n${css}\n${offlineInitial}</style></head><body>${body}<script>${engine}</script><script>window.BANNER_THEME=${scriptJson(offline)};\n${code}</script></body></html>\n`);
}
