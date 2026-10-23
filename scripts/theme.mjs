import {mkdir,cp,writeFile} from 'node:fs/promises';
import {resolve,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJson,json} from './lib/files.mjs';
import {normalizeProject} from './lib/project.mjs';
import {buildTheme} from './lib/build-theme.mjs';
import {validateTheme} from './validate-theme.mjs';

export async function run(args) {
  const [command,...rest]=args,flags={},positionals=[];
  for(let index=0;index<rest.length;index++) {
    const value=rest[index];
    if(['--out','--name','--preset'].includes(value)) {
      if(!rest[index+1]||rest[index+1].startsWith('--'))throw new Error(`${value} requires a value`);
      flags[value.slice(2)]=rest[++index];
    } else if(['--gif','--no-proofs','--overwrite'].includes(value))flags[value.slice(2)]=true;
    else if(value.startsWith('--'))throw new Error(`Unknown option: ${value}`);
    else positionals.push(value);
  }
  if(positionals.length>1)throw new Error('Use one project or theme path');
  if(command==='init') {
    if(!positionals[0])throw new Error('Usage: npm run theme:init -- <new-directory> [--name theme-name] [--preset 4x1]');
    if(flags.preset!==undefined&&flags.preset!=='4x1')throw new Error('Supported preset: 4x1; omit --preset for the full-width default');
    const destination=resolve(positionals[0]),template=fileURLToPath(new URL(flags.preset==='4x1'?'../templates/banner-4x1/':'../templates/theme-project/',import.meta.url));
    const project=await readJson(join(template,'project.json'));
    const suggested=basename(destination).toLowerCase().replace(/[^a-z0-9-]/g,'-');
    project.name=flags.name??(/^[a-z]/.test(suggested)?suggested:'new-theme');
    normalizeProject(project);
    await mkdir(destination,{recursive:false});
    await cp(template,destination,{recursive:true});
    await cp(fileURLToPath(new URL('../schemas/',import.meta.url)),join(destination,'schemas'),{recursive:true});
    project.$schema='./schemas/project.schema.json';
    await writeFile(join(destination,'project.json'),json(project));
    console.log(`Created ${destination}. Replace source images and mark their important regions, then run theme:build.`);
    return {ok:true,output:destination};
  }
  if(command==='build') {
    const result=await buildTheme(positionals[0]??'templates/theme-project/project.json',flags.out,{proofs:!flags['no-proofs'],gif:flags.gif,overwrite:flags.overwrite});
    for(const warning of result.report.warnings)console.warn(`WARN ${warning}`);
    for(const error of result.report.errors.slice(0,20))console.error(`ERROR ${error}`);
    console.log(`${result.ok?'PASS':'FAIL'} / ${result.report.checks} checks / ${result.output}`);
    console.log(`Preview: ${join(result.output,'index.html')}\nReport: ${join(result.output,'artifacts/report.json')}\nPackage: ${join(result.output,'artifacts/theme.zip')}`);
    return result;
  }
  if(command==='check') {
    const result=await validateTheme(positionals[0]??'templates/theme/theme.json');
    console.table(result.rows);
    for(const warning of result.warnings)console.warn(`WARN ${warning}`);
    for(const error of result.errors.slice(0,20))console.error(`ERROR ${error}`);
    console.log(`${result.ok?'PASS':'FAIL'} / ${result.checks} checks`);
    return result;
  }
  throw new Error('Commands: init <directory>, build <project.json> [--out directory] [--gif], check <theme.json>');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const result=await run(process.argv.slice(2));process.exitCode=result.ok?0:1;}
  catch(error){console.error(error.message);process.exitCode=1;}
}
