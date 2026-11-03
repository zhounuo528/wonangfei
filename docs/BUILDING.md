# 构建说明

当前源码与 v0.2.1 安装包使用相同产品代码。发布附件是已有构建，不是 CI 自动生成。

开发与测试：
```sh
npm ci
npm test
npm start
```

Mac 的 `scripts/package-trial.mjs` 构建 ARM64 App，`scripts/package-mac-intel.mjs` 从同一 app.asar 构建 Intel x64；`scripts/build-dmg.mjs arm64` / `x64` 生成 DMG。`scripts/package-windows.mjs` 生成 Windows x64 目录，`scripts/build-nsis.mjs` 编译当前用户安装向导。

构建脚本使用白名单，只装入 desktop、src 和包元数据；输出文件已存在时停止覆盖。个人档案、运行日志、测试数据、构建工具和缓存均不打包。

需要先准备官方固定版本的工具与运行时：
- Electron 45.2.1 ZIP，来自 [官方发布](https://github.com/electron/electron/releases/tag/v45.2.1)，按 `SHASUMS256.txt` 验证。ARM64 / Windows 打包脚本使用环境变量 `WONANGFEI_ELECTRON_ZIP_DIR` 指向包含对应 ZIP 的目录；Intel 脚本使用 `.installer-tools/electron-v45.2.1-darwin-x64.zip`。
- NSIS 3.12，官方 electron-userland 工具集 `nsis@1.2.1/nsis-bundle-3.12.tar.gz`，SHA-256 为 `56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4`。解压到 `.installer-tools/nsis-bundle/` 后，脚本调用其原生 Mac 编译器，不需要 Wine。
- 校验摘要依据 `app-builder-lib@26.18.0` 的工具集配置；工具集不随源码仓库或安装包分发。
- Mac DMG 使用系统 `hdiutil`，需要正常的磁盘映像创建/只读挂载能力。

例如在准备好对应官方 ZIP 后：
```sh
WONANGFEI_ELECTRON_ZIP_DIR=/path/to/verified-zips node scripts/package-trial.mjs
WONANGFEI_ELECTRON_ZIP_DIR=/path/to/verified-zips node scripts/package-windows.mjs
node scripts/package-mac-intel.mjs
node scripts/build-nsis.mjs
node scripts/build-dmg.mjs arm64
node scripts/build-dmg.mjs x64
```

签名为内部体验配置。正式签名、公证需要自己的有效授权和证书，本仓库不包含证书、私钥、令牌或发布凭据。GitHub Release 附件与测试限制见 README。
