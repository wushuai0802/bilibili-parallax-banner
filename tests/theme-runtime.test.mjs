import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createTheme,loadTheme} from '../src/banner.js';

function fixture({width=390,fine=false,reduced=false,fail=''}={}) {
  const dom=new JSDOM('<div id="root"><strong>Host content</strong></div>',{url:'https://example.org/page',pretendToBeVisual:true});
  const win=dom.window,root=win.document.getElementById('root'),frames=new Map(),timers=new Map(),observers=new Set(),intersections=new Set(),queries=new Map(),sources=[];
  let clock=0,id=0,currentWidth=width,hidden=false;
  win.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};win.cancelAnimationFrame=id=>frames.delete(id);
  win.setTimeout=(callback,delay)=>{timers.set(++id,{callback,time:clock+delay});return id;};win.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(win.performance,'now',{value:()=>clock});
  Object.defineProperty(win.document,'hidden',{get:()=>hidden});
  Object.defineProperty(root,'clientWidth',{get:()=>currentWidth});
  root.getBoundingClientRect=()=>({left:0,top:0,width:currentWidth,height:parseFloat(root.style.height)||200,right:currentWidth,bottom:parseFloat(root.style.height)||200});
  win.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){observers.add(this);}disconnect(){observers.delete(this);}};
  win.IntersectionObserver=class{constructor(callback){this.callback=callback;}observe(){intersections.add(this);}disconnect(){intersections.delete(this);}};
  win.matchMedia=query=>{
    if(!queries.has(query)){const value=new win.EventTarget();value.matches=query.includes('reduced-motion')?reduced:fine;queries.set(query,value);}return queries.get(query);
  };
  const create=win.document.createElement.bind(win.document);
  win.document.createElement=tag=>{
    const element=create(tag);
    if(tag==='img')Object.defineProperties(element,{naturalWidth:{value:3840},naturalHeight:{value:360},src:{get(){return this.getAttribute('src')||'';},set(value){this.setAttribute('src',value);sources.push(value);queueMicrotask(()=>this.dispatchEvent(new win.Event(fail&&value.includes(fail)?'error':'load')));}}});
    return element;
  };
  const config={baseWidth:1920,baseHeight:180,pixelRatio:2,poster:'poster.webp',interaction:{touch:'drag'},layers:[{id:'background',src:'background.webp'},{id:'subject',src:'subject.webp',fit:'contain',offset:[24,0],required:true}]};
  const theme={version:1,name:'test-theme',variants:{desktop:{manifest:'desktop/banner.json',config},mobile:{manifest:'mobile/banner.json',config}}};
  return {win,root,theme,config,frames,timers,queries,sources,
    resize(value){currentWidth=value;for(const observer of [...observers])observer.callback([]);},
    flush(time=16){clock=time;const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(time));},
    tick(time){clock+=time;for(const [key,timer] of [...timers])if(timer.time<=clock){timers.delete(key);timer.callback();}},
    preference(kind,value){const query=win.matchMedia(kind==='reduced'?'(prefers-reduced-motion: reduce)':'(any-hover: hover) and (any-pointer: fine)');query.matches=value;query.dispatchEvent(new win.Event('change'));},
    visibility(value){hidden=value;win.document.dispatchEvent(new win.Event('visibilitychange'));},
    intersect(value){for(const observer of [...intersections])observer.callback([{isIntersecting:value}]);},
    touch(type,x,y=100){const event=new win.Event(type,{bubbles:true});Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:1},isPrimary:{value:true},clientX:{value:x},clientY:{value:y}});root.dispatchEvent(event);},
    close(){dom.window.close();}};
}

test('one theme selects the container variant and loads only its image set',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme,{baseUrl:'https://assets.example/theme.json'});await theme.ready;
  assert.equal(theme.variant,'mobile');assert.equal(theme.mode,'auto');
  assert.ok(f.sources.every(src=>src.startsWith('https://assets.example/mobile/')));
  f.flush(200);f.flush(240);assert.notEqual(theme.banner.progress,0);
  f.resize(1200);await theme.ready;assert.equal(theme.variant,'desktop');assert.equal(f.root.querySelectorAll('.lpb__stage').length,1);
  assert.equal(theme.mode,'auto');theme.destroy();assert.equal(f.frames.size,0);f.close();
});

test('selected mode survives resize, input changes and reduced-motion round trips',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme);await theme.ready;
  theme.setMode('still');f.preference('reduced',true);f.preference('fine',true);f.resize(1200);await theme.ready;
  f.preference('reduced',false);assert.equal(theme.mode,'still');assert.equal(f.frames.size,0);
  theme.setMode('default');assert.equal(theme.mode,'pointer');f.preference('fine',false);assert.equal(theme.mode,'auto');
  theme.destroy();f.close();
});

test('touch takeover resumes the selected auto policy after release',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme);await theme.ready;
  f.flush(0);f.touch('pointerdown',100);f.touch('pointermove',180);assert.equal(theme.mode,'pointer');
  f.touch('pointerup',180);f.tick(1800);assert.equal(theme.mode,'auto');
  theme.destroy();f.close();
});

