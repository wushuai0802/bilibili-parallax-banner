# 4:1 标准源工程

适合固定比例、带侧栏或轮播的 Banner。用 `npm run theme:init -- themes/my-banner --preset 4x1` 创建工程，替换 `source/` 中的原图并更新 `project.json` 的来源、关键区域和标准 `layout` 字段，再运行 `theme:build`。

电脑逻辑画布1920×480，2倍导出3840×960；紧凑逻辑画布400×100，3倍导出1200×300。两端均为4:1，用 `height.aspectRatio:4` 保持容器宽高比例。紧凑指容器不超过767px，电脑展开侧栏后也可能使用它。

不要把旧的1920×216或375×200画布直接拉伸过来。背景可以等比cover裁切；人物必须保持contain，修改box和anchor重新排布。最终每端的所有图层保留相同的完整画布。默认没有叠加标题。

原图是可编辑的原创SVG，使用MIT许可。SVG、PNG、WebP都可作为制作输入；自动生成的WebP、海报、配置、离线HTML与ZIP可直接交付。对接UBits时参照 [站点接入说明](../../docs/UBITS.md)。
