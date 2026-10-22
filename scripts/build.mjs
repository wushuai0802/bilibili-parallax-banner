import {build} from 'esbuild';
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('dist', {recursive: true});
await build({entryPoints:['src/banner.js'], bundle:true, format:'esm', outfile:'dist/banner.js', target:'es2020'});
await build({entryPoints:['src/banner.js'], bundle:true, format:'iife', globalName:'LayeredBanner', outfile:'dist/banner.min.js', minify:true, target:'es2020'});
await build({entryPoints:['src/banner.js'], bundle:true, format:'cjs', outfile:'dist/banner.umd.cjs', target:'es2020'});
await copyFile('src/banner.css', 'dist/banner.css');
await copyFile('src/banner.d.ts', 'dist/banner.d.ts');

const manifest = JSON.parse(await readFile('assets/demo/banner.json', 'utf8'));
// The JSON manifest is canonical; this generated wrapper enables file:// previews.
await writeFile('assets/demo/banner.config.js', `/* Generated from banner.json. Do not edit. */\nwindow.BANNER_CONFIG = ${JSON.stringify(manifest, null, 2)};\nwindow.BANNER_CONFIG.baseUrl = new URL('.', document.currentScript.src).href;\n`);
const layers = await Promise.all(manifest.layers.map(async layer => ({input: await readFile(`assets/demo/${layer.src}`), left:0, top:0})));
await sharp({create:{width:3840,height:360,channels:4,background:'#173d42'}}).composite(layers).webp({quality:88}).toFile('assets/demo/poster.webp');
console.log('Built ESM, browser IIFE, CommonJS, types, CSS and the offline demo config.');
