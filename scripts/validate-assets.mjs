import {readFile, stat, realpath} from 'node:fs/promises';
import {dirname, resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {normalizeConfig} from '../src/model.js';

export async function validateManifest(manifestPath) {
  const manifestFile = resolve(manifestPath);
  const config = normalizeConfig(JSON.parse(await readFile(manifestFile, 'utf8')));
  const directory = await realpath(dirname(manifestFile));
  const errors = [], warnings = [], rows = [], used = new Set();
  let bytes = 0;
  const expectedWidth = config.baseWidth * config.pixelRatio;
  const expectedHeight = config.baseHeight * config.pixelRatio;
  for (const item of [...config.layers, ...(config.poster ? [{id:'poster',src:config.poster,type:'image'}] : []), ...(config.mobilePoster ? [{id:'mobile-poster',src:config.mobilePoster,type:'image'}] : [])]) {
    const problems = [];
    try {
      if (item.type === 'video') throw new Error('Video validation requires an external media probe; not checked by this image validator');
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(item.src)) throw new Error('Provide local files for reproducible asset validation');
      const candidate = resolve(directory, item.src);
      const actual = await realpath(candidate);
      const rel = relative(directory, actual);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Asset must stay inside the manifest directory');
      const info = await stat(actual);
      if (!info.isFile()) throw new Error('Asset is not a regular file');
      if (!used.has(actual)) {bytes += info.size; used.add(actual);}
      const image = sharp(actual, {limitInputPixels: 40_000_000});
      const metadata = await image.metadata();
      if (metadata.format === 'svg' && config.mode === 'aligned') {
        const svg = (await readFile(actual, 'utf8')).match(/<svg\b[^>]*>/i)?.[0] ?? '';
        if (!/\swidth\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/i.test(svg) || !/\sheight\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/i.test(svg)) {
          problems.push('SVG must declare absolute width and height; viewBox alone has browser-dependent intrinsic dimensions');
        }
      }
      // Decode the complete pipeline; metadata alone cannot detect corrupt pixels.
      const decoded = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
      let hasTransparentPixels = false;
      for (let i = decoded.info.channels - 1; i < decoded.data.length; i += decoded.info.channels) {
        if (decoded.data[i] < 255) {hasTransparentPixels = true; break;}
      }
      if (config.mode === 'aligned' && !['poster','mobile-poster'].includes(item.id) && (metadata.width !== expectedWidth || metadata.height !== expectedHeight)) {
        problems.push(`Canvas must be ${expectedWidth}x${expectedHeight}`);
      }
      if (item.requireAlpha && !hasTransparentPixels) problems.push('Foreground requires actual transparent pixels');
      if (item.id === config.layers[0].id && hasTransparentPixels && !config.poster) problems.push('Base layer must be opaque unless a poster is supplied');
      if (info.size > 300 * 1024) warnings.push(`${item.id}: over 300 KiB; optimize without damaging alpha edges`);
      rows.push({id:item.id, file:item.src, dimensions:`${metadata.width}x${metadata.height}`, transparent:hasTransparentPixels, bytes:info.size, ok:problems.length === 0});
    } catch (error) {
      problems.push(error.message);
      rows.push({id:item.id,file:item.src,ok:false});
    }
    for (const problem of problems) errors.push(`${item.id}: ${problem}`);
  }
  if (bytes > 1.5 * 1024 * 1024) warnings.push('Combined download exceeds the suggested 1.5 MiB budget');
  return {ok:errors.length === 0, bytes, rows, errors, warnings};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await validateManifest(process.argv[2] ?? 'assets/demo/banner.json');
    console.table(result.rows);
    for (const message of result.warnings) console.warn(`WARN ${message}`);
    for (const message of result.errors) console.error(`ERROR ${message}`);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} / ${(result.bytes/1024).toFixed(1)} KiB`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
