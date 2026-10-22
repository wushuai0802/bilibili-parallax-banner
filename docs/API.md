# API 参考 / v1

所有单位除图片导出尺寸外均为 CSS 像素。先加载 `dist/banner.css`。

## 创建与状态

```js
const banner = createBanner(elementOrSelector, config);
await banner.ready;
console.log(banner.state);
banner.pause();
banner.resume();
banner.setProgress(0.5);
banner.destroy();
```

`ready` 在图层成功、失败或超时处理结束后解析为实例。它不代表所有资源成功，请检查 `state`。
非法配置、重复挂载、找不到容器会同步抛错。`loadBanner` 的网络/JSON错误会拒绝 Promise，由宿主捕获。

| 状态 | 含义 |
| --- | --- |
| loading | 正在加载 |
| ready | 全部图层可用 |
| degraded | 必要图层可用，可选图层失败 |
| error | 必要图层失败，显示海报/背景 |
| destroyed | 已卸载；重复 destroy 安全 |

`pause()` 归位并暂停视频；`resume()` 恢复允许的交互。`setProgress(-1..1)` 用于设计预览，遵守系统减少动态、暂停和指针能力设置，不启动自动循环。

## 配置

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| version | 1 | 清单版本 |
| mode | aligned | 同画布模式；兼容模式由适配器生成 |
| baseWidth / baseHeight | 1920 / 180 | 逻辑画布 |
| pixelRatio | 2 | 实际图片尺寸与逻辑尺寸之比 |
| baseUrl | 当前页面地址 | 相对资源解析基准；loadBanner 使用清单地址 |
| poster / mobilePoster | 无 | 静态海报 / 可选独立手机海报 |
| posterPosition | 50% 50% | 海报 object-position |
| description | 空 | 场景的可访问描述；不填时装饰层 aria-hidden |
| background | #173d42 | 最终兜底底色 |
| taper | true | 100px 顶部渐隐遮罩 |
| loadTimeout | 10000 | 单资源加载超时，毫秒 |
| height | 见下文 | 容器响应式高度 |
| interaction | 见下文 | 交互参数 |
| layers | 必填 | 从背景到前景的图层数组，1–32层 |

```js
height: {min:155, max:240, ratio:0.09375, mobile:144, breakpoint:640},
interaction: {enabled:true, strength:1, resetDuration:200}
```

高度按**容器宽度**计算，桌面 `clamp(width*ratio,min,max)`；小于等于 breakpoint 使用 mobile 高度。组件不设置页面最小宽度，也不拦截触摸滚动。

## 图层

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| id | layer-N | 唯一标识，用于事件与诊断 |
| src | 必填 | 图片/视频地址 |
| type | 按扩展名推断 | image / video |
| required | 首层 true，其余 false | 失败时是否整组退到海报 |
| scale | 1 | 初始缩放；同画布素材通常都为1 |
| offset | [0,0] | 横向输入联动的 X/Y 位移，逻辑像素 |
| initial | [0,0] | 静止位置偏移 |
| opacity / rotate / blur | 1 / 0 / 0 | 不透明度、角度、模糊 |
| requireAlpha | false | 本地素材校验要求有真实透明像素，运行时不读 canvas |

手感公式：`progress=(pointerX-entryX)/containerWidth`，进入时不跳动；`dx/dy=(initial+offset*progress)*height/baseHeight*scale`。
同画布模式另计算共同出血缩放，防止水平与垂直运动露底；不分别扩大每张图而破坏对齐。

## 事件

```js
root.addEventListener('banner:ready', event => {
  // {state, loadedLayers, failedLayerIds}
});
root.addEventListener('banner:state', event => { /* {state, failedLayerIds?} */ });
root.addEventListener('banner:error', event => { /* {layerId, message} */ });
root.addEventListener('banner:motion', event => { /* {enabled} */ });
```

事件绑定在容器上；加载错误信息不包含完整图片 URL。首次 loading 事件发生在创建过程中，监听它需先绑定再创建。

## B站分层适配器

```js
const config = fromBilibiliSplitLayer(splitLayerObjectOrString, {
  baseUrl: 'https://my-assets.example/banner/',
  poster: 'poster.webp'
});
const banner = createBanner(root, config);
```

接受 v1 对象、JSON字符串或带 `data.split_layer` 的响应对象。支持每层第一项活动资源（图片或静音循环视频），保留天然尺寸和数组绘制顺序。
支持 scale/rotate/translate/blur/opacity 的初始值、偏移和 offsetCurve；blur/opacity 的 alternate 规则也支持。
不实现 `extensions.time`、额外插件回调或同层自动切换多资源；这些非空扩展会明确拒绝，不静默跳过。

## 卸载与错误恢复

`destroy()` 停止定时器、视频、帧更新，断开观察器，解除事件并保留宿主内容。加载过程中销毁也会结束等待。
重试或更换主题时先 destroy 再 create；没有自动无限重试，不会在路由卸载后继续更新旧页面。
