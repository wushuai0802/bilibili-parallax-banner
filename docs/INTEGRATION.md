# 给网站开发者的对接指南

## 1. 职责与交付边界

本库只管理一个容器内的装饰横幅。你的网站继续管理导航、登录、搜索、路由、分析统计和业务状态。
组件添加的节点使用 `lpb` 前缀，不向 `window` 注册鼠标监听；原有容器子节点保留，`destroy()` 仅移除组件自己创建的节点。

网站方需要提供：容器、CSS/JS 地址、素材清单地址。美术方需要提供：统一画布图层、静态合成海报、可选手机海报。

## 2. 普通网页 / CDN

参考 README 的固定标签 CDN。`banner.min.js` 暴露 `window.LayeredBanner`；载入 CSS 后调用 `createBanner(element, config)` 或 `loadBanner(element, manifestUrl)`。
不要同时引入多个版本；每个容器只挂载一个实例。
资源 URL 由开发者配置。跨域 JSON 与图片应正确配置 CORS；生产环境建议使用自己控制的素材域名。

离线双击模式必须使用对象配置或生成的 `banner.config.js`。JSON 清单通过 HTTP(S) 获取；浏览器不支持 `fetch(file://...)`，不要求关闭浏览器安全设置。

## 3. JSON 清单（推荐）

```js
import {loadBanner} from './dist/banner.js';
const banner = await loadBanner(document.querySelector('#banner'), '/assets/banner/banner.json');
await banner.ready;
```

相对图片路径总是相对清单 URL，而不是相对当前页面路由。一次挂载不会启动轮询；切换活动主题时销毁旧实例再加载新清单。

## 4. React

```jsx
import {useEffect, useRef} from 'react';
import {loadBanner} from 'bilibili-parallax-banner';
import 'bilibili-parallax-banner/style.css';

export function SiteBanner({manifestUrl}) {
  const root = useRef(null);
  useEffect(() => {
    let instance;
    let disposed = false;
    const abort = new AbortController();
    loadBanner(root.current, manifestUrl, {signal: abort.signal})
      .then(value => {
        if (disposed) value.destroy();
        else instance = value;
      })
      .catch(error => {if (!disposed) console.error('Banner configuration unavailable', error);});
    return () => {disposed = true; abort.abort(); instance?.destroy();};
  }, [manifestUrl]);
  return <div ref={root} />;
}
```

SSR 场景只在客户端 `useEffect` 中挂载。初始容器请由宿主预留高度和背景海报，避免首屏等待 JS 时闪空。

## 5. Vue 3

```vue
<script setup>
import {onMounted, onBeforeUnmount, ref} from 'vue';
import {loadBanner} from 'bilibili-parallax-banner';
import 'bilibili-parallax-banner/style.css';
const root = ref(null);
const abort = new AbortController();
let instance;
let disposed = false;
onMounted(async () => {
  try {
    const value = await loadBanner(root.value, '/assets/banner/banner.json', {signal: abort.signal});
    if (disposed) value.destroy(); else instance = value;
  } catch (error) {if (!disposed) console.error('Banner unavailable', error);}
});
onBeforeUnmount(() => {disposed = true; abort.abort(); instance?.destroy();});
</script>
<template><div ref="root" /></template>
```

## 6. 叠放自己的网站内容

```html
<div id="banner" style="position:relative">
  <a class="site-logo" href="/">我的网站</a>
</div>
<style>
.site-logo { position:absolute; z-index:2; left:32px; bottom:20px; }
</style>
```

组件不会重建或删除 `.site-logo`。导航不是图片的一部分，应保留真实链接、键盘焦点和响应式布局。
默认顶部遮罩为 100px 黑色至透明渐变；若导航已有遮罩，可设置 `taper:false`。

## 7. 上线验收

1. 375、768、1280、1920、3440px 宽度无横向页面溢出；窄屏主体由美术安全区或手机海报保证。
2. 鼠标最左/最右，背景无灰边；横幅位于页面中部时仍可交互。
3. React Strict Mode / Vue 路由切换后没有重复图层或遗留事件。
4. 断网、必要图层 404、可选图层 404 分别表现为静态海报或降级，状态可观测。
5. 系统减少动态效果生效，手机可正常滚动，视频不在后台持续播放。启用 `interaction.touch:'drag'` 时还需核对横向拖动、抬手归位与多触点取消。
6. `npm run validate -- /path/to/banner.json` 通过后再上传；本地校验不代表生产 CDN 已正确部署。

## 8. 版本、CDN 与供应链

使用 `@v1.1.0` 这类固定标签，避免直接跟随 `main`。若站点不允许第三方 CDN，可自托管 `dist/banner.min.js` 和 `dist/banner.css`；组件无需联网服务。
网站开发者不需要 Node.js、图像处理工具或构建过程，直接使用已构建文件即可。开发维护仓库时才需要 Node.js。
如启用严格 CSP，把 JS/CSS 及图片域名加入现有策略；本库不使用 `eval`、注入 HTML 字符串或第三方跟踪。