test('offscreen, hidden and unfocused themes stop automatic frames and recover',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme);await theme.ready;
  for(const [hide,show] of [[()=>f.intersect(false),()=>f.intersect(true)],[()=>f.visibility(true),()=>f.visibility(false)],
    [()=>f.win.dispatchEvent(new f.win.Event('blur')),()=>f.win.dispatchEvent(new f.win.Event('focus'))]]) {
    hide();assert.equal(theme.frame,0);show();assert.notEqual(theme.frame,0);
  }
  theme.pause();assert.equal(theme.mode,'still');theme.resume();assert.equal(theme.mode,'auto');
  theme.destroy();f.close();
});

test('bfcache suspension preserves the controller, layers and manual mode',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme);await theme.ready;theme.setMode('still');
  for(const type of ['pagehide','pageshow']){const event=new f.win.Event(type);Object.defineProperty(event,'persisted',{value:true});f.win.dispatchEvent(event);}
  assert.equal(theme.state,'ready');assert.equal(theme.mode,'still');assert.equal(f.root.querySelectorAll('.lpb__stage').length,1);
  theme.destroy();f.close();
});

test('a failed important layer retains the poster and does not run an animation loop',async()=>{
  const f=fixture({fail:'subject.webp'}),theme=createTheme(f.root,f.theme);await theme.ready;
  assert.equal(theme.state,'error');assert.equal(theme.frame,0);assert.ok(f.root.querySelector('.lpb__poster'));
  theme.destroy();f.close();
});

test('destroy restores host attributes and permits a fresh controller',async()=>{
  const f=fixture();f.root.setAttribute('data-theme-mode','host');f.root.style.height='99px';
  const theme=createTheme(f.root,f.theme);await theme.ready;
  assert.throws(()=>createTheme(f.root,f.theme),/already mounted/);theme.destroy();
  assert.equal(f.root.textContent,'Host content');assert.equal(f.root.getAttribute('data-theme-mode'),'host');assert.equal(f.root.style.height,'99px');
  const next=createTheme(f.root,f.theme);await next.ready;next.destroy();f.close();
});

test('a stale manifest cannot win a rapid container switch even if fetch ignores abort',async()=>{
  const f=fixture(),original=globalThis.fetch,requests=new Map();
  globalThis.fetch=(url,options)=>new Promise(resolve=>requests.set(new URL(url).pathname,{resolve,options}));
  delete f.theme.variants.desktop.config;delete f.theme.variants.mobile.config;
  const theme=createTheme(f.root,f.theme,{baseUrl:'https://assets.example/theme.json'});
  try {
    await Promise.resolve();f.resize(1200);await Promise.resolve();
    requests.get('/desktop/banner.json').resolve(new Response(JSON.stringify(f.config)));
    await theme.ready;assert.equal(theme.variant,'desktop');
    requests.get('/mobile/banner.json').resolve(new Response(JSON.stringify(f.config)));
    await Promise.resolve();await Promise.resolve();
    assert.ok(f.sources.every(src=>src.includes('/desktop/')));assert.equal(f.root.querySelectorAll('.lpb__stage').length,1);
    assert.equal(requests.get('/desktop/banner.json').options.credentials,'omit');
    assert.equal(requests.get('/desktop/banner.json').options.cache,'no-cache');
  } finally {theme.destroy();globalThis.fetch=original;f.close();}
});

test('aborting a pending public load releases the root immediately',async()=>{
  const f=fixture(),original=globalThis.fetch,abort=new AbortController();
  globalThis.fetch=()=>new Promise(()=>{});
  try {
    const pending=loadTheme(f.root,'https://assets.example/theme.json',{signal:abort.signal});
    const rejected=assert.rejects(pending,error=>error.name==='AbortError');abort.abort();
    const next=createTheme(f.root,f.theme);await next.ready;await rejected;
    assert.equal(next.state,'ready');next.destroy();
  }finally{globalThis.fetch=original;f.close();}
});

test('source changes cancel stale metadata and retain the current manual mode',async()=>{
  const f=fixture(),theme=createTheme(f.root,f.theme),original=globalThis.fetch;await theme.ready;theme.setMode('still');
  globalThis.fetch=()=>new Promise(()=>{});
  try {
    const pending=theme.setTheme('https://assets.example/old.json'),rejected=assert.rejects(pending,error=>error.name==='AbortError');
    await theme.setTheme({...f.theme,name:'replacement'});await rejected;
    assert.equal(theme.theme.name,'replacement');assert.equal(theme.mode,'still');assert.equal(f.root.querySelectorAll('.lpb__stage').length,1);
  }finally{theme.destroy();globalThis.fetch=original;f.close();}
});

test('metadata request timeout is bounded and cleans up its root',async()=>{
  const f=fixture(),original=globalThis.fetch;
  globalThis.fetch=()=>new Promise(()=>{});
  try {
    const pending=loadTheme(f.root,'https://assets.example/theme.json',{timeout:100});
    const rejected=assert.rejects(pending,/timed out/);f.tick(100);await rejected;
    const next=createTheme(f.root,f.theme);await next.ready;next.destroy();
  }finally{globalThis.fetch=original;f.close();}
});
