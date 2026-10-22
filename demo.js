(function(){
  const status=document.getElementById('banner-status');
  const root=document.getElementById('banner');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let instance,paused=false;
  function showState(){
    if(!instance)return;
    if(instance.state==='error'){status.textContent='图层未能加载，正在显示静态海报';return;}
    if(!fine.matches||reduce.matches){status.textContent='当前使用静态模式（触屏或系统减少动态效果）';return;}
    status.textContent=paused?'动效已暂停':'已就绪 · 左右移动鼠标查看视差，离开后 200ms 归位';
  }
  root.addEventListener('banner:ready',showState);
  root.addEventListener('banner:motion',showState);
  try {instance=LayeredBanner.createBanner(root,window.BANNER_CONFIG);instance.ready.then(showState);}catch(error){status.textContent='配置加载失败：'+error.message;}
  document.getElementById('motion-toggle').addEventListener('click',function(){
    if(!instance)return;paused=!paused;if(paused)instance.pause();else instance.resume();
    this.setAttribute('aria-pressed',String(paused));this.textContent=paused?'恢复动效':'暂停动效';showState();
  });
  document.querySelectorAll('[data-progress]').forEach(button=>button.addEventListener('click',()=>instance?.setProgress(Number(button.dataset.progress))));
  document.getElementById('strength').addEventListener('input',function(){
    document.getElementById('strength-value').textContent=Number(this.value).toFixed(1)+'×';
  });
  document.getElementById('strength').addEventListener('change',function(){
    const value=Number(this.value);
    if(!instance)return;
    instance.destroy();instance=LayeredBanner.createBanner(root,{...window.BANNER_CONFIG,interaction:{...window.BANNER_CONFIG.interaction,strength:value}});
    if(paused)instance.pause();instance.ready.then(showState);
  });
})();
