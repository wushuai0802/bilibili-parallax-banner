import sharp from 'sharp';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {localFile,readJson,json} from './files.mjs';
import {normalizeProject,defaultBox} from './project.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
const full=[0,0,1,1];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function pixels(file) {
  return sharp(await readFile(file),{limitInputPixels:40_000_000}).autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
}

// Check the whole source scene, including lettering, before resampling/encoding.
export async function verifyPreservation(project,directory) {
  if(!project.preserve)return null;
  const reference=await pixels(await localFile(directory,project.preserve.reference));
  const {width,height}=reference.info;
  for(let i=3;i<reference.data.length;i+=4)if(reference.data[i]!==255)throw new Error('Preservation reference must be opaque');
  const decoded=new Map(),rows=[];
  for(const [name,variant] of Object.entries(project.variants)) {
    const config=variant.config;
    if(Math.abs(config.baseWidth/config.baseHeight-width/height)>1e-9||config.height.aspectRatio!==width/height)throw new Error('Preservation requires the reference aspect ratio on both variants');
    const inputs=[];
    for(const layer of config.layers) {
      const layout=layer.source.layout;
      if(layout.fit!=='fill'||layout.trim||layout.crop||!same(defaultBox(project,name,layer),full)||layer.fit!=='contain'||layer.scale!==1||layer.rotate!==0||layer.blur!==0||layer.opacity!==1||!same(layer.initial,[0,0]))throw new Error('Preservation forbids crop, rearrangement, hidden layers and altered scale/opacity: '+name+'/'+layer.id);
      const path=await localFile(directory,layer.source.src);
      if(!decoded.has(path))decoded.set(path,await pixels(path));
      const source=decoded.get(path);
      if(source.info.width!==width||source.info.height!==height)throw new Error('Preservation source layers must share the complete reference canvas');
      inputs.push({input:source.data,raw:{width,height,channels:4},left:0,top:0});
    }
    const composite=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(inputs).raw().toBuffer();
    let changedPixels=0,maxDifference=0;
    for(let i=0;i<composite.length;i+=4) {
      let changed=false;
      for(let c=0;c<4;c++){const d=Math.abs(composite[i+c]-reference.data[i+c]);maxDifference=Math.max(maxDifference,d);if(d)changed=true;}
      if(changed)changedPixels++;
    }
    if(changedPixels)throw new Error('Original content changed in '+name+': '+changedPixels+' source pixels differ; restore text/objects/alignment before delivery');
    rows.push({variant:name,changedPixels,maxDifference});
  }
  return {kind:'whole-source-composite-equality',referenceSha256:sha(reference.data),width,height,rows,
    scope:'All text and objects match at rest before resizing and encoding; motion still requires seam/contact review.'};
}

