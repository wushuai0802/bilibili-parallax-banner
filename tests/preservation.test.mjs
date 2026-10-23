import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
import {unzipSync,strFromU8} from 'fflate';
import {preparePreservedProject,verifyPreservation} from '../scripts/lib/preservation.mjs';
import {normalizeProject} from '../scripts/lib/project.mjs';
import {buildTheme} from '../scripts/lib/build-theme.mjs';
import {runBatch,loadEngine} from '../skills/parallax-banner-maker/scripts/banner-batch.mjs';

const json=value=>JSON.stringify(value,null,2)+'\n';
async function fixture(action){
  await mkdir('tmp',{recursive:true});
  const dir=await mkdtemp(resolve('tmp/preserved-')),projectDir=join(dir,'project'),out=join(dir,'output');
  const svg=body=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200">'+body+'</svg>');
  const save=async(name,body)=>sharp(svg(body)).png().toFile(join(dir,name));
  await save('original.png','<rect width="800" height="200" fill="#153b60"/><text x="24" y="60" fill="white" font-size="32">KEEP ALL WORDS</text><text x="35" y="130" fill="#ffe600" font-size="25">LOGO · 2026</text><rect x="480" y="145" width="180" height="55" fill="#66513c"/><rect x="525" y="60" width="70" height="105" fill="#d62f53"/><circle cx="560" cy="42" r="19" fill="#ffdf9d"/><path d="M0 177 L160 191 L230 200 H0Z M700 183 L800 155 V200 H700Z" fill="#333"/>');
  await save('fill.png','<rect width="800" height="200" fill="#153b60"/>');
  await save('person-mask.png','<rect width="800" height="200" fill="black"/><rect x="520" y="18" width="85" height="150" fill="white"/>');
  await save('support-mask.png','<rect width="800" height="200" fill="black"/><rect x="480" y="140" width="180" height="60" fill="white"/>');
  await save('front-mask.png','<rect width="800" height="200" fill="black"/><path d="M0 177 L160 191 L230 200 H0Z M700 183 L800 155 V200 H700Z" fill="white"/>');
  const plan={version:1,name:'preserved-test',original:'original.png',fill:'fill.png',
    artwork:{author:'Test fixture',source:'Original generated fixture',license:'MIT'},
    planes:[{id:'midground',role:'subject',masks:[{src:'person-mask.png',channel:'luma'},{src:'support-mask.png',channel:'luma'}],regions:[{id:'head',rect:[540,22,40,40]}],offset:[8,0]},
      {id:'foreground',role:'foreground',masks:[{src:'front-mask.png',channel:'luma'}],offset:[20,0]}]};
  const planPath=join(dir,'plan.json');await writeFile(planPath,json(plan));
  try{await action({dir,projectDir,out,plan,planPath,savePlan:()=>writeFile(planPath,json(plan))});}
  finally{await rm(dir,{recursive:true,force:true});}
}

