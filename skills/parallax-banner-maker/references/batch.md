# 批量制作

批量分为素材准备和本地导出。AI 逐项准备分层工程，附带脚本逐项调用同一个生成器、记录状态并输出总览。脚本不从任意 JPG 自动抠图，不调用图像服务。

## 清单

复制 assets/batch.example.json 到本次工作目录，改成真实路径。每项 id 是唯一的小写 ASCII 标识，不能使用 Windows 保留设备名。路径相对清单所在目录，也支持明确的绝对路径。

~~~json
{
  "version": 1,
  "jobs": [
    {"id": "film-a", "project": "work/film-a/project.json"},
    {"id": "film-b", "input": "inputs/film-b.jpg", "mode": "preserve", "brief": "保留两名主角，制作 UBits 4:1"}
  ]
}
~~~

有 project 的项目进入导出；只有 input 的项目为 needs_preparation。AI 完成对应源工程后，在该项补充 project，再用 --resume 继续。原始 input 可保留，用于追踪参考素材；它发生变化也会使已有结果失效。mode 为 preserve、generate、static 或 layers，描述素材准备方式，不会自动改变现有工程。

对用户要求的整批原图，先按其顺序编制清单，逐项评估和准备。预设的修正次数用于素材准备，不能在脚本中自动扩张成无限付费重试。

## 导出与恢复

~~~sh
node "SKILL_DIR/scripts/banner-batch.mjs" batch --repo "REPO_DIR" --manifest "RUN_DIR/batch.json" --out "RUN_DIR/outputs"
node "SKILL_DIR/scripts/banner-batch.mjs" batch --repo "REPO_DIR" --manifest "RUN_DIR/batch.json" --out "RUN_DIR/outputs" --resume
~~~

UBits 批量出样加 --quick --ubits，复用统一的个人中心预览并跳过大型拼图。确认画面后，去掉 --quick 再加 --resume 完成最终构建。构建选项参与摘要；原图 preserve.reference 也参与摘要，改原图后不会错误复用旧批准结果。doctor 的 capabilities 须包含 quickPreview、ubitsOffline、websitePackage。

输出目录首次应为空或不存在。已有批次必须明确加 --resume，不能借用含其他文件的目录。恢复要求使用同一源码路径、清单路径和批次输出路径；清单内容可以增加／修改项目。移动到其他电脑后可在新的输出目录重新运行，原主题包仍可直接预览和交付。

脚本顺序执行，无共享目录并发覆盖：

- 每项按源文件、工程内容、制作方式、生成器及依赖锁文件计算摘要；新输入保存到新的版本子目录，保留之前产物。
- --resume 只复用内容未变、文件摘要完整且重新校验合格的已有产物。源图改变、文件损坏或引擎改变时重新构建，画面复核状态随之失效。
- 失败独立记录，继续后续项目；再次 --resume 会重新处理失败项。needs_preparation 继续保留，不把它当导出成功。
- batch-state.json 在开始和每项结束时更新；index.html 提供海报、状态、错误、离线预览和精简网站包。quick 模式不会提供不存在的构图图链接。记录的 buildMs 仅为本地导出时间。
- 有 failed 或 needs_preparation 时进程退出码为 1，全部工程导出成功（包括 needs_review）为 0。退出码 0 不表示已经视觉验收。

正在执行时使用 .batch.lock 防止另一个导出或复核同时改写本批次。正常退出会释放；进程被强制结束而留下锁时，先读取锁里的进程和主机信息，确认已停止，再仅移除这一锁文件后恢复。

## 画面复核

成功导出的项目初始为 needs_review。实际查看对应图片、预览或浏览器截图后，用真实复核者和具体结论记录：

~~~sh
node "SKILL_DIR/scripts/banner-batch.mjs" review --repo "REPO_DIR" --out "RUN_DIR/outputs" --id film-a --decision approved --by "agent:Codex" --note "已检查两端构图图与左右位移；未做实体设备验收"
node "SKILL_DIR/scripts/banner-batch.mjs" review --repo "REPO_DIR" --out "RUN_DIR/outputs" --id film-a --decision changes --by "operator:实际姓名" --note "紧凑构图右侧人物头发被裁切，需要调整"
~~~

review 会再次核对当前源文件与产物摘要，输入变化后不能沿用旧复核。运营未实际确认时不能使用运营署名。代理通过模型检查图自检时必须明确这是模型检查，不能记成浏览器、真人或真机验收。

批次包含私有源路径、参考说明和复核信息，留作制作记录。网站优先使用 artifacts/website.zip，只包含运行需要的资源；artifacts/theme.zip 是附带预览与证明材料的完整包。源工程单独交付，不把整个批次目录公开。
