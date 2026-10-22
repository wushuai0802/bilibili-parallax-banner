import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {unzipSync,strFromU8} from 'fflate';
import {JSDOM} from 'jsdom';
import {buildTheme} from '../scripts/lib/build-theme.mjs';
import {readJson,json} from '../scripts/lib/files.mjs';

const exec=promisify(execFile);
async function fixture(run) {
  await mkdir('tmp',{recursive:true});
  const temporary=await mkdtemp(resolve('tmp/pipeline-')),input=join(temporary,'input');
  await cp('templates/theme-project',input,{recursive:true});
  const path=join(input,'project.json'),project=await readJson(path),output=join(temporary,'output');
  try {await run({temporary,input,path,project,output,save:()=>writeFile(path,json(project))});}
  finally {await rm(temporary,{recursive:true,force:true});}
}

test('a generic source project builds a complete, repeatable delivery without leaking input files',()=>fixture(async f=>{
  const first=await buildTheme(f.path,f.output,{proofs:false});assert.equal(first.ok,true);assert.equal(first.report.checks,85);
  await writeFile(join(f.output,'private-note.txt'),'not part of the delivery');
  const second=await buildTheme(f.path,f.output,{proofs:false});assert.equal(second.ok,true);assert.equal(first.theme.revision,second.theme.revision);
  const zip=unzipSync(await readFile(join(f.output,'artifacts/theme.zip')));
  assert.ok(zip['theme.json']);assert.ok(zip['artifacts/offline.html']);assert.ok(zip['engine.min.js']);
  assert.equal(Object.keys(zip).some(path=>/source\/|project\.json|private-note|node_modules|\.theme-build-/.test(path)),false);
  assert.equal(JSON.parse(strFromU8(zip['theme.json'])).revision,first.theme.revision);
  for(const variant of Object.values(first.theme.variants)) {
    assert.match(variant.manifest,/banner-[a-f0-9]{12}\.json$/);
    assert.ok(variant.config.layers.every(layer=>/-[a-f0-9]{12}\.webp$/.test(layer.src)));
  }
}));

test('failed composition keeps the previous live theme and provides an isolated failure report',()=>fixture(async f=>{
  await buildTheme(f.path,f.output,{proofs:false});const original=await readFile(join(f.output,'theme.json'),'utf8');
  f.project.variants={mobile:{layers:{subject:{runtime:{initial:[-10000,0]}}}}};await f.save();
  const failed=await buildTheme(f.path,f.output,{proofs:false});
  assert.equal(failed.ok,false);assert.ok(failed.report.errors.some(error=>error.includes('safe viewport')));
  assert.equal(await readFile(join(f.output,'theme.json'),'utf8'),original);
  await access(join(failed.output,'artifacts/report.json'));
}));

test('source traversal and output-over-input mistakes are rejected',()=>fixture(async f=>{
  await cp(join(f.input,'source/subject.svg'),join(f.temporary,'outside.svg'));
  f.project.layers[1].src='../outside.svg';await f.save();
  await assert.rejects(buildTheme(f.path,f.output,{proofs:false}),/stay inside/);
  await assert.rejects(buildTheme(f.path,f.input,{proofs:false}),/cannot contain the source project/);
}));

test('unowned output files require explicit overwrite instead of being silently replaced',()=>fixture(async f=>{
  await mkdir(f.output);await writeFile(join(f.output,'index.html'),'host page');
  await assert.rejects(buildTheme(f.path,f.output,{proofs:false}),/unowned file/);
  assert.equal(await readFile(join(f.output,'index.html'),'utf8'),'host page');
}));

test('preview metadata is escaped in HTML and embedded script data',()=>fixture(async f=>{
  f.project.preview.title='</script><img id="injected" src=x onerror=alert(1)>';await f.save();
  const built=await buildTheme(f.path,f.output,{proofs:false});assert.equal(built.ok,true);
  const html=await readFile(join(f.output,'artifacts/offline.html'),'utf8'),dom=new JSDOM(html);
  assert.equal(dom.window.document.querySelector('#injected'),null);
  assert.ok(html.includes('\\u003c/script>'));dom.window.close();
}));

test('init creates an editable source project and refuses to overwrite it',()=>fixture(async f=>{
  const path=join(f.temporary,'project with spaces');
  await exec(process.execPath,['scripts/theme.mjs','init',path,'--name','new-theme']);
  assert.equal((await readJson(join(path,'project.json'))).name,'new-theme');
  await access(join(path,'source/subject.svg'));
  await assert.rejects(exec(process.execPath,['scripts/theme.mjs','init',path,'--name','other-theme']));
  assert.equal((await readJson(join(path,'project.json'))).name,'new-theme');
}));

test('prepared full-canvas artwork is preserved by the generic pipeline',async()=>{
  const project=await readJson('themes/frieren/project.json'),theme=await readJson('examples/frieren/theme.json');
  for(const source of project.layers) {
    const layer=theme.variants.desktop.config.layers.find(layer=>layer.id===source.id);
    const original=await readFile(join('themes/frieren',source.src));
    const delivered=await readFile(join('examples/frieren/desktop',layer.src));
    assert.ok(original.equals(delivered),`${source.id} was unnecessarily recompressed`);
  }
});

test('opaque subject sources cannot pass by acquiring a transparent output margin',()=>fixture(async f=>{
  await writeFile(join(f.input,'source/subject.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="432"><rect width="3840" height="432" fill="white"/></svg>');
  await assert.rejects(buildTheme(f.path,f.output,{proofs:false}),/needs real transparency/);
}));

test('misspelled layout parameters fail instead of being silently ignored',()=>fixture(async f=>{
  f.project.layers[1].layout={fit:'contain',subjectWidth:300};await f.save();
  await assert.rejects(buildTheme(f.path,f.output,{proofs:false}),/Unknown layout field: subjectWidth/);
}));
