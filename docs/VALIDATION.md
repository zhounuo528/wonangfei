# v0.3.0 实际验收

宿主：macOS 27.2.0、Apple Silicon、Electron 45.2.1。测试全部为隔离虚拟档案，未读取用户实际财务记录。

- 85 项单元测试在 UTC、Asia/Shanghai、America/New_York 分别通过；覆盖五种考勤、闰年与大小月、切换模式、旧快照、计薪/费用、目标池、摸鱼、返工及时间修正。
- Apple Silicon：DMG CRC 校验通过，只读挂载后复制 App 到临时目录，推出磁盘，再通过 LaunchServices 默认参数启动；主流程 32、考勤 6、修正 7 组通过，综合功能 8 组通过。
- Intel x64：在同一宿主的 Rosetta 下以默认参数完成相同 53 项/组检查，`process.arch=x64`、`app.runningUnderARM64Translation=true`。Intel 硬件与朋友的 macOS 15.8.2 未测。
- Mac 两个 App 的 codesign 深度严格校验通过，签名为 ad-hoc；没有 Team ID、Developer ID 或公证票据，Gatekeeper 评估 rejected。实际浏览器下载后的隔离状态下无提示启动不作保证。
- Windows：PE App 为 x64，安装器引导为 x86 Unicode；App 和安装器权限均 asInvoker，签名目录为空。安装器解包得到 73 个应用文件，大小和哈希逐一匹配打包源。没有 Windows 真机或虚拟机，安装、启动、升级、卸载未运行。
- 三端 app.asar 的 SHA-256 均为 `929f0d6bb866c2e43688ac16466f571b26525b324d058ec92fb704ae0ceb526a`。仅含 src、desktop 和最小 package.json，共 45 个文件，运行源码与验收版本一致。

验收中发现并处理了两项测试条件问题，产品代码未因此改变：平均时薪统一两位小数，固定等待 4.2 秒可能尚未跨过下一次显示刷新，改为有超时上限地等待可见下降，保持严格下降断言；Intel Rosetta 读取外置卷测试脚本时停在文件打开，改在内部临时目录运行相同测试后默认启动参数通过。没有关闭沙箱、禁用安全功能或自动批准权限。

菜单栏已验证原生 Tray 创建、坐标、标题和程序触发点击处理器；没有辅助功能/屏幕录制权限，未做真实鼠标点击或系统菜单栏截图。Finder 真实鼠标拖拽/双击未测；LaunchServices 启动成功不能冒称完成 Finder 鼠标操作。没有安装到系统 Applications。物理休眠、掉电、实体手机及 macOS 15.6.1 未测，手机截图只是视口模拟。

仓库截图来自实际运行窗口，均为虚拟数据。历史 v0.2.1 的测试结论不混入本轮结果。0.2.1 保留原 Release 与附件。
