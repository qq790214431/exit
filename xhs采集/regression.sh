#!/bin/bash
# 全量回归：单元测试 + 营销模块测试 + 冒烟测试（可选）
set -e
cd "$(dirname "$0")"
echo "===== 1. 单元测试 ====="
node test_units.js
echo "===== 2. 营销模块测试 ====="
node test_marketing.js
if [ "$1" = "--smoke" ]; then
  echo "===== 3. 端到端冒烟（真实采集2条，需网络） ====="
  node smoke_test.js
fi
echo "===== 全部通过 ✅ ====="
