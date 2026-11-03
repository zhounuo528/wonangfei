# v0.2.1 验证范围

验证日期：2026-11-03。所有运行验证只使用隔离的虚拟数据，没有上传个人记录、测试档案、原始日志或系统截图。

- 41 项核心测试在 Asia/Shanghai、UTC、America/New_York 三个时区通过。
- Apple Silicon App：macOS 27.2 原生运行，DMG 校验和、只读挂载、复制到独立测试目录、签名和首次使用检查通过，32+9 项窗口流程通过。
- Intel x64 App：官方 Electron x64 ZIP 校验后构建；DMG 复制副本在 Apple Silicon + macOS 27.2 的 Rosetta 下执行，进程架构为 x64，`runningUnderARM64Translation` 为 true，32+9 项流程通过。Intel 硬件、macOS Sequoia 15.8.2 未实测。
- Windows x64：交叉构建完成；安装器为 x86 Unicode NSIS 引导程序，应用本体为 PE x64。manifest 为 asInvoker，按当前用户安装，包含卸载入口。安装包校验与解包后 73 个应用文件逐字节一致；没有 Windows 实机或虚拟机，安装、启动和卸载未实测。
- 三端应用使用相同 app.asar，产品源码文件与构建输入一致。
- Mac 真实菜单栏鼠标点击、系统区域截图、Finder 鼠标拖拽/双击未执行。菜单栏创建与程序触发的点击处理器、实际详情窗口内交互通过。
- 没有向系统 Applications 目录写入；测试复制到独立目录后通过系统 Launch Services 打开。
- 未做物理休眠/掉电硬件测试，已验证时间戳序列化及窗口隐藏恢复。

Mac App 仅 ad-hoc 临时签名，未启用 hardened runtime，没有 Developer ID 或公证；签名完整性校验通过，但 Gatekeeper 评估拒绝。DMG 没有数字签名。Windows 应用和安装器均未进行 Authenticode 签名。以上均不能称为完整跨平台验收。

下班提醒为应用内弹窗，应用退出后不保证准点提醒；Windows 托盘未适配。

附件 SHA-256 和字节大小见 [发布清单](../release-assets.json) 和 Release 附件 `SHA256SUMS.txt`。
