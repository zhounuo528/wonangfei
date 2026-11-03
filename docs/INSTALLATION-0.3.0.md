# 安装说明

窝囊费 0.3.0 · 公开预发布体验版

选择安装包：
Windows 10/11 x64：Wonangfei-Setup-0.3.0-x64.exe
Intel Mac（Core i5/i7/i9）：Wonangfei-0.3.0-mac-x64.dmg，最低 macOS 13
Apple Silicon Mac（M 系列）：Wonangfei-0.3.0-mac-arm64.dmg，最低 macOS 13

Mac：先退出旧版，打开 DMG，把窝囊费.app 复制到 Applications，再从应用程序中打开并推出磁盘。Windows：运行 EXE，按当前用户安装，默认无需管理员权限；先退出旧版。

升级前请在旧版设置中导出备份。数据目录沿用 WonangfeiTrial，升级保留记录；旧版目标保留名称金额，从升级当天开始进入不限时目标池。旧版不保证理解新增字段，回退前请使用升级前备份。没有为用户安装新版或读取实际财务数据。

本轮新增：薄荷毛玻璃主题与图标、时间修正、不限时净收入目标池、摸鱼时长调节、返工与本次加班费、今日/本月平均值、996 和全年无休考勤。原有日期、费用和分摊表保留原快照；计薪天数仍独立填写。

Mac App 为 ad-hoc 临时签名，未做 Developer ID 签名或 Apple 公证，DMG 未签名，Gatekeeper 评估拒绝；下载后可能被系统拦截，不能保证无提示打开。Windows App 和安装器未做 Authenticode 签名。不要关闭系统安全功能或移除隔离属性；被阻止时保留提示反馈。

验收：85 项核心测试在三个时区通过。Apple Silicon 原生和 Intel x64 Rosetta 均从经校验的 DMG 复制到临时目录、推出磁盘后用 LaunchServices 打开，通过主流程32、考勤6、修正7、综合8项/组检查。Intel 硬件、macOS 15.6.1/15.8.2、Windows 安装启动卸载、Finder 真实鼠标拖拽/双击及物理菜单栏点击未实测。未向 Applications 安装；Rosetta 不等同 Intel 真机。

Mac 菜单栏模式需在配置后主动点击“收起到菜单栏”，不会在启动时自动出现；Windows 托盘尚未适配。下班提醒为应用内弹窗，应用关闭时不提醒。

SHA-256：
09cea3e32c20b5f58aada901b9c8fc84c95df018bd9609b8682cc15f3907a8d6  Wonangfei-Setup-0.3.0-x64.exe  (116130259 字节)
1a9b7d1adffc1bccc175c1dbaeacdc5986922bbecab0f6f1e392d1ae1ea5cf1b  Wonangfei-0.3.0-mac-x64.dmg  (144315794 字节)
6b066bedcc548644c838055b0c3e9eaf4159af4ab778724ef59b8e733e6900ac  Wonangfei-0.3.0-mac-arm64.dmg  (135987277 字节)
