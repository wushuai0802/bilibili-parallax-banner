import {readFile,realpath,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {localFile,fileList,inside,json,readJson} from './files.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=data=>createHash('sha256').update(data).digest('hex');
export async function buildFingerprint(projectPath,project,options) {
  const inputs=[['project',sha(await readFile(projectPath))]],base=dirname(projectPath),sources=new Set();
  for(const variant of Object.values(project.variants))for(const layer of variant.config.layers)sources.add(await localFile(base,layer.source.src));
  if(project.preserve)sources.add(await localFile(base,project.preserve.reference));
  for(const file of [...sources].sort())inputs.push([file,sha(await readFile(file))]);
  for(const directory of ['src','scripts/lib','templates','dist'])for(const file of await fileList(join(root,directory)))inputs.push([directory+'/'+file,sha(await readFile(join(root,directory,file)))]);
  for(const file of ['package-lock.json','scripts/validate-assets.mjs','scripts/validate-theme.mjs','examples/ubits/index.html','examples/ubits/site.js','examples/ubits/site.css'])inputs.push([file,sha(await readFile(join(root,file)))]);
  return sha(json({inputs,proofs:options.proofs!==false,gif:!!options.gif,ubits:!!options.ubits}));
}
export async function outputHashes(directory,files) {
  return Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(join(directory,file)))])));
}
export async function cachedBuild(output,fingerprint) {
  try {
    const root=await realpath(output),info=await readJson(join(root,'build-info.json')),cache=await readJson(join(root,'artifacts/build-cache.json'));
    if(cache.inputFingerprint!==fingerprint||!cache.outputHashes||!Array.isArray(info.files)||!info.files.includes('theme.json')||!info.files.includes('artifacts/report.json')||info.files.some(file=>!Object.hasOwn(cache.outputHashes,file)))return null;
    for(const [name,hash] of Object.entries(cache.outputHashes)){
      const file=join(root,name),actual=await realpath(file);
      if(!inside(root,actual)||(await lstat(file)).isSymbolicLink()||sha(await readFile(file))!==hash)return null;
    }
    const report=await readJson(join(root,'artifacts/report.json'));
    if(!report.ok)return null;
    return {ok:true,reused:true,output:root,theme:await readJson(join(root,'theme.json')),report};
  }catch{return null;}
}
