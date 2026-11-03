# 窝囊费

今天的班，也得上出点数字。一个本地运行的 Electron 桌面体验版，用工资增长、成本回本和下班倒计时，给工作日一点反馈。

## 下载 v0.2.1

这是内部体验版，仍有签名和平台验收限制。安装包在 [Release](https://github.com/zhounuo528/wonangfei/releases/tag/v0.2.1)，不放入 Git 源码历史。

| 文件 | 适用电脑 | 最低系统 |
|---|---|---|
| `Wonangfei-Setup-0.2.1-x64.exe` | Windows x64 | Windows 10 |
| `Wonangfei-0.2.1-mac-x64.dmg` | Intel Mac | macOS 13 |
| `Wonangfei-0.2.1-mac-arm64.dmg` | Apple Silicon / M 系列 | macOS 13 |

Intel Core i5/i7/i9 的 Mac 选择 x64；M 系列选择 arm64。系统下限依据 [Electron 45.2.1](https://github.com/electron/electron/blob/v45.2.1/README.md#platform-support)。

**签名与验证状态：** 两个 Mac App 仅 ad-hoc 临时签名，没有 Developer ID 签名或 Apple 公证，DMG 未签名，Gatekeeper 评估为 rejected。Windows 安装器和应用未做 Authenticode 签名。下载后可能被系统阻止，不能保证无提示打开。

Apple Silicon 版在 macOS 27.2 原生验证；Intel x64 版在同一 Apple Silicon 系统的 Rosetta 下验证，分别通过 32 项主流程和 9 项界面检查。Intel 硬件和 macOS 15.8.2 未实测。Windows 仅完成交叉构建、架构及 73 个应用文件解包比对；Windows 安装、启动和卸载均未实测。未执行 Finder 真实鼠标拖拽或双击，也未向系统 Applications 目录安装。详细范围见 [验收说明](docs/VALIDATION.md)。

## 主要功能

- 薪资、计薪天数、单双休和大小周、上下班与午休配置；按真实时间戳计算工资。
- 今日净额 = 工资 − 花销 − 固定负担。负数显示红色「今日还欠」，回本后恢复「今日已赚」；同一只小猫从焦虑变开心。
- 主金额可切换今日、本月、赚钱目标或隐藏；所有金额保留两位显示精度。
- 手动添加 10 / 20 / 30 分钟摸鱼、事项和删除纠错；工资照涨，有效时薪据有效工时计算。
- 临时花销、整月自定义费用与固定账单，按考勤工作日分摊，保留历史口径。
- 目标与消费换算：不足一天显示小时/分钟，达到一天排班工时后显示工作日天数。
- 到点后工资封顶，未点击下班则倒计时切为加班计时，有效时薪随无薪加班降低。
- 下班总结、小月历、月末回顾、可选应用内下班提醒。
- 迷你窗口、置顶，以及 Mac 原生菜单栏入口。Windows 原生托盘尚未适配。

首次运行先设置考勤和薪资；也可通过「体验虚拟数据」查看演示。演示档案独立保存。提醒仅在应用运行期间工作，应用退出后不能准点提醒。

## 本地开发

需要 Node.js 22.12+；当前验证环境为 Node.js 26.8.2、Electron 45.2.1。

```sh
npm ci
npm start
```

若本机 npm 设置禁用了依赖安装脚本，可在核实官方来源后运行 `node node_modules/electron/install.js` 安装官方运行时。

```sh
npm test
npm run smoke
```

`npm test` 运行纯计算和存储测试。`npm run smoke` 启动真实 Electron 窗口，并使用独立虚拟档案；当前脚本包含 Mac 菜单栏检查，不代表 Windows 验收。不要对个人档案执行测试脚本。

## 数据与计算

应用无需账户，运行时不联网。本地 JSON 明文保存，个人与演示数据分开：
- 开发版：项目目录的 `.local-data/`。
- Mac 安装版：`~/Library/Application Support/WonangfeiTrial/`。
- Windows 安装版：`%APPDATA%\\WonangfeiTrial`。

工资仅计已开始的班次与排班交集，午休排除，排班结束封顶；关闭和休眠后按时间戳恢复。未开始的日期不补计工资。有效工作 = 计薪工时 + 无薪加班 − 摸鱼，零分母显示不可计算。跨日加班归属原班次。

固定费用与整月花销保留添加时的考勤快照；修改排班不静默重写已有记录。按截至当前日期的工作日累计，不提前扣未来分摊。数据可在设置中导出。

## 源码结构

- `src/`：原生 HTML/CSS/JavaScript 界面、纯计算、金额和插画。
- `desktop/`：Electron 窗口、preload/IPC、本地存储和 Mac Tray。
- `tests/`：测试源码；不包含运行生成的测试档案。
- `scripts/`：窗口验收与构建脚本。
- [构建说明](docs/BUILDING.md)、[平台迁移评估](docs/PORTABILITY.md)、[素材记录](ASSETS.md)。

本仓库没有添加项目级开源许可证；第三方依赖和运行时使用各自许可证。
