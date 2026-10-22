import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
import {validateManifest} from '../scripts/validate-assets.mjs';

async function fixture(run) {
  await mkdir(resolve('tmp'),{recursive:true});
  const dir=await mkdtemp(resolve('tmp/asset-test-'));
  try {await run(dir);} finally {await rm(dir,{recursive:true,force:true});}
}

test('validator decodes AVIF/WebP and rejects corrupt data',()=>fixture(async dir=>{
  await writeFile(join(dir,'banner.json'),JSON.stringify({layers:[{src:'bg.avif'},{src:'fg.webp',requireAlpha:true}]}));
  await writeFile(join(dir,'bg.avif'),'invalid AVIF');await writeFile(join(dir,'fg.webp'),'invalid WebP');
  const result=await validateManifest(join(dir,'banner.json'));assert.equal(result.ok,false);assert.equal(result.errors.length,2);
}));

test('mismatched canvas and opaque foreground fail',()=>fixture(async dir=>{
  await writeFile(join(dir,'banner.json'),JSON.stringify({layers:[{src:'fg.png',requireAlpha:true}]}));
  await sharp({create:{width:120,height:80,channels:3,background:'#ffffff'}}).png().toFile(join(dir,'fg.png'));
  const result=await validateManifest(join(dir,'banner.json'));assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes('Canvas')));assert.ok(result.errors.some(x=>x.includes('transparent')));
}));

test('missing references and paths outside the asset directory fail',()=>fixture(async dir=>{
  await writeFile(join(dir,'banner.json'),JSON.stringify({layers:[{src:'missing.png'},{src:'../../package.json'}]}));
  const result=await validateManifest(join(dir,'banner.json'));assert.equal(result.ok,false);assert.equal(result.errors.length,2);
}));

test('bundled original demo assets satisfy their manifest',async()=>{
  const result=await validateManifest('assets/demo/banner.json');assert.deepEqual(result.errors,[]);
});

test('SVG without explicit intrinsic dimensions is rejected',()=>fixture(async dir=>{
  await writeFile(join(dir,'banner.json'),JSON.stringify({layers:[{src:'bg.svg'}]}));
  await writeFile(join(dir,'bg.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3840 360"><rect width="3840" height="360" fill="red"/></svg>');
  const result=await validateManifest(join(dir,'banner.json'));
  assert.equal(result.ok,false);assert.ok(result.errors.some(x=>x.includes('absolute width')));
}));

test('a layer named poster must still meet the aligned canvas contract',()=>fixture(async dir=>{
  await writeFile(join(dir,'banner.json'),JSON.stringify({layers:[{id:'poster',src:'small.svg'}]}));
  await writeFile(join(dir,'small.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>');
  const result=await validateManifest(join(dir,'banner.json'));
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Canvas must be 3840x360')));
}));
