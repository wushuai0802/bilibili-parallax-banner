import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function ready(page,variant) {
  const root=page.locator('#banner');
  if(variant)await expect(root).toHaveAttribute('data-theme-variant',variant);
  await expect(root).toHaveAttribute('data-theme-state','ready');
  await expect.poll(()=>page.evaluate(()=>{
    const controller=window.bannerPreview;
    return Math.abs(controller.banner.width-document.querySelector('#banner').clientWidth)<1;
  })).toBe(true);
}

for(const name of ['frieren','studio'])test(`${name} keeps subjects and real HTML titles separate at seven sizes`,async({page},testInfo)=>{
  const theme=JSON.parse(await readFile(`examples/${name}/theme.json`,'utf8'));
  await page.goto(`/examples/${name}/`);await ready(page);
  await page.getByRole('button',{name:'静态预览',exact:true}).click();
  for(const width of [280,320,390,767,768,1280,3440]) {
    await page.setViewportSize({width,height:900});
    const variant=width<=theme.breakpoint?'mobile':'desktop';await ready(page,variant);
    const result=await page.evaluate(({definition})=>{
      const root=document.querySelector('#banner'),banner=root.getBoundingClientRect(),title=root.querySelector('.scene-title').getBoundingClientRect();
      const heads=definition.protectedRegions.map(region=>{
        const image=root.querySelector(`[data-layer-id="${region.layerId}"] img`),box=image.getBoundingClientRect(),style=getComputedStyle(image),matrix=new DOMMatrix(style.transform);
        const w=parseFloat(style.width),h=parseFloat(style.height),cx=box.left+box.width/2,cy=box.top+box.height/2;
        const [x,y,rw,rh]=region.rect;
        const points=[[x,y],[x+rw,y],[x,y+rh],[x+rw,y+rh]].map(([px,py])=>{
          const dx=(px/definition.config.baseWidth-.5)*w,dy=(py/definition.config.baseHeight-.5)*h;
          return [cx+matrix.a*dx+matrix.c*dy,cy+matrix.b*dx+matrix.d*dy];
        });
        const rect={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
        return {id:region.id,inside:rect.left>=banner.left+3&&rect.right<=banner.right-3&&rect.top>=banner.top+3&&rect.bottom<=banner.bottom-3,
          titleOverlap:rect.left<title.right&&rect.right>title.left&&rect.top<title.bottom&&rect.bottom>title.top};
      });
      return {heads,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,stages:root.querySelectorAll('.lpb__stage').length};
    },{definition:theme.variants[variant]});
    expect(result.overflow).toBe(false);expect(result.stages).toBe(1);
    for(const head of result.heads){expect(head.inside,`${width}/${head.id}`).toBe(true);expect(head.titleOverlap,`${width}/${head.id}`).toBe(false);}
    if(width===390||width===1280) {
      const screenshot=await page.screenshot({path:testInfo.outputPath(`${name}-${width}.png`)});
      await testInfo.attach(`${name}-${width}`,{body:screenshot,contentType:'image/png'});
    }
  }
});

test('initial selection downloads only the active variant and reduced motion preserves user choice',async({page,isMobile})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/examples/studio/');await ready(page,isMobile?'mobile':'desktop');
  const inactive=isMobile?'desktop':'mobile';expect(requests.some(url=>url.includes(`/examples/studio/${inactive}/`))).toBe(false);
  await page.getByRole('button',{name:'自动演示',exact:true}).click();
  await expect.poll(()=>page.locator('[data-layer-id="subject"] img').evaluate(image=>new DOMMatrix(getComputedStyle(image).transform).m41)).not.toBe(0);
  await page.getByRole('button',{name:'静态预览',exact:true}).click();
  const root=page.locator('#banner');
  await expect(root).toHaveAttribute('data-theme-mode','still');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.getByRole('button',{name:'自动演示',exact:true})).toBeDisabled();
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.getByRole('button',{name:'自动演示',exact:true})).toBeEnabled();
  await expect(root).toHaveAttribute('data-theme-mode','still');await expect(root.locator('.lpb__layer:visible')).toHaveCount(3);
});

test('public theme loading can replace a scene without stale layers or losing static mode',async({page})=>{
  await page.goto('/examples/studio/');await ready(page);
  await page.getByRole('button',{name:'静态预览',exact:true}).click();
  await page.evaluate(()=>window.bannerPreview.setTheme('/examples/frieren/theme.json'));
  await ready(page);await expect(page.locator('#banner')).toHaveAttribute('data-theme-name','frieren');
  await expect(page.locator('#banner')).toHaveAttribute('data-theme-mode','still');await expect(page.locator('.lpb__stage')).toHaveCount(1);
  await page.evaluate(()=>window.bannerPreview.setTheme('/examples/studio/theme.json'));
  await ready(page);await expect(page.locator('#banner')).toHaveAttribute('data-theme-name','studio');
});

test('important-image failure leaves a poster and stops automatic motion',async({page})=>{
  await page.route('**/subject-*.webp',route=>route.abort());
  await page.goto('/examples/studio/');
  await expect(page.locator('#banner')).toHaveAttribute('data-theme-state','error');
  await expect(page.locator('.lpb__poster')).toBeVisible();await expect(page.locator('.lpb__layer')).toHaveCount(0);
  expect(await page.evaluate(()=>window.bannerPreview.frame)).toBe(0);
});

test('offline preview needs no remote scripts, manifests or images',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/examples/studio/artifacts/offline.html');await ready(page);
  expect(requests.filter(url=>url.startsWith('http')&&!url.endsWith('/artifacts/offline.html')&&!url.endsWith('/favicon.ico'))).toEqual([]);
});

test('real intersection changes stop and restore automatic frames',async({page})=>{
  await page.setViewportSize({width:390,height:300});
  await page.goto('/examples/studio/');await ready(page,'mobile');
  await page.getByRole('button',{name:'自动演示',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.bannerPreview.frame)).toBeGreaterThan(0);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>window.bannerPreview.banner.visible)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.bannerPreview.frame)).toBe(0);
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect.poll(()=>page.evaluate(()=>window.bannerPreview.frame)).toBeGreaterThan(0);
});

test('native Chromium touch drag takes over and resumes the auto policy',async({page,browserName,isMobile,context})=>{
  test.skip(browserName!=='chromium'||!isMobile,'Native touch dispatch is checked in the Chromium mobile project');
  await page.goto('/examples/studio/');await ready(page,'mobile');
  const session=await context.newCDPSession(page),box=await page.locator('#banner').boundingBox(),y=box.y+box.height*.6;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});
  await expect(page.locator('#banner')).toHaveAttribute('data-theme-mode','pointer');
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#banner')).toHaveAttribute('data-theme-mode','auto');
});
