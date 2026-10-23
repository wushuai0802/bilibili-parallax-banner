#!/usr/bin/env node
// Local build orchestration. Image APIs and credentials belong to the host environment.
import {readFile,writeFile,readdir,mkdir,realpath,lstat,rename,unlink,open} from 'node:fs/promises';
import {resolve,dirname,relative,join,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

const self=fileURLToPath(import.meta.url);
const json=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inside=(root,file)=>{const rel=relative(root,file);return rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=value=>value.split('/').map(encodeURIComponent).join('/');

function assertKeys(value,allowed,label) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(label+' must be an object');
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error('Unknown '+label+' field: '+key);
}

async function exists(file) {
  try {await lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
}

async function regular(file) {
  const stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Expected a regular file: '+file);
  return file;
}

async function files(root,prefix='') {
  const stat=await lstat(join(root,prefix));
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Expected a directory without symlinks: '+join(root,prefix));
  const output=[];
  for(const entry of await readdir(join(root,prefix),{withFileTypes:true})) {
    const name=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw new Error('Symlink is not supported in build files: '+name);
    if(entry.isDirectory())output.push(...await files(root,name));
    else if(entry.isFile())output.push(name);
    else throw new Error('Unsupported build file: '+name);
  }
  return output.sort();
}

async function treeDigest(root) {
  const entries=[];
  for(const file of await files(root))entries.push([file,sha(await readFile(join(root,file)))]);
  return sha(json(entries));
}

async function atomic(file,value) {
  const pending=file+'.'+randomUUID()+'.tmp';
  try {await writeFile(pending,value,{flag:'wx'});await rename(pending,file);}
  finally {await unlink(pending).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}

async function locked(root,action) {
  const file=join(root,'.batch.lock');
  let handle;
  try {handle=await open(file,'wx');}
  catch(error){if(error.code==='EEXIST')throw new Error('Batch is locked. Read .batch.lock and confirm its process stopped before removing a stale lock.');throw error;}
  try {
    await handle.writeFile(json({pid:process.pid,host:hostname(),startedAt:new Date().toISOString()}));
    return await action();
  } finally {await handle.close();await unlink(file);}
}

export async function loadEngine(requested) {
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required');
  let root=requested?await realpath(resolve(requested)):null;
  if(!root) {
    for(const start of [process.cwd(),dirname(self)]) {
      for(let candidate=resolve(start);;) {
        try {if((await readJson(join(candidate,'package.json'))).name==='bilibili-parallax-banner'){root=candidate;break;}}
        catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code)&&!(error instanceof SyntaxError))throw error;}
        const parent=dirname(candidate);if(parent===candidate)break;candidate=parent;
      }
      if(root)break;
    }
  }
  if(!root)throw new Error('Source checkout not found. Pass --repo with the bilibili-parallax-banner source directory.');
  root=await realpath(root);
  const pkg=await readJson(join(root,'package.json'));
  const version=String(pkg.version??''),parts=version.split('.').map(Number);
  if(pkg.name!=='bilibili-parallax-banner'||parts[0]!==1||parts[1]<4||!Number.isInteger(parts[1]))throw new Error('Expected bilibili-parallax-banner 1.4.x or compatible 1.x source; inspect other contracts before use.');
  for(const file of ['scripts/lib/build-theme.mjs','scripts/lib/project.mjs','scripts/validate-theme.mjs','dist/banner.min.js','dist/banner.css'])await regular(join(root,file));
  let buildTheme,normalizeProject,validateTheme,localFile;
  try {
    [{buildTheme},{normalizeProject},{validateTheme},{localFile}]=await Promise.all([
      import(pathToFileURL(join(root,'scripts/lib/build-theme.mjs'))),
      import(pathToFileURL(join(root,'scripts/lib/project.mjs'))),
      import(pathToFileURL(join(root,'scripts/validate-theme.mjs'))),
      import(pathToFileURL(join(root,'scripts/lib/files.mjs'))),
    ]);
  } catch(error) {throw new Error('Cannot load production dependencies. Run npm ci --ignore-scripts in the selected checkout. '+error.message);}
  return {root,version,buildTheme,normalizeProject,validateTheme,localFile,
    warnings:version==='1.4.0'?[]:['future-version: '+version+' is outside the tested v1.4.0 baseline; inspect the selected source contract before production use.']};
}

