# UBits 首页 Banner 对接

目标页：[UBits 新版首页](https://ubits.club/newui/)。本适配只增强画面层；网站继续负责个人中心、轮播数据、链接、箭头、指示条、搜索与业务。没有向原站注入或部署代码。

## 1. 实测约束

2026-10-23，在已登录浏览器读取现有页面的DOM、已加载CSS和容器尺寸。没有导出账户数据、Cookie、原站图片或完整站点源码。

| 项目 | 当前页面 |
| --- | --- |
| 外层 | `.ub-home-banner-section`，圆角8px，1px边框，overflow:hidden |
| 图片区域 | `#ub-home-banner.ub-banner`，**aspect-ratio:4/1** |
| 原生画面 | `--art`、`--next-art`配合center/cover与伪元素淡入 |
| 跳转层 | `#ub-home-banner-link`绝对定位铺满 |
| 轮播 | `[data-banner-direction]`、`[data-banner-index]`，默认5秒切换 |
| 箭头 | 约40×48px，左右各2px，垂直居中 |
| 指示条 | 20×3px，间距7px，当前项为红色 |
| 宿主交互 | 外层hover可缩放1.006并提亮；尺寸计算须用未变换的容器CSS像素 |
| 全站动效 | `#ub-top-motion-toggle` |

4:1指图片区域，不包含外层边框。截图约1245×312的比例与CSS一致。不能把整个浏览器宽度当作横幅宽度。

个人中心展开的实测值：

| 浏览器宽 | Banner内容宽 | 高 | 侧栏行为 |
| --- | --- | --- | --- |
| 1920 | 1244 | 311 | 右列385px |
| 1440 | 994 | 248.5 | 右列385px |
| 1280 | 约758.125 | 约189.531 | 右列约460.875px |
| 1024 | 657 | 164.25 | 右列320px |
| 768 | 740 | 185 | fixed浮层 |
| 390 | 362 | 90.5 | fixed浮层 |

在2560屏宽收起面板后，内容宽约1638、高409.5。侧栏宽度随原站布局改变，不应在组件中写死`屏宽-385`。实测窄屏来自当前桌面页面的响应式布局，**不等同于单独服务端移动模板的实测**；原脚本存在`[data-mobile-home-banner]`分支，部署到该模板时仍须检查其父框。

## 2. 一次接入

自托管以下文件，保持主题子目录完整：

```text
/assets/layered-banner/v1.4.0/
  banner.css
  ubits.css
  ubits.min.js              # 已包含引擎，无需再加载banner.min.js
/themes/home-2026-10/
  theme.json
  desktop/...
  mobile/...
```

加载顺序为站点样式、引擎样式、适配样式：

```html
<link rel="stylesheet" href="/assets/layered-banner/v1.4.0/banner.css">
<link rel="stylesheet" href="/assets/layered-banner/v1.4.0/ubits.css">
<script src="/assets/layered-banner/v1.4.0/ubits.min.js"></script>
```

在原来的首页轮播脚本内，`banner`和`mobileBanner`定义之后建立接入实例。只为实际存在的容器建立实例：

```js
var bannerBridge = window.UBitsBanner && banner
  ? UBitsBanner.mount(banner, {motionToggle:'#ub-top-motion-toggle'}) : null;
var mobileBannerBridge = window.UBitsBanner && mobileBanner
  ? UBitsBanner.mount(mobileBanner, {motionToggle:'#ub-top-motion-toggle'}) : null;
function clearBannerVisual() {
  if (bannerBridge) void bannerBridge.setSlide(null);
  if (mobileBannerBridge) void mobileBannerBridge.setSlide(null);
}
function syncBannerVisual(slide) {
  if (bannerBridge) void bannerBridge.setSlide(slide);
  if (mobileBannerBridge) void mobileBannerBridge.setSlide(slide);
}
```

给需要视差的轮播记录新增可选`theme`。`poster`继续保留，使用生成目录中电脑端合成海报的真实哈希文件名：

```js
{
  title: '自己的标题',
  poster: '/themes/home-2026-10/desktop/poster-实际哈希.webp',
  link: '/newui/details/自己的记录',
  theme: '/themes/home-2026-10/theme.json'
}
```

只改原脚本的两个连接点：

1. **开始转场时**：在`goToSlide()`中预载完成、开始写`--next-art`之前调用`clearBannerVisual()`。让原生海报与伪元素继续负责整个淡入过程，避免旧动态层挡住新海报。
2. **提交当前页时**：在`renderSlide(slideIndex)`结尾调用`syncBannerVisual(slides[slideIndex])`。初始页也需要调用一次；如果已有初始`renderSlide(index)`，不用重复添加。

没有`theme`的记录仍走原生静态轮播。JSON或重要图片失败时移除增强层，保留原生海报、按钮与链接。切换很快时旧请求会取消；一个实例只保留当前页面的图层。

移动模板的宿主图片区域也必须为4:1，例如按实际DOM确认后设置：

```css
[data-mobile-home-banner] {
  position:relative;
  aspect-ratio:4 / 1;
  min-width:0;
  min-height:0;
  overflow:hidden;
}
```

不要在不核对原站规则时叠加固定高度。外层负责尺寸；接入层是绝对定位，不参与原站grid排版。若原站原链接层有不透明背景，需由网站开发方移除该链接层背景，以显示其下的画面层。

ESM入口为`dist/ubits.js`的`mount`。API为`setSlide(slide)`、`setMode('default'|'auto'|'pointer'|'still')`和`destroy()`；`setSlide`返回是否成功增强，失败另触发`ubits-banner:error`事件。路由卸载时销毁实例；非框架页面正常卸载由主题控制器处理。

## 3. 个人中心与触摸

组件通过ResizeObserver观察实际容器，个人中心开合不需要额外刷新或重建。跨767px时会自动选择紧凑构图；即使电脑窗口宽1280px，展开侧栏后也可能用紧凑图。两端都是4:1，切换前后不跳到180px固定手机高度。

保留原站浮层、侧栏开关、层级与滚动策略；不监听账户字段，也不改全站`.ub-content`或`.ub-shell`规则。示例页的侧栏CSS仅为验收支架，**不要整体复制进生产站点**。

手机上画面自动轻动效，滑动与点击由原轮播接收；接入层只转发鼠标事件给画面，因此不会同时触发手动视差和轮播。原站负责阻止滑动后误跳转、双指缩放和多触点管理。独立主题预览仍可以手动拖动视差，两种宿主的手势策略不同。

关闭站点动效开关，或系统启用减少动态，增强层静止。后台、失焦与离屏停止自动帧。原站是否继续自动换页仍由其原轮播政策决定。

## 4. 换图标准

```sh
npm run theme:init -- themes/my-ubits-banner --preset 4x1
npm run theme:build -- themes/my-ubits-banner/project.json --out outputs/my-ubits-banner
npm run theme:check -- outputs/my-ubits-banner/theme.json
```

仓库适配交付包可用`npm run build`后运行`npm run package:ubits`重新生成，输出到outputs目录。包内含部署文件、4:1源工程、对接文档、离线预览和构图报告；制作工具从对应版本源码运行。

| 项目 | 电脑构图 | 紧凑构图 |
| --- | --- | --- |
| 逻辑画布 | 1920×480 | 400×100 |
| 导出倍率 | 2 | 3 |
| 所有图层与海报 | 3840×960 | 1200×300 |
| 高度规则 | `height.aspectRatio:4` | `height.aspectRatio:4` |
| 使用依据 | 容器>767px | 容器≤767px |

使用同一套源素材，工具生成两端，不要求美工重复抠图。背景等比cover，人物contain；禁止把旧的宽扁或高手机画布fill拉伸成4:1。只有一张扁平海报时，先完成拆层与背景补绘；工具不自动抠图或补景。

不要把搜索框、片名、导航和账户内容烘焙进图。以真实控件为准预留左右至少42px；关键头部避开底部指示条及4px安全间距。增加指示条数量、标题或Logo后，更新源工程的textZones并复验实际DOM。紧凑画面高度较低，优先呈现胸像、头像与横向场景。

## 5. 交接验收

[适配预览](https://wushuai0802.github.io/bilibili-parallax-banner/examples/ubits/)提供个人中心开关、原生静态/动态切换、触摸轮播和尺寸读数，使用原创MIT素材，无原站内容。`examples/ubits/theme/artifacts/offline.html`可双击打开标准4:1主题预览；带侧栏的站点支架通过HTTP打开。

自动检查覆盖390、768、1024、1280、1440、1920屏宽，以及侧栏展开/收起、关键区域、重复图层、原链接、指示条与图片失败。构图校验另覆盖24种容器宽度和5个位移位置。浏览器CI区分Chromium、WebKit和原生Chromium触摸派发。

上线仍需网站开发者在实际首页套入上述两个连接点，验证部署路径、CSP、真实移动模板、站点现有滑动处理和业务跳转。当前交付是适配文件与可复核预览，不是生产站点已部署的证明。
