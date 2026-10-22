# 源图制作工程

先准备一套背景和真实透明的主体，近景可选。在project.json中填写实际作者信息和源图关键区域；源坐标使用按正常方向显示后的实际像素。

在原始源码仓库根目录执行：

```sh
npm run theme:build -- /path/to/this-project/project.json --out outputs/my-theme
```

工具自动裁切透明边缘、按角色安排电脑/手机构图、导出完整画布、转换关键区域、合成海报、生成哈希文件与配置、实际网页及离线预览、构图图、报告和部署ZIP。

默认布局需要调整时，只编辑统一的layout字段。不要修改JS，不引入角色专用的characterWidth或cropLeft字段。项目内本地Schema可供编辑器提示。

原画只有一张扁平海报时，先由AI/美工完成拆层和补景；工具不代替这个素材制作步骤。

[完整工作流](https://github.com/wushuai0802/bilibili-parallax-banner/blob/v1.3.0/docs/WORKFLOW.md)
