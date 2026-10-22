import sharp from 'sharp';
import {zipSync,strToU8} from 'fflate';
import {mkdir,mkdtemp,readFile,rm,access,realpath} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION,normalizeConfig} from '../../src/model.js';
import {bannerHeight} from '../../src/layout.js';
import {normalizeProject,defaultBox,rectangle} from './project.mjs';
import {localFile,readJson,digest,json,put,fileList,inside,publishFiles,xml} from './files.mjs';
import {renderScene,sceneLayers} from './render.mjs';
import {validateTheme} from '../validate-theme.mjs';
import {writePreview} from './preview.mjs';

function alphaBounds(data,width,height) {
  let left=width,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]) {
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
  }
  if(right<=left||bottom<=top)throw new Error('Source layer is completely transparent; omit unused layers instead');
  return [left,top,right-left,bottom-top];
}

async function exportLayer(layer,project,name,directory,output,cache,warnings) {
  const path=await localFile(directory,layer.source.src);
  if(inside(output,path))throw new Error('Output directory cannot contain source inputs');
  if(!cache.has(path)) {
    const original=await readFile(path),metadata=await sharp(original,{limitInputPixels:40_000_000}).metadata();
    if(metadata.format==='svg') {
      const tag=original.toString('utf8').match(/<svg\b[^>]*>/i)?.[0]??'';
      if(!/\swidth\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/i.test(tag)||!/\sheight\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/i.test(tag))throw new Error('Source SVG must declare explicit pixel width and height');
    }
    const decoded=await sharp(original,{limitInputPixels:40_000_000}).autoOrient().toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent=false;
    for(let index=3;index<decoded.data.length;index+=4)if(decoded.data[index]<255){transparent=true;break;}
    cache.set(path,{original,metadata,transparent,...decoded});
  }
  const source=cache.get(path),width=source.info.width,height=source.info.height;
  if(layer.source.role!=='background'&&!source.transparent)throw new Error(`Source overlay ${layer.id} needs real transparency; adding an empty output canvas does not remove its background`);
  const {layout,regions}=layer.source;
  for(const region of regions) {
    const [x,y,w,h]=rectangle(region.rect,region.id);
    if(x<0||y<0||x+w>width||y+h>height)throw new Error(`${layer.id}/${region.id} exceeds its upright source dimensions`);
  }
  let crop=layout.crop??(layout.trim?alphaBounds(source.data,width,height):[0,0,width,height]);
  if(!layout.crop&&layout.trim)for(const region of regions) {
    const [x,y,w,h]=region.rect,left=Math.min(crop[0],x),top=Math.min(crop[1],y);
    crop=[left,top,Math.max(crop[0]+crop[2],x+w)-left,Math.max(crop[1]+crop[3],y+h)-top];
  }
  const [cx,cy,cw,ch]=crop;
  const left=Math.floor(cx),top=Math.floor(cy),cropWidth=Math.ceil(cx+cw)-left,cropHeight=Math.ceil(cy+ch)-top;
  if(left<0||top<0||left+cropWidth>width||top+cropHeight>height)throw new Error(`Invalid source crop for ${layer.id}`);
  for(const region of regions)if(region.rect[0]<cx||region.rect[1]<cy||region.rect[0]+region.rect[2]>cx+cw||region.rect[1]+region.rect[3]>cy+ch)throw new Error(`Source crop removes protected region ${region.id}`);
  const config=project.variants[name].config,exportWidth=config.baseWidth*config.pixelRatio,exportHeight=config.baseHeight*config.pixelRatio;
  const [bx,by,bw,bh]=defaultBox(project,name,layer),boxWidth=bw*exportWidth,boxHeight=bh*exportHeight;
  const ratio=layout.fit==='cover'?Math.max(boxWidth/cropWidth,boxHeight/cropHeight):Math.min(boxWidth/cropWidth,boxHeight/cropHeight);
  const w=Math.max(1,Math.round(layout.fit==='fill'?boxWidth:cropWidth*ratio)),h=Math.max(1,Math.round(layout.fit==='fill'?boxHeight:cropHeight*ratio));
  if(w*h>40_000_000)throw new Error('A source placement exceeds 40 megapixels');
  const x=Math.round(bx*exportWidth+(boxWidth-w)*layout.anchor[0]),y=Math.round(by*exportHeight+(boxHeight-h)*layout.anchor[1]);
  if(source.metadata.format!=='svg'&&Math.max(w/cropWidth,h/cropHeight)>1.5)warnings.push(`${name}/${layer.id}: source enlarged more than 1.5x; check effective detail`);
  const identity=left===0&&top===0&&cropWidth===width&&cropHeight===height&&w===exportWidth&&h===exportHeight&&x===0&&y===0;
  let data;
  if(identity&&source.metadata.format==='webp'&&!source.metadata.orientation&&!source.metadata.icc)data=source.original;
  else {
    const resized=await sharp(source.data,{raw:{width,height,channels:4}}).extract({left,top,width:cropWidth,height:cropHeight}).resize(w,h,{fit:'fill'}).png().toBuffer();
    const cutX=Math.max(0,-x),cutY=Math.max(0,-y),visibleWidth=Math.min(w-cutX,exportWidth-Math.max(0,x)),visibleHeight=Math.min(h-cutY,exportHeight-Math.max(0,y));
    if(visibleWidth<=0||visibleHeight<=0)throw new Error(`Placement ${layer.id} is completely outside its output canvas`);
    const clipped=await sharp(resized).extract({left:cutX,top:cutY,width:visibleWidth,height:visibleHeight}).png().toBuffer();
    data=await sharp({create:{width:exportWidth,height:exportHeight,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
      .composite([{input:clipped,left:Math.max(0,x),top:Math.max(0,y)}]).webp({quality:92,alphaQuality:100}).toBuffer();
  }
  const protectedRegions=regions.map(region=>({id:`${layer.id}-${region.id}`,layerId:layer.id,rect:[
    (x+(region.rect[0]-left)*w/cropWidth)/config.pixelRatio,(y+(region.rect[1]-top)*h/cropHeight)/config.pixelRatio,
    region.rect[2]*w/cropWidth/config.pixelRatio,region.rect[3]*h/cropHeight/config.pixelRatio]}));
  return {data,protectedRegions};
}

async function proofs(theme,stage,options) {
  const widths=options.proofWidths??[320,390,768,1280,1920,3440],items=[];
  for(const width of widths) {
    const name=width<=theme.breakpoint?'mobile':'desktop',variant=theme.variants[name];
    const config=normalizeConfig(variant.config),layers=await sceneLayers(config,join(stage,variant.manifest));
    const height=bannerHeight(config,width);
    for(const progress of [-1,0,1]) {
      const input=await renderScene(config,layers,width,height,progress,variant);
      const file=`artifacts/proofs/${width}-${progress+1}.webp`;
      await put(stage,file,await sharp(input).webp({quality:85}).toBuffer());
      items.push({width,height,progress,file});
    }
  }
  const tileWidth=640,tileHeight=210,columns=2,rows=Math.ceil(items.length/columns),composites=[];
  for(const [index,item] of items.entries()) {
    const x=index%columns*tileWidth,y=Math.floor(index/columns)*tileHeight;
    const input=await sharp(await readFile(join(stage,item.file))).resize(tileWidth,tileHeight-26,{fit:'contain',background:'#08131f'}).png().toBuffer();
    composites.push({input,left:x,top:y+26});
    const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="26"><text x="8" y="18" fill="#c9f1f4" font-family="sans-serif" font-size="12">${item.width}px / progress ${item.progress} / source and text guides</text></svg>`);
    composites.push({input:label,left:x,top:y});
  }
  await put(stage,'artifacts/contact-sheet.png',await sharp({create:{width:tileWidth*columns,height:tileHeight*rows,channels:4,background:'#08131f'}}).composite(composites).png().toBuffer());
  return items;
}

async function animation(theme,stage) {
  const config=normalizeConfig(theme.variants.desktop.config),manifest=join(stage,theme.variants.desktop.manifest);
  const layers=await sceneLayers(config,manifest),width=1280,height=bannerHeight(config,width),outWidth=800,outHeight=Math.round(height/width*outWidth),frames=[];
  for(let index=0;index<48;index++) {
    const frame=await renderScene(config,layers,width,height,Math.sin(index/48*2*Math.PI)*theme.motion.fine.amplitude);
    frames.push(await sharp(frame).resize(outWidth,outHeight).ensureAlpha().raw().toBuffer());
  }
  return sharp(Buffer.concat(frames),{raw:{width:outWidth,height:outHeight*frames.length,channels:4,pageHeight:outHeight}}).gif({loop:0,delay:125,colours:128,dither:.3,effort:5}).toBuffer();
}

export async function buildTheme(projectPath,outputPath,options={}) {
  const input=resolve(projectPath),directory=dirname(input),project=normalizeProject(await readJson(input));
  const output=resolve(outputPath??join('outputs',project.name));
  if(inside(output,input))throw new Error('Output directory cannot contain the source project file');
  await mkdir(dirname(output),{recursive:true});
  const stage=await mkdtemp(join(dirname(output),'.theme-build-'));
  const warnings=[],cache=new Map(),theme={$schema:'schema/theme.schema.json',version:1,name:project.name,artwork:project.artwork,
    breakpoint:project.breakpoint,minimumMargin:project.minimumMargin,motion:project.motion,preview:project.preview??{},variants:{}};
  try {
    for(const name of ['desktop','mobile']) {
      const variant=project.variants[name],config={...variant.config,layers:[]},protectedRegions=[];
      for(const layer of variant.config.layers) {
        const result=await exportLayer(layer,project,name,directory,output,cache,warnings);
        const file=`${layer.id}-${digest(result.data)}.webp`;
        await put(stage,`${name}/${file}`,result.data);
        const {source,...runtime}=layer;
        config.layers.push({...runtime,src:file});protectedRegions.push(...result.protectedRegions);
      }
      const posterConfig=normalizeConfig(config),layers=await sceneLayers(posterConfig,join(stage,name,'banner.json'));
      // Freeze the scene at the design canvas; live static mode uses the same layers.
      const posterPng=await renderScene({...posterConfig,taper:false},layers,config.baseWidth*config.pixelRatio,config.baseHeight*config.pixelRatio,0);
      const poster=await sharp(posterPng).removeAlpha().webp({quality:92}).toBuffer();
      config.poster=`poster-${digest(poster)}.webp`;
      await put(stage,`${name}/${config.poster}`,poster);
      const manifest=`${name}/banner-${digest(json(config))}.json`;
      await put(stage,manifest,json(config));
      theme.variants[name]={manifest,config,viewports:variant.viewports,protectedRegions,textZones:variant.textZones};
    }
    theme.revision=digest(json(theme));
    await put(stage,'theme.json',json(theme));
    await put(stage,'schema/theme.schema.json',await readFile(fileURLToPath(new URL('../../schemas/theme.schema.json',import.meta.url))));
    const validation=await validateTheme(join(stage,'theme.json'));
    validation.warnings.push(...warnings);
    const proofItems=options.proofs===false?[]:await proofs(theme,stage,project.preview??{});
    await writePreview(stage,theme,{proofs:proofItems});
    const report={version:1,generatorVersion:VERSION,name:theme.name,revision:theme.revision,
      kind:'image-decode-and-layout-validation',visuals:'Model renders; browser screenshots are produced separately by browser tests.',...validation,proofs:proofItems};
    await put(stage,'artifacts/report.json',json(report));
    if(options.gif)await put(stage,'artifacts/preview.gif',await animation(theme,stage));
    await put(stage,'README.md',`# ${project.name}\n\nGenerated theme revision: ${theme.revision}. Component: ${VERSION}.\n\nWebsite: loadTheme(element, './theme.json'). Minimal host example: embed.html. Preview: index.html. Offline: artifacts/offline.html. Validation: artifacts/report.json.${proofItems.length?' Model proofs: artifacts/contact-sheet.png.':''}\n\nArtwork author: ${project.artwork.author}\nSource: ${project.artwork.source}\nArtwork license: ${project.artwork.license}\n\nThe component code is MIT; artwork uses the license above.\n`);
    const publicFiles=await fileList(stage);
    const zipFiles={};
    for(const file of publicFiles)if(!file.startsWith('artifacts/proofs/'))zipFiles[file]=new Uint8Array(await readFile(join(stage,file)));
    zipFiles['build-info.json']=strToU8(json({generatorVersion:VERSION,revision:theme.revision,files:publicFiles}));
    await put(stage,'artifacts/theme.zip',zipSync(zipFiles,{level:6,mtime:new Date('2020-01-01T00:00:00Z')}));
    const files=await fileList(stage);
    await put(stage,'build-info.json',json({generatorVersion:VERSION,revision:theme.revision,files}));
    if(!validation.ok) {
      const failed=join(output,'artifacts','failed',theme.revision);
      await publishFiles(stage,failed,await fileList(stage));
      return {ok:false,output:failed,theme,report};
    }
    let hasPrevious=false;
    try {await access(join(output,'build-info.json'));hasPrevious=true;}catch{}
    if(!hasPrevious&&!options.overwrite) {
      for(const file of files)try {await access(join(output,file));throw new Error(`Output contains an unowned file: ${file}; choose a new directory or explicitly use --overwrite`);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    await publishFiles(stage,output,await fileList(stage));
    return {ok:true,output,theme,report};
  } finally {
    const absolute=await realpath(stage);
    if(!inside(dirname(output),absolute)||absolute===resolve(dirname(output)))throw new Error('Refusing to remove an unexpected staging path');
    await rm(absolute,{recursive:true,force:true,maxRetries:5,retryDelay:50});
  }
}