test('registered layers preserve every source pixel and bind the person to support ground',()=>fixture(async f=>{
  await preparePreservedProject(f.planPath,f.projectDir);
  const project=JSON.parse(await readFile(join(f.projectDir,'project.json'),'utf8'));
  const result=await verifyPreservation(normalizeProject(project),f.projectDir);
  assert.ok(result.rows.every(row=>row.changedPixels===0));
  const {data,info}=await sharp(join(f.projectDir,'source/midground.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const [x,y] of [[560,42],[520,175]])assert.equal(data[(y*info.width+x)*4+3],255);
  assert.deepEqual(project.variants.desktop.canvas,[800,200]);
  assert.equal(project.variants.mobile.layers.midground.runtime.offset[0],4);
}));

test('content guard rejects deleted text, hidden layers and compact rearrangements',()=>fixture(async f=>{
  await preparePreservedProject(f.planPath,f.projectDir);
  const project=JSON.parse(await readFile(join(f.projectDir,'project.json'),'utf8'));
  const hidden=structuredClone(project);hidden.variants.mobile.layers.midground.runtime.opacity=0;
  await assert.rejects(verifyPreservation(normalizeProject(hidden),f.projectDir),/forbids crop/);
  const moved=structuredClone(project);moved.variants.mobile.layers.midground.layout={fit:'fill',trim:false,box:[.1,0,.9,1]};
  await assert.rejects(verifyPreservation(normalizeProject(moved),f.projectDir),/forbids crop/);
  const autoLayout=structuredClone(project);delete autoLayout.layers[1].layout.box;
  await assert.rejects(verifyPreservation(normalizeProject(autoLayout),f.projectDir),/forbids crop/);
  const background=join(f.projectDir,'source/background.png');
  const {data,info}=await sharp(background).raw().toBuffer({resolveWithObject:true});
  for(let y=30;y<65;y++)for(let x=20;x<330;x++){const i=(y*info.width+x)*4;data[i]=0;data[i+1]=0;data[i+2]=0;}
  await sharp(data,{raw:info}).png().toFile(join(f.projectDir,'source/changed.png'));
  project.layers[0].src='source/changed.png';
  await assert.rejects(verifyPreservation(normalizeProject(project),f.projectDir),/source pixels differ/);
}));

test('misregistered masks are rejected before creating a project',()=>fixture(async f=>{
  await sharp({create:{width:400,height:100,channels:3,background:'white'}}).png().toFile(join(f.dir,'bad-mask.png'));
  f.plan.planes[0].masks=[{src:'bad-mask.png',channel:'luma'}];await f.savePlan();
  await assert.rejects(preparePreservedProject(f.planPath,f.projectDir),/dimensions must match/);
  await assert.rejects(stat(f.projectDir),{code:'ENOENT'});
}));

test('reusing an uncleaned original as the fill plate is rejected to prevent double silhouettes',()=>fixture(async f=>{
  f.plan.fill='original.png';await f.savePlan();
  await assert.rejects(preparePreservedProject(f.planPath,f.projectDir),/duplicate silhouettes/);
  await assert.rejects(stat(f.projectDir),{code:'ENOENT'});
}));

test('quick output retains checks, creates a lean website ZIP and offline original comparison',()=>fixture(async f=>{
  await preparePreservedProject(f.planPath,f.projectDir);
  const result=await buildTheme(join(f.projectDir,'project.json'),f.out,{proofs:false,ubits:true});
  assert.equal(result.ok,true);assert.equal(result.report.checks,120);
  assert.ok(result.report.preservation.rows.every(row=>row.changedPixels===0));
  assert.equal(result.report.proofs.length,0);
  const site=unzipSync(await readFile(join(f.out,'artifacts/website.zip')));
  assert.ok(site['theme.json']);assert.ok(site['engine.min.js']);assert.ok(site['embed.html']);
  assert.equal(Object.keys(site).some(file=>file.startsWith('artifacts/')||file.startsWith('source/')),false);
  assert.equal(strFromU8(site['README.md']).includes('artifacts/offline.html'),false);
  const preview=await readFile(join(f.out,'artifacts/ubits-offline.html'),'utf8');
  assert.ok(preview.includes('original-compare'));assert.ok(preview.includes('data:image/png;base64,'));
  assert.equal(preview.includes("fetch('./theme/theme.json')"),false);
  const poster=await sharp(await readFile(join(f.out,'desktop',result.theme.variants.desktop.config.poster))).removeAlpha().raw().toBuffer();
  const reference=await sharp(join(f.dir,'original.png')).removeAlpha().raw().toBuffer();
  let difference=0,faceDifference=0,faceSamples=0;
  for(let i=0;i<poster.length;i++)difference+=Math.abs(poster[i]-reference[i]);
  for(let y=22;y<62;y++)for(let x=540;x<580;x++)for(let c=0;c<3;c++){
    const i=(y*800+x)*3+c;faceDifference+=Math.abs(poster[i]-reference[i]);faceSamples++;
  }
  assert.ok(difference/poster.length<4,'Exported poster changed original layout');
  assert.ok(faceDifference/faceSamples<8,'The exported person moved or was stretched');
}));

test('verified cache reuses unchanged files and rejects a corrupt preview or changed original',()=>fixture(async f=>{
  await preparePreservedProject(f.planPath,f.projectDir);const input=join(f.projectDir,'project.json');
  const options={proofs:false,ubits:true,reuse:true};
  await buildTheme(input,f.out,options);
  const file=join(f.out,'artifacts/ubits-offline.html'),before=(await stat(file)).mtimeMs;
  const cached=await buildTheme(input,f.out,options);
  assert.equal(cached.reused,true);assert.equal((await stat(file)).mtimeMs,before);
  await writeFile(file,'corrupt');
  assert.equal((await buildTheme(input,f.out,options)).reused,false);
  const reference=join(f.projectDir,'source/original.png');
  const {data,info}=await sharp(reference).raw().toBuffer({resolveWithObject:true});
  data[0]^=255;await sharp(data,{raw:info}).png().toFile(join(f.projectDir,'source/revised.png'));
  const project=JSON.parse(await readFile(input,'utf8'));project.preserve.reference='source/revised.png';await writeFile(input,json(project));
  await assert.rejects(buildTheme(input,f.out,options),/Original content changed/);
}));

test('batch build profiles invalidate cached results and expose correct artifact links',()=>fixture(async f=>{
  await preparePreservedProject(f.planPath,f.projectDir);
  const manifest=join(f.dir,'batch.json'),out=join(f.dir,'batch-out');
  await writeFile(manifest,json({version:1,jobs:[{id:'poster',project:'project/project.json'}]}));
  const options={repo:resolve('.'),manifest,out,quick:true,ubits:true};
  const first=await runBatch(options);
  assert.equal(first.jobs[0].status,'needs_review');assert.equal(first.jobs[0].proofs,false);
  assert.equal(first.jobs[0].websitePackage,'artifacts/website.zip');
  assert.equal((await runBatch({...options,resume:true})).jobs[0].reused,true);
  const final=await runBatch({...options,quick:false,resume:true});
  assert.notEqual(final.jobs[0].directory,first.jobs[0].directory);
  assert.equal(final.jobs[0].proofs,true);
  const caps=(await loadEngine(resolve('.'))).capabilities;
  assert.equal(caps.preservation,1);assert.equal(caps.websitePackage,1);
}));
