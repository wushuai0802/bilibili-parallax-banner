# 运营 Banner 制作 Skill

parallax-banner-maker 1.1.0 面向运营制作单张／批量 UBits Banner。默认保留整张原图的文字、人物、道具和构图，统一远中近景、接触地面与接缝检查。新增工具随 skill-v1.1.0 源码标签提供，网站组件合同仍为 v1.4.0。

## 安装与准备

直接下载 [Skill v1.1.0 安装包](https://github.com/wushuai0802/bilibili-parallax-banner/releases/download/skill-v1.1.0/parallax-banner-maker.zip)，解压得到 parallax-banner-maker 文件夹。[发布页](https://github.com/wushuai0802/bilibili-parallax-banner/releases/tag/skill-v1.1.0)另附使用说明和 [SHA256 校验值](https://github.com/wushuai0802/bilibili-parallax-banner/releases/download/skill-v1.1.0/SHA256SUMS.txt)。

需要查看或维护 Skill 时使用 [仓库中的源文件](../skills/parallax-banner-maker/)。本地重新打包可在源码仓库运行 npm run package:skill，得到 outputs/parallax-banner-maker.zip。

将整个文件夹复制到客户端的技能目录。Codex 通常使用 CODEX_HOME 下的 skills；未设置 CODEX_HOME 时为用户目录下的 .codex/skills。保留已有同名安装并先比较版本，避免直接覆盖自定义内容。客户端重新发现技能后可用名称调用；当前已打开的会话是否即时刷新由客户端决定。

运营还需要：

- skill-v1.1.0 对应源码和 Node.js 22 或 24；首次在源码目录完成 npm ci --ignore-scripts，已有依赖直接复用。doctor 的 capabilities 会显示保真、缓存、快速预览和网站包能力。
- 做抠图、补景或原创图时，客户端有实际可用的图像工具。只导出已有源工程不需要图像服务。
- 原图或分层素材及其来源信息。

Skill 本身不包含账号、API Key、电脑固定路径、图像模型或生产站点登录信息。它调用本项目的标准制作工具；图像生成能力由运营自己的客户端提供。只发一份 Skill 并不等于所有运行依赖已安装。

## 运营直接这样说

~~~text
使用 $parallax-banner-maker，把这张海报制作成 UBits 4:1 动态 Banner。
完整保留原图文字、人物和构图，只补全被分层遮住的背景。
人物与坐具、阴影和地面保持接触，检查个人中心开合，给我离线预览和精简网站包。
~~~

~~~text
使用 $parallax-banner-maker，批量处理这个目录的海报。
保留每张原图的全部内容，复用已有遮罩，逐项制作 UBits 4:1 主题；困难项列明原因并继续其他项。
请给我一个总览，方便集中复核和下载。
~~~

~~~text
使用 $parallax-banner-maker，继续这个批次。
我修改了第二张的人物位置，请重新导出这一项，复用其他未变化且检查合格的结果。
~~~

已有分层工程时直接提供 project.json。只有平面海报时，AI 会先准备背景和透明主体；缺少所需能力时记录 needs_preparation，并给出具体素材任务书。

## 单张与批量产物

原图已经是 4:1 且有原尺寸遮罩时，theme:preserve 可自动生成原坐标源工程；一个移动层可以合并人物与支撑地面的多张遮罩。preserve.reference 会比较完整源画布，拒绝删字、隐藏、裁切或重新排布。该检查发生在缩放和编码之前。

首次出样用 theme:build 的 --quick --ubits：保留内容、图片和几何验证，跳过大型拼图，自动生成个人中心预览及“对照原图”。确认后去掉 --quick 做一次最终构建。单张也默认按输入／工具／产物摘要复用缓存，--rebuild 可强制重建。

这缩短的是可复用的本地处理、出样和交付流程。新海报的分割／补绘质量仍取决于实际图像工具；不能把已准备好遮罩的秒级构建描述成任意图片的完整制作耗时。

单张交付包含双端图片、theme.json、预览和报告。网站优先使用 artifacts/website.zip，约束为运行资源和最小接入文件；预览、拼图、源工程不会混进网站包。artifacts/theme.zip 继续提供完整预览资料包。

批量脚本另生成：

- index.html：各项海报、状态、预览和主题 ZIP 链接。
- batch-state.json：输入摘要、输出摘要、状态和实际复核记录。
- themes/主题标识/输入摘要/：各版本的完整产物；新输入保留旧产物。

批量脚本可以在 Skill 安装目录以外运行，通过 --repo 指定源码；不会联网或调用付费图像 API。具体命令、清单和恢复规则见 [批量参考](../skills/parallax-banner-maker/references/batch.md)，素材制作见 [图像参考](../skills/parallax-banner-maker/references/artwork.md)。

## 验收边界

导出成功默认仍为 needs_review。对照原图、检查两端位移、拼接处和脚下接触关系后再记录复核，区分 AI 自检与运营确认。原图、布局、构建选项、引擎或产物变化会使缓存和旧复核失效。

自动检查覆盖图片和标记区域的几何规则，不自动识别人脸或验证抠图美感。批量脚本不会将任意海报直接变成无缺陷的分层图，也不会自动发布到网站。完整验收约定见 [验收参考](../skills/parallax-banner-maker/references/acceptance.md)。
