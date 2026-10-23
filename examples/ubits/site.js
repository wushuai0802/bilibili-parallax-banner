(function () {
  const host = document.getElementById('ub-home-banner');
  const link = document.getElementById('ub-home-banner-link');
  const shell = document.querySelector('.ub-shell');
  const panel = document.getElementById('demo-profile');
  const toggle = document.getElementById('panel-toggle');
  const motion = document.getElementById('ub-top-motion-toggle');
  const auto = document.getElementById('autoplay');
  const dots = [...document.querySelectorAll('[data-slide]')];
  const bridge = UBitsBanner.mount(host, {motionToggle:motion});
  window.ubitsPreview = bridge;
  let slides, index = 0, timer, pointer;
  function panelState(open) {
    shell.classList.toggle('is-side-collapsed', !open);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '收起个人中心' : '展开个人中心';
  }
  toggle.addEventListener('click', () => panelState(panel.hidden));
  document.getElementById('close-panel').addEventListener('click', () => panelState(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') panelState(false); });
  function measure() {
    const root = host.querySelector('.lpb-ubits-visual');
    document.getElementById('measure').textContent = `${host.clientWidth} × ${(host.clientWidth / 4).toFixed(2)} px · ${root?.dataset.themeVariant || '原生海报'}`;
  }
  host.addEventListener('theme:layout', measure, true);
  host.addEventListener('theme:state', measure, true);
  const observer = new ResizeObserver(measure); observer.observe(host);
  async function show(next) {
    if (!slides) return;
    index = (next + slides.length) % slides.length;
    const slide = slides[index];
    host.style.setProperty('--art', `url("${slide.poster}")`);
    link.setAttribute('aria-label', slide.title);
    dots.forEach((dot,i) => { if (i === index) dot.setAttribute('aria-current','true'); else dot.removeAttribute('aria-current'); });
    await bridge.setSlide(slide); measure();
  }
  dots.forEach((dot,i) => dot.addEventListener('click', () => show(i)));
  document.querySelector('.ub-banner-nav-prev').addEventListener('click', () => show(index - 1));
  document.querySelector('.ub-banner-nav-next').addEventListener('click', () => show(index + 1));
  function autoplay() {
    clearInterval(timer);
    if (auto.checked && !document.hidden) timer = setInterval(() => show(index + 1),5000);
  }
  auto.addEventListener('change',autoplay); document.addEventListener('visibilitychange',autoplay);
  host.addEventListener('pointerenter',event => {if(event.pointerType === 'mouse')clearInterval(timer);});
  host.addEventListener('pointerleave',event => {if(event.pointerType === 'mouse')autoplay();});
  host.style.touchAction = 'pan-y pinch-zoom';
  host.addEventListener('pointerdown', event => {
    if(event.pointerType !== 'touch' || !event.isPrimary)return;
    pointer = {id:event.pointerId,x:event.clientX,y:event.clientY};
  }, {passive:true});
  host.addEventListener('pointerup', event => {
    if(!pointer || event.pointerId !== pointer.id)return;
    const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
    pointer = undefined;
    if(Math.abs(dx) >= Math.max(40,host.clientWidth*.12) && Math.abs(dx)>Math.abs(dy)*1.2) {
      const cancel = click => {click.preventDefault();click.stopPropagation();};
      host.addEventListener('click',cancel,{capture:true,once:true});
      setTimeout(() => host.removeEventListener('click',cancel,true),400);
      show(index + (dx < 0 ? 1 : -1));
    }
  }, {passive:true});
  host.addEventListener('pointercancel', () => {pointer = undefined;}, {passive:true});
  fetch('./theme/theme.json').then(response => {if(!response.ok)throw new Error('Theme metadata unavailable');return response.json();}).then(theme => {
    const poster = new URL(`./theme/desktop/${theme.variants.desktop.config.poster}`,location.href).href;
    slides = [{title:'远行者',poster,theme:'./theme/theme.json'},{title:'原生静态海报',poster}];
    show(0);
  }).catch(() => {document.getElementById('measure').textContent='预览资源不可用，请通过 HTTP 打开本页';});
  window.addEventListener('pagehide',event => {clearInterval(timer);if(!event.persisted){bridge.destroy();observer.disconnect();}});
  window.addEventListener('pageshow',event => {if(event.persisted)autoplay();});
})();
