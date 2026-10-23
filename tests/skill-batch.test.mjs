import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,rm,access,readdir,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {unzipSync} from 'fflate';
import {runBatch,reviewBatch,loadEngine,runCli} from '../skills/parallax-banner-maker/scripts/banner-batch.mjs';
import {packageSkill} from '../scripts/package-skill.mjs';

const repo=resolve('.'),exec=promisify(execFile),json=value=>JSON.stringify(value,null,2)+'\n';
async function fixture(action) {
  await mkdir('tmp',{recursive:true});
  const dir=await mkdtemp(resolve('tmp/skill suite-')),out=join(dir,'outputs'),manifest=join(dir,'batch.json');
  const project=async(name,staticMode=false)=>{
    const destination=join(dir,name);
    await cp('templates/banner-4x1',destination,{recursive:true});
    const file=join(destination,'project.json'),data=JSON.parse(await readFile(file,'utf8'));
    data.name=name;data.preview.proofWidths=[362,994];
    data.variants.desktop.viewports=[994];data.variants.mobile.viewports=[362];
    if(staticMode) {
      data.layers=[{...data.layers[0],runtime:{offset:[0,0]},regions:[{id:'landmark',rect:[1800,360,240,120]}]}];
      for(const variant of Object.values(data.variants)){variant.interaction={enabled:false};delete variant.layers;}
    }
    await writeFile(file,json(data));
    return file;
  };
  try {await action({dir,out,manifest,project,save:jobs=>writeFile(manifest,json({version:1,jobs})),options:{repo,out,manifest}});}
  finally {await rm(dir,{recursive:true,force:true});}
}

test('batch isolates failures and unprepared posters, exports real 4:1/static artwork, and resumes unchanged successes',()=>fixture(async f=>{
  await f.project('portrait');await f.project('scene',true);await f.project('broken');
  await writeFile(join(f.dir,'poster.jpg'),'raw input awaiting preparation');
  await writeFile(join(f.dir,'broken/source/background.svg'),'not an image');
  await f.save([
    {id:'portrait',project:'portrait/project.json'},
    {id:'pending',input:'poster.jpg',mode:'preserve'},
    {id:'broken',project:'broken/project.json'},
    {id:'scene',project:'scene/project.json',mode:'static'},
  ]);
  const state=await runBatch(f.options);
  assert.deepEqual(state.jobs.map(job=>job.status),['needs_review','needs_preparation','failed','needs_review'],json(state.jobs));
  assert.ok(state.jobs[2].error);
  assert.equal(state.summary.needs_review,2);
  const first=state.jobs[0],directory=join(f.out,first.directory),theme=JSON.parse(await readFile(join(directory,'theme.json'),'utf8'));
  const desktop=await sharp(await readFile(join(directory,'desktop',theme.variants.desktop.config.poster))).metadata();
  assert.deepEqual([desktop.width,desktop.height],[3840,960]);
  const compact=await sharp(await readFile(join(directory,'mobile',theme.variants.mobile.config.poster))).metadata();
  assert.deepEqual([compact.width,compact.height],[1200,300]);
  await access(join(directory,'artifacts/offline.html'));await access(join(directory,'artifacts/contact-sheet.png'));
  const zip=unzipSync(await readFile(join(directory,'artifacts/theme.zip')));
  assert.ok(zip['theme.json']);assert.ok(zip['artifacts/offline.html']);
  assert.equal(Object.keys(zip).some(file=>/project\.json|source\/|batch-state/.test(file)),false);
  const scene=JSON.parse(await readFile(join(f.out,state.jobs[3].directory,'theme.json'),'utf8'));
  assert.equal(scene.variants.mobile.config.layers.length,1);
  assert.deepEqual(scene.variants.mobile.config.layers[0].offset,[0,0]);
  const resumed=await runBatch({...f.options,resume:true});
  assert.equal(resumed.jobs[0].reused,true);assert.equal(resumed.jobs[3].reused,true);
  assert.equal(resumed.jobs[2].status,'failed');assert.equal(resumed.jobs[1].status,'needs_preparation');
  assert.equal((await readdir(f.out)).includes('.batch.lock'),false);
}));

test('review is bound to exact source/output and invalidates after edits, while prior versions remain',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);
  const initial=await runBatch(f.options),oldDirectory=initial.jobs[0].directory;
  const reviewed=await reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'test:automated fixture',note:'Fixture state transition only; no operator approval'});
  assert.equal(reviewed.status,'approved');
  assert.equal((await runBatch({...f.options,resume:true})).jobs[0].status,'approved');
  const background=join(f.dir,'portrait/source/background.svg');
  await writeFile(background,(await readFile(background,'utf8'))+'\n');
  await assert.rejects(reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'test',note:'stale'}),/Inputs or output changed/);
  const changed=await runBatch({...f.options,resume:true});
  assert.equal(changed.jobs[0].status,'needs_review');assert.equal(changed.jobs[0].review,undefined);
  assert.notEqual(changed.jobs[0].directory,oldDirectory);
  await access(join(f.out,oldDirectory,'artifacts/theme.zip'));
}));

test('damaged cached artifacts trigger a rebuild and clear approvals',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);
  const initial=await runBatch(f.options);
  await reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'test',note:'Fixture approval'});
  const row=initial.jobs[0];
  await writeFile(join(f.out,row.directory,row.poster),'corrupt image');
  await assert.rejects(reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'test',note:'stale'}),/Inputs or output changed/);
  const rebuilt=await runBatch({...f.options,resume:true});
  assert.equal(rebuilt.jobs[0].reused,false);assert.equal(rebuilt.jobs[0].status,'needs_review');
  assert.equal(rebuilt.jobs[0].review,undefined);
  assert.equal((await sharp(await readFile(join(f.out,rebuilt.jobs[0].directory,rebuilt.jobs[0].poster))).metadata()).format,'webp');
}));

