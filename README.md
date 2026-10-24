# VisionEducation · 行知实验室

面向行为识别教学的互动网站，让学生经历观察动作、摆布人物、人工描点、模型识别、读取坐标与解释动作证据的过程。

[在线课堂](https://action-lab-classroom.upbeatape2048.chatgpt.site/classroom) · [描骨辨势 / Python 实验](https://action-lab-classroom.upbeatape2048.chatgpt.site/classroom#lesson-2)

## 教学功能

- 分课时互动课堂、动作观察、人工描点与证据判断。
- 3D 人体摆姿：拖动关键点、预设动作、查看角度与恢复姿态。
- Python 姿态识别实验：全班使用统一图片，编辑 Python 并运行官方 YOLO26n-pose 模型，显示 17 个人体关键点、骨架、坐标与置信度。
- 三组 Python 示例：识别图片、读取关键点、编写动作判断规则；支持停止执行、恢复代码、保存草稿、下载代码与实际运行记录。
- “量势成规”开头提供完整角度规则实验台：拖拽 COCO 关键点实时调整角度，为多个动作设置且/或条件，上传图片进行真实关键点检测、查看原图坐标并输出匹配动作；支持规则导入导出、撤销、重置及按本机学生身份保存。
- 教师建班、学生通过班级码加入、提交学习记录、教师点评及课堂展示。真实课堂数据保存在部署环境的 D1 数据库中，不在此仓库内。

## 本地运行

需要 Node.js **22.13 或更高版本**。包含 SQLite 测试的完整测试集建议使用 Node.js 24 或更高版本。首次安装需要网络。

```sh
npm run install:ci
npm run dev
```

浏览器访问 `http://127.0.0.1:5173/classroom`，进入「描骨辨势」并向下滚动至「让代码，替你找到关节点。」。

```sh
npm test
npm run build
npm start
```

`npm start` 使用本地 Wrangler 预览构建产物；端口以终端输出为准。项目基于 Vinext、React、Cloudflare Workers 与 D1。静态课堂入口为 `public/classroom.html`，首页自动跳转到课堂。

教师功能需要配置 `.dev.vars`（不要提交此文件）：

```dotenv
TEACHER_EMAILS=your-teacher-email@example.com
ALLOW_GUEST_STUDENTS=true
```

数据库表结构见 `drizzle/0000_tiresome_nova.sql`，本地使用项目声明的 `DB` 绑定初始化：

```sh
npm run build
npx wrangler d1 execute DB --local --config=dist/server/wrangler.json --persist-to=.wrangler/state --file=drizzle/0000_tiresome_nova.sql
```

本地开发支持 `/signin-with-chatgpt?return_to=/classroom` 的模拟身份，模拟邮箱是 `seedy@sites.test`。需要本地测试教师界面时，将该邮箱加入本地 `TEACHER_EMAILS`。生产环境使用托管身份服务与真实教师邮箱白名单。复制部署时应在新环境中单独配置身份、D1 与环境变量；现有 `.openai/hosting.json` 标识原有 Sites 项目。

## Python 实验如何运行

本实验运行真正的 CPython 3.12（Pyodide 0.27.7）与 NumPy 2.0.2，学生代码在独立 Web Worker 中执行。ONNX Runtime Web 1.22.0 使用 CPU/WASM 执行官方 `yolo26n-pose.onnx`，没有预存识别坐标代替模型输出。统一图片与推理留在浏览器内；首次使用需要下载约 40 MB 运行资源，后续可使用浏览器缓存。

课堂提供的是 `classroom_yolo` 适配接口，不是完整 PyTorch / Ultralytics 环境：

```python
from classroom_yolo import YOLO

model = YOLO("yolo26n-pose.onnx")
results = await model.predict("classroom-person.png", conf=0.25)
result = results[0]
print(result.keypoints.xy)    # NumPy 数组：人数 × 17 × 2
print(result.keypoints.conf)  # 人数 × 17
result.show(conf=0.50)
```

`predict(conf=...)` 筛选人体，`show(conf=...)` 筛选绘制的关键点。`xy` 是原图像素坐标；`xyn` 是归一化坐标；置信度不是深度。代码执行上限为 25 秒，可以随时点停止。环境只在首次运行加载，退出本课会终止 Worker。

界面可下载使用 `from ultralytics import YOLO` 的本地 Python 示例。在本地安装 `ultralytics` 并使用 `yolo26n-pose.pt` 时，推理接口为同步调用，和浏览器中的异步适配接口有区别。

## 文件与验证

- `public/pose-code-lab.js` / `.css`：编辑器、控制台、预测结果及教学任务。
- `public/angle-rules-embed.js` / `.css`：将规则实验台放在第四课实验区最前方；原有提膝阈值对照实验继续保留。
- `tools/angle-studio/`、`scripts/build-angle-studio.mjs`：规则实验台源码与构建；开发、构建命令会生成 `public/angle-studio/index.html`。模型与 WASM 复用现有资源，按需加载，图片不上传。
- `public/pose-lab-worker.js`、`public/classroom_yolo.py`：Python 执行和真实模型桥接。
- `public/pose-lab-inference.js`：图像预处理、坐标还原与输出解析。
- `public/pose-lab-assets/`：固定课堂图片、官方模型和校验清单。
- `public/vendor/`：本地托管的运行时与许可证。
- `scripts/prepare-pose-lab-assets.ps1`：从固定官方来源准备资源。
- `tests/`：推理解析、课堂 API、3D 姿态预设与变形回归测试。

浏览器验收涵盖实际推理、修改置信度后的零检测、Python 语法报错、终止无限循环和再次运行。模型与运行资源的版本、来源和 SHA-256 见 [第三方声明](THIRD_PARTY_NOTICES.md) 及 `public/pose-lab-assets/manifest.json`。

## 图像分类训练与模型评测

第四课新增完整的训练、模型文件、预测、教师评测和班级排名实验。数据取自 Evan Quinn 的 [Combat Sports Dataset](https://zenodo.org/records/15349809)，作者声明 Public Domain，保留直拳、高位防守、踢腿三类。训练 180 张、验证 45 张、服务端保留测试 60 张，每类分别 60/15/20 张。按已知来源视频、原图、未识别连续帧和照片批次分组，同源增强图不跨集合。下载包只含训练和验证图；仍有小样本、背景和未知拍摄来源偏差，不是武术规范或跨人泛化基准。

固定 MobileNetV2 为图像特征提取器（1280 维输出，固定压缩为 256 维），学生真实训练线性 Softmax 或单隐藏层 ReLU 分类器，优化器为 Adam。可以调整学习率、轮数、批大小、隐藏层、每类训练数量、L2、种子和早停。给定图片特征提前计算以减少等待；上传新图时实际运行同一特征模型。

`actionlab-image-classifier/v1` JSON 保存分类器权重、训练集归一化参数、超参数、特征提取器版本和本机训练记录。固定 MobileNet 由本站提供，JSON 不是独立的完整 CNN。模型自动保存在本机 IndexedDB，可下载备份、重新载入预测。图片不上传。

学生凭课堂码加入后，模型可正式提交。规范化文件保存到私有 R2 `BUCKET`，D1 `DB` 保存归属、摘要、参数和评测指标。服务器在固定 60 张测试图的特征上重新计算准确率、宏平均 F1 和混淆矩阵，不采信客户端精度。每人最多 10 个不同模型，重复权重不重复计数；取最佳测试准确率，同分并列。排名仅对本班学生和所属教师开放，文件仅本人或所属教师可下载。教师可查看全部模型、下载、重新评测；结束收件后禁止新上传。

源码：`public/model-lab/`（训练、模型、预测、排名），`public/model-training-embed.js`（第四课入口、教师模型界面），`lib/model-api.ts`（评测与权限）。`public/model-lab-assets/` 包含训练/验证图片、特征、ZIP、MobileNet 和许可；`lib/classifier-benchmark.json` 是服务端测试特征。处理记录在 `docs/classifier-dataset-provenance.json`。

数据库新增迁移为 `drizzle/0001_black_killraven.sql`，Sites 发布时应用；本地预览须先对本地 DB 执行迁移。`.openai/hosting.json` 保留 DB 并启用 BUCKET。数据和模型已随项目提供；重建可运行 `scripts/prepare-classifier-data.py`（需 Pillow、NumPy、ONNX、ONNX Runtime，首次原始包下载约 391 MB）。不要在学生使用期间改变测试集。

`scripts/verify-model-training.mjs` 验收真实训练、文件保存/载入、MobileNet 新图预测、R2 上传、教师下载重测及排名；只对本地预览创建测试课堂，不对线上课堂运行写入验收。

模型提交入口位于第四课图像分类实验标题旁的“提交模型 / 实时排名”，训练完成后也有直接提交按钮。学生排名页和教师模型工作台每 5 秒自动同步；断网时保留上次成功榜单并自动重试。未加入课堂时提供直接加入入口。

## 许可

项目按 [GNU AGPL-3.0](LICENSE) 提供，与所分发的 Ultralytics 模型许可保持一致。第三方运行时保留各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。用户提供的角色模型与教学图片保留原权利人的权利。
