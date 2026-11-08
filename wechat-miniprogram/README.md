# 窝囊费 · 微信小程序版

网页版与桌面版的微信小程序移植。**计算内核直接复用 `web/src`，页面、存储和平台能力按小程序重写。**

当前分支：`wechat-miniprogram`。网页版（`web/`）与桌面版（`src/`、`desktop/`）源码未做任何改动，生产站点不受影响。

## 目录结构

```text
wechat-miniprogram/
├── app.js / app.json / app.wxss     小程序入口与全局样式
├── project.config.json             开发者工具工程配置（appid 需替换）
├── core/                           计算内核，与 web/src 同源
│   ├── model.js                    计薪、考勤、费用、目标、报表（925 行，逐行复用）
│   ├── calendar.js                 单日日历与修正
│   ├── money.js                    金额格式化（Intl 优先，无机型兜底）
│   ├── money-change.js             金额变化语义（仅纯函数部分）
│   ├── extra-income.js / break-earnings.js / work-equivalent.js / shift-clock.js
│   ├── live.js / hold-stepper.js   可注入定时器的渲染节奏与长按步进
│   ├── compat.js                   小程序缺失能力的兼容层（新增）
│   └── backup.js                   备份解析（替换 TextEncoder/IndexedDB，新增）
├── store/index.js                  wx 本地存储 + 迁移 + 原子写入（替换 browser-store）
├── utils/format.js                 时长、日期、百分比等视图格式化
├── pages/                          today / calendar / costs / mine / goal / report / settings
├── tests/                          从 web/tests 移植，288 项
└── scripts/                        smoke.mjs（端到端）/ validate.mjs（静态校验）
```

## 复用了什么

`core/model.js` 等 6 个模块与 `web/src/*.mjs` **逐行一致**，只做了三处平台替换：

| 差异 | 网页版 | 小程序 |
|---|---|---|
| 深拷贝 | 全局 `structuredClone` | `core/compat.js` 的实现（模块内绑定，同名遮蔽） |
| 记录 ID | `crypto.randomUUID()` | `createId()`：有则用，无则时间戳 + 计数器 + 随机段 |
| 数组末位 | `Array.prototype.at(-1)` | `compat.js` 在加载时补 polyfill |

`scripts/validate.mjs` 会校验这 6 个文件在归一化后与网页版**完全一致**，防止后续各自漂移。

## 平台适配点

| 能力 | 网页/桌面 | 小程序 |
|---|---|---|
| 存储 | IndexedDB（`wonangfei-web-v1`） | `wx.setStorageSync`，键 `wonangfei-wechat-v1` |
| 写入 | 事务 + revision 校验 | 内存快照 + `validateState` + 失败回滚 |
| 备份 | 下载/上传 JSON 文件 | 复制到剪贴板 / 从剪贴板导入 |
| 渲染节奏 | `requestAnimationFrame` | `setInterval` 1s，仅在有时钟运行时启动，`onHide` 停止 |
| 自动考勤补记 | 页面可见时定时检查 | `onShow` 调用 `reconcileAttendance()` |
| 下班提醒 | 页面可见时弹窗 | `onShow` / tick 时弹一次，`markReminderDelivered` 去重 |
| 界面 | DOM + CSS | WXML + WXSS，7 个页面 |

## 已实现

- **工作台**：开始上班 / 下班结算（超 2 小时加班必须先选免费或填加班费）、秒薪时薪工时、今日收支与净额、显示模式切换（今日 / 本月 / 目标 / 隐藏）、快捷记花销、摸鱼计时、目标进度。
- **小月历**：月历计划底色、每日净利润、点选日期看当日明细、本月概览。
- **账本**：花销（当日 / 整月分摊）、固定负担（月/季/年/每日，可停止）、意外之财（可作废恢复）。
- **目标**：设置名称金额、进度、结算、完成记录。
- **报表**：月报 / 周报、收入成本净额、工时与摸鱼、平均日/时/秒薪、出勤统计、加班前后对比。
- **设置**：双休/单休/大小周/996/全年无休、工作日、月薪与计薪方式、上下班与午休、自动上下班、上班打卡提醒、下班提醒。

## 尚未移植（后续迭代）

- 日历单日修改（改当天排班 / 工资 / 加班费 / 当日费用）与撤销审计。
- 按日期调薪的时间线与撤销、首笔工资参考修复。
- 每日重复费用的单日调整与历史。
- 月末回顾快照、目标完成弹层、关于页的版本检查。
- 桌面版的迷你窗、菜单栏、置顶。

## 运行

1. 微信开发者工具 → 导入项目 → 选择 `wechat-miniprogram/` 目录。
2. `project.config.json` 里的 `appid` 目前是 `touristappid`（游客模式，仅本地预览）。正式开发请替换为你自己的小程序 AppID。
3. 首次使用进入「我的 → 薪资与排班」保存工资和排班，工作台才开始计薪。

## 校验

三层，全部通过：

```sh
cd wechat-miniprogram
node scripts/validate.mjs          # 工程结构 / JSON / WXML / 事件绑定 / 内核同源检查
node --test tests/*.test.mjs       # 从 web/tests 移植的 288 项单元测试
node scripts/smoke.mjs             # Node 模拟小程序运行时，31 项端到端检查
```

`smoke.mjs` 用 stub 的 `wx` / `Page` / `App` 把「设置 → 开始上班 → 记花销 → 摸鱼 → 加班决策 → 下班结算 → 目标 → 账本 → 日历 → 报表 → 备份往返」整条链路跑一遍。
它不能代替真机测试：界面渲染、`picker`、`switch`、键盘、真机性能仍需在开发者工具和真机上验证。

## 数据与合规

- 记录只保存在本机微信的 Storage，不上传、无账号、无网络请求（不配置任何 request 域名）。
- 备份是明文 JSON，复制到剪贴板后请自行妥善保管。
- 小程序正式发布前需要：替换 AppID、完成 **ICP 备案**、配置隐私协议（本版未采集任何个人信息，只需声明本地存储）。
