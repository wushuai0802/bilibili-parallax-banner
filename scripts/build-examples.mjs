import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function buildExamples(){
  const dir='examples/frieren',assets=join(dir,'assets');
  const desktop=JSON.parse(await readFile(join(assets,'banner.json'),'utf8'));
  desktop.interaction={...desktop.interaction,touch:'drag'};
  desktop.layers.find(layer=>layer.id==='party').fit='contain';
  desktop.layers.find(layer=>layer.id==='party').position=[.5,1];
  const composition=JSON.parse(await readFile(join(dir,'composition.json'),'utf8'));
  const {width,height,pixelRatio,sourceCrop,characterWidth,cropLeft}=composition.mobile;
  await writeFile(join(assets,'banner.json'),JSON.stringify(desktop,null,2)+'\n');
  await sharp(join(assets,'01-background.webp')).resize(width,height,{fit:'cover'}).webp({quality:92}).toFile(join(assets,'mobile-background.webp'));
  const characters=await sharp(join(assets,'02-characters.webp')).extract(sourceCrop).resize({width:characterWidth}).png().toBuffer();
  const characterHeight=(await sharp(characters).metadata()).height;
  const contained=await sharp(characters).extract({left:cropLeft,top:0,width,height:characterHeight}).png().toBuffer();
  await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:contained,left:0,top:height-characterHeight}]).webp({quality:94,alphaQuality:100}).toFile(join(assets,'mobile-characters.webp'));
  const fg=await readFile(join(assets,'03-crystals.webp'));
  const left=await sharp(fg).extract({left:0,top:0,width:980,height:432}).resize({width:240}).png().toBuffer();
  const right=await sharp(fg).extract({left:2860,top:0,width:980,height:432}).resize({width:170}).png().toBuffer();
  const lh=(await sharp(left).metadata()).height,rh=(await sharp(right).metadata()).height;
  await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:left,left:0,top:height-lh},{input:right,left:width-170,top:height-rh}]).webp({quality:93,alphaQuality:100}).toFile(join(assets,'mobile-crystals.webp'));
  const mobile={version:1,mode:'aligned',baseWidth:width/pixelRatio,baseHeight:height/pixelRatio,pixelRatio,
    description:desktop.description,poster:'mobile.webp',background:desktop.background,
    height:{min:120,max:280,ratio:height/width,mobile:180,breakpoint:0},
    interaction:{enabled:true,touch:'drag',strength:.65,resetDuration:200},
    layers:[{id:'mobile-cavern',src:'mobile-background.webp',offset:[2,0],required:true},
      {id:'mobile-party',src:'mobile-characters.webp',fit:'contain',position:[.5,1],offset:[12,0],requireAlpha:true},
      {id:'mobile-crystals',src:'mobile-crystals.webp',offset:[20,2],requireAlpha:true}]};
  const composites=await Promise.all(mobile.layers.map(async l=>({input:await readFile(join(assets,l.src)),left:0,top:0})));
  await sharp({create:{width,height,channels:4,background:desktop.background}}).composite(composites).webp({quality:93}).toFile(join(assets,'mobile.webp'));
  await writeFile(join(assets,'mobile.json'),JSON.stringify(mobile,null,2)+'\n');
  const themes={desktop,mobile};
  await writeFile(join(dir,'theme.config.js'),`/* Generated from assets/banner.json and assets/mobile.json */\nwindow.FRIEREN_THEMES=${JSON.stringify(themes)};\nfor(const theme of Object.values(window.FRIEREN_THEMES)) theme.baseUrl=new URL('./assets/',document.currentScript.src).href;\n`);
  const body=(await readFile(join(dir,'body.html'),'utf8')).replaceAll('__REFERENCE__','./assets/reference-poster.jpg');
  const head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>芙莉莲 · 水晶之旅 Banner 预览</title>';
  await writeFile(join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><head>${head}<link rel="stylesheet" href="../../dist/banner.css"><link rel="stylesheet" href="./theme.css"><link rel="stylesheet" href="./mobile.css"></head><body>${body}<script src="../../dist/banner.min.js"></script><script src="./theme.config.js"></script><script src="./theme.js"></script></body></html>\n`);
  const files=new Set(['reference-poster.jpg',...Object.values(themes).flatMap(theme=>[theme.poster,theme.mobilePoster,...theme.layers.map(l=>l.src)]).filter(Boolean)]);
  const media={};
  for(const file of files) media[file]=`data:${file.endsWith('.jpg')?'image/jpeg':'image/webp'};base64,${(await readFile(join(assets,file))).toString('base64')}`;
  const css=(await readFile(join(dir,'theme.css'),'utf8'))+'\n'+(await readFile(join(dir,'mobile.css'),'utf8')),engineCss=await readFile('dist/banner.css','utf8');
  const boot=await readFile(join(dir,'theme.js'),'utf8'),engine=await readFile('dist/banner.min.js','utf8'),license=await readFile('LICENSE','utf8');
  const offlineBody=(await readFile(join(dir,'body.html'),'utf8')).replaceAll('__REFERENCE__',media['reference-poster.jpg']);
  const hydrate=`const media=${JSON.stringify(media)};window.FRIEREN_THEMES=${JSON.stringify(themes)};for(const theme of Object.values(window.FRIEREN_THEMES)){theme.poster=media[theme.poster];if(theme.mobilePoster)theme.mobilePoster=media[theme.mobilePoster];theme.layers=theme.layers.map(layer=>({...layer,src:media[layer.src]}));}`;
  await mkdir('outputs',{recursive:true});
  await writeFile('outputs/frieren-banner-preview.html',`<!doctype html><!-- Component license:\n${license}\n--><html lang="zh-CN"><head>${head}<style>${engineCss}\n${css}\n</style></head><body>${offlineBody}<script>${engine}</script><script>${hydrate}\n${boot}</script></body></html>`);
  console.log('Built desktop/mobile Frieren showcase and the offline HTML.');
}
