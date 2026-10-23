import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('UBits keeps 4:1, safe subjects and working controls with the personal panel open and closed',async({page},testInfo)=>{
  const theme=JSON.parse(await readFile('examples/ubits/theme/theme.json','utf8'));
  await page.goto('/examples/ubits/');
  const surface=page.locator('.lpb-ubits-visual');
  await expect(surface).toHaveAttribute('data-ubits-active','true');
  await page.locator('#ub-top-motion-toggle').uncheck();
  for(const width of [390,768,1024,1280,1440,1920]) {
    await page.setViewportSize({width,height:900});
    for(const expanded of [true,false]) {
      await page.locator('#panel-toggle').click();
      await expect(page.locator('#panel-toggle')).toHaveAttribute('aria-expanded',String(expanded));
      const slotWidth=await page.locator('#ub-home-banner').evaluate(el=>el.clientWidth);
      const variant=slotWidth<=theme.breakpoint?'mobile':'desktop';
      await expect(surface).toHaveAttribute('data-theme-variant',variant);
      await expect(surface).toHaveAttribute('data-theme-state','ready');
      await expect.poll(()=>page.evaluate(()=>{
        const root=document.querySelector('.lpb-ubits-visual');
        return Math.abs(window.ubitsPreview.controller.banner.width-root.clientWidth)<1;
      })).toBe(true);
      const result=await surface.evaluate((root,definition)=>{
        const rect=root.getBoundingClientRect(),host=root.parentElement.getBoundingClientRect();
        const head=definition.protectedRegions[0],image=root.querySelector('[data-layer-id="subject"] img'),box=image.getBoundingClientRect();
        const x=box.left+head.rect[0]/definition.config.baseWidth*box.width,y=box.top+head.rect[1]/definition.config.baseHeight*box.height;
        const right=x+head.rect[2]/definition.config.baseWidth*box.width,bottom=y+head.rect[3]/definition.config.baseHeight*box.height;
        const controls=[...root.parentElement.querySelectorAll('.ub-banner-nav,.ub-dots')].map(el=>el.getBoundingClientRect());
        return {ratio:Math.abs(rect.width/4-rect.height),hostRatio:Math.abs(host.width/4-host.height),
          subjectSafe:x>=rect.left+3&&right<=rect.right-3&&y>=rect.top+3&&bottom<=rect.bottom-3,
          controlOverlap:controls.some(c=>x<c.right&&right>c.left&&y<c.bottom&&bottom>c.top),
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,stages:root.querySelectorAll('.lpb__stage').length};
      },theme.variants[variant]);
      expect(result.ratio).toBeLessThan(.5);expect(result.hostRatio).toBeLessThan(.5);
      expect(result.subjectSafe).toBe(true);expect(result.controlOverlap).toBe(false);
      expect(result.overflow).toBe(false);expect(result.stages).toBe(1);
      if((width===1280||width===390)&&expanded)await page.screenshot({path:testInfo.outputPath(`ubits-${width}-panel.png`)});
    }
  }
  const original=await page.locator('#ub-home-banner-link').getAttribute('href');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(surface).not.toHaveAttribute('data-ubits-active','true');
  await expect(page.locator('[data-slide="1"]')).toHaveAttribute('aria-current','true');
  await page.getByRole('button',{name:'上一页',exact:true}).click();
  await expect(surface).toHaveAttribute('data-ubits-active','true');
  expect(await page.locator('#ub-home-banner-link').getAttribute('href')).toBe(original);
  await expect(surface).toHaveAttribute('data-theme-mode','still');
});

test('UBits native touch switches the carousel once without activating its link',async({page,browserName,isMobile,context})=>{
  test.skip(browserName!=='chromium'||!isMobile,'Native touch dispatch is checked on Chromium mobile');
  await page.goto('/examples/ubits/');
  await expect(page.locator('.lpb-ubits-visual')).toHaveAttribute('data-ubits-active','true');
  await expect(page.locator('.lpb-ubits-visual')).toHaveAttribute('data-theme-mode','auto');
  const session=await context.newCDPSession(page),box=await page.locator('#ub-home-banner').boundingBox(),y=box.y+box.height/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.8,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.25,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('[data-slide="1"]')).toHaveAttribute('aria-current','true');
  expect(new URL(page.url()).hash).toBe('');
});
