import sharp from 'sharp';
import {mkdir,readFile} from 'node:fs/promises';
import {normalizeConfig,alignedScale,layerState} from '../src/model.js';

const folder='examples/frieren/assets';
const config=normalizeConfig(JSON.parse(await readFile(`${folder}/banner.json`,'utf8')));
const width=1280,height=190,frames=48,outWidth=800,outHeight=119;
const shared=alignedScale(config,width,height);
const layers=[];
for(const layer of config.layers){
  const input=await readFile(`${folder}/${layer.src}`);
  const info=await sharp(input).metadata();
  const w=Math.round(info.width/config.pixelRatio*shared*layer.scale);
  const h=Math.round(info.height/config.pixelRatio*shared*layer.scale);
  const image=await sharp(input).resize(w,h).ensureAlpha().raw().toBuffer();
  layers.push({...layer,image,width:w,height:h});
}
const chrome=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="top" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="left"><stop stop-color="#010e1d" stop-opacity=".58"/><stop offset=".48" stop-color="#010e1d" stop-opacity="0"/></linearGradient></defs><rect width="${width}" height="100" fill="url(#top)"/><rect width="${width}" height="${height}" fill="url(#left)"/><text x="48" y="65" fill="#d4eaf4" font-family="Georgia" font-size="11" letter-spacing="3">BEYOND JOURNEY'S END</text><text x="48" y="112" fill="white" font-family="Microsoft YaHei, sans-serif" font-size="40">葬送的芙莉莲</text><text x="48" y="144" fill="#c5dfe9" font-family="sans-serif" font-size="12">FRIEREN · LAYERED PARALLAX PREVIEW</text></svg>`);
const pages=[];
for(let i=0;i<frames;i++){
  const progress=Math.sin(i/frames*2*Math.PI)*.85;
  const composites=[];
  for(const layer of layers){
    const state=layerState(layer,progress,height/config.baseHeight);
    const x=Math.round((width-layer.width)/2+state.x),y=Math.round((height-layer.height)/2+state.y);
    const left=Math.max(0,-x),top=Math.max(0,-y);
    const w=Math.min(layer.width-left,width-Math.max(0,x)),h=Math.min(layer.height-top,height-Math.max(0,y));
    const input=await sharp(layer.image,{raw:{width:layer.width,height:layer.height,channels:4}}).extract({left,top,width:w,height:h}).png().toBuffer();
    composites.push({input,left:Math.max(0,x),top:Math.max(0,y)});
  }
  composites.push({input:chrome,left:0,top:0});
  const composed=await sharp({create:{width,height,channels:4,background:config.background}}).composite(composites).png().toBuffer();
  const frame=await sharp(composed).resize(outWidth,outHeight).ensureAlpha().raw().toBuffer();
  pages.push(frame);
}
await mkdir('docs/images',{recursive:true});
const file='docs/images/frieren-parallax.gif';
await sharp(Buffer.concat(pages),{raw:{width:outWidth,height:outHeight*frames,channels:4,pageHeight:outHeight}})
  .gif({loop:0,delay:125,colours:128,dither:.3,effort:7}).toFile(file);
const metadata=await sharp(file,{animated:true}).metadata();
if(metadata.pages!==frames||metadata.loop!==0)throw new Error('Animated showcase verification failed');
console.log(JSON.stringify({file,frames:metadata.pages,pageHeight:metadata.pageHeight,bytes:(await readFile(file)).length}));
