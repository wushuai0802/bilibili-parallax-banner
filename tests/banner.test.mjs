import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {ParallaxBanner,loadBanner} from '../src/banner.js';

function fixture({width=1200,top=300,reduced=false,fine=true,fail='',timeout=false,visualScale=1}={}) {
  const dom=new JSDOM('<div id="root"><strong>Host content</strong></div>',{url:'https://example.org/page',pretendToBeVisual:true,runScripts:'outside-only'});
  const win=dom.window, root=win.document.getElementById('root');
  let currentWidth=width, clock=0, id=0;
  const frames=new Map(), queries=new Map();
  win.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
  win.cancelAnimationFrame=id=>frames.delete(id);
  Object.defineProperty(win.performance,'now',{value:()=>clock});
  win.matchMedia=query=>{
    if (!queries.has(query)) {const value=new win.EventTarget();value.matches=query.includes('reduced-motion')?reduced:query.includes('max-width')?currentWidth<=Number(query.match(/\d+/)[0]):fine;queries.set(query,value);}
    return queries.get(query);
  };
  let observer;
  win.ResizeObserver=class {constructor(callback){observer=callback;} observe(){} disconnect(){}};
  Object.defineProperty(root,'clientWidth',{get:()=>currentWidth});
  root.getBoundingClientRect=()=>({left:80,top,right:80+currentWidth*visualScale,bottom:top+180,width:currentWidth*visualScale,height:180});
  const create=win.document.createElement.bind(win.document);
  win.document.createElement=tag=>{
    const element=create(tag);
    if(tag==='img') {
      Object.defineProperties(element,{naturalWidth:{value:3840},naturalHeight:{value:360},src:{
        get(){return this.getAttribute('src')??'';},
        set(value){this.setAttribute('src',value);if(!timeout)queueMicrotask(()=>this.dispatchEvent(new win.Event(value.includes(fail)&&fail?'error':'load')));}
      }});
    }
    return element;
  };
  const config={poster:'poster.webp',layers:[{id:'bg',src:'bg.svg',offset:[6,0]},{id:'fg',src:'fg.svg',offset:[64,12]}]};
  return {win,root,config,frames,queries,
    resize(width){currentWidth=width;observer();for(const [query,value] of queries){if(!query.includes('max-width'))continue;const next=width<=Number(query.match(/\d+/)[0]);if(next!==value.matches){value.matches=next;value.dispatchEvent(new win.Event('change'));}}},
    flush(time=16){clock=time;const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(time));},
    move(x,y=330){root.dispatchEvent(new win.MouseEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));},
    touch(type,x,y,id=1){const event=new win.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:id},isPrimary:{value:id===1},clientX:{value:x},clientY:{value:y}});root.dispatchEvent(event);return event;},
    close(){dom.window.close();}};
}

