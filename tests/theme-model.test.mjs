import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeTheme} from '../src/theme-model.js';
import {normalizeProject} from '../scripts/lib/project.mjs';
import {validateTheme} from '../scripts/validate-theme.mjs';

test('motion profiles have bounded standard defaults and reject nonstandard options',()=>{
  const input={version:1,name:'test',variants:{desktop:{manifest:'desktop.json'},mobile:{manifest:'mobile.json'}}};
  const theme=normalizeTheme(input);
  assert.equal(theme.motion.coarse.fps,30);assert.equal(theme.motion.fine.fps,60);
  assert.throws(()=>normalizeTheme({...input,motion:{speed:99}}),/Unknown motion field/);
  assert.throws(()=>normalizeTheme({...input,motion:{coarse:{fps:60}}}),/fps/);
});

test('a changed source breakpoint generates compatible default validation widths',async()=>{
  const input=JSON.parse(await readFile('templates/theme-project/project.json','utf8'));
  const project=normalizeProject({...input,breakpoint:600});
  assert.ok(project.variants.mobile.viewports.every(width=>width<=600));
  assert.ok(project.variants.desktop.viewports.includes(601));
  assert.ok(project.variants.desktop.viewports.every(width=>width>600));
});

test('published sources use the shared contract and all inline configs match their manifests',async()=>{
  const catalog=JSON.parse(await readFile('themes/catalog.json','utf8'));
  for(const job of catalog.projects) {
    const result=await validateTheme(`${job.output}/theme.json`);
    assert.equal(result.ok,true,result.errors.join('\n'));
    assert.ok(result.checks>=85);
  }
});