test('unsafe ids, duplicate jobs and unknown contract fields fail before creating outputs',()=>fixture(async f=>{
  for(const jobs of [
    [{id:'../escape',project:'some.json'}],
    [{id:'con',project:'some.json'}],
    [{id:'same',project:'one.json'},{id:'same',project:'two.json'}],
    [{id:'one',project:'one.json',shell:'unexpected command'}],
  ]) {
    await f.save(jobs);
    await assert.rejects(runBatch(f.options),/ids must|Unknown job field/);
    await assert.rejects(access(f.out),{code:'ENOENT'});
  }
}));

test('existing private files and a live batch lock are preserved',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);
  await mkdir(f.out);const privateFile=join(f.out,'private.txt');await writeFile(privateFile,'keep');
  await assert.rejects(runBatch(f.options),/empty output directory/);
  assert.equal(await readFile(privateFile,'utf8'),'keep');
  await rm(privateFile);
  await runBatch(f.options);
  await assert.rejects(runBatch(f.options),/use --resume/);
  const state=await readFile(join(f.out,'batch-state.json'),'utf8');
  await writeFile(join(f.out,'.batch.lock'),'live fixture lock');
  await assert.rejects(runBatch({...f.options,resume:true}),/Batch is locked/);
  assert.equal(await readFile(join(f.out,'batch-state.json'),'utf8'),state);
  assert.equal(await readFile(join(f.out,'.batch.lock'),'utf8'),'live fixture lock');
}));

test('review requires identity and notes, escapes gallery text, and rejects another manifest on resume',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);await runBatch(f.options);
  await assert.rejects(reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'',note:''}),/review requires/);
  const reviewed=await reviewBatch({repo,out:f.out,id:'portrait',decision:'changes',by:'test',note:'<script id="injected">bad</script>'});
  assert.equal(reviewed.status,'changes_requested');
  const html=await readFile(join(f.out,'index.html'),'utf8');
  assert.equal(html.includes('<script id="injected">'),false);assert.ok(html.includes('&lt;script'));
  const other=join(f.dir,'other.json');await cp(f.manifest,other);
  await assert.rejects(runBatch({...f.options,manifest:other,resume:true}),/same source checkout and manifest/);
}));

test('standalone CLI works from a different directory with paths containing spaces and returns partial failure',()=>fixture(async f=>{
  const cli=join(repo,'skills/parallax-banner-maker/scripts/banner-batch.mjs');
  const doctor=await exec(process.execPath,[cli,'doctor','--repo',repo],{cwd:f.dir});
  assert.equal(JSON.parse(doctor.stdout).ok,true);
  await writeFile(join(f.dir,'poster.jpg'),'pending');
  await f.save([{id:'pending',input:'poster.jpg'}]);
  await assert.rejects(exec(process.execPath,[cli,'batch','--repo',repo,'--manifest',f.manifest,'--out',f.out],{cwd:f.dir}),error=>error.code===1&&error.stdout.includes('needs_preparation'));
  await assert.rejects(runCli(['batch','--out',f.out,'--unexpected','value']),/Unknown or repeated/);
  await assert.rejects(loadEngine(f.dir),/ENOENT/);
}));

test('portable skill package has one root, supporting resources and no private runtime files',()=>fixture(async f=>{
  const zipFile=await packageSkill(join(f.dir,'parallax-banner-maker.zip')),entries=unzipSync(await readFile(zipFile)),paths=Object.keys(entries);
  for(const file of ['SKILL.md','agents/openai.yaml','scripts/banner-batch.mjs','scripts/check-preview.mjs','references/artwork.md','references/batch.md','references/production.md','references/acceptance.md','assets/batch.example.json','assets/preserve-plan.example.json','LICENSE'])assert.ok(entries['parallax-banner-maker/'+file],file);
  assert.ok(paths.every(file=>file.startsWith('parallax-banner-maker/')));
  assert.equal(paths.some(file=>/node_modules|batch-state|\.env|outputs\/|\.git\//.test(file)),false);
}));

test('resuming an interrupted checkpoint retains not-yet-visited successful results and reviews',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);await runBatch(f.options);
  await reviewBatch({repo,out:f.out,id:'portrait',decision:'approved',by:'test',note:'Fixture approval'});
  const stateFile=join(f.out,'batch-state.json'),state=JSON.parse(await readFile(stateFile,'utf8'));
  state.jobs=[{id:'portrait',status:'running',cached:state.jobs[0]}];
  await writeFile(stateFile,json(state));
  const resumed=await runBatch({...f.options,resume:true});
  assert.equal(resumed.jobs[0].reused,true);assert.equal(resumed.jobs[0].status,'approved');
}));

test('a symlink in output parents cannot redirect a job outside the batch',()=>fixture(async f=>{
  await f.project('portrait');await f.save([{id:'portrait',project:'portrait/project.json'}]);await runBatch(f.options);
  const external=join(f.dir,'outside-output');await mkdir(external);
  await symlink(external,join(f.out,'themes/redirect'),process.platform==='win32'?'junction':'dir');
  await f.save([{id:'portrait',project:'portrait/project.json'},{id:'redirect',project:'portrait/project.json'}]);
  const state=await runBatch({...f.options,resume:true});
  assert.equal(state.jobs[0].reused,true);assert.equal(state.jobs[1].status,'failed');
  assert.match(state.jobs[1].error,/without symlinks/);assert.deepEqual(await readdir(external),[]);
}));
