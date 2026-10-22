import {realpath,readFile,mkdir,readdir,writeFile,rename,copyFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,join,sep} from 'node:path';
import {createHash} from 'node:crypto';

export const digest = data => createHash('sha256').update(data).digest('hex').slice(0,12);
export const json = value => JSON.stringify(value,null,2)+'\n';
export const scriptJson = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export const xml = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function inside(root,path) {
  const rel=relative(resolve(root),resolve(path));
  return rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);
}
export async function localFile(directory,path) {
  if(typeof path!=='string'||!path.trim()||isAbsolute(path)||/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path))throw new TypeError('Sources must be local relative paths');
  const base=await realpath(directory),file=await realpath(resolve(base,path));
  if(!inside(base,file))throw new Error('Source must stay inside its project directory');
  return file;
}
export async function put(directory,path,data) {
  const file=resolve(directory,path);
  if(!inside(directory,file))throw new Error('Generated path escaped its output directory');
  await mkdir(dirname(file),{recursive:true});await writeFile(file,data);
}
export async function fileList(directory,prefix='') {
  const files=[];
  for(const entry of await readdir(join(directory,prefix),{withFileTypes:true})) {
    const path=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())throw new Error('Generated output must not contain symbolic links');
    if(entry.isDirectory())files.push(...await fileList(directory,path));else files.push(path);
  }
  return files.sort();
}
export async function publishFiles(stage,output,paths) {
  await mkdir(output,{recursive:true});
  for(const path of paths.filter(path=>path!=='theme.json')) {
    const target=resolve(output,path);
    if(!inside(output,target))throw new Error('Invalid generated output path');
    await mkdir(dirname(target),{recursive:true});await copyFile(join(stage,path),target);
  }
  // Publish the index last so it never points at a half-written set of assets.
  const temp=join(output,'.theme-pending.json');
  await copyFile(join(stage,'theme.json'),temp);await rename(temp,join(output,'theme.json'));
}
export const readJson = async path => JSON.parse(await readFile(path,'utf8'));