async function engineDigest(engine) {
  const entries=[['batch-helper',sha(await readFile(self))]];
  for(const name of ['package.json','package-lock.json'])entries.push([name,sha(await readFile(join(engine.root,name)))]);
  for(const name of ['scripts','src','schemas','templates','dist'])entries.push([name,await treeDigest(join(engine.root,name))]);
  return sha(json(entries));
}

function validateManifest(manifest) {
  assertKeys(manifest,['version','jobs'],'manifest');
  if(manifest.version!==1||!Array.isArray(manifest.jobs)||!manifest.jobs.length)throw new Error('Manifest needs version:1 and a non-empty jobs array');
  const ids=new Set();
  for(const job of manifest.jobs) {
    assertKeys(job,['id','project','input','mode','brief'],'job');
    if(!slug(job.id)||ids.has(job.id))throw new Error('Job ids must be unique lowercase slugs and cannot be Windows device names');
    ids.add(job.id);
    if(job.project===undefined&&job.input===undefined)throw new Error(job.id+': project or input is required');
    for(const key of ['project','input','brief'])if(job[key]!==undefined&&(typeof job[key]!=='string'||!job[key].trim()))throw new Error(job.id+': '+key+' must be a non-empty string');
    if(job.mode!==undefined&&!['preserve','generate','static','layers'].includes(job.mode))throw new Error(job.id+': unsupported preparation mode');
  }
  return manifest;
}

async function sourceFingerprint(engine,job,base,engineHash) {
  const entries=[];
  if(job.input) {
    const input=await realpath(resolve(base,job.input));
    await regular(input);entries.push(['input',sha(await readFile(input))]);
  }
  let project;
  if(job.project) {
    project=await realpath(resolve(base,job.project));
    await regular(project);
    const raw=await readFile(project),normalized=engine.normalizeProject(JSON.parse(raw.toString('utf8')));
    entries.push(['project',sha(raw)]);
    const sources=new Set();
    for(const variant of Object.values(normalized.variants))for(const layer of variant.config.layers)sources.add(await engine.localFile(dirname(project),layer.source.src));
    for(const file of [...sources].sort()){await regular(file);entries.push([relative(dirname(project),file),sha(await readFile(file))]);}
  }
  return {fingerprint:sha(json({engineHash,job,entries})),project};
}

function outputFor(root,job) {
  if(!slug(job.id)||!hex(job.fingerprint))throw new Error('Invalid job checkpoint');
  const directory='themes/'+job.id+'/'+job.fingerprint.slice(0,16);
  if(job.directory!==directory)throw new Error('Unexpected job output path in checkpoint');
  return join(root,directory);
}

async function checkedOutput(root,job,create=false) {
  const output=outputFor(root,job);
  let parent=root;
  for(const part of ['themes',job.id]) {
    parent=join(parent,part);
    if(create)await mkdir(parent).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const stat=await lstat(parent);
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Job output parents must be directories without symlinks: '+parent);
  }
  if(await exists(output))await files(output);
  return output;
}

export function summary(state) {
  const counts={approved:0,needs_review:0,changes_requested:0,needs_preparation:0,failed:0,running:0};
  for(const job of state.jobs)counts[job.status]=(counts[job.status]??0)+1;
  return counts;
}

const statusLabels={approved:'已复核',needs_review:'待画面复核',changes_requested:'需要修改',needs_preparation:'待素材制作',failed:'制作失败',running:'正在处理'};

