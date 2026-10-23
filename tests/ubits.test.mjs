import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mount} from '../integrations/ubits/banner.js';

function fixture() {
  const dom=new JSDOM('<input id="motion" type="checkbox" checked><article id="banner"><a href="/details/42" aria-label="Original title"></a><button>Next</button></article>',{url:'https://site.example/newui/',pretendToBeVisual:true});
  const win=dom.window,host=win.document.querySelector('article'),toggle=win.document.querySelector('input');
  let width=1244;
  const observers=new Set();
  win.ResizeObserver=class{constructor(callback){this.callback=callback;observers.add(this);}observe(){}disconnect(){observers.delete(this);}};
  win.matchMedia=query=>{const result=new win.EventTarget();result.matches=!query.includes('reduced-motion');return result;};
  win.PointerEvent=class extends win.MouseEvent{constructor(type,options){super(type,options);Object.defineProperty(this,'pointerType',{value:options.pointerType});}};
  Object.defineProperty(win.HTMLElement.prototype,'clientWidth',{get:()=>width});
  win.HTMLElement.prototype.getBoundingClientRect=()=>({width,height:width/4,left:0,top:0,right:width,bottom:width/4});
  const create=win.document.createElement.bind(win.document);
  win.document.createElement=tag=>{
    const element=create(tag);
    if(tag==='img')Object.defineProperties(element,{naturalWidth:{value:400},naturalHeight:{value:100},src:{get(){return this.getAttribute('src')||'';},set(value){this.setAttribute('src',value);queueMicrotask(()=>this.dispatchEvent(new win.Event(value.includes('broken')?'error':'load')));}}});
    return element;
  };
  const config={baseWidth:400,baseHeight:100,pixelRatio:1,height:{aspectRatio:4},interaction:{touch:'drag'},layers:[{src:'background.webp'}]};
  const theme={version:1,name:'four-to-one',variants:{desktop:{config},mobile:{config}}};
  const bridge=mount(host,{motionToggle:toggle});
  return {win,host,toggle,bridge,theme,resize(value){width=value;for(const observer of [...observers])observer.callback([]);},close(){bridge.destroy();dom.window.close();}};
}

test('UBits preserves native links and controls while resizing through the sidebar breakpoint',async()=>{
  const f=fixture();try {
    assert.equal(await f.bridge.setSlide({theme:f.theme}),true);
    const original=f.host.querySelector('a').outerHTML;
    assert.equal(f.bridge.controller.variant,'desktop');assert.equal(f.bridge.controller.banner.height,311);
    f.resize(758);await f.bridge.controller.ready;
    assert.equal(f.bridge.controller.variant,'mobile');assert.equal(f.bridge.controller.banner.height,189.5);
    assert.equal(f.host.querySelectorAll('.lpb__stage').length,1);
    assert.equal(f.host.querySelector('a').outerHTML,original);assert.equal(f.host.querySelector('button').textContent,'Next');
    assert.equal(await f.bridge.setSlide({}),false);assert.equal(f.host.querySelectorAll('.lpb__stage').length,0);
    assert.equal(f.host.querySelector('a').outerHTML,original);
  } finally {f.close();}
});

test('UBits obeys the site motion toggle, cancels stale slides and cleans up its surface',async()=>{
  const f=fixture();try {
    const old=f.bridge.setSlide({theme:f.theme}),last=f.bridge.setSlide({theme:f.theme});
    assert.equal(await old,false);assert.equal(await last,true);
    f.toggle.checked=false;f.toggle.dispatchEvent(new f.win.Event('change'));
    assert.equal(f.bridge.controller.mode,'still');
    f.toggle.checked=true;f.toggle.dispatchEvent(new f.win.Event('change'));
    assert.equal(f.bridge.controller.mode,'pointer');
    f.bridge.destroy();assert.equal(f.host.querySelector('.lpb-ubits-visual'),null);
    assert.equal(f.host.querySelector('a').getAttribute('href'),'/details/42');
    await assert.rejects(f.bridge.setSlide({theme:f.theme}),/destroyed/);
  } finally {f.close();}
});

test('UBits leaves native posters available on invalid geometry or important-image failure',async()=>{
  const f=fixture();try {
    const bad=structuredClone(f.theme);bad.variants.mobile.config.height.aspectRatio=3;
    assert.equal(await f.bridge.setSlide({theme:bad}),false);
    const missing=structuredClone(f.theme);missing.variants.desktop.config.layers[0].src='broken.webp';
    assert.equal(await f.bridge.setSlide({theme:missing}),false);
    assert.equal(f.host.querySelector('[data-ubits-active]'),null);
    assert.equal(f.host.querySelector('a').getAttribute('href'),'/details/42');
  } finally {f.close();}
});