test('pointer motion works below the page top and batches writes once per frame',async()=>{
  const f=fixture(), banner=new ParallaxBanner(f.root,f.config);await banner.ready;f.flush();
  f.move(100);f.move(500);f.move(700);
  assert.equal(f.frames.size,1);f.flush();
  assert.equal(banner.progress,.5);
  assert.match(banner.layers[1].element.style.transform,/translate3d\(/);
  f.move(900,700);assert.equal(banner.progress,.5);
  banner.destroy();f.close();
});

test('leave settles to zero in 200ms',async()=>{
  const f=fixture(),banner=new ParallaxBanner(f.root,f.config);await banner.ready;f.flush(0);
  f.move(100);f.move(700);f.flush(0);
  f.root.dispatchEvent(new f.win.Event('pointerleave'));f.flush(100);
  assert.equal(banner.progress,.25);f.flush(200);assert.equal(banner.progress,0);assert.equal(f.frames.size,0);
  banner.destroy();f.close();
});

test('container-only resizing changes layout; mobile has no hard minimum width',async()=>{
  const f=fixture(),banner=new ParallaxBanner(f.root,f.config);await banner.ready;
  f.resize(375);assert.equal(banner.width,375);assert.equal(f.root.style.height,'144px');
  f.resize(3440);assert.equal(f.root.style.height,'240px');
  banner.destroy();f.close();
});

test('reduced motion changes live, resets transforms and prevents pointer updates',async()=>{
  const f=fixture(),banner=new ParallaxBanner(f.root,f.config);await banner.ready;
  f.move(100);f.move(700);f.flush();assert.equal(banner.progress,.5);
  const query=f.queries.get('(prefers-reduced-motion: reduce)');query.matches=true;query.dispatchEvent(new f.win.Event('change'));
  f.move(100);f.move(700);assert.equal(banner.progress,0);
  banner.destroy();f.close();
});

test('destroy preserves host content and permits remounting',async()=>{
  const f=fixture(),banner=new ParallaxBanner(f.root,f.config);await banner.ready;
  assert.throws(()=>new ParallaxBanner(f.root,f.config),/already mounted/);
  banner.destroy();assert.equal(f.root.querySelectorAll('.lpb__stage').length,0);assert.equal(f.root.textContent,'Host content');
  const next=new ParallaxBanner(f.root,f.config);await next.ready;assert.equal(next.layers.length,2);next.destroy();f.close();
});

test('required image failure leaves poster, optional failure reports degraded',async()=>{
  for(const [fail,state] of [['bg.svg','error'],['fg.svg','degraded']]) {
    const f=fixture({fail}),banner=new ParallaxBanner(f.root,f.config);await banner.ready;
    assert.equal(banner.state,state);assert.ok(f.root.querySelector('.lpb__poster'));
    banner.destroy();f.close();
  }
});

test('destroy during loading settles ready without late DOM writes',async()=>{
  const f=fixture({timeout:true}),banner=new ParallaxBanner(f.root,{...f.config,loadTimeout:100});
  banner.destroy();await banner.ready;assert.equal(f.root.querySelectorAll('.lpb__stage').length,0);assert.equal(banner.state,'destroyed');f.close();
});

test('manifest loader resolves assets relative to the manifest and omits credentials',async()=>{
  const f=fixture(), originalFetch=globalThis.fetch;
  let options;
  globalThis.fetch=async(_url,value)=>{options=value;return new Response(JSON.stringify(f.config));};
  try {
    const banner=await loadBanner(f.root,'/campaigns/summer/banner.json');await banner.ready;
    assert.equal(banner.layers[0].element.src,'https://example.org/campaigns/summer/bg.svg');
    assert.equal(options.credentials,'omit');banner.destroy();
  } finally {globalThis.fetch=originalFetch;f.close();}
});

test('coarse pointers stay static by default but opt-in touch enables programmatic motion',async()=>{
  const f=fixture({width:375,fine:false}),banner=new ParallaxBanner(f.root,f.config);await banner.ready;
  banner.setProgress(.5);f.flush();assert.equal(banner.progress,0);banner.destroy();
  const active=new ParallaxBanner(f.root,{...f.config,interaction:{touch:'drag'}});await active.ready;
  active.setProgress(.5);f.flush();assert.equal(active.progress,.5);assert.equal(f.root.style.touchAction,'pan-y pinch-zoom');
  active.destroy();f.close();
});

test('horizontal touch owns only its pointer and never prevents vertical scrolling',async()=>{
  const f=fixture({width:375,fine:false}),banner=new ParallaxBanner(f.root,{...f.config,interaction:{touch:'drag'}});await banner.ready;f.flush(0);
  f.touch('pointerdown',140,330);const horizontal=f.touch('pointermove',220,332);f.flush(0);
  assert.ok(banner.progress>0);assert.equal(horizontal.defaultPrevented,false);
  const progress=banner.progress;f.touch('pointermove',300,332,2);assert.equal(banner.progress,progress);
  f.touch('pointerup',220,332);f.flush(200);assert.equal(banner.progress,0);
  f.touch('pointerdown',140,330);const vertical=f.touch('pointermove',142,390);f.flush(250);
  assert.equal(banner.progress,0);assert.equal(vertical.defaultPrevented,false);f.touch('pointercancel',142,390);
  banner.destroy();f.close();
});

test('touch opt-in cannot override reduced motion and restores host touch action',async()=>{
  const f=fixture({fine:false,reduced:true});f.root.style.touchAction='manipulation';
  const banner=new ParallaxBanner(f.root,{...f.config,interaction:{touch:'drag'}});await banner.ready;
  banner.setProgress(.8);f.touch('pointerdown',140,330);f.touch('pointermove',240,330);f.flush();assert.equal(banner.progress,0);
  banner.destroy();assert.equal(f.root.style.touchAction,'manipulation');f.close();
});

test('mobile poster does not hide layers when touch motion is explicitly enabled',async()=>{
  const f=fixture({width:375,fine:false}),banner=new ParallaxBanner(f.root,{...f.config,mobilePoster:'mobile.webp',interaction:{touch:'drag'}});await banner.ready;
  assert.ok(banner.layers.every(layer=>!layer.wrap.hidden));
  const reduced=f.queries.get('(prefers-reduced-motion: reduce)');reduced.matches=true;reduced.dispatchEvent(new f.win.Event('change'));
  assert.ok(banner.layers.every(layer=>!layer.wrap.hidden));assert.equal(banner.progress,0);banner.destroy();f.close();
});

test('contain keeps subject layers inside the canvas while the background covers the container',async()=>{
  const f=fixture({width:768}),banner=new ParallaxBanner(f.root,{...f.config,layers:[f.config.layers[0],{...f.config.layers[1],fit:'contain'}]});await banner.ready;
  assert.ok(parseFloat(banner.layers[0].element.style.width)>=768);
  assert.equal(parseFloat(banner.layers[1].element.style.width),768);
  banner.setProgress(1);f.flush();assert.match(banner.layers[1].element.style.transform,/translate3d\(25\.600px/);
  f.resize(3440);assert.ok(parseFloat(banner.layers[1].element.style.height)<=banner.height);
  banner.destroy();f.close();
});

test('layout uses container CSS pixels and touch uses its displayed width under ancestor scaling',async()=>{
  const f=fixture({width:375,fine:false,visualScale:2}),banner=new ParallaxBanner(f.root,{...f.config,interaction:{touch:'drag'}});await banner.ready;
  assert.equal(banner.width,375);assert.equal(f.root.style.height,'144px');
  f.touch('pointerdown',140,330);f.touch('pointermove',222.5,330);f.flush();assert.ok(Math.abs(banner.progress-.2)<1e-8);
  f.resize(375);assert.equal(banner.width,375);banner.destroy();f.close();
});

test('a second finger cancels parallax including when it lands outside the banner',async()=>{
  const f=fixture({width:375,fine:false}),banner=new ParallaxBanner(f.root,{...f.config,interaction:{touch:'drag'}});await banner.ready;f.flush(0);
  const interactions=[];f.root.addEventListener('banner:interaction',event=>interactions.push(event.detail));
  f.touch('pointerdown',140,330);f.touch('pointermove',220,330);f.flush(0);
  const second=new f.win.Event('pointerdown',{bubbles:true,cancelable:true});Object.defineProperties(second,{pointerType:{value:'touch'},pointerId:{value:2}});f.win.document.body.dispatchEvent(second);
  assert.equal(banner.touchGesture,null);assert.equal(interactions.at(-1).cancelled,true);assert.equal(second.defaultPrevented,false);
  f.touch('pointermove',330,330);f.flush(200);assert.equal(banner.progress,0);
  f.touch('pointerup',330,330);f.touch('pointerup',330,330,2);
  f.touch('pointerdown',140,330);f.touch('pointermove',180,330);f.flush(220);assert.ok(banner.progress>0);
  banner.destroy();f.close();
});
