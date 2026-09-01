#!/bin/bash
# 构建 Windows 版前的运行时准备：下载 node.exe + 安装 playwright-core
# 用法: bash scripts/setup_runtime.sh
set -e
cd "$(dirname "$0")/.."
NODE_VERSION="v22.14.0"
mkdir -p runtime/node runtime/node_modules

if [ ! -f runtime/node/node.exe ]; then
  echo "下载 Windows Node $NODE_VERSION ..."
  curl -L -o /tmp/node-win.zip "https://npmmirror.com/mirrors/node/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip"
  unzip -q -o /tmp/node-win.zip -d /tmp/node-win
  cp "/tmp/node-win/node-${NODE_VERSION}-win-x64/node.exe" runtime/node/node.exe
  chmod +x runtime/node/node.exe
  rm -rf /tmp/node-win /tmp/node-win.zip
fi

if [ ! -d runtime/node_modules/playwright-core ]; then
  echo "安装 playwright-core ..."
  npm install --prefix runtime playwright-core --no-audit --no-fund
fi
echo "运行时就绪: $(du -sh runtime/node runtime/node_modules | tr '\n' ' ')"
