# 标准制作与交接流程

## 只维护一份制作工程

v1.3把源图、制作工程和网站交付包分开。AI或美工维护 `project.json` 和源图；通用工具导出双端素材、海报、预览、检查报告和部署ZIP；网站开发只接入一次 `loadTheme`。

```text
参考海报 → AI/美工拆层、补背景、标注重点 → project.json
  → theme:build → 双端图片 + theme.json + 预览/报告/ZIP
  → 网站 loadTheme → 后续只换主题地址
```

美工不用手动放大每个导出尺寸、重复计算两端关键区域或拼装JS。框架中没有按角色名、文件名、某部作品分支的裁切代码；需要调整的构图参数全部使用统一的布局字段。

## 1. 初始化

制作工具需要Node.js 22或24。在源码仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run theme:init -- themes/summer
```

初始化会创建源图占位、可编辑工程和本地JSON Schema，不覆盖已有目录。可以把整个工程目录连同AI任务书交给美工或后续AI。

```text
themes/summer/
  project.json
  source/background.svg
  source/subject.svg
  source/foreground.svg
  schemas/
  README.md
```

## 2. 准备源图

源图可保留原分辨率，不必手工导出电脑与手机两套完整画布。至少提供不透明背景；需要人物独立运动时再提供真实透明的人物，近景可选。没有近景就删除该图层，不交付空白占位图。

主体必须已经抠图，背景要补全抠图留下的空洞并去掉重复人物。工具负责透明边缘裁切和排版，不把整张扁平海报自动拆开，也不自动补画被遮住的内容。

替换源文件后修改 `src`、作者、来源、许可及每个关键主体的标注。PNG/WebP等位图可以直接替换占位SVG；修改对应扩展名即可。

## 3. 最少需要填写的内容

```json
{
  "version": 1,
  "name": "summer",
  "artwork": {"author":"作者","source":"来源","license":"实际使用许可"},
  "preview": {"title":"主题名称"},
  "layers": [
    {"id":"background","role":"background","src":"source/background.webp"},
    {"id":"hero","role":"subject","src":"source/hero.png",
     "regions":[{"id":"head","rect":[120,40,220,200]}]}
  ]
}
```

`regions.rect` 是源图按正常方向显示后的 **实际像素** `[x,y,width,height]`，每个重要头部或物体分别标一次。工具会把标注转换到两端导出画布；不需要再手填两套坐标。SVG也按明确声明的实际width/height计量。

默认角色只有 `background`、`subject`、`foreground`、`detail`：第一层必须是唯一背景；独立主体默认等比、底部对齐；多主体自动分配放置区域。默认导出电脑3840×432、手机1125×600，图层顺序沿用输入顺序。

## 4. 构图需要调整时

只在 `project.json` 的 `variants.desktop.layers` 或 `variants.mobile.layers` 覆盖相应图层。所有主题使用相同字段：

| 字段 | 作用 |
| --- | --- |
| src | 使用另一张源图；通常继续复用同一组源图 |
| regions | 源图不同才需要覆盖关键区域标注 |
| layout.fit | cover铺满、contain等比容纳、fill按框填充；fill适用于已经完成构图的同画布图 |
| layout.trim | 默认去掉透明边缘；已经完成构图时可设false |
| layout.box | 在目标画布放置区域，归一化的[x,y,width,height]；完整画布为[0,0,1,1] |
| layout.anchor | 框内对齐，[0.5,1]为水平居中、底部对齐 |
| layout.crop | 可选，先从源图裁出一个实际像素矩形；不能裁掉已标记关键区域 |
| runtime | 高级选项，覆盖已有组件的offset、initial、fit、position、scale等参数 |

```json
"variants": {
  "mobile": {
    "layers": {
      "hero": {"layout":{"box":[0.45,0.42,0.5,0.58]}}
    }
  }
}
```

已有完整画布的美术可以设置 `layout:{fit:'fill',trim:false,box:[0,0,1,1]}` 原样放入导出画布。尺寸一致的WebP会直接复用，避免重复有损压缩。原始 `sourceCrop`、`characterWidth`、`cropLeft` 等示例专用字段已退出流程。

`textZones` 使用目标横幅0–1比例，为网站标题、导航或按钮预留位置；关键标注按导出画布的逻辑像素写入生成结果。两类坐标的换算由工具处理。[字段Schema](../schemas/project.schema.json)提供编辑器提示，CLI还会做图片与几何语义校验。

## 5. 一次生成与检查

```sh
npm run theme:build -- themes/summer/project.json --out outputs/summer
```

默认自动完成源图解码、透明检查、sRGB处理、双端排版、合成海报、内容哈希命名、构图检查和打包。需要GIF可加 `--gif`；`--no-proofs`只跳过模型检查图的渲染，不跳过校验。

| 文件 | 使用者和用途 |
| --- | --- |
| theme.json | 网站唯一主题入口，包含两端配置及不可变清单引用 |
| desktop/、mobile/ | 哈希命名的图片和清单，防止缓存混用 |
| index.html | 实际网页预览，可双击打开 |
| embed.html | 最小网站接入示例；通过HTTP(S)运行 |
| artifacts/offline.html | 全部资源内嵌，可单独发送到手机打开 |
| artifacts/contact-sheet.png | 默认6种宽度×左、中、右，含关键区域和文字区标注的模型构图图 |
| artifacts/report.json | 机器可读结果、错误、体积与源图放大提示 |
| artifacts/theme.zip | 本次生成文件的部署包，不包含原始源图、项目目录或私人旁文件 |

校验失败时CLI退出码为1，上一版 `theme.json` 保持不变；失败预览与报告保存在 `artifacts/failed/<revision>/`。已经成功生成的目录可以重复构建；首次向含有同名文件的目录写入会拒绝，需选择新目录或明确加 `--overwrite`。工具不删除目录里的其他文件。

需要单独复验交付包时：

```sh
npm run theme:check -- outputs/summer/theme.json
```

检查覆盖声明的宽度、五个位移进度、图片尺寸和透明、所有关键区域及文字区距离；还核对内联配置与不可变清单一致。它不识别真实人脸，也不检查抠图审美和前景真实像素是否遮脸，最终以预览和网站画面核对。

## 6. 网站接入与换主题

把theme.zip解压到静态资源目录，使用预构建组件：

```js
const banner = await LayeredBanner.loadTheme('#banner', '/themes/summer/theme.json');
await banner.setTheme('/themes/winter/theme.json');
banner.destroy(); // 路由或页面组件卸载时
```

加载器按容器宽度选择两端，只创建当前端图像。默认精细指针使用鼠标视差、触屏轻量自动演示；交互接管后按标准策略恢复。离屏、后台、失焦、用户暂停或系统减少动态时停止循环；快速切换、取消请求和浏览器返回恢复由控制器处理。

正式网站保留自己的导航、文案和按钮；预览页不是网站业务框架。`embed.html`已展示首屏高度和海报预留，网站可按同一方式预置，减少等待JS时的布局变化。[完整框架接入](INTEGRATION.md)。

## 7. 验收与发布

- 源图阶段检查清晰度、重复人物、抠图和补景；工具会提示位图超过1.5倍放大的情况。
- 先修复报告错误，再看左右位移、手机横竖屏和网站真实标题；不要仅依赖矩形标注。
- 新主题的校验命令加入项目CI。仓库现有图像主题和默认模板统一运行同一工具。
- 仓库浏览器CI覆盖Chromium电脑、Chromium触屏和WebKit触屏布局，保留实际网页截图；实体设备仍属于单独的设备验收范围。
- 组件固定版本，theme.json使用no-cache，哈希图片与不可变清单可长期缓存。发布包包含同一版本的代码、文档、源模板与Schema。

`themes/catalog.json`只登记示例工程路径和输出位置；通用源码不包含作品名判断、角色坐标计算或特定近景拼装。芙莉莲的现成画布与独立几何源图都通过这条流程构建。
