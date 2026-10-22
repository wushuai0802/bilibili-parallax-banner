import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {normalizeConfig} from '../src/model.js';
import {bannerHeight,protectedBounds} from '../src/layout.js';
import {normalizeTheme} from '../src/theme-model.js';
import {validateManifest} from './validate-assets.mjs';

const samples=[-1,-.55,0,.55,1];
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function rectangle(value,width,height,label) {
  if(!Array.isArray(value)||value.length!==4||!value.every(finite))throw new TypeError(`${label} must be [x, y, width, height]`);
  const [x,y,w,h]=value;
  if(x<0||y<0||w<=0||h<=0||x+w>width||y+h>height)throw new TypeError(`${label} must stay inside ${width}x${height}`);
  return value;
}

function regions(entries,label,check,required=false) {
  if(!Array.isArray(entries)||(required&&!entries.length))throw new TypeError(`${label} must be ${required?'a nonempty':'an'} array`);
  const ids=new Set();
  return entries.map(entry=>{
    if(!entry||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id))throw new TypeError(`${label} requires unique nonempty ids`);
    ids.add(entry.id);check(entry);return entry;
  });
}

async function localManifest(directory,path) {
  if(typeof path!=='string'||!path.trim()||isAbsolute(path)||/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path))throw new TypeError('manifest must be a local relative path');
  const actual=await realpath(resolve(directory,path)),rel=relative(directory,actual);
  if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('Manifest must stay inside the theme directory');
  return actual;
}

export async function validateTheme(themePath) {
  const file=resolve(themePath),directory=await realpath(dirname(file));
  const theme=JSON.parse(await readFile(file,'utf8'));
  const errors=[],warnings=[],rows=[];
  let bytes=0,checks=0;
  if(!theme||theme.version!==1)throw new TypeError('Unsupported theme contract version');
  try {normalizeTheme(theme);}catch(error){errors.push(error.message);}
  if(typeof theme.name!=='string'||!theme.name.trim())errors.push('Theme requires a name');
  for(const key of ['author','source','license'])if(typeof theme.artwork?.[key]!=='string'||!theme.artwork[key].trim())errors.push(`artwork.${key} must be recorded`);
  const breakpoint=theme.breakpoint??767,margin=theme.minimumMargin??4;
  if(!Number.isInteger(breakpoint)||breakpoint<1||breakpoint>9999)throw new TypeError('breakpoint must be an integer in [1, 9999]');
  if(!finite(margin)||margin<4||margin>1000)throw new TypeError('minimumMargin must be in [4, 1000]');
  for(const key of Object.keys(theme.variants??{}))if(!['desktop','mobile'].includes(key))errors.push(`Unsupported variant: ${key}`);

  for(const name of ['desktop','mobile']) {
    const before=errors.length,startChecks=checks;
    try {
      const variant=theme.variants?.[name];
      if(!variant)throw new TypeError(`Missing ${name} variant`);
      if(!Array.isArray(variant.viewports)||!variant.viewports.length||variant.viewports.some(width=>!Number.isInteger(width)||width<1||width>10000||(name==='mobile'?width>breakpoint:width<=breakpoint)))throw new TypeError('viewports must be positive integers on the correct side of breakpoint');
      const manifest=await localManifest(directory,variant.manifest);
      const config=normalizeConfig(JSON.parse(await readFile(manifest,'utf8')));
      if(variant.config&&!isDeepStrictEqual(normalizeConfig(variant.config),config))errors.push(`${name}: Inline config differs from its immutable manifest`);
      if(config.mode!=='aligned')throw new TypeError('Paired image themes require aligned manifests');
      if(!config.poster)throw new TypeError('Each variant requires a matching poster');
      const protectedRegions=regions(variant.protectedRegions,'protectedRegions',entry=>{
        if(!config.layers.some(layer=>layer.id===entry.layerId))throw new TypeError(`Unknown protected layer: ${entry.layerId}`);
        rectangle(entry.rect,config.baseWidth,config.baseHeight,entry.id);
      },true);
      const textZones=regions(variant.textZones,'textZones',entry=>rectangle(entry.rect,1,1,entry.id));
      const assets=await validateManifest(manifest);
      bytes+=assets.bytes;errors.push(...assets.errors.map(error=>`${name}: ${error}`));warnings.push(...assets.warnings.map(warning=>`${name}: ${warning}`));
      const layerRows=assets.rows.slice(0,config.layers.length);
      if(layerRows[0]?.transparent!==false)errors.push(`${name}: Background must be opaque even when a poster is supplied`);
      for(const row of layerRows.slice(1))if(row.transparent!==true)errors.push(`${name}: Overlay ${row.id} requires actual transparent pixels`);
      const expected=`${config.baseWidth*config.pixelRatio}x${config.baseHeight*config.pixelRatio}`;
      const poster=assets.rows.findLast(row=>row.id==='poster');
      if(poster?.dimensions!==expected||poster?.transparent!==false)errors.push(`${name}: Poster must be opaque and match ${expected}`);
      for(const width of new Set(variant.viewports)) {
        const height=bannerHeight(config,width);
        for(const progress of samples)for(const region of protectedRegions) {
          checks++;
          const layer=config.layers.find(item=>item.id===region.layerId);
          const bounds=protectedBounds(config,layer,region.rect,width,height,progress);
          const label=`${name}: ${width}px/progress ${progress}/${region.id}`;
          if(bounds.left<margin-1e-7||bounds.right>width-margin+1e-7||bounds.top<margin-1e-7||bounds.bottom>height-margin+1e-7)errors.push(`${label} leaves the safe viewport`);
          for(const zone of textZones) {
            const [x,y,w,h]=zone.rect;
            if(bounds.right>x*width-margin&&bounds.left<(x+w)*width+margin&&bounds.bottom>y*height-margin&&bounds.top<(y+h)*height+margin)errors.push(`${label} overlaps text zone ${zone.id}`);
          }
        }
      }
      rows.push({variant:name,canvas:expected,assets:assets.rows.length,viewports:new Set(variant.viewports).size,regions:protectedRegions.length,checks:checks-startChecks,ok:errors.length===before});
    } catch(error) {
      errors.push(`${name}: ${error.message}`);rows.push({variant:name,ok:false});
    }
  }
  return {ok:errors.length===0,bytes,checks,rows,errors,warnings};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=await validateTheme(process.argv[2]??'templates/theme/theme.json');
    console.table(result.rows);
    for(const warning of result.warnings)console.warn(`WARN ${warning}`);
    for(const error of result.errors.slice(0,20))console.error(`ERROR ${error}`);
    if(result.errors.length>20)console.error(`${result.errors.length-20} further errors; adjust the composition and recheck.`);
    console.log(`${result.ok?'PASS':'FAIL'} / ${result.checks} composition checks / ${(result.bytes/1024).toFixed(1)} KiB`);
    process.exitCode=result.ok?0:1;
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
