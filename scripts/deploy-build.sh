#!/usr/bin/env bash
# 服务器端构建脚本：backend + frontend 各自 npm ci + build，跑迁移，最后落一个产物闸标记文件。
# 由 deployment.config 的 build-command 调用，退出码非零则不会 touch 标记（构建产物闸据此判定）。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> backend: npm ci"
(cd backend && npm ci)
echo "==> backend: build"
(cd backend && npm run build)
echo "==> backend: migration:run"
(cd backend && npm run migration:run)

echo "==> frontend: npm ci"
(cd frontend && npm ci)
echo "==> frontend: build"
(cd frontend && npm run build)

touch .build-complete
echo "==> build complete"
