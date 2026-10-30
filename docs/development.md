# 开发与可选组件

日常开发使用 `npm ci --ignore-scripts` 和 `npm start`。Node.js 使用内置 SQLite，因此本轮固定验证 Node.js 24.15.0；建议沿用 24.x。

## 环境变量

| 变量 | 开发启动的默认值 | 用途 |
| --- | --- | --- |
| `SHIGUANG_PORT` | 43527 | 页面与本地 API |
| `SHIGUANG_MODEL_PORT` | 43528 | 可选本地模型服务 |
| `SHIGUANG_MOBILE_PORT` | 43529 | 手机桥接端口 |
| `SHIGUANG_MOBILE_HOST` | 127.0.0.1 | 手机桥接监听地址；需要局域网配对时显式设为 0.0.0.0 |
| `SHIGUANG_DATA` | 源码目录下 `.local/data` | 数据目录 |
| `SHIGUANG_BROWSER_CHANNEL` | 空 | 浏览器测试使用已安装的 Chromium；设为 msedge 时使用 Edge |

例如使用其他端口：

```powershell
$env:SHIGUANG_PORT = '43537'
$env:SHIGUANG_MOBILE_PORT = '43539'
npm start
```

测试会创建临时数据库并使用合成账号，不需要连接自己的微信或 QQ。只读客户端适配代码在 `wechat-reader.mjs`、`qq-reader.mjs` 与对应 PowerShell 文件里；不要把自己生成的缓存和 DPAPI 文件加入 Git。

## 本地模型

先用规则初筛即可核对、确认和提醒。需要模型时，自行从模型发布者取得兼容 GGUF，放入 `models/`，将兼容 Windows x64 `llama-server.exe` 及其依赖放入 `runtime/`。源码未附带这些文件。

已用过的组件来源是 [Qwen3-4B-GGUF](https://huggingface.co/Qwen/Qwen3-4B-GGUF) 和 [llama.cpp](https://github.com/ggml-org/llama.cpp)。不同模型可能需要不同版本的引擎；更换前按对应发布说明核对兼容性与许可证。启动后到“本地设置 → 本地模型”选择，空闲释放行为仍由原模块管理。

## Windows 原生窗口

浏览器开发入口无需原生窗口。需要原生窗口时：

```powershell
npm run build:native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File launch.ps1
```

构建脚本取得固定版本的 Microsoft WebView2 NuGet SDK，核验包 SHA512，然后调用 Windows 自带 .NET Framework C# 编译器生成两份窗口 EXE。SDK 缓存在 `.local/`；编译结果在 `native/`，两处都不提交。系统还需已安装 WebView2 Runtime。

若已准备同版本 SDK，可通过脚本的 `-SdkDirectory` 参数指定其中 `lib/net462`、`runtimes/win-x64/native` 的上级目录；不需要复制个人安装目录。

```powershell
npm run test:native
```

这会运行 Windows 原生窗口和真实提醒弹窗检查。执行时可能短暂出现测试窗口。未编译原生窗口时，其对应测试会明确跳过；不要把跳过当成通过。

## 浏览器检查

`npm run test:ui` 会串行运行核心测试及四个浏览器流程，检查接入入口、合成目录选择、实际任务进度、账号备注、设置配色及粘贴通知到确认日程的操作。首次使用 Chromium 需先执行 `npx playwright install chromium`；Windows 也可将 `SHIGUANG_BROWSER_CHANNEL` 设为 `msedge`。

`.github/workflows/ci.yml` 仅运行安装、核心测试和源码检查。浏览器、原生窗口、真实客户端和不同电脑的实测分别记录。
