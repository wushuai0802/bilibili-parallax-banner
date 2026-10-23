# API 参考 / v1.4

## 推荐：统一主题接口

```js
const controller = await loadTheme(root, '/themes/summer/theme.json', {
  signal: abortController.signal, timeout: 10000, mode: 'default'
});
await controller.setTheme('/themes/winter/theme.json');
controller.setMode('auto');
controller.setMode('pointer');
controller.setMode('still');
controller.setMode('default');
controller.pause();
controller.resume();
controller.destroy();
```

`loadTheme`创建ThemeBanner并等待当前布局就绪；`createTheme(root, inlineTheme, options)`直接返回控制器，通过ready等待。生成的离线预览使用含内联配置和data图片的createTheme，生产网页使用loadTheme。

| 项目 | 含义 |
| --- | --- |
| ready | 当前主题/布局的等待Promise；改变容器时跟随最新布局，替换主题时旧操作拒绝AbortError |
| state | loading、ready、degraded、error、destroyed |
| variant | desktop或mobile，按容器宽度与theme.breakpoint选择 |
| mode | 实际生效的pointer、auto、still |
| setTheme | 接受另一个URL或对象，取消旧操作并只挂载最后选择的资源 |
| setMode(default) | 恢复主题默认输入策略，不覆盖系统减少动态效果 |
| pause/resume | 宿主临时暂停与恢复，不丢失已选模式 |
| destroy | 取消请求、帧与定时器，解除观察器与事件，恢复宿主属性，保留原有子节点 |

JSON获取使用omit credentials和no-cache；默认10秒超时，支持100–120000ms。重要图层失败时状态为error，控制器仍可用、展示海报；JSON获取/解析错误会拒绝Promise。一次销毁后可在同一个容器重新创建控制器。

### 标准动效配置

```json
"motion": {
  "period": 8000,
  "resumeDelay": 1800,
  "fine": {"mode":"pointer","amplitude":0.85,"fps":60},
  "coarse": {"mode":"auto","amplitude":0.55,"fps":30}
}
```

period与resumeDelay使用毫秒。amplitude是进度幅度0–1，仍与清单中的interaction.strength相乘；触屏最多30fps，精细指针最多60fps。横向交互临时接管自动模式，结束后恢复；手动选择静态会跨布局、输入变化和减少动态的开关保留。

页面隐藏、横幅离屏、窗口失焦、暂停或减少动态时停止自动循环。原生滚动和双指缩放由底层触摸方向判定与多触点取消处理。浏览器前进/后退缓存恢复时保留控制器与用户模式。

### 主题事件

```js
root.addEventListener('theme:state', event => { /* {state,variant,mode,name} */ });
root.addEventListener('theme:ready', event => { /* 当前布局完成，可读取state */ });
root.addEventListener('theme:variant', event => { /* 变体加载完成 */ });
root.addEventListener('theme:mode', event => { /* 生效模式改变 */ });
root.addEventListener('theme:layout', event => { /* {...,width,height} */ });
root.addEventListener('theme:error', event => { /* {...,message} */ });
```

对应观测属性是data-theme-state、data-theme-variant、data-theme-mode、data-theme-name和data-theme-input-kind；销毁时恢复宿主原值。[主题Schema](../schemas/theme.schema.json)与[制作流程](WORKFLOW.md)。

## 底层绘制接口

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

`pause()` 归位并暂停视频；`resume()` 恢复允许的交互。`setProgress(-1..1)` 用于设计预览，遵守系统减少动态和暂停设置；默认只允许精细指针，设置 `interaction.touch:'drag'` 后也可在触屏上使用。不启动自动循环。

## 配置

固定比例容器可使用`height:{aspectRatio:4}`。aspectRatio为宽/高，支持0.5–100，优先于min/max/ratio/mobile/breakpoint；没有该字段的既有配置保持原行为。宿主CSS首屏同样预留`aspect-ratio:4/1;min-height:0`，避免加载前后比例变化。

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
interaction: {enabled:true, strength:1, resetDuration:200, touch:'none'}
```

高度按**容器宽度**计算，桌面 `clamp(width*ratio,min,max)`；小于等于 breakpoint 使用 mobile 高度。组件不设置页面最小宽度，也不拦截触摸滚动。

### 手机动态（可选）

`interaction.touch:'none'` 是默认策略，触屏保持静态。设为 `'drag'` 后启用单指横向拖动，也允许宿主用 `setProgress` 驱动轻量自动演示。
拖动采用8px方向判定阈值，横向意图明确时才接管；组件只设置自身容器 `touch-action:pan-y pinch-zoom`，不调用 `preventDefault()` 阻止上下滚动或缩放。
第二个触点出现时取消视差，包括第二个触点落在横幅之外的情况，将手势交给浏览器缩放；抬手或取消时归位。`destroy()` 恢复宿主原有的 touch-action。
配置手机海报时，默认仍用于静态降级；触摸动态启用时显示图层，减少动态效果生效时将同一套图层归位静止，避免重新切换海报导致人物大小变化。加载失败仍退到海报。

## 图层

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| id | layer-N | 唯一标识，用于事件与诊断 |
| src | 必填 | 图片/视频地址 |
| type | 按扩展名推断 | image / video |
| required | 首层 true，其余 false | 失败时是否整组退到海报 |
| scale | 1 | 初始缩放；同画布素材通常都为1 |
| fit | canvas | aligned 模式中，canvas 使用共同铺满缩放；contain 独立等比容纳完整逻辑画布 |
| position | [0.5,0.5] | contain 图层在剩余空间中的位置，0–1；[0.5,1] 为水平居中、底部对齐 |
| offset | [0,0] | 横向输入联动的 X/Y 位移，逻辑像素 |
| initial | [0,0] | 静止位置偏移 |
| opacity / rotate / blur | 1 / 0 / 0 | 不透明度、角度、模糊 |
| requireAlpha | false | 本地素材校验要求有真实透明像素，运行时不读 canvas |

手感公式：`progress=(pointerX-entryX)/containerWidth`，进入时不跳动；`dx/dy=(initial+offset*progress)*height/baseHeight*scale`。
同画布模式另计算共同出血缩放，防止水平与垂直运动露底；不分别扩大每张图而破坏对齐。

背景与需要拼接对齐的图层保留 `fit:'canvas'`。独立人物、标志或物体可以用 `fit:'contain',position:[0.5,1]`；该层不参与背景出血缩放，位移按自己的显示比例计算。它不是自动识别人脸，仍需为头部、文字和最大位移预留安全区。contain 的完整画布默认居中，裁到下边缘的半身像应显式底部对齐，避免悬空。
手机图层的高度需要随宽度变化时，可设置 `height:{min:120,max:280,ratio:200/375,breakpoint:0}`；`breakpoint:0` 表示所有正宽度都使用比例高度，不再套用固定 mobile 高度。

## 事件

```js
root.addEventListener('banner:ready', event => {
  // {state, loadedLayers, failedLayerIds}
});
root.addEventListener('banner:state', event => { /* {state, failedLayerIds?} */ });
root.addEventListener('banner:error', event => { /* {layerId, message} */ });
root.addEventListener('banner:motion', event => { /* {enabled} */ });
root.addEventListener('banner:visibility', event => { /* {visible} */ });
root.addEventListener('banner:interaction', event => { /* {phase:'start'|'end', pointerType:'touch', cancelled?:boolean} */ });
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
