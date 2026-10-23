# Bilibili Parallax Banner

独立、零运行时依赖的分层视差Banner组件。网站接入一个主题地址；AI或美工维护一份标准工程，工具自动导出双端素材、海报、预览、校验报告和部署包。

Inspired by Bilibili-style pointer parallax. MIT component code. Not affiliated with Bilibili; no Bilibili proprietary code or artwork is distributed.

## 效果预览

[![分层视差动效示意](docs/images/frieren-parallax.gif)](https://wushuai0802.github.io/bilibili-parallax-banner/examples/frieren/)

[芙莉莲预览](https://wushuai0802.github.io/bilibili-parallax-banner/examples/frieren/) · [通用源图自动排版示例](https://wushuai0802.github.io/bilibili-parallax-banner/examples/studio/) · [下载离线HTML](https://github.com/wushuai0802/bilibili-parallax-banner/releases/download/v1.3.0/frieren-banner-preview.html)

[UBits 4:1适配预览：支持个人中心开合](https://wushuai0802.github.io/bilibili-parallax-banner/examples/ubits/) · [站点对接文档](docs/UBITS.md) · [4:1源工程模板](templates/banner-4x1/README.md)

所有示例调用同一生成工具和主题控制器。动图与构图图按布局模型生成；网页预览使用真实组件，浏览器截图由CI单独提供。影视示例为非官方AI重绘，[素材说明](themes/frieren/README.md)。

## 网站接入一次

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/wushuai0802/bilibili-parallax-banner@v1.4.0/dist/banner.css">
<div id="banner"></div>
<script src="https://cdn.jsdelivr.net/gh/wushuai0802/bilibili-parallax-banner@v1.4.0/dist/banner.min.js"></script>
<script>
  LayeredBanner.loadTheme('#banner', '/themes/summer/theme.json')
    .then(controller => { window.siteBanner = controller; });
</script>
```

自动选择容器对应的电脑/手机素材、管理默认动效与交互接管，并处理离屏、后台、减少动态、快速换主题和卸载。后续换主题：

```js
await siteBanner.setTheme('/themes/winter/theme.json');
siteBanner.destroy(); // 路由卸载时
```

只加载当前端图片；网站继续管理导航、标题、按钮与业务。生成包中的 `embed.html` 提供首屏高度和海报预留示例。ESM、React、Vue及取消请求见[接入指南](docs/INTEGRATION.md)。

## AI与美工的标准流程

在源码仓库中安装制作工具后：

```sh
npm ci --ignore-scripts
npm run theme:init -- themes/summer
```

固定4:1容器使用 `npm run theme:init -- themes/my-banner --preset 4x1`。按容器宽度选择构图，兼容侧栏开合；新字段 `height.aspectRatio:4` 优先于原有的最小/最大高度与固定手机高度。

替换源图、填写实际作者信息，并在 `project.json` 标注每个重要头部或物体。源图可保留原分辨率，默认透明边缘裁切、双端布局与动效参数由工具处理。

```sh
npm run theme:build -- themes/summer/project.json --out outputs/summer
npm run theme:check -- outputs/summer/theme.json
```

得到可直接预览的网页、单文件离线HTML、双端图片、带标注的构图检查图、JSON报告和 `artifacts/theme.zip`。布局调整使用统一的 `crop/box/fit/anchor` 字段，无需修改生成代码。[完整流程](docs/WORKFLOW.md) · [AI任务书](templates/theme-project/AI-BRIEF.md)。

输入仍需要已经拆层的背景和透明主体；工具不从任意扁平海报自动抠图、补景或识别人脸。素材制作与验收约定见[图片规范](docs/IMAGE-SPEC.md)。

## 文档与模板

| 需要 | 入口 |
| --- | --- |
| 从海报到网站的完整交接 | [标准流程](docs/WORKFLOW.md) |
| 网站、React、Vue接入 | [接入指南](docs/INTEGRATION.md) |
| UBits 4:1、侧栏和原生轮播 | [站点适配](docs/UBITS.md) |
| 源图与导出图片要求 | [图片规范](docs/IMAGE-SPEC.md) |
| 可复制的制作工程 | [源工程模板](templates/theme-project/README.md) |
| 已经做好双端图片的接入方 | [交付目录模板](templates/theme/README.md) |
| 参数、事件与底层绘制接口 | [API](docs/API.md) |
| 编辑器字段提示 | [工程Schema](schemas/project.schema.json)、[主题Schema](schemas/theme.schema.json) |
| 检查范围与兼容边界 | [测试](docs/TESTING.md)、[参考](docs/REFERENCE.md) |

## 维护与许可

```sh
npm run check
npm run dev
```

`check`构建全部目录登记的主题、运行单元/离线/生成流程检查，并验证所有输出。浏览器CI另运行 `npm run test:browser`，覆盖Chromium与WebKit并保留截图。制作需要Node.js 22或24；网站使用预构建文件即可。

组件也保留 `createBanner/loadBanner` 和B站 `split_layer v1` 适配器供高级接入。项目尚未发布npm registry包，可以自托管dist或安装固定Git标签。

组件代码、工具和几何模板使用[MIT](LICENSE)。影视角色及参考美术的权利归相应权利人，不包含在组件的MIT许可中。主题包记录各自作者、来源和许可。
