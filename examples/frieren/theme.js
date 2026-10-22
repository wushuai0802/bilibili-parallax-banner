(function(){
  const root=document.getElementById('banner'),status=document.getElementById('status');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const compact=matchMedia('(max-width: 640px)');
  const buttons=[...document.querySelectorAll('[data-mode]')];
  let banner,mode=reduced.matches?'still':fine.matches?'pointer':'auto';
  let raf=0,start=0,lastFrame=0,visible=true,resumeTimer=0,resumeAfterDrag=false;

  function stop(){cancelAnimationFrame(raf);raf=0;}
  function clearResume(){clearTimeout(resumeTimer);resumeTimer=0;resumeAfterDrag=false;}
  function sync(){
    const loading=!banner||banner.state==='loading';
    const failed=banner?.state==='error';
    buttons.forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
      button.disabled=button.dataset.mode!=='still'&&(reduced.matches||loading||failed);
      if(button.dataset.mode==='pointer')button.textContent=fine.matches?'鼠标视差':'触摸视差';
    });
    root.classList.toggle('frieren-still',mode==='still'||reduced.matches);
    root.dataset.previewMode=mode;
    root.dataset.inputKind=fine.matches?'mouse':'touch';
    if(loading){status.textContent='正在准备画面…';return;}
    if(failed){status.textContent='图层加载失败，正在显示静态海报';return;}
    if(reduced.matches){status.textContent='已遵循系统“减少动态效果”，当前使用静态海报';return;}
    status.textContent=mode==='auto'?(fine.matches?'自动演示中 · 三层独立移动':'手机轻量演示中 · 横向拖动可接管视差'):
      mode==='still'?'静态海报 · 已暂停位移':fine.matches?'在横幅内左右移动鼠标，感受前后层次':'在横幅上横向拖动；上下滑动仍正常滚动页面';
    const help=document.getElementById('interaction-help');
    if(help)help.textContent=fine.matches?'在横幅内左右移动鼠标，洞窟、人物与近处水晶会以不同速度移动。也可以点击“自动演示”，观察画面的前后层次。':'手机默认轻量自动演示。横向拖动画面可以接管视差，上下滑动仍可正常浏览页面；也可以切换为静态海报。';
  }
  function animate(now){
    if(mode!=='auto')return;
    if(reduced.matches){setMode('still');return;}
    if(document.hidden||!visible||!banner||banner.state==='loading')return;
    const interval=fine.matches?1000/60:1000/30;
    if(now-lastFrame>=interval-.5){
      banner.setProgress(Math.sin((now-start)*2*Math.PI/8000)*(fine.matches?.85:.55));
      lastFrame=now;
    }
    raf=requestAnimationFrame(animate);
  }
  function startAuto(){
    stop();
    if(mode!=='auto'||reduced.matches||document.hidden||!visible||!banner||!['ready','degraded'].includes(banner.state))return;
    banner.resume();start=performance.now();lastFrame=0;raf=requestAnimationFrame(animate);
  }
  function setMode(value){
    clearResume();stop();mode=reduced.matches?'still':value;
    if(mode==='still')banner?.pause();else banner?.resume();
    sync();if(mode==='auto')startAuto();
  }
  function mount(){
    clearResume();stop();banner?.destroy();
    banner=LayeredBanner.createBanner(root,compact.matches?window.FRIEREN_THEMES.mobile:window.FRIEREN_THEMES.desktop);
    const active=banner;
    active.ready.then(()=>{if(active!==banner)return;setMode(mode);});
    sync();
  }
  buttons.forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  root.addEventListener('banner:interaction',event=>{
    if(event.detail.phase==='start'){
      const wasAuto=mode==='auto';clearResume();resumeAfterDrag=wasAuto;stop();mode='pointer';sync();
    }else if(resumeAfterDrag&&!fine.matches){
      resumeTimer=setTimeout(()=>setMode('auto'),1800);
    }
  });
  root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&mode==='auto')setMode('pointer');});
  root.addEventListener('banner:visibility',event=>{visible=event.detail.visible;if(!visible)stop();else startAuto();});
  document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden){if(reduced.matches)setMode('still');else startAuto();}});
  reduced.addEventListener('change',()=>setMode(reduced.matches?'still':fine.matches?'pointer':'auto'));
  fine.addEventListener('change',()=>setMode(fine.matches?'pointer':'auto'));
  compact.addEventListener('change',mount);
  window.addEventListener('pagehide',()=>{clearResume();stop();banner?.destroy();},{once:true});
  mount();
})();