async function save(root,state) {
  state.updatedAt=new Date().toISOString();state.summary=summary(state);
  const cards=state.jobs.map(job=>{
    let links='',image='';
    if(job.directory&&hex(job.fingerprint)&&slug(job.id)) {
      outputFor(root,job);
      const prefix=href(job.directory);
      if(job.poster)image='<img alt="'+escape(job.id)+' 海报" src="'+prefix+'/'+href(job.poster)+'">';
      if(['approved','needs_review','changes_requested'].includes(job.status))links='<p><a href="'+prefix+'/index.html">网页预览</a> · <a href="'+prefix+'/artifacts/offline.html">离线预览</a> · <a href="'+prefix+'/artifacts/theme.zip">主题 ZIP</a> · <a href="'+prefix+'/artifacts/contact-sheet.png">构图图</a></p>';
    }
    const message=job.status==='needs_preparation'?'请先准备分层素材与制作工程，再继续导出。':job.error??job.message??'';
    const warnings=job.warnings?.length?'<details><summary>制作提示</summary><p>'+escape(job.warnings.join(' / '))+'</p></details>':'';
    return '<article>'+image+'<h2>'+escape(job.title??job.id)+'</h2><p class="status">'+escape(statusLabels[job.status]??job.status)+'</p>'+links+'<p>'+escape(message)+'</p>'+warnings+(job.review?'<p>复核：'+escape(job.review.by)+' · '+escape(job.review.note)+'</p>':'')+'</article>';
  }).join('\n');
  const counts=Object.entries(state.summary).filter(([,count])=>count>0).map(([status,count])=>escape(statusLabels[status]??status)+' '+count+' 项').join(' · ');
  const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Banner 批量制作</title><style>body{margin:24px auto;padding:0 20px;max-width:1280px;background:#0d1623;color:#e2ebf6;font:16px/1.6 system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}article{background:#182538;padding:16px;border-radius:12px;overflow-wrap:anywhere}img{width:100%;aspect-ratio:4/1;object-fit:contain;background:#07101c}a{color:#88d5ff}.status{font-weight:bold}</style><h1>Banner 批量制作</h1><p>'+counts+'</p><p>打开预览检查两端构图与动效，再让 AI 记录复核结果。源图或产物变化后需要重新复核。</p><main>'+cards+'</main></html>\n';
  await atomic(join(root,'batch-state.json'),json(state));
  await atomic(join(root,'index.html'),html);
}

async function ensureRoot(out) {
  const root=resolve(out);
  if(dirname(root)===root)throw new Error('Use a dedicated batch output directory');
  if(await exists(root)){const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Batch output must be a regular directory');}
  else await mkdir(root,{recursive:true});
  return await realpath(root);
}

async function readState(root) {
  await regular(join(root,'batch-state.json'));
  const state=await readJson(join(root,'batch-state.json'));
  if(state.version!==1||!Array.isArray(state.jobs)||typeof state.manifest!=='string'||typeof state.repo!=='string')throw new Error('Unsupported batch checkpoint');
  return state;
}

export async function runBatch(options) {
  if(!options.manifest||!options.out)throw new Error('batch requires --manifest and --out');
  const engine=await loadEngine(options.repo),manifestPath=await realpath(resolve(options.manifest));
  await regular(manifestPath);
  const manifest=validateManifest(await readJson(manifestPath)),base=dirname(manifestPath);
  const inputs=[manifestPath,...manifest.jobs.flatMap(job=>[job.project,job.input].filter(Boolean).map(path=>resolve(base,path)))];
  for(const file of inputs)if(inside(resolve(options.out),file))throw new Error('Batch output cannot contain its manifest or inputs');
  const root=await ensureRoot(options.out);
  for(const file of inputs) {
    const actual=await realpath(file).catch(error=>{if(error.code==='ENOENT')return file;throw error;});
    if(inside(root,actual))throw new Error('Batch output cannot contain its manifest or inputs');
  }
  return locked(root,async()=>{
    const stateFile=join(root,'batch-state.json'),hasState=await exists(stateFile);
    if(hasState&&!options.resume)throw new Error('Batch already exists; use --resume to preserve and reuse its results');
    if(!hasState&&(await readdir(root)).some(name=>name!=='.batch.lock'))throw new Error('A new batch needs an empty output directory');
    const previous=hasState?await readState(root):null;
    if(previous&&(previous.repo!==engine.root||previous.manifest!==manifestPath))throw new Error('Resume must use the same source checkout and manifest path; use a new output directory for a different batch');
    const old=new Map((previous?.jobs??[]).map(job=>[job.id,job.status==='running'&&job.cached?job.cached:job]));
    // Preserve not-yet-visited results across an interruption without presenting them as reverified.
    const state={version:1,repo:engine.root,generatorVersion:engine.version,manifest:manifestPath,startedAt:previous?.startedAt??new Date().toISOString(),warnings:engine.warnings,jobs:manifest.jobs.map(job=>({id:job.id,status:'running',...(old.has(job.id)?{cached:old.get(job.id)}:{})}))};
    const engineHash=await engineDigest(engine);
    await save(root,state);
    for(const [index,job] of manifest.jobs.entries()) {
      let row={id:job.id,status:'failed'};
      try {
        const {fingerprint,project}=await sourceFingerprint(engine,job,base,engineHash);
        row.fingerprint=fingerprint;
        if(!project)row={...row,status:'needs_preparation',message:'Prepare source layers and project.json with available image tools, then add project to this job and resume.'};
        else {
          row.directory='themes/'+job.id+'/'+fingerprint.slice(0,16);
          const output=await checkedOutput(root,row,true),cached=old.get(job.id);
          let reused=false;
          if(cached?.fingerprint===fingerprint&&cached.directory===row.directory&&['approved','needs_review','changes_requested'].includes(cached.status)) {
            try {
              if(cached.outputDigest===await treeDigest(output)&&(await engine.validateTheme(join(output,'theme.json'))).ok){row={...cached,reused:true};reused=true;}
            } catch {}
          }
          if(!reused) {
            const result=await engine.buildTheme(project,output);
            if(!result.ok) {
              row={...row,error:result.report.errors.join('; '),failedPreview:result.output};
            } else if(!(await engine.validateTheme(join(output,'theme.json'))).ok) {
              row={...row,error:'Published output did not pass independent theme validation'};
            } else {
              row={...row,status:'needs_review',reused:false,title:result.theme.preview?.title??result.theme.name,revision:result.theme.revision,checks:result.report.checks,warnings:result.report.warnings,
                poster:'desktop/'+result.theme.variants.desktop.config.poster,outputDigest:await treeDigest(output)};
            }
          }
        }
      } catch(error){row={...row,status:'failed',error:error.message};delete row.review;}
      state.jobs[index]=row;
      await save(root,state);
      if(options.onProgress)options.onProgress(row);
    }
    return state;
  });
}

export async function reviewBatch(options) {
  if(!options.out||!slug(options.id)||!['approved','changes'].includes(options.decision)||typeof options.by!=='string'||!options.by.trim()||typeof options.note!=='string'||!options.note.trim())throw new Error('review requires --out, --id, --decision approved|changes, --by and a concrete --note');
  const root=await ensureRoot(options.out),engine=await loadEngine(options.repo);
  return locked(root,async()=>{
    const state=await readState(root);
    if(state.repo!==engine.root)throw new Error('Review must use the batch source checkout');
    const manifest=validateManifest(await readJson(state.manifest)),source=manifest.jobs.find(job=>job.id===options.id),row=state.jobs.find(job=>job.id===options.id);
    if(!source||!row||!['approved','needs_review','changes_requested'].includes(row.status))throw new Error('Only a successfully exported current job can be reviewed');
    const {fingerprint}=await sourceFingerprint(engine,source,dirname(state.manifest),await engineDigest(engine));
    const output=await checkedOutput(root,row);
    if(fingerprint!==row.fingerprint||await treeDigest(output)!==row.outputDigest||!(await engine.validateTheme(join(output,'theme.json'))).ok)throw new Error('Inputs or output changed. Resume the batch before recording a new review.');
    row.status=options.decision==='approved'?'approved':'changes_requested';
    row.review={by:options.by.trim(),note:options.note.trim(),decision:row.status,at:new Date().toISOString(),fingerprint,outputDigest:row.outputDigest};
    await save(root,state);
    return row;
  });
}

export async function runCli(args) {
  const [command,...rest]=args;
  if(!command||command==='help'||command==='--help') {
    console.log('doctor --repo SOURCE\nbatch --repo SOURCE --manifest JOBS.json --out OUTPUT [--resume]\nreview --repo SOURCE --out OUTPUT --id JOB --decision approved|changes --by REVIEWER --note NOTES');
    return 0;
  }
  const allowed={doctor:['repo'],batch:['repo','manifest','out','resume'],review:['repo','out','id','decision','by','note']}[command];
  if(!allowed)throw new Error('Unknown command: '+command);
  const options={};
  for(let index=0;index<rest.length;index++) {
    const flag=rest[index],key=flag.startsWith('--')?flag.slice(2):'';
    if(!allowed.includes(key)||Object.hasOwn(options,key))throw new Error('Unknown or repeated option: '+flag);
    if(key==='resume')options.resume=true;
    else {if(rest[index+1]===undefined||rest[index+1].startsWith('--'))throw new Error(flag+' requires a value');options[key]=rest[++index];}
  }
  if(command==='doctor') {
    const engine=await loadEngine(options.repo);
    console.log(json({ok:true,repo:engine.root,node:process.versions.node,version:engine.version,warnings:engine.warnings,imageService:'Use the host image tools; this script makes no API calls.'}));
    return 0;
  }
  if(command==='review'){console.log(json(await reviewBatch(options)));return 0;}
  const state=await runBatch({...options,onProgress:row=>console.log(row.id+': '+row.status+(row.reused?' (reused)':''))});
  console.log(json({summary:state.summary,gallery:join(resolve(options.out),'index.html')}));
  return state.summary.failed||state.summary.needs_preparation?1:0;
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(self)) {
  try {process.exitCode=await runCli(process.argv.slice(2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
