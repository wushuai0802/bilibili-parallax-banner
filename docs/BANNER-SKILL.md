# 运营 Banner 制作 Skill

parallax-banner-maker 将本项目制作流程交给支持 Agent Skills 的 AI 客户端执行，覆盖单张、批量、UBits 4:1、保留原人物、AI 创作和静态交付。Skill 版本 1.0.0，已验证源码基线 v1.4.0。

## 安装与准备

直接下载 [Skill v1.0.0 安装包](https://github.com/wushuai0802/bilibili-parallax-banner/releases/download/skill-v1.0.0/parallax-banner-maker.zip)，解压得到 parallax-banner-maker 文件夹，包含 SKILL.md、界面元数据、制作参考和批量脚本。[发布页](https://github.com/wushuai0802/bilibili-parallax-banner/releases/tag/skill-v1.0.0)另附使用说明和 [SHA256 校验值](https://github.com/wushuai0802/bilibili-parallax-banner/releases/download/skill-v1.0.0/SHA256SUMS.txt)。

需要查看或维护 Skill 时使用 [仓库中的源文件](../skills/parallax-banner-maker/)。本地重新打包可在源码仓库运行 npm run package:skill，得到 outputs/parallax-banner-maker.zip。

将整个文件夹复制到客户端的技能目录。Codex 通常使用 CODEX_HOME 下的 skills；未设置 CODEX_HOME 时为用户目录下的 .codex/skills。保留已有同名安装并先比较版本，避免直接覆盖自定义内容。客户端重新发现技能后可用名称调用；当前已打开的会话是否即时刷新由客户端决定。

运营还需要：

- 本项目源码和 Node.js 22 或 24；在源码目录完成 npm ci --ignore-scripts。
- 做抠图、补景或原创图时，客户端有实际可用的图像工具。只导出已有源工程不需要图像服务。
- 原图或分层素材及其来源信息。

Skill 本身不包含账号、API Key、电脑固定路径、图像模型或生产站点登录信息。它调用本项目的标准制作工具；图像生成能力由运营自己的客户端提供。只发一份 Skill 并不等于所有运行依赖已安装。

## 运营直接这样说

~~~text
使用 $parallax-banner-maker，把这张海报制作成 UBits 4:1 动态 Banner。
保留原图人物，补全背景，兼顾个人中心展开后的紧凑构图，给我离线预览和网站主题包。
~~~

~~~text
使用 $parallax-banner-maker，批量处理这个目录的海报。
保留每张原图的主要人物，逐项制作 UBits 4:1 主题；有困难的项目列明原因并继续其他项。
请给我一个总览，方便集中复核和下载。
~~~

~~~text
使用 $parallax-banner-maker，继续这个批次。
我修改了第二张的人物位置，请重新导出这一项，复用其他未变化且检查合格的结果。
~~~

已有分层工程时直接提供 project.json。只有平面海报时，AI 会先准备背景和透明主体；缺少所需能力时记录 needs_preparation，并给出具体素材任务书。

## 单张与批量产物

单张交付沿用标准 theme:build：双端图片、theme.json、网页与单文件离线预览、构图图、报告、artifacts/theme.zip，以及独立保存的源工程。

批量脚本另生成：

- index.html：各项海报、状态、预览和主题 ZIP 链接。
- batch-state.json：输入摘要、输出摘要、状态和实际复核记录。
- themes/主题标识/输入摘要/：各版本的完整产物；新输入保留旧产物。

批量脚本可以在 Skill 安装目录以外运行，通过 --repo 指定源码；不会联网或调用付费图像 API。具体命令、清单和恢复规则见 [批量参考](../skills/parallax-banner-maker/references/batch.md)，素材制作见 [图像参考](../skills/parallax-banner-maker/references/artwork.md)。

## 验收边界

导出成功的默认状态是 needs_review。查看两端与位移效果后再记录画面复核；记录中区分 AI 自检和运营确认。源图、布局、引擎或产物变化会使旧复核失效。

自动检查覆盖图片和标记区域的几何规则，不自动识别人脸或验证抠图美感。批量脚本不会将任意海报直接变成无缺陷的分层图，也不会自动发布到网站。完整验收约定见 [验收参考](../skills/parallax-banner-maker/references/acceptance.md)。
