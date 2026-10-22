(function () {
  const root = document.querySelector('[data-banner-preview]');
  const status = document.getElementById('status');
  const buttons = [...document.querySelectorAll('[data-mode]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let controller;
  function sync() {
    if (!controller || controller.state === 'destroyed' || !root.isConnected) return;
    const ready = ['ready', 'degraded'].includes(controller.state);
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(controller.mode === button.dataset.mode));
      button.disabled = button.dataset.mode !== 'still' && (!ready || reduced.matches);
      if (button.dataset.mode === 'pointer') button.textContent = root.dataset.themeInputKind === 'touch' ? '触摸视差' : '鼠标视差';
    }
    status.textContent = controller.state === 'loading' ? '正在准备画面…' : controller.state === 'error' ? '画面加载失败，使用可用的静态预览' :
      reduced.matches ? '已遵循系统“减少动态效果”' : controller.mode === 'auto' ? '自动演示中 · 横向交互可接管视差' :
      controller.mode === 'still' ? '静态预览 · 图层已归位' : root.dataset.themeInputKind === 'touch' ? '横向拖动查看视差，上下滑动正常浏览页面' : '在横幅内左右移动鼠标，感受前后层次';
    const theme = controller.theme;
    if (!theme) return;
    const zone = theme.variants[controller.variant]?.textZones?.[0];
    const title = document.querySelector('.scene-title');
    title.hidden = !zone;
    if (zone) {
      const [x, y, w, h] = zone.rect;
      Object.assign(title.style, {left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`});
      const height = parseFloat(root.style.height) || root.getBoundingClientRect().height;
      title.style.setProperty('--title-size', `${Math.max(16, Math.min(54, height * h * .42))}px`);
    }
    document.getElementById('preview-title').textContent = theme.preview?.title || theme.name;
    document.getElementById('preview-subtitle').textContent = theme.preview?.subtitle || '';
    document.getElementById('preview-eyebrow').textContent = theme.preview?.eyebrow || '';
    document.getElementById('brand').textContent = theme.preview?.brand || theme.name;
    const list = document.getElementById('layer-list');
    const names = (theme.variants[controller.variant]?.config?.layers || []).map(layer => layer.name || layer.id);
    if (list.dataset.names !== names.join('|')) {
      list.replaceChildren(...names.map((name, index) => {
        const item = document.createElement('li');
        const number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0');
        const text = document.createElement('span'); text.textContent = name;
        item.append(number, text); return item;
      }));
      list.dataset.names = names.join('|');
    }
  }
  for (const type of ['state', 'mode', 'layout', 'variant']) root.addEventListener(`theme:${type}`, sync);
  controller = LayeredBanner.createTheme(root, window.BANNER_THEME, {baseUrl: window.BANNER_THEME_BASE || document.baseURI});
  // The preview exposes the public controller for host integration and browser checks.
  window.bannerPreview = controller;
  controller.ready.then(sync).catch(() => sync());
  buttons.forEach(button => button.addEventListener('click', () => controller.setMode(button.dataset.mode)));
  sync();
})();
