import {build} from 'esbuild';
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import sharp from 'sharp';
import {buildExamples} from './build-examples.mjs';
import {resolve} from 'node:path';
import {normalizeConfig} from '../src/model.js';
import {sceneLayers,renderScene} from './lib/render.mjs';

await mkdir('dist', {recursive: true});
await build({entryPoints:['src/banner.js'], bundle:true, format:'esm', outfile:'dist/banner.js', target:'es2020'});
await build({entryPoints:['src/banner.js'], bundle:true, format:'iife', globalName:'LayeredBanner', outfile:'dist/banner.min.js', minify:true, target:'es2020'});
await build({entryPoints:['src/banner.js'], bundle:true, format:'cjs', outfile:'dist/banner.umd.cjs', target:'es2020'});
await copyFile('src/banner.css', 'dist/banner.css');
await copyFile('src/banner.d.ts', 'dist/banner.d.ts');
await build({entryPoints:['integrations/ubits/banner.js'],bundle:true,format:'esm',outfile:'dist/ubits.js',target:'es2020'});
await build({entryPoints:['integrations/ubits/banner.js'],bundle:true,format:'iife',globalName:'UBitsBanner',outfile:'dist/ubits.min.js',minify:true,target:'es2020'});
await copyFile('integrations/ubits/banner.css','dist/ubits.css');

const manifest = JSON.parse(await readFile('assets/demo/banner.json', 'utf8'));
// The JSON manifest is canonical; this generated wrapper enables file:// previews.
await writeFile('assets/demo/banner.config.js', `/* Generated from banner.json. Do not edit. */\nwindow.BANNER_CONFIG = ${JSON.stringify(manifest, null, 2)};\nwindow.BANNER_CONFIG.baseUrl = new URL('.', document.currentScript.src).href;\n`);
const config=normalizeConfig(manifest),layers=await sceneLayers(config,resolve('assets/demo/banner.json'));
const poster=await renderScene({...config,taper:false},layers,config.baseWidth*config.pixelRatio,config.baseHeight*config.pixelRatio,0);
await sharp(poster).removeAlpha().webp({quality:88}).toFile('assets/demo/poster.webp');
console.log('Built ESM, browser IIFE, CommonJS, types, CSS and the offline demo config.');
await buildExamples();
