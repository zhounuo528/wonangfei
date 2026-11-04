# 窝囊费 0.3.4 安装与回退

- Windows x64：Wonangfei-Setup-0.3.4-x64.exe，Windows 10/11 x64，当前用户安装。
- Intel Mac：Wonangfei-0.3.4-mac-x64.dmg，macOS 13+；2019 Intel Core i5 选择此包。
- Apple Silicon Mac：Wonangfei-0.3.4-mac-arm64.dmg，macOS 13+，M 系列芯片。

先退出旧版，在设置导出升级前 JSON 备份。Mac 打开 DMG 后将应用复制到 Applications，再打开应用；Windows 运行安装向导。沿用 WonangfeiTrial 数据目录，不清空记录。本轮构建验收只复制应用到自己的临时目录，不安装到用户 Applications。

首次工资、日期调薪、普通补班整月重分及原加班费范围迁移采用记录格式 3；0.3.3 及更早版拒读。回退必须配合升级前备份，不能仅替换程序或网页资源，也不能强改数据格式号。

Mac 应用仅 ad-hoc 签名，没有 Developer ID 或 Apple 公证，DMG 未签名。Windows 应用和安装器未签名。下载可能被 Gatekeeper / SmartScreen 阻止；不要求用户关闭系统安全设置。

本机可测试 Mac ARM 与 Rosetta x64；Rosetta 不等于 Intel 实机。Windows 没有实机或虚拟机；macOS Sequoia 15.x 与朋友设备未实测。最终本轮实际验收结果另附，不将打包成功当作所有平台验收通过。
