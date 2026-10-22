import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {validateTheme} from '../scripts/validate-theme.mjs';

async function fixture(run) {
  await mkdir('tmp',{recursive:true});
  const temporary=await mkdtemp(resolve('tmp/theme-test-')),directory=join(temporary,'theme');
  await cp('templates/theme',directory,{recursive:true});
  const themePath=join(directory,'theme.json'),theme=JSON.parse(await readFile(themePath,'utf8'));
  const save=()=>writeFile(themePath,JSON.stringify(theme));
  try {await run({temporary,directory,themePath,theme,save});}finally{await rm(temporary,{recursive:true,force:true});}
}

test('generic paired template decodes all assets and passes 85 declared composition checks',async()=>{
  const result=await validateTheme('templates/theme/theme.json');
  assert.equal(result.ok,true);assert.deepEqual(result.errors,[]);assert.equal(result.checks,85);
  assert.deepEqual(result.rows.map(row=>[row.canvas,row.assets]),[['3840x432',4],['1125x600',4]]);
});

test('both variants and recorded artwork metadata are required',()=>fixture(async f=>{
  delete f.theme.variants.mobile;delete f.theme.artwork.license;await f.save();
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Missing mobile')));
  assert.ok(result.errors.some(error=>error.includes('artwork.license')));
}));

test('paired validation checks decoded images rather than trusting file extensions',()=>fixture(async f=>{
  await writeFile(join(f.directory,'mobile/02-subject.svg'),'not an image');
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('mobile: subject:')));
}));

test('protected regions that leave the viewport fail even when the images are valid',()=>fixture(async f=>{
  f.theme.variants.mobile.protectedRegions[0].rect=[0,50,30,30];await f.save();
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('leaves the safe viewport')));
}));

test('a changed host title zone cannot silently cover a protected subject',()=>fixture(async f=>{
  f.theme.variants.mobile.textZones[0].rect=[0,0,1,1];await f.save();
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('overlaps text zone site-title')));
}));

test('manifests outside the theme directory are rejected before asset loading',()=>fixture(async f=>{
  await cp(join(f.directory,'desktop/banner.json'),join(f.temporary,'outside.json'));
  f.theme.variants.desktop.manifest='../outside.json';await f.save();
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('stay inside the theme directory')));
}));

test('a per-variant poster must have the same canvas instead of relying on cover cropping',()=>fixture(async f=>{
  const path=join(f.directory,'mobile/poster.svg'),poster=await readFile(path,'utf8');
  await writeFile(path,poster.replace('width="1125"','width="1124"'));
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Poster must be opaque and match 1125x600')));
}));

test('subject safety accounts for actual layer rotation',()=>fixture(async f=>{
  const path=join(f.directory,'mobile/banner.json'),config=JSON.parse(await readFile(path,'utf8'));
  config.layers.find(layer=>layer.id==='subject').rotate=90;
  await writeFile(path,JSON.stringify(config));
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('leaves the safe viewport')));
}));

test('physical-pixel coordinates cannot masquerade as logical subject coordinates',()=>fixture(async f=>{
  f.theme.variants.mobile.protectedRegions[0].rect=[678,264,216,225];await f.save();
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('must stay inside 375x200')));
}));

test('paired themes cannot reduce the mandatory four CSS pixel margin',()=>fixture(async f=>{
  f.theme.minimumMargin=0;await f.save();
  await assert.rejects(validateTheme(f.themePath),/minimumMargin must be in \[4, 1000\]/);
}));

test('a fallback poster cannot hide a transparent base background',()=>fixture(async f=>{
  const path=join(f.directory,'mobile/01-background.svg'),source=await readFile(path,'utf8');
  await writeFile(path,source.replace(/<path fill="url\(#sky\)"[^>]*\/>/,''));
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Background must be opaque')));
}));

test('overlay transparency is checked even if requireAlpha was accidentally removed',()=>fixture(async f=>{
  const manifest=join(f.directory,'mobile/banner.json'),config=JSON.parse(await readFile(manifest,'utf8'));
  config.layers.find(layer=>layer.id==='subject').requireAlpha=false;
  await writeFile(manifest,JSON.stringify(config));
  await writeFile(join(f.directory,'mobile/02-subject.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1125" height="600"><rect width="1125" height="600" fill="red"/></svg>');
  const result=await validateTheme(f.themePath);
  assert.equal(result.ok,false);assert.ok(result.errors.some(error=>error.includes('Overlay subject requires actual transparent pixels')));
}));
