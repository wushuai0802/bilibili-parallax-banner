import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {layoutScale,layerState} from '../../src/model.js';
import {protectedBounds} from '../../src/layout.js';
import {localFile,xml} from './files.mjs';

export async function sceneLayers(config,manifest) {
  return Promise.all(config.layers.map(async layer=>({...layer,input:await readFile(await localFile(dirname(resolve(manifest)),layer.src))})));
}

export async function renderScene(config,layers,width,height,progress=0,guides) {
  width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
  const composites=[];
  for(const layer of layers) {
    const scale=layoutScale(config,layer,width,height);
    const state=layerState(layer,progress*config.interaction.strength,layer.fit==='contain'?scale:height/config.baseHeight);
    if(!state.opacity)continue;
    const baseWidth=config.baseWidth*scale*layer.scale,baseHeight=config.baseHeight*scale*layer.scale;
    const position=layer.fit==='contain'?layer.position:[.5,.5];
    const cx=(width-baseWidth)*position[0]+baseWidth/2+state.x,cy=(height-baseHeight)*position[1]+baseHeight/2+state.y;
    const w=Math.max(1,Math.round(baseWidth*state.scale)),h=Math.max(1,Math.round(baseHeight*state.scale));
    if(w*h>40_000_000)throw new Error('Rendered layer exceeds 40 megapixels');
    let image=sharp(layer.input).resize(w,h).toColourspace('srgb').ensureAlpha();
    if(state.blur>.3)image=image.blur(Math.min(1000,state.blur*state.scale));
    if(state.rotate%360)image=image.rotate(state.rotate,{background:{r:0,g:0,b:0,alpha:0}});
    const decoded=await image.raw().toBuffer({resolveWithObject:true});
    if(state.opacity<1)for(let index=3;index<decoded.data.length;index+=4)decoded.data[index]=Math.round(decoded.data[index]*state.opacity);
    const x=Math.round(cx-decoded.info.width/2),y=Math.round(cy-decoded.info.height/2);
    const left=Math.max(0,-x),top=Math.max(0,-y),cw=Math.min(decoded.info.width-left,width-Math.max(0,x)),ch=Math.min(decoded.info.height-top,height-Math.max(0,y));
    if(cw<=0||ch<=0)continue;
    const input=await sharp(decoded.data,{raw:{width:decoded.info.width,height:decoded.info.height,channels:4}}).extract({left,top,width:cw,height:ch}).png().toBuffer();
    composites.push({input,left:Math.max(0,x),top:Math.max(0,y)});
  }
  let overlay=config.taper?'<defs><linearGradient id="taper" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100" fill="url(#taper)"/>':'';
  if(guides) {
    for(const zone of guides.textZones??[]) {
      const [x,y,w,h]=zone.rect;
      overlay+=`<rect x="${x*width}" y="${y*height}" width="${w*width}" height="${h*height}" fill="#00bcd4" fill-opacity=".15" stroke="#00bcd4"/><text x="${x*width+3}" y="${y*height+12}" fill="#c9f1f4" font-size="10">${xml(zone.id)}</text>`;
    }
    for(const region of guides.protectedRegions??[]) {
      const bounds=protectedBounds(config,config.layers.find(layer=>layer.id===region.layerId),region.rect,width,height,progress);
      overlay+=`<rect x="${bounds.left}" y="${bounds.top}" width="${bounds.right-bounds.left}" height="${bounds.bottom-bounds.top}" fill="none" stroke="#ffe08a" stroke-width="1.5"/><text x="${bounds.left+2}" y="${Math.max(10,bounds.top-3)}" fill="#ffe08a" font-size="10">${xml(region.id)}</text>`;
    }
  }
  if(overlay)composites.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${overlay}</svg>`),left:0,top:0});
  return sharp({create:{width,height,channels:4,background:config.background}}).composite(composites).png().toBuffer();
}
