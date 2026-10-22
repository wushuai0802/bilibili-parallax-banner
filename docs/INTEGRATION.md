# 网站开发接入指南 / v1.3

## 1. 收到什么

美术交付 `theme.zip`，包含 `theme.json`、双端哈希素材、不可变清单、预览、报告和最小接入例。网站方不用重复处理人物裁切、两端坐标换算或编写一套自动演示逻辑。

网站继续管理导航、标题、按钮、点击跳转和其他业务。组件只添加自己的画面节点，销毁时保留宿主内容。[制作流程](WORKFLOW.md)与[图片规范](IMAGE-SPEC.md)面向AI/美工。

## 2. 普通网页与ESM

加载dist/banner.css和dist/banner.min.js：

```js
const banner = await LayeredBanner.loadTheme('#banner', '/themes/summer/theme.json');
await banner.setTheme('/themes/winter/theme.json');
banner.setMode('still');
banner.setMode('default');
banner.destroy();
```

ESM使用 `import {loadTheme} from './dist/banner.js'`，或安装固定Git标签后从包导入。

双端切换按**容器实际宽度**进行，适用于全宽横幅和窄容器。只实例化当前端图片；默认精细指针使用鼠标视差、触屏自动演示并支持横向接管。更换主题、切换宽度和销毁中的旧请求会取消，不会覆盖新画面。

`theme.json`相对路径以它自己的URL解析。组件采用omit credentials获取配置；跨域部署需配置CORS。固定组件版本，主题索引建议no-cache，哈希资源可用长期immutable缓存。

## 3. React

```jsx
import {useEffect, useRef} from 'react';
import {loadTheme} from 'bilibili-parallax-banner';
import 'bilibili-parallax-banner/style.css';

export function SiteBanner({themeUrl}) {
  const root = useRef(null);
  useEffect(() => {
    const abort = new AbortController();
    let controller;
    loadTheme(root.current, themeUrl, {signal: abort.signal})
      .then(value => { controller = value; })
      .catch(error => { if (error.name !== 'AbortError') console.error(error); });
    return () => { abort.abort(); controller?.destroy(); };
  }, [themeUrl]);
  return <div ref={root} />;
}
```

只在客户端Effect中创建组件。SSR首屏按生成包中的 `embed.html` 预留高度和海报，避免JS到达前闪空或页面跳动。文字仍使用真实HTML，并放在主题约定的文字留白区。

## 4. Vue 3

```vue
<script setup>
import {ref, onMounted, onBeforeUnmount} from 'vue';
import {loadTheme} from 'bilibili-parallax-banner';
import 'bilibili-parallax-banner/style.css';
const root = ref(null);
const abort = new AbortController();
let controller;
onMounted(async () => {
  try { controller = await loadTheme(root.value, '/themes/summer/theme.json', {signal: abort.signal}); }
  catch (error) { if (error.name !== 'AbortError') console.error(error); }
});
onBeforeUnmount(() => { abort.abort(); controller?.destroy(); });
</script>
<template><div ref="root" /></template>
```

Vue路由参数更新时调用现有控制器的setTheme，或取消旧请求、销毁后重新加载。

## 5. 状态与失败

`ready`不等同所有图片成功。检查 `controller.state`：ready为全部成功，degraded为可选图层失败，error为重要图层失败。重要图层失败时显示本端合成海报并停止自动循环。

JSON请求失败会拒绝 `loadTheme`；宿主预置的CSS海报仍可作为首屏兜底。`setTheme`失败时报告错误并保留可用的上一画面。取消和快速替换返回AbortError，可忽略预期取消。

```js
root.addEventListener('theme:state', event => {
  console.log(event.detail.state, event.detail.variant, event.detail.mode);
});
```

## 6. 离线与CSP

`index.html`通过经典配置包装，可双击查看；`artifacts/offline.html`内嵌全部资源，可单独传到手机。`embed.html`演示真实网站的HTTP(S)主题加载，不使用fetch(file://)。

严格CSP的网站自托管组件，启动JS和首屏CSS按自己的nonce或外部文件策略处理；预览页内联资源是便携展示用途。组件本身不使用eval或第三方跟踪。

## 7. 上线验收

先运行 `theme:check`，再核对真实标题、按钮、字体、明暗对比、前景遮脸和抠图。确认移动端横向交互、纵向滚动、减少动态、后台、快速路由切换和资源失败。源图矩形检查不能替代浏览器与实体设备验收。

已有单端清单可继续使用 `loadBanner`，已经持有对象可用 `createBanner`；这些底层接口保留兼容，双端和动效策略优先使用新的统一主题控制器。
