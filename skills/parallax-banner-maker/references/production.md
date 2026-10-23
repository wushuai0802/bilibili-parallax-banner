# 工具与工程

## 源码与依赖

本 Skill 的批量脚本只依赖 Node.js 内置模块，实际制作复用源码仓库：
https://github.com/wushuai0802/bilibili-parallax-banner

已验证基线为 v1.4.0，工程合同 version:1。使用 Node.js 22 或 24。首先找用户已有源码，检查 package.json 的 name；当前目录和 Skill 位于仓库内时脚本可自动寻找，否则显式传 --repo。不要硬编码制作方电脑路径。

首次准备可将源码下载或克隆到用户选定的开发目录，再在该目录运行 npm ci --ignore-scripts。需要新克隆时使用已验证标签 v1.4.0；已有仓库不切换分支或覆盖本地修改。预构建引擎 dist/banner.min.js、dist/banner.css 随源码提供；缺失时在确认的源码目录运行 npm run build。doctor 会实际加载生成与校验模块，检查依赖和预览引擎。

下面的 "SKILL_DIR" 和 "REPO_DIR" 表示当前环境发现的真实绝对路径，执行时替换；含空格的路径保留引号。

~~~sh
node "SKILL_DIR/scripts/banner-batch.mjs" doctor --repo "REPO_DIR"
~~~

doctor 的 future-version 提示表示该版本未在此 Skill 的交付验证中覆盖。2.x 合同需要先复核脚本兼容性。Skill 不会自动联网、安装模型、读取账号或修改代理。

## 单张流程

以下 npm 命令在源码仓库根目录执行。输出和源图分开；新工程不放进 Skill 安装目录。

~~~sh
npm run theme:init -- "PROJECT_DIR" --name summer-film --preset 4x1
npm run theme:build -- "PROJECT_DIR/project.json" --out "OUTPUT_DIR"
npm run theme:check -- "OUTPUT_DIR/theme.json"
~~~

初始化后务必替换 source/ 占位图、作者信息和 regions；初始化本身不是完成制作。通用全宽模板省略 --preset 4x1，采用已有项目约定的比例。

## UBits 4:1

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
