import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {VERSION} from '../src/model.js';
import {fileList,json} from './lib/files.mjs';

const report=JSON.parse(await readFile('examples/ubits/theme/artifacts/report.json','utf8'));
if(!report.ok||report.generatorVersion!==VERSION)throw new Error('Build and validate the current version before packaging');
const files={};
for(const root of ['dist','docs','schemas','templates/banner-4x1','examples/ubits']) {
  for(const name of await fileList(root)) {
    if(root==='examples/ubits'&&name.startsWith('theme/artifacts/')&&!['theme/artifacts/offline.html','theme/artifacts/report.json','theme/artifacts/contact-sheet.png'].includes(name))continue;
    const path=`${root}/${name}`;
    files[path]=new Uint8Array(await readFile(path));
  }
}
for(const path of ['LICENSE','README.md','integrations/ubits/banner.js','integrations/ubits/banner.css'])files[path]=new Uint8Array(await readFile(path));
files['HANDOFF.md']=strToU8(`# UBits Banner ${VERSION}\n\nStart with docs/UBITS.md. Deployment uses dist/banner.css, dist/ubits.css, dist/ubits.min.js and a complete theme directory. The adapter includes its engine.\n\nLive integration preview: https://wushuai0802.github.io/bilibili-parallax-banner/examples/ubits/\nLocal site preview: serve this directory over HTTP, then open examples/ubits/.\nOffline 4:1 artwork preview: examples/ubits/theme/artifacts/offline.html.\n\nThis package is a website handoff, not a checkout of the authoring tool. Use the source repository or matching source release to run npm commands and edit integration source. The editable 4:1 artwork project is included in templates/banner-4x1/. Do not copy the preview site CSS into production.\n\nNo UBits account data, site screenshots or original site artwork is included.\n`);
files['bundle-info.json']=strToU8(json({version:VERSION,themeRevision:report.revision,compositionChecks:report.checks,files:Object.keys(files).sort()}));
const output=resolve(process.argv[2]??`outputs/ubits-banner-v${VERSION}.zip`);
await mkdir(dirname(output),{recursive:true});
await writeFile(output,zipSync(files,{level:6,mtime:new Date('2020-01-01T00:00:00Z')}));
console.log(`Packaged ${Object.keys(files).length} public handoff files: ${output}`);
