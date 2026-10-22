# AI素材制作与标准交付任务

请使用项目v1.3标准流程，把参考海报制作成可交付的网站Banner主题。

1. 评估原图分辨率、人物遮挡和横图留白；说明需要补绘的部分。
2. 准备一套不透明背景、真实透明主体和可选前景。背景补全抠图空洞、移除重复人物；保留可编辑源文件。
3. 在project.json更新实际作者、来源、许可、图层src和role。每个关键头部或物体以源图实际像素标记regions.rect，只标一次，由工具映射到两端。
4. 先使用默认布局生成；只在构图不满足预期时调整标准layout.box、crop、fit和anchor，或提供某端独立源图。无需手填两端输出坐标和脚本参数。
5. 在仓库根目录运行theme:build。检查自动生成的index.html、offline.html、contact-sheet.png和report.json，修复所有错误及实际抠图/遮挡问题。
6. 交付源工程和编辑文件，以及生成的theme.zip。网站通过loadTheme接入；不要把导航、搜索框和业务按钮绘制进素材。

统一使用docs/WORKFLOW.md、docs/IMAGE-SPEC.md和schemas/project.schema.json。禁止照抄某部作品的裁切值，禁止修改通用JS来适配单张海报。最终说明校验结果、浏览器与设备验证范围。
