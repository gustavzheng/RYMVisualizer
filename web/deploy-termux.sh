#!/data/data/com.termux/files/usr/bin/bash

set -e

PORT="${PORT:-3000}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "首次运行：正在安装 Node.js……"
  pkg install -y nodejs
fi

cd "$PROJECT_DIR"

if [ ! -f node_modules/next/package.json ]; then
  echo "首次运行：正在安装网页依赖……"
  npm ci
fi

echo
echo "网页已启动：http://127.0.0.1:$PORT/"
echo "请保持 Termux 运行，按 Ctrl+C 停止。"
echo

(sleep 4; termux-open-url "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || true) &
# Turbopack requires native bindings that Next.js does not provide for
# Android/arm64. Webpack works with the WASM bindings available in Termux.
npm run dev -- --webpack --hostname 0.0.0.0 --port "$PORT"
