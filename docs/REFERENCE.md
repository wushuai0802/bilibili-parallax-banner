# 原站参考、REA 与兼容边界

研究日期：2026-10-22。线上资源会变化，本文固定记录本次分析对象。

## 本次实际读取的公开资源

- 首页：https://www.bilibili.com/
- JS：https://s1.hdslb.com/bfs/static/shanks/laputa-home/assets/index-84fb5632.js
- CSS：https://s1.hdslb.com/bfs/static/shanks/laputa-home/assets/index-4d416e23.css
- JS SHA256：`271ecaca131b61e909601b56c5a652ec8014ad0409bfefb863b832a2c14c0465`
- CSS SHA256：`4d416e23b775f6de703d334c94b74a9f1d7e9be8869733b0408dd324bcf1a05f`

REA 静态分析证据：`ev_f848d0e8ccd45a13682f9bdf8b688009facbccfdc170cbd0170d44acdf722fd8`。
摘要证据：`ev_f00f45e54c7923d23f2e409ef8bf1c39ad7daaf8ba6781fadecc7ae328ebc543`。
REA 完成一个 JavaScript 文件的静态解析，未执行原站脚本；全站语义图因规模上限为部分覆盖。这里的参数由对应横幅代码人工核对，不把全站静态结果当作运行覆盖。

## 已直接核对的行为

| 项目 | 原站观察 | 本库处理 |
| --- | --- | --- |
| 容器高度 | min155、9.375vw、max240 | 默认比例相同，改按容器宽度并加手机分支 |
| 顶部遮罩 | 100px，黑色0.4至透明 | 默认相同，可关 |
| 图层排列 | 各层容器铺满、内部居中 | 相同思想，保留数组顺序 |
| 素材尺寸 | naturalWidth/Height × height/155 × initialScale | bilibili 模式保留天然尺寸 |
| 输入 | 相对进入点的横向增量 / 容器宽度 | 相同；事件限制在组件容器内 |
| 位移 | (initial + offset × curve(progress)) × height/155 × initialScale | 适配器实现并有数值回归测试 |
| 退出 | 200ms 线性归零 | 默认相同，可配置 |
| 标量通道 | 缩放、旋转、模糊、透明度与曲线 | v1 adapter支持 |
| 主题扩展 | 按时间选主题等 | 不内置，交给宿主；非空扩展拒绝 |

## 为什么还提供 aligned 模式

原站每期素材有不同天然尺寸与参数，不适合把任意图片直接扔进同一组配置。
默认模式约定所有图层共用一个画布，统一做覆盖与出血，服务“以后只换图片”的维护方式。两种模式不混用，也不声称少量几何示例等同某一期复杂插画。

示例素材是仓库内原创 SVG。发行物不包含 B站 JS/CSS 原文、美术素材、登录信息或抓取数据，也不会在使用者页面请求 B站。

## 观察与测试的区分

原站参数来自公开脚本和CSS的静态观察；单元/DOM回归证明本库的状态、几何和生命周期；浏览器预览验证本库显示。任何一项都不证明与所有历史 B站主题逐像素等同。

## 相关项目（参考而非依赖）

- [palxiao/bilibili-banner](https://github.com/palxiao/bilibili-banner)：分层头图学习参考。
- [react-scroll-parallax](https://github.com/jscottsmith/react-scroll-parallax)：滚动视差，与本库指针视差不同。

本库没有复制上述项目的实现或美术资源。
