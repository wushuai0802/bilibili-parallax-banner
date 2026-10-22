# 芙莉莲示例源工程

## 素材说明

此主题以《葬送的芙莉莲》第二季[官方海报](https://frieren-anime.jp/news/4335/)为参考进行非官方AI重绘。角色、参考美术和作品名称权利归相应权利人，素材不包含在组件MIT许可内。

source/desktop和source/mobile保存已经制作好的分层画布。project.json使用通用fill、trim、box与runtime字段保留现有构图，关键区域以源图像素记录。框架源码没有角色专用的裁切算法。

与默认几何源图示例一样，通过scripts/lib/build-theme.mjs构建。所有示例输出由themes/catalog.json登记，生成到examples/，完整过程见docs/WORKFLOW.md。
