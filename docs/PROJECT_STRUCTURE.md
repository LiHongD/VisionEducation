# 项目结构与二次开发

VisionEducation（行知实验室）将行为识别教学拆分为观察动作、操作人体、人工描点、模型检测、设计规则、训练分类器和解释结果。项目包含学生课堂、教师工作台及真实的浏览器模型实验。

## 技术架构

| 部分 | 实现 |
| --- | --- |
| 应用与服务端路由 | React、Vinext、TypeScript、Vite |
| 课堂交互 | `public/` 中的 HTML、CSS 和 JavaScript |
| 3D 人体 | Three.js、glTF 人物、姿态与变形控制 |
| Python 实验 | Pyodide 中的 CPython、NumPy、独立 Web Worker |
| 人体关键点检测 | 官方 YOLO26n-pose ONNX、ONNX Runtime Web CPU/WASM |
| 图像分类 | 固定 MobileNetV2 特征提取器，浏览器真实训练分类器 |
| 课堂记录 | Cloudflare D1 `DB`；本地使用 Wrangler/Miniflare 模拟 |
| 已提交分类模型 | 私有 R2 `BUCKET`；本地使用模拟存储 |

学生图片的检测、特征提取和实验代码在浏览器执行。正式课堂提交和排名由服务端进行身份、归属和数据校验，教师视图切换本身不会授予教师权限。

## 目录入口

```text
app/                         应用、身份读取与课堂 API 路由
build/                       Sites/Vite 集成及 Worker 入口源码
components/                  React 界面组件
db/                          Drizzle 数据表定义
docs/                        部署、结构、资源处理记录
drizzle/                     已生成的数据库迁移
examples/                    可供学生下载或参考的示例
lib/                         课堂 API、模型评测和服务端测试特征
public/
  classroom.html             课堂入口
  classroom.js               教师、学生与提交交互
  curriculum.js              六课任务与课堂内容
  micro15.js                 描点、规则、3D 等教学模块
  pose3d.js                  3D 场景与关键点交互
  pose-character.js          已提供人物模型的加载
  pose-rig.js                骨骼/形变与摆姿
  pose-presets.js            预设姿势
  pose-code-lab.js            Python 编辑器、终端与实验任务
  pose-lab-worker.js          Python Worker 与模型桥接
  classroom_yolo.py          课堂 Python 模型接口
  pose-lab-inference.js       YOLO 输入处理与输出还原
  pose-lab-assets/            固定课堂图片、模型、资源校验清单
  vendor/                    本地托管的第三方库与许可证
  micro15-assets/             人物、图片与教学视频
  angle-studio/              构建后的角度规则实验台
  model-lab/                 图像分类训练、预测、提交与排名
  model-lab-assets/          数据、特征、MobileNet 和下载包
scripts/                     安装、构建、资源准备与浏览器验收
tests/                       API、评测、3D、推理与资源回归检查
tools/angle-studio/          角度规则实验台源码
```

## 各功能的修改位置

| 想修改的内容 | 主要入口 |
| --- | --- |
| 课时文字、任务和问题 | `public/curriculum.js`、`public/classroom.html` |
| 整体课堂样式 | `public/classroom.css`、`public/style.css` |
| 3D 人物、预设姿势 | `public/pose-character.js`、`public/pose-rig.js`、`public/pose-presets.js` |
| Python 默认代码与提示 | `public/pose-lab-snippets.js`、`public/pose-code-lab.js` |
| Python 支持的模型接口 | `public/classroom_yolo.py`、`public/pose-lab-worker.js` |
| 关键点坐标和阈值处理 | `public/pose-lab-inference.js` |
| 角度规则实验台 | `tools/angle-studio/`，由 `scripts/build-angle-studio.mjs` 构建 |
| 图像分类训练与预测 | `public/model-lab/` |
| 教师、学生、课堂码和答卷 | `lib/classroom-api.ts`、`app/api/classroom/[...path]/route.ts` |
| 模型上传、重新评测与排名 | `lib/model-api.ts`、`public/model-training-embed.js` |
| 数据库表结构 | `db/` 和 `drizzle/` |

不要只修改 `dist/`：它是构建产物，下一次构建会覆盖。角度实验台的源文件位于 `tools/angle-studio/`，不要只改生成后的嵌入页面。

## 两类模型实验

### 人体关键点检测

学生通过 `classroom_yolo` 课堂适配接口，在 Pyodide 中编写并执行 Python，再由 Worker 调用实际的 ONNX 模型。输出为 17 点骨架、原图像素坐标、归一化坐标与关键点置信度。

这不是完整桌面版 Ultralytics/PyTorch 环境。浏览器示例中的 `await model.predict(...)` 是异步接口；下载的桌面 Ultralytics 示例使用同步调用。具体代码见 README 和页面内的接口说明。

### 图像分类训练

MobileNetV2 特征提取器固定不变，学生实际训练其后的线性 Softmax 或单隐藏层 ReLU 分类器。预计算的课堂图片特征用于缩短训练等待，上传新图时运行相同特征提取器。

学生保存的 JSON 包含分类器权重、归一化参数、训练配置和版本标识，需要与本站的固定特征提取器配套使用。服务端使用固定测试特征重新计算指标，不采用客户端自行填报的准确率。仓库保留测试特征以复现教学评测，排名用于课堂小样本比较。

## 数据与身份

- 未提交的草稿、角度规则、学生会话和本机分类器保存在当前浏览器。
- 课堂成员、答卷、点评、模型摘要与评测指标保存在 D1。
- 正式提交的分类器文件保存在 R2，读取和下载受服务端权限控制。
- 本机开发通过回环地址模拟教师身份；托管环境由身份服务提供经过验证的用户信息。
- `.dev.vars`、`.wrangler/` 和其他运行状态不应加入源码仓库。

## 开发与验证

```sh
npm run install:ci
npm run dev
npm test
npx tsc --noEmit
npm run build
```

`tests/` 覆盖课堂 API 权限、模型提交和服务端评测、关键点解析、素材校验、预设姿势及人物变形等。浏览器完整流程的验收脚本在 `scripts/`；含写入行为的验收应使用本地测试课堂。

资源重建脚本使用固定来源：`scripts/prepare-pose-lab-assets.ps1`、`scripts/prepare-classifier-data.py`。仓库已经包含相应资源，普通安装无需执行这些下载和预处理步骤。

二次分发时保留 [AGPL-3.0 许可](../LICENSE) 和 [第三方声明](../THIRD_PARTY_NOTICES.md)。教学人物及图片保留原权利人的权利，修改模型或数据时同步更新来源、许可和校验清单。