// Merge a person, seat and contact ground into one registered moving plane.
export async function preparePreservedProject(planPath,destination) {
  const file=resolve(planPath),base=dirname(file),plan=await readJson(file),output=resolve(destination);
  if(plan.version!==1||!Array.isArray(plan.planes)||!plan.planes.length)throw new Error('Preservation plan needs version:1 and planes');
  if(typeof plan.name!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(plan.name))throw new Error('Invalid project name');
  for(const key of ['author','source','license'])if(!plan.artwork?.[key])throw new Error('Record artwork.'+key);
  const original=await pixels(await localFile(base,plan.original));
  const {width,height}=original.info;
  if(width!==height*4)throw new Error('Direct preservation expects an existing 4:1 poster; extend its canvas explicitly instead of cropping content');
  if(width>20000||height>4000)throw new Error('Poster exceeds supported source canvas limits');
  for(let i=3;i<original.data.length;i+=4)if(original.data[i]!==255)throw new Error('Original poster must be opaque');
  const fill=await sharp(await readFile(await localFile(base,plan.fill))).autoOrient().toColourspace('srgb').resize(width,height,{fit:'cover'}).ensureAlpha().raw().toBuffer();
  const planeData=[],union=new Uint8Array(width*height),ids=new Set();
  for(const plane of plan.planes) {
    if(typeof plane.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(plane.id)||plane.id==='background'||ids.has(plane.id))throw new Error('Planes need unique ids');
    ids.add(plane.id);
    if(!['subject','foreground','detail'].includes(plane.role)||!Array.isArray(plane.masks)||!plane.masks.length)throw new Error('Each plane needs a role and registered masks');
    if(plane.role==='subject'&&(!plane.regions||!plane.regions.length))throw new Error('Mark every important source region');
    const mask=new Uint8Array(width*height);
    for(const item of plane.masks) {
      if(!['alpha','luma'].includes(item.channel))throw new Error('Mask channel must be alpha or luma');
      const decoded=await pixels(await localFile(base,item.src));
      if(decoded.info.width!==width||decoded.info.height!==height)throw new Error('Mask dimensions must match the original; resizing a mask can misalign content');
      for(let p=0;p<mask.length;p++){
        const i=p*4,v=item.channel==='alpha'?decoded.data[i+3]:(decoded.data[i]+decoded.data[i+1]+decoded.data[i+2])/3;
        if(v>=128)mask[p]=255;
      }
    }
    const data=Buffer.alloc(original.data.length);
    let count=0;
    for(let p=0;p<mask.length;p++)if(mask[p]){const i=p*4;original.data.copy(data,i,i,i+3);data[i+3]=255;union[p]=255;count++;}
    if(!count||count===mask.length)throw new Error('A plane must have visible and transparent pixels');
    planeData.push({plane,data,count});
  }
  const background=Buffer.from(original.data);
  let repairedPixels=0;
  for(let p=0;p<union.length;p++)if(union[p]){
    const i=p*4;
    if(fill[i]!==original.data[i]||fill[i+1]!==original.data[i+1]||fill[i+2]!==original.data[i+2])repairedPixels++;
    fill.copy(background,i,i,i+3);background[i+3]=255;
  }
  if(!repairedPixels)throw new Error('The fill plate still equals the original inside moving regions; remove hidden subjects to avoid duplicate silhouettes');
  await mkdir(output,{recursive:false});await mkdir(join(output,'source'));
  const save=async(name,data)=>writeFile(join(output,'source',name),await sharp(data,{raw:{width,height,channels:4}}).png({compressionLevel:3}).toBuffer());
  await save('original.png',original.data);await save('background.png',background);
  const layers=[{id:'background',role:'background',src:'source/background.png',layout:{fit:'fill',trim:false,box:[0,0,1,1]},runtime:{fit:'contain',offset:[0,0],position:[.5,.5]}}];
  for(const {plane,data} of planeData) {
    await save(plane.id+'.png',data);
    layers.push({id:plane.id,role:plane.role,src:'source/'+plane.id+'.png',regions:plane.regions??[],
      layout:{fit:'fill',trim:false,box:[0,0,1,1]},runtime:{name:plane.name??plane.id,fit:'contain',position:[.5,.5],offset:plane.offset??[plane.role==='foreground'?20:8,0]}});
  }
  const mobileWidth=Math.min(width,1200);
  const mobileLayers=Object.fromEntries(layers.map(layer=>[layer.id,{runtime:{offset:layer.runtime.offset.map(value=>value*400/width)}}]));
  const project={version:1,name:plan.name,artwork:plan.artwork,preserve:{reference:'source/original.png'},
    background:plan.background??'#10131b',preview:{title:plan.preview?.title??plan.name,brand:plan.preview?.brand??plan.name,proofWidths:[362,758,1244]},
    layers,variants:{
      desktop:{canvas:[width,height],pixelRatio:1,height:{aspectRatio:4},interaction:{strength:1},textZones:[],
        viewports:[768,820,994,1024,1244,1280,1440,1638,1920,2560,3440,5120]},
      mobile:{canvas:[400,100],pixelRatio:mobileWidth/400,height:{aspectRatio:4},interaction:{strength:1},textZones:[],
        viewports:[280,320,362,375,390,412,430,600,657,740,758,767],layers:mobileLayers}},
    motion:{period:9000,fine:{mode:'pointer',amplitude:.85},coarse:{mode:'auto',amplitude:.65}}};
  await writeFile(join(output,'project.json'),json(project));
  const preservation=await verifyPreservation(normalizeProject(project),output);
  await writeFile(join(output,'preservation-plan.json'),json({version:1,sourceDimensions:[width,height],originalSha256:sha(original.data),
    policy:'Only hidden pixels covered by moving original-source planes are repaired. All layers keep original coordinates.',
    planes:planeData.map(({plane,count})=>({id:plane.id,masks:plane.masks,visiblePixels:count,offset:plane.offset??[plane.role==='foreground'?20:8,0]})),repairedPixels,preservation}));
  return {ok:true,output,project:join(output,'project.json')};
}
