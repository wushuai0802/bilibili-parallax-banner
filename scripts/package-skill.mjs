import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
import {fileList} from './lib/files.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function packageSkill(out=join(root,'outputs/parallax-banner-maker.zip')) {
  const skill='parallax-banner-maker',source=join(root,'skills',skill),entries={};
  for(const file of await fileList(source)) {
    if(/(^|\/)(node_modules|\.git|\.env)(\/|$)/.test(file)||/\.(log|zip)$/i.test(file))throw new Error('Unexpected private or generated skill file: '+file);
    entries[skill+'/'+file]=new Uint8Array(await readFile(join(source,file)));
  }
  entries[skill+'/LICENSE']=new Uint8Array(await readFile(join(root,'LICENSE')));
  const output=resolve(out);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,zipSync(entries,{level:6,mtime:new Date('2020-01-01T00:00:00Z')}));
  return output;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await packageSkill(process.argv[2]));
