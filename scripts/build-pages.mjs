import {mkdir,cp,writeFile} from 'node:fs/promises';
const target='tmp/pages';
await mkdir(target,{recursive:true});
for(const path of ['index.html','demo.js','demo.css','assets','dist','examples']){
  await cp(path,`${target}/${path}`,{recursive:true});
}
await writeFile(`${target}/.nojekyll`,'');
console.log('Prepared static demos only; work, logs and local artifacts are excluded.');
