import sharp from 'sharp';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {normalizeConfig,layoutScale,layerState} from '../src/model.js';

// Deterministic composition proofs, not browser screenshots.
const folder='examples/frieren/assets';
const themes={};
for(const [name,file] of [['desktop','banner'],['mobile','mobile']]) themes[name]=normalizeConfig(JSON.parse(await readFile(`${folder}/${file}.json`,'utf8')));
await mkdir('outputs/composition',{recursive:true});
const proofs=[];
for(const width of [320,390,768,1280,1920,3440]) {
  const mobile=width<=767,config=themes[mobile?'mobile':'desktop'];
  const height=Math.round(width<=config.height.breakpoint?config.height.mobile:Math.min(config.height.max,Math.max(config.height.min,width*config.height.ratio)));
  for(const progress of [-1,0,1]) {
    const composites=[];
    for(const layer of config.layers) {
      const image=await readFile(`${folder}/${layer.src}`),info=await sharp(image).metadata();
      const scale=layoutScale(config,layer,width,height);
      const w=Math.round(info.width/config.pixelRatio*scale*layer.scale),h=Math.round(info.height/config.pixelRatio*scale*layer.scale);
      const state=layerState(layer,progress*config.interaction.strength,layer.fit==='contain'?scale:height/config.baseHeight);
      const x=Math.round((width-w)*(layer.fit==='contain'?layer.position[0]:.5)+state.x);
      const y=Math.round((height-h)*(layer.fit==='contain'?layer.position[1]:.5)+state.y);
      const left=Math.max(0,-x),top=Math.max(0,-y),visibleWidth=Math.min(w-left,width-Math.max(0,x)),visibleHeight=Math.min(h-top,height-Math.max(0,y));
      if(visibleWidth<=0||visibleHeight<=0)continue;
      const input=await sharp(image).resize(w,h).extract({left,top,width:visibleWidth,height:visibleHeight}).png().toBuffer();
      composites.push({input,left:Math.max(0,x),top:Math.max(0,y)});
    }
    const font=mobile?Math.min(25,Math.max(21,width*.064)):Math.min(54,Math.max(28,width*.032));
    const x=mobile?18:Math.max(24,width*.04),titleY=mobile?51:height-49;
    const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="top" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".4"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="shade" x2="${mobile?0:1}" y2="${mobile?1:0}"><stop stop-color="#010e1d" stop-opacity=".5"/><stop offset=".58" stop-color="#010e1d" stop-opacity="0"/></linearGradient></defs><rect width="${width}" height="${mobile?60:100}" fill="url(#top)"/><rect width="${width}" height="${height}" fill="url(#shade)"/><text x="${x}" y="${mobile?20:titleY-font*1.4}" fill="#d4eaf4" font-family="Georgia" font-size="${mobile?8:11}" letter-spacing="2">BEYOND JOURNEY'S END</text><text x="${x}" y="${titleY}" fill="white" font-family="SimSun,serif" font-size="${font}">葬送的芙莉莲</text><text x="${x}" y="${mobile?73:height-28}" fill="#c5dfe9" font-family="Microsoft YaHei,sans-serif" font-size="${mobile?9:11}">水晶深处，旅途仍在继续。</text></svg>`);
    composites.push({input:overlay,left:0,top:0});
    const file=`outputs/composition/${width}-${progress+1}.png`;
    await sharp({create:{width,height,channels:4,background:config.background}}).composite(composites).png().toFile(file);
    proofs.push({width,height,progress,file});
  }
}
await copyFile('outputs/composition/390-1.png','docs/images/frieren-mobile.png');
const columns=[];
for(const width of [320,390,768,1280,1920,3440]) {
  const rows=[];
  for(const progress of [-1,0,1]) {
    const proof=proofs.find(value=>value.width===width&&value.progress===progress);
    const input=await sharp(proof.file).resize({width:780,height:240,fit:'contain',background:'#08131f'}).png().toBuffer();
    rows.push({input,left:0,top:(progress+1)*270+30});
    const caption=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="780" height="30"><text x="12" y="21" fill="#c9f1f4" font-family="sans-serif" font-size="15">${width} x ${proof.height} | progress ${progress}</text></svg>`);
    rows.push({input:caption,left:0,top:(progress+1)*270});
  }
  columns.push(await sharp({create:{width:780,height:810,channels:4,background:'#08131f'}}).composite(rows).png().toBuffer());
}
await sharp({create:{width:1560,height:2430,channels:4,background:'#08131f'}})
  .composite(columns.map((input,index)=>({input,left:index%2*780,top:Math.floor(index/2)*810}))).png().toFile('outputs/composition/contact-sheet.png');
await writeFile('outputs/composition/proofs.json',JSON.stringify({description:'Rendered from the runtime layout model; not browser screenshots.',proofs},null,2)+'\n');
console.log('Rendered six widths at three progress values and a contact sheet.');
