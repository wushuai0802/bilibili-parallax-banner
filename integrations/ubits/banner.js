import {createTheme} from '../../src/banner.js';

// The native carousel owns navigation and touch. Only mouse input is forwarded.
export function mount(host, options = {}) {
  const element = typeof host === 'string' ? document.querySelector(host) : host;
  if (!element || element.nodeType !== 1) throw new TypeError('A UBits banner container is required');
  if (element.querySelector(':scope > .lpb-ubits-visual')) throw new Error('UBits banner already mounted');
  const doc = element.ownerDocument, win = doc.defaultView;
  const toggle = typeof options.motionToggle === 'string' ? doc.querySelector(options.motionToggle) : options.motionToggle;
  const visual = doc.createElement('span');
  visual.className = 'lpb-ubits-visual';
  visual.setAttribute('aria-hidden', 'true');
  element.append(visual);
  let controller, revision = 0, destroyed = false, mode = options.mode ?? 'default';
  const cleanups = [];
  const listen = (target, type, handler, settings) => {
    target.addEventListener(type, handler, settings);
    cleanups.push(() => target.removeEventListener(type, handler, settings));
  };
  const syncMode = () => controller?.setMode(toggle && !toggle.checked ? 'still' : mode);
  if (toggle) listen(toggle, 'change', syncMode);
  for (const type of ['pointerenter', 'pointermove', 'pointerleave']) listen(element, type, event => {
    if (event.pointerType !== 'mouse' || !controller) return;
    visual.dispatchEvent(new win.PointerEvent(type, {pointerType:'mouse', pointerId:event.pointerId,
      clientX:event.clientX, clientY:event.clientY, isPrimary:true, bubbles:false}));
  }, {passive:true});
  const clear = () => {
    controller?.destroy(); controller = undefined;
    visual.removeAttribute('data-ubits-active');
  };
  const fits = config => config?.height?.aspectRatio === 4 && Math.abs(config.baseWidth / config.baseHeight - 4) < 1e-9;
  listen(visual, 'theme:state', () => {
    const active = controller && ['ready','degraded'].includes(controller.state) && fits(controller.banner?.config);
    if (active) visual.setAttribute('data-ubits-active', 'true');
    else visual.removeAttribute('data-ubits-active');
  });
  const api = {
    get controller() { return controller; },
    async setSlide(slide) {
      if (destroyed) throw new Error('UBits banner was destroyed');
      const current = ++revision;
      clear();
      if (!slide?.theme) return false;
      try {
        const instance = createTheme(visual, slide.theme, {baseUrl:options.baseUrl ?? doc.baseURI, mode:toggle && !toggle.checked ? 'still' : mode});
        controller = instance;
        await instance.ready;
        if (destroyed || current !== revision) return false;
        for (const variant of Object.values(instance.theme.variants)) {
          const config = variant.config;
          if (config && !fits(config)) {
            throw new Error('UBits requires both theme variants to use a 4:1 canvas and height.aspectRatio:4');
          }
        }
        if (!fits(instance.banner?.config)) throw new Error('The active banner canvas must use 4:1');
        if (!['ready','degraded'].includes(instance.state)) throw new Error('Required banner images did not load');
        visual.setAttribute('data-ubits-active', 'true');
        return true;
      } catch (error) {
        if (destroyed || current !== revision) return false;
        clear();
        element.dispatchEvent(new win.CustomEvent('ubits-banner:error', {detail:{message:error.message}}));
        return false;
      }
    },
    setMode(value) {
      if (!['default','auto','pointer','still'].includes(value)) throw new TypeError('Unknown theme mode');
      mode = value; syncMode();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; revision++; clear();
      cleanups.splice(0).forEach(cleanup => cleanup()); visual.remove();
    },
  };
  return api;
}
