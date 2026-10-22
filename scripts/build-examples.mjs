import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {buildTheme} from './lib/build-theme.mjs';
import {readJson,inside} from './lib/files.mjs';
import {normalizeConfig} from '../src/model.js';
import {bannerHeight} from '../src/layout.js';
import {sceneLayers,renderScene} from './lib/render.mjs';

export async function buildExamples(options={}) {
  const catalog=await readJson('themes/catalog.json');
  for(const job of catalog.projects) {
    const result=await buildTheme(job.project,job.output,{overwrite:true,gif:job.gif||options.gif});
    if(!result.ok)throw new Error(`Theme ${result.theme.name} failed: ${result.report.errors.join('; ')}`);
    for(const [type,path] of Object.entries(job.publish??{})) {
      const target=resolve(path);
      if(!inside(process.cwd(),target))throw new Error('Catalog publication must stay inside the repository');
      await mkdir(dirname(target),{recursive:true});
      if(type==='mobile') {
        const variant=result.theme.variants.mobile,config=normalizeConfig(variant.config),manifest=join(result.output,variant.manifest);
        await writeFile(target,await renderScene(config,await sceneLayers(config,manifest),390,bannerHeight(config,390),0));
      } else {
        const source=type==='gif'?'preview.gif':type==='offline'?'offline.html':null;
        if(!source)throw new Error(`Unknown catalog publication type: ${type}`);
        await copyFile(join(result.output,'artifacts',source),target);
      }
    }
    console.log(`Built ${result.theme.name}: ${result.report.checks} composition checks, ${result.output}`);
  }
}
