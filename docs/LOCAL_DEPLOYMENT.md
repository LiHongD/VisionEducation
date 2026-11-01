# VisionEducation 本地部署说明

本文对应仓库中的实际运行脚本，适用于 Windows、macOS 和 Linux。本地教学页面不需要域名，也不需要先购买服务器。

**教师无需安装开发环境的方式：** 使用 [Windows 离线免安装版](OFFLINE_PORTABLE.md)。由学校管理员拷贝完整启动包后，教师双击启动即可，学生通过校园局域网访问。下文保留源码安装与开发部署说明。

## 1. 运行方式

| 方式 | 用途 | 当前支持范围 |
| --- | --- | --- |
| 本机开发运行 | 备课、个人学习、检查教师和学生流程 | `npm run dev`，带本机模拟教师登录及本地 D1/R2 |
| 本机构建预览 | 检查打包后的页面和 Worker | `npm run build` 后 `npm start`；不包含开发模拟登录 |
| 校园局域网 | 多台设备连接同一服务端 | 需要额外配置监听地址、身份与访问方式，并做多设备验收 |
| Sites 托管 | 跨设备使用正式课堂、登录与云端数据 | 需要独立的托管身份、D1、R2 和环境变量 |

GitHub 用于保存和分发源码。GitHub Pages 只托管静态文件，不能直接运行本项目的课堂 API、数据库和模型收件功能。

## 2. 准备环境

- 安装 Node.js 22.13 或以上版本。运行完整测试集推荐 Node.js 24 或以上，部分 API 测试使用 Node 内置 SQLite。
- 使用较新的 Chrome、Edge 或其他支持 WebAssembly、Web Worker 和 WebGL 的浏览器。
- 使用 Git 下载源码，或在 GitHub 仓库选择 **Code → Download ZIP** 后解压。
- 首次安装 npm 依赖需要网络。YOLO 与 Python 课堂运行在浏览器内，使用这些课堂功能无需另行安装桌面 Python、PyTorch 或 CUDA。

检查环境：

```sh
node --version
npm --version
```

## 3. 下载与安装

```sh
git clone https://github.com/LiHongD/VisionEducation.git
cd VisionEducation
npm run install:ci
```

`install:ci` 使用锁文件安装完整开发与运行依赖。不要同时在一个目录启动多个安装进程；无需重新下载仓库已经包含的模型和课堂素材。

Windows 也可以进入解压后的文件夹，在地址栏输入 `powershell` 打开终端，再执行安装和启动命令。如果 PowerShell 的执行策略阻止 `npm.ps1`，使用 `npm.cmd run install:ci`、`npm.cmd run dev` 等对应命令。

## 4. 快速打开教学页面

```sh
npm run dev
```

默认地址：<http://127.0.0.1:5173/classroom>。以终端实际打印的地址为准；停止服务时在对应终端按 `Ctrl+C`。

进入“描骨辨势”，可使用 3D 摆姿、人工描点和“让代码，替你找到关节点。”实验。进入“量势成规”，可使用角度规则实验台和图像分类训练。

仅查看页面和浏览器实验，可以先完成这一节。教师建班、学生提交、模型收件和排名还需要按下一节初始化本地数据库。

## 5. 初始化完整课堂功能

### 5.1 配置本地环境变量

在项目根目录创建 `.dev.vars`，内容如下：

```dotenv
TEACHER_EMAILS=seedy@sites.test
ALLOW_GUEST_STUDENTS=true
```

`seedy@sites.test` 是本机开发模拟身份，并非真实邮箱。`.dev.vars` 已被 Git 忽略；如果修改了变量，重新启动开发服务。

### 5.2 初始化空的本地数据库

先构建一次，生成本地 Wrangler 配置：

```sh
npm run build
```

再依次执行两份迁移：

```sh
npx wrangler d1 execute DB --local --config=dist/server/wrangler.json --persist-to=.wrangler/state --file=drizzle/0000_tiresome_nova.sql
npx wrangler d1 execute DB --local --config=dist/server/wrangler.json --persist-to=.wrangler/state --file=drizzle/0001_black_killraven.sql
```

第一份创建课堂、学生和答卷相关表；第二份创建图像分类模型的提交与评测表。以上命令只访问本地模拟数据库，不需要把数据上传到 Cloudflare。

SQL 文件用于**首次初始化空库**，不要在已有数据库上反复执行。升级时只应用尚未执行的迁移，不要直接删除本地状态来消除报错。

### 5.3 启动并登录教师

```sh
npm run dev
```

