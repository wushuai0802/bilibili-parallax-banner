import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {put,scriptJson,xml} from './files.mjs';
import sharp from 'sharp';
const root=fileURLToPath(new URL('../../',import.meta.url));
export async function writeUbitsPreview(directory,theme,options={}) {
  if(Object.values(theme.variants).some(v=>v.config.height.aspectRatio!==4))throw new Error('UBits preview requires 4:1 on both variants');
  const inline=structuredClone(theme);
  for(const [name,variant] of Object.entries(inline.variants)){
    for(const layer of variant.config.layers)layer.src='data:image/webp;base64,'+(await readFile(join(directory,name,layer.src))).toString('base64');
    variant.config.poster='data:image/webp;base64,'+(await readFile(join(directory,name,variant.config.poster))).toString('base64');
  }
  const title=theme.preview?.title??theme.name;
  const css=(await Promise.all(['dist/banner.css','dist/ubits.css','examples/ubits/site.css'].map(file=>readFile(join(root,file),'utf8')))).join('\n');
  const engine=await readFile(join(root,'dist/ubits.min.js'),'utf8');
  let code=await readFile(join(root,'examples/ubits/site.js'),'utf8');
  const start=code.indexOf("  fetch('./theme/theme.json')"),end=code.indexOf("  window.addEventListener('pagehide'",start);
  if(start<0||end<0)throw new Error('UBits preview template startup changed; update its offline adapter');
  code=code.slice(0,start)+'  const theme=window.BANNER_THEME;\n  const poster=theme.variants.desktop.config.poster;\n  slides=[{title:'+scriptJson(title)+',poster,theme},{title:"原图静态海报",poster}];\n  show(0);\n'+code.slice(end);
  code=code.replace('  function measure() {','  function measure() {\n    if(window.BANNER_THEME){const name=host.clientWidth<=window.BANNER_THEME.breakpoint?"mobile":"desktop";host.style.setProperty("--art",\'url("\'+window.BANNER_THEME.variants[name].config.poster+\'")\');}');
  let html=await readFile(join(root,'examples/ubits/index.html'),'utf8');
  html=html.replace(/<link rel="stylesheet"[^>]*>/g,'').replace('</head>','<style>'+css+'</style></head>');
  html=html.replace(/远行者/g,()=>xml(title)).replace('href="../../"','href="#demo-detail"');
  html=html.replace('<a href="./theme/">查看标准主题预览</a>','');
  if(options.reference){
    const reference='data:image/png;base64,'+(await sharp(await readFile(options.reference)).autoOrient().png().toBuffer()).toString('base64');
    html=html.replace('<output id="measure"','<button type="button" id="original-compare" style="padding:8px 12px;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px">对照原图</button><output id="measure"');
    code+='\nconst originalView=document.createElement("img");originalView.src='+scriptJson(reference)+';originalView.alt="原图完整内容对照";originalView.hidden=true;originalView.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;pointer-events:none";document.getElementById("ub-home-banner").append(originalView);document.getElementById("original-compare").onclick=function(){originalView.hidden=!originalView.hidden;this.textContent=originalView.hidden?"对照原图":"返回动效";window.ubitsPreview.setMode(originalView.hidden?"default":"still");};\n';
  }
  html=html.replace('<script src="../../dist/ubits.min.js"></script>',()=>'<script>'+engine+'</script>');
  html=html.replace('<script src="./site.js"></script>',()=>'<script>window.BANNER_THEME='+scriptJson(inline)+';</script><script>'+code+'</script>');
  await put(directory,'artifacts/ubits-offline.html',html);
}
