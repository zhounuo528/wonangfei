# v0.3.3 installation and compatibility

窝囊费 0.3.3 · 公开预发布体验版

请选择正确架构：
- Wonangfei-Setup-0.3.3-x64.exe：Windows 10/11 x64；只为当前用户安装。
- Wonangfei-0.3.3-mac-x64.dmg：Intel Mac，macOS 13+。2019 Intel Core i5 机型应选此包。
- Wonangfei-0.3.3-mac-arm64.dmg：Apple Silicon（M 系列）Mac，macOS 13+。

升级前先在旧版设置导出 JSON 备份，再退出旧版。Mac 打开 DMG 后把应用复制到 Applications；Windows 按向导安装到窝囊费专用目录。不必手动删除 AppData 或 Library 数据；本轮没有自动安装或清理你的应用。

新版包括：按当月考勤计算计薪天数、今天/明天改薪、按设定上班时间补算、日历未来计划/历史请假调休/补录/净利润、直接修正上下班和所有返工时段、补救忘记下班、加班费及摸鱼保留、净收入目标池、猫咪图标。演示入口已移除，旧演示档案只归档，不混入个人账本。

数据目录保持：Mac ~/Library/Application Support/WonangfeiTrial/；Windows 用户 AppData 下的 WonangfeiTrial/。记录仍保存在本机，包内没有用户档案。

首次保存新日历或时间修正会把个人记录升级至格式 2；旧版拒绝该格式。静态文件或应用回滚不会回滚数据；回旧版必须使用升级前备份，不能强改格式号或清空站点/应用数据。旧版也不保证理解今天/明天改薪等新字段，即使记录尚为格式 1，也不要导入新备份后用旧版继续记账。历史时段、固定分摊、加班费、摸鱼和已完成目标结算保留；历史调整可能令目标余池变负，不会重复结算。

签名：Mac App 仅 ad-hoc 临时签名，无 Developer ID、未公证，DMG 未签名；Windows App 与安装器未做 Authenticode 签名。下载后可能被 Gatekeeper 或 SmartScreen 拦截。请保留系统提示反馈，不要求关闭或绕过系统安全设置。

验证：macOS 27.2 Apple Silicon 上，最终 DMG 复制出的 arm64 应用原生运行、x64 应用通过现有 Rosetta 运行，各通过 20 组日历和 15 组工资/存储检查，均使用隔离虚拟数据；实际 0.3.0 模型生成的虚拟旧档案升级和完整重启验证通过。35 组检查不是 Intel 实机验收。Mac 物理 Finder 双击和菜单栏鼠标操作、macOS Sequoia 15.x、Windows 实机/虚拟机安装启动升级卸载、Intel 硬件未测。Windows 安装器压缩、架构、提取代码一致性和安装/卸载脚本检查通过，不等同 Windows 运行通过。

DMG 内应用经严格签名校验；本机通过 LaunchServices open 启动成功，不等于互联网下载后的 Gatekeeper 放行已验证。无薪加班、有效工时和净利润均为本地记录的估算口径，不预设法定加班倍率。菜单栏需主动点击收起，Windows 原生托盘尚未实现。

下载后可用同一 Release 的 SHA256SUMS.txt 核对文件。源码及公开发布记录：https://github.com/zhounuo528/wonangfei