打开以下本机开发登录地址：

<http://127.0.0.1:5173/signin-with-chatgpt?return_to=/classroom>

之后在课堂页面切换教师端、创建课堂并取得课堂码。学生可在其他浏览器配置文件或无痕窗口中进入同一课堂，通过课堂码填写身份并提交。

本机模拟登录只在 `npm run dev` 下生效，并限制为回环地址。`npm start` 预览构建产物时不提供此模拟身份；普通 GitHub 克隆也不会自动获得线上 ChatGPT 登录服务。

## 6. 构建、预览与检查

```sh
npm test
npx tsc --noEmit
npm run build
npm start
```

`npm start` 通过 Wrangler 在本机运行构建后的 Worker，数据库和模型文件仍使用本地模拟存储；地址和端口以终端输出为准。日常修改页面及本机教师流程使用 `npm run dev` 更方便。

`npm run dev` 和 `npm run build` 会自动构建角度规则实验台，无需另外进入该工具目录执行构建。

## 7. 模型与离线资源

仓库内已包含：

- `public/pose-lab-assets/`：统一课堂图片、YOLO26n-pose 模型及资源清单。
- `public/vendor/pyodide/`：CPython 的浏览器运行环境和 NumPy。
- `public/vendor/ort/`：ONNX Runtime Web 的 JavaScript/WASM 文件。
- `public/micro15-assets/`：课堂图片、3D 人物及教学视频素材。
- `public/model-lab-assets/`：图像分类训练/验证图片、特征、下载包和固定 MobileNetV2。

模型运算与学生输入的实验代码在浏览器运行。上传用于识别或预测的图片在本机处理；主动提交的文字记录和分类模型会发送给当前服务端。

准备好依赖与资源后，主要实验可从本地加载。外部字体等展示资源仍可能产生网络请求；若要用于完全断网的课堂，应在目标电脑上断网验收。浏览器显示的首次模型加载量来自当前本地服务，不等同于访问互联网下载。

## 8. 局域网与正式部署

`127.0.0.1` 只代表正在打开页面的那台电脑，不能直接发给其他学生作为教师电脑的地址。局域网使用需要配置服务的监听地址、教师电脑的局域网地址与相应防火墙规则。

当前教师模拟登录特意限制为回环地址，不能通过简单开放端口就获得适合全班共用的正式教师身份。局域网版本还需要检查 HTTPS/浏览器能力、独立学生会话、多人读写和数据备份。本仓库不把开发模拟登录当作正式局域网账户系统。

Sites 托管部署还需要为新项目单独配置身份服务、D1 `DB`、R2 `BUCKET`、迁移和教师邮箱白名单。`.openai/hosting.json` 中的项目标识对应原有教学网站，不是访问凭据，也不应直接作为自己的新部署目标。普通静态托管不会自动提供这些服务。

## 9. 数据保存与备份

- 本地服务端状态保存在 `.wrangler/state/`，包含模拟 D1 和 R2 数据。停服后备份整个目录，并记录对应源码版本。
- 学生草稿、角度规则和本机模型还保存在各自浏览器的本地存储/IndexedDB；使用页面内的导出或下载入口另行备份。
- 线上课堂的数据不会随着 `git clone` 同步到本地；本地数据也不会自动写回线上。
- GitHub 仓库不包含 `.dev.vars`、依赖目录、构建产物、本地数据库、学生身份令牌或运行记录。

## 10. 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 找不到 `node` 或 `npm` | 安装 Node.js 后重新打开终端，检查版本 |
| `no such table` | 对照第 5 节，确认两份迁移都已应用到相同的 `.wrangler/state` |
| 教师登录失败或没有教师权限 | 使用开发服务和 `127.0.0.1`，检查 `.dev.vars` 是否包含模拟邮箱并重启 |
| Python 或模型首次加载慢 | 等待运行资源加载；在浏览器网络面板检查本地 WASM、ONNX 请求是否成功 |
| 仅双击 HTML 后页面不完整 | 使用 `npm run dev`；浏览器 Worker、模块和 API 需要 HTTP 服务 |
| 其他电脑访问不了 | 回环地址只对本机有效；局域网功能需按第 8 节单独配置 |
| 下载源码后没有原有班级和答卷 | 运行数据不包含在源码仓库，这是新环境，需要重新建班或单独迁移数据 |

课程操作见 [课堂使用指南](../CLASSROOM-GUIDE.md)，源码入口见 [项目结构与二次开发](PROJECT_STRUCTURE.md)。
