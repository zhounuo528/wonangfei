# 当前技术栈与迁移评估

仅基于实际源码评估，没有部署或迁移平台。

前端为原生 HTML、CSS、JavaScript ES Modules，没有 React/Vue/TypeScript。`src/app.mjs` 直接操作 DOM、表单和 dialog；`src/model.mjs` 负责考勤、计薪、成本、摸鱼、总结、目标及月报；`money.mjs`、`live.mjs`、`work-equivalent.mjs` 分别处理金额显示、时间戳刷新和消费工时换算。使用本地 SVG、PNG 和系统字体，没有远程 CDN。

Electron 主进程使用 CommonJS，通过 `contextBridge` 与 IPC 提供 `window.workday`。桌面专属部分包括 BrowserWindow 的迷你尺寸/置顶/可见性事件、Mac Tray/Menu、原生导出对话框、本地 fs JSON 读写和应用生命周期。下班提醒本身是页面 dialog，未实现系统通知或退出后的定时唤醒。

`desktop/storage.cjs` 把个人 `state.json`、演示 `demo-state.json` 和模式 `mode.json` 分开，并用串行队列、临时文件写入与 rename 保存；不是 SQLite 或浏览器 localStorage。开发目录默认 `.local-data/`；安装版默认 Mac `~/Library/Application Support/WonangfeiTrial/`、Windows `%APPDATA%\WonangfeiTrial`。测试用 `WORKDAY_DATA_DIR` 指向独立虚拟档案。JSON 是本机明文，Chromium 会话缓存在同一目录的 `chromium/`。

普通网页可以复用计算模块和大部分界面。主要改造是把 `window.workday` 的保存/读取/个人演示切换改为 IndexedDB 等浏览器存储，导出改为浏览器下载；桌面小窗、置顶和菜单栏入口需要另设计浏览器体验；生命周期改用页面可见性事件。若需离线网页，再增加 HTTPS 下的 Service Worker 缓存。后台或关闭后的提醒需要按浏览器权限和能力重新设计，不能照搬桌面行为。

微信小程序可复用经过适配的纯计算逻辑，界面要重写为 WXML/WXSS、组件和小程序事件：DOM 查询、FormData、HTML dialog、直接 progress 更新等不能原样搬用。持久化需改为小程序本地存储并考虑限额、备份和多端口径；生命周期改为 onShow/onHide，减少频繁 setData，继续按时间戳恢复。还需检查 `Intl.NumberFormat`、`structuredClone`、`crypto.randomUUID` 的基础库兼容性并提供适配。窗口置顶、原生 Tray 没有对应形态；提醒需依据平台允许的通知能力设计。

代码依据：[前端入口](src/app.mjs)、[计算核心](src/model.mjs)、[桥接 API](desktop/preload.cjs)、[桌面窗口与数据路径](desktop/main.cjs)、[存储实现](desktop/storage.cjs)。
