#!/usr/bin/env node
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {loadEngine} from './banner-batch.mjs';

const options={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==='--full'){options.full=true;continue;}
  if(!['--repo','--preview','--theme','--out','--channel'].includes(key)||!process.argv[i+1])throw new Error('Use --repo SOURCE --preview FILE --theme THEME.json --out QA [--channel chrome|chromium] [--full]');
  options[key.slice(2)]=process.argv[++i];
}
if(!options.preview||!options.theme||!options.out)throw new Error('preview, theme and out are required');
const engine=await loadEngine(options.repo),require=createRequire(join(engine.root,'package.json'));
const {chromium}=require('@playwright/test');
const theme=JSON.parse(await readFile(resolve(options.theme),'utf8')),output=resolve(options.out);
await mkdir(output,{recursive:true});
const started=performance.now(),errors=[],network=[],results=[];
const browser=await chromium.launch({headless:true,...((options.channel??'chrome')==='chromium'?{}:{channel:options.channel??'chrome'})});
try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await page.goto(pathToFileURL(resolve(options.preview)).href);
  await page.waitForFunction(()=>window.ubitsPreview?.controller?.state==='ready');
  for(const width of (options.full?[390,768,1024,1280,1440,1920]:[390,1280,1920])){
    await page.setViewportSize({width,height:900});
    for(const expanded of [false,true]){
      const state=await page.locator('#panel-toggle').getAttribute('aria-expanded');
      if(state!==String(expanded))await page.locator('#panel-toggle').click();
      await page.waitForFunction(()=>{
        const root=document.querySelector('.lpb-ubits-visual'),c=window.ubitsPreview?.controller;
        return c?.state==='ready'&&c.variant===(root.clientWidth<=c.theme.breakpoint?'mobile':'desktop')&&Math.abs(c.banner.width-root.clientWidth)<1;
      });
      const variant=await page.evaluate(()=>ubitsPreview.controller.variant);
      for(const progress of [-1,0,1]){
        await page.evaluate(p=>{ubitsPreview.setMode('pointer');ubitsPreview.controller.banner.setProgress(p);},progress);
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        const result=await page.locator('.lpb-ubits-visual').evaluate((root,definition)=>{
          const box=root.getBoundingClientRect();
          const controls=[...root.parentElement.querySelectorAll('.ub-banner-nav,.ub-dots')].map(element=>element.getBoundingClientRect());
          const regions=definition.protectedRegions.map(region=>{
            const image=root.querySelector('[data-layer-id="'+region.layerId+'"] img').getBoundingClientRect();
            const x=image.left+region.rect[0]/definition.config.baseWidth*image.width;
            const y=image.top+region.rect[1]/definition.config.baseHeight*image.height;
            const right=x+region.rect[2]/definition.config.baseWidth*image.width;
            const bottom=y+region.rect[3]/definition.config.baseHeight*image.height;
            return {id:region.id,safe:x>=box.left+3&&right<=box.right-3&&y>=box.top+3&&bottom<=box.bottom-3,
              overlaps:controls.some(c=>x<c.right&&right>c.left&&y<c.bottom&&bottom>c.top)};
          });
          const layers=[...root.querySelectorAll('[data-layer-id]')].map(layer=>{
            const image=layer.querySelector('img'),matrix=new DOMMatrix(getComputedStyle(image).transform);
            return {id:layer.dataset.layerId,x:matrix.m41,y:matrix.m42,loaded:image.complete&&image.naturalWidth>0};
          });
          return {slotWidth:box.width,slotHeight:box.height,ratioError:Math.abs(box.width/4-box.height),regions,layers,
            stages:root.querySelectorAll('.lpb__stage').length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
        },theme.variants[variant]);
        assert.ok(result.ratioError<.5);
        assert.ok(result.regions.every(r=>r.safe&&!r.overlaps),JSON.stringify({width,expanded,progress,result}));
        assert.ok(result.layers.every(layer=>layer.loaded));assert.equal(result.stages,1);assert.equal(result.overflow,false);
        results.push({width,expanded,variant,progress,...result});
        if(width===1280)await page.locator('.ub-home-banner-section').screenshot({path:join(output,'banner-'+(expanded?'expanded':'closed')+'-'+(progress+1)+'.png')});
      }
      if(width===390&&!expanded)await page.screenshot({path:join(output,'mobile.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:1280,height:900});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.waitForFunction(()=>ubitsPreview.controller?.state==='ready');
  await page.locator('#ub-top-motion-toggle').uncheck();
  await page.waitForFunction(()=>ubitsPreview.controller.mode==='still'&&ubitsPreview.controller.banner.progress===0);
  await page.locator('.ub-banner-nav-next').click();
  await page.waitForFunction(()=>!document.querySelector('.lpb-ubits-visual').hasAttribute('data-ubits-active'));
  await page.locator('.ub-banner-nav-prev').click();
  await page.waitForFunction(()=>ubitsPreview.controller?.state==='ready');
  let originalComparison=false;
  if(await page.locator('#original-compare').count()){
    await page.locator('#original-compare').click();
    await page.waitForFunction(()=>!document.querySelector('img[alt="原图完整内容对照"]').hidden);
    await page.locator('.ub-home-banner-section').screenshot({path:join(output,'original-reference.png')});
    await page.locator('#original-compare').click();originalComparison=true;
  }
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone=await mobile.newPage();
  phone.on('pageerror',error=>errors.push(error.message));
  phone.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
  await phone.goto(pathToFileURL(resolve(options.preview)).href);
  await phone.waitForFunction(()=>window.ubitsPreview?.controller?.state==='ready');
  await phone.waitForFunction(()=>ubitsPreview.controller.mode==='auto'&&Math.abs(ubitsPreview.controller.banner.progress)>.005);
  await phone.emulateMedia({reducedMotion:'reduce'});
  await phone.waitForFunction(()=>ubitsPreview.controller.mode==='still');
  await mobile.close();
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  const report={ok:true,revision:theme.revision,elapsedMs:performance.now()-started,layoutCases:results.length,
    checks:{motionToggle:true,staticFallback:true,touchAutoplay:true,reducedMotion:true,originalComparison},results,errors,externalRequests:network,
    scope:'Chrome layout and motion checks; inspect saved extreme-position screenshots for seams and grounding. Not physical-device or production-site acceptance.'};
  await writeFile(join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:true,layoutCases:results.length,originalComparison,elapsedMs:report.elapsedMs},null,2));
}finally{await browser.close();}
