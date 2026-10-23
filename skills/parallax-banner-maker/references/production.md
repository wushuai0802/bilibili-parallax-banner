# 工具与工程

## 源码与依赖

本 Skill 的批量脚本只依赖 Node.js 内置模块，实际制作复用源码仓库：
https://github.com/wushuai0802/bilibili-parallax-banner

组件合同基线为 v1.4.0，新增工具随 skill-v1.1.0 标签发布，工程合同仍为 version:1。使用 Node.js 22 或 24。先找已有源码并检查 doctor 的 capabilities；只看 package.json 版本不能判断是否已有保真、缓存和精简包功能。

首次准备下载或克隆 skill-v1.1.0 对应源码，在源码目录运行 npm ci --ignore-scripts。已有环境直接复用，不擅自切换分支或覆盖修改。只在预构建引擎缺失时运行 npm run build；普通制图不重建全部历史示例。

下面的 "SKILL_DIR" 和 "REPO_DIR" 表示当前环境发现的真实绝对路径，执行时替换；含空格的路径保留引号。

~~~sh
node "SKILL_DIR/scripts/banner-batch.mjs" doctor --repo "REPO_DIR"
~~~

doctor 的 future-version 提示表示该版本未在此 Skill 的交付验证中覆盖。2.x 合同需要先复核脚本兼容性。Skill 不会自动联网、安装模型、读取账号或修改代理。

## 单张流程

保留原海报时，复制 assets/preserve-plan.example.json，填写原图、填充板、原尺寸遮罩、头部区域及实际来源。一层可合并人物与支撑地面的多张遮罩：

~~~sh
npm run theme:preserve -- "PLAN.json" --out "NEW_PROJECT_DIR"
npm run theme:build -- "NEW_PROJECT_DIR/project.json" --out "OUTPUT_DIR" --quick --ubits
~~~

输入已经是 4:1 时保留原坐标与原生电脑分辨率，避免无效放大。preserve.reference 要求两端源图层静止合成与完整原图逐像素一致；删字、隐藏、裁切、重排或改透明度会被拒绝。检查发生在缩放和有损编码之前，不等于浏览器最终像素逐字节相同。

--quick 保留内容与几何检查，仅跳过大型构图拼图；确认画面后去掉它做一次最终构建。保真工程默认只输出 362、758、1244 三种代表宽度的拼图，几何检查仍覆盖全部声明宽度。--ubits 自动生成带侧栏开合与“对照原图”的 artifacts/ubits-offline.html。

单张构建按输入、工具、选项和产物摘要复用缓存；--rebuild 强制重建。耗时须区分环境准备、分层／补绘与本地导出，不能把已有遮罩的构建秒数当作任意新海报的全部制作时间。

以下 npm 命令在源码仓库根目录执行。输出和源图分开；新工程不放进 Skill 安装目录。

~~~sh
npm run theme:init -- "PROJECT_DIR" --name summer-film --preset 4x1
npm run theme:build -- "PROJECT_DIR/project.json" --out "OUTPUT_DIR"
npm run theme:check -- "OUTPUT_DIR/theme.json"
~~~

初始化后务必替换 source/ 占位图、作者信息和 regions；初始化本身不是完成制作。通用全宽模板省略 --preset 4x1，采用已有项目约定的比例。

## UBits 4:1

下表是新创作／手工模板的推荐规格。保真导入使用原图原生尺寸作为电脑画布，紧凑端等比输出；不能为了套表强制放大或重排。

| 内容 | 电脑 | 紧凑 |
| --- | --- | --- |
| 逻辑画布 | 1920×480 | 400×100 |
| 导出倍率 | 2 | 3 |
| 图层及海报 | 3840×960 | 1200×300 |
| 容器 | 大于 767px | 不超过 767px |
| 高度 | height.aspectRatio:4 | height.aspectRatio:4 |

容器宽度决定构图，电脑展开个人中心后也可能变为紧凑构图。两端都为 4:1。不要复用旧的高手机画布并拉伸。

## 源工程规则

- 只维护 project.json 和源图；生成的 theme.json、哈希图片和清单由工具管理。
- 第一层是唯一 background，其后可用 subject、foreground、detail。前景可省略，不能提交空白占位层。
- 背景用 cover；主体通常用 contain，不能使用 fill 拉伸人物。导出图层保留完整画布，源人物可用紧贴轮廓的透明 PNG/WebP。
- regions.rect 是源图经 EXIF 正向显示后的实际像素 [x,y,width,height]；每个重要头部分别标记，包括同一张群像图中的所有人。图片替换或裁切后重新测量。
- layout.box 是目标画布的 0–1 放置框，layout.anchor 为框内对齐；layout.crop 使用源图实际像素。runtime 用已有标准字段，不添加作品专用参数。
- artwork.author/source/license 填真实来源与许可；信息不明如实记录待确认，不能把组件 MIT 许可移植到第三方图片上。
- textZones 表示网站实际文字与控件预留区。UBits 的左右箭头至少预留实际占用宽度（当前文档约 42px），头部还需避开底部指示条及约定安全间距。实际网页控件改变时更新预留区。

可用排版起点：单人使用右侧区域；群像按重要程度分配横向空间；场景以完整背景为主、独立细节层为辅。参数要根据实际源图调整，模板中的关键区域不能照抄。

## 静态制作

用户接受静态模式时，先完成合格的背景成图，工程仅保留一个 background。两端 interaction.enabled 设为 false，背景 runtime.offset 设为 [0,0]；移除其他层及其端内覆盖。背景必须至少标一处实际重要区域（人脸、建筑或主体景物）的 regions，纯场景也不能留空；生成器的配对校验要求每端有保护区域，以便检查 cover 裁切。保留原图来源信息。静态包用同一构建与校验流程，不声称有独立人物视差。

## 项目文档

实施时以选定源码版本的 docs/WORKFLOW.md、docs/IMAGE-SPEC.md、docs/UBITS.md 和 schemas/project.schema.json 为准，按需要读取。源码版本变化时优先核对合同及导出命令，不复制维护第二套生成器。
