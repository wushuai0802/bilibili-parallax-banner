# 新主题图片模板

这是已经准备好两端完整画布时的手工交付模板。新制作推荐使用[源工程模板](../theme-project/README.md)，由theme:build自动导出本目录所表示的结构。

先阅读[Banner图片交付规范](../../docs/IMAGE-SPEC.md)。本目录可以整份复制，作为AI、画师和网站开发者的交付起点。占位图为原创几何SVG，使用仓库MIT许可。

| 目录 | 逻辑画布 | 实际导出 |
| --- | --- | --- |
| desktop | 1920×216，2倍 | 3840×432 |
| mobile | 375×200，3倍 | 1125×600 |

每端都有背景、透明主体、透明前景、合成海报及banner.json。两端可以复用同一套原始分层，分别安排构图。占位人物用于说明位置，不能将其矩形原样用于其他人物。

开始制作时更新theme.json的主题名、作者、来源与许可；更换各端图片，按实际位置更新protectedRegions。改用WebP/PNG时同步改清单中的文件扩展名。

在仓库根目录验证本模板：

```sh
npm run validate:theme
```

验证复制后的主题：

```sh
npm run validate:theme -- /path/to/my-theme/theme.json
```

验证器检查两端图片、海报、已登记的主体区域与文字区；它不自动抠图、补景或识别人脸。运行时使用loadTheme(theme.json)，统一管理两端选择、动效和销毁；底层loadBanner只管理单端清单。

把[源工程AI任务书](../theme-project/AI-BRIEF.md)、规范和参考图片交给AI。需要手工维护两端现成图时继续使用此模板；所有示例已改用通用工具，没有专用生成脚本。
