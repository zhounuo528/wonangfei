#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print '未检测到 Node.js/npm。请先使用已验证的 Node.js 22.12+ 环境。'
  read '?按回车关闭…'
  exit 1
fi
if [[ ! -d node_modules/electron ]]; then
  print '开发依赖尚未安装。请先在此目录运行 npm ci。'
  read '?按回车关闭…'
  exit 1
fi
npm start
