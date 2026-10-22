import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import sharp from 'sharp';
import {VERSION} from '../src/model.js';

for(const name of ['frieren','studio'])for(const [width,url,fine] of [[390,'content://com.tencent.provider/banner.html',false],[1280,'file:///E:/banner/index.html',true]]) {
  test(`${name} offline HTML decodes its embedded layers at ${width}px without HTTP`,async()=>{
    const html=await readFile(`examples/${name}/artifacts/offline.html`,'utf8');
    let resolveReady;
    const ready=new Promise(resolve=>{resolveReady=resolve;});
    const sources=[],dimensions=new WeakMap(),frames=new Map();
    let id=0,timer;
    const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(win){
      win.matchMedia=query=>{const result=new win.EventTarget();result.matches=query.includes('reduced-motion')?false:query.includes('max-width')?width<=767:fine;return result;};
      win.ResizeObserver=class{observe(){}disconnect(){}};
      win.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
      win.cancelAnimationFrame=value=>frames.delete(value);
      Object.defineProperty(win.HTMLElement.prototype,'clientWidth',{get:()=>width});
      win.HTMLElement.prototype.getBoundingClientRect=function(){const height=parseFloat(this.style.height)||208;return{left:0,top:56,right:width,bottom:56+height,width,height};};
      Object.defineProperties(win.HTMLImageElement.prototype,{
        naturalWidth:{get(){return dimensions.get(this)?.width||0;}},
        naturalHeight:{get(){return dimensions.get(this)?.height||0;}},
        src:{get(){return this.getAttribute('src')||'';},set(value){
          this.setAttribute('src',value);sources.push(value);
          const bytes=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
          sharp(bytes).metadata().then(info=>{dimensions.set(this,info);this.dispatchEvent(new win.Event('load'));},()=>this.dispatchEvent(new win.Event('error')));
        }}
      });
      win.document.addEventListener('theme:ready',event=>resolveReady(event.detail),{capture:true,once:true});
    }});
    try {
      const result=await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Offline banner did not finish loading')),5000);})]);
      assert.equal(result.state,'ready');
      const root=dom.window.document.getElementById('banner');
      assert.equal(root.dataset.themeVariant,width<=767?'mobile':'desktop');
      assert.equal(root.dataset.themeMode,fine?'pointer':'auto');
      assert.equal(root.querySelectorAll('.lpb__layer').length,3);
      assert.ok(sources.length>=4&&sources.every(src=>src.startsWith('data:image/')));
      assert.ok(dom.window.document.querySelector('footer').textContent.includes(`v${VERSION}`));
      assert.equal(dom.window.document.querySelector('meta[name=viewport]').content,'width=device-width,initial-scale=1');
    } finally {
      clearTimeout(timer);dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
    }
  });
}
