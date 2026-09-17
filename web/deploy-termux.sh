#!/data/data/com.termux/files/usr/bin/bash

set -eu

PORT="${PORT:-3000}"
MODE="${MODE:-development}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "首次运行：正在安装 Node.js……"
  pkg install -y nodejs
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "当前 Node.js 版本过低（$(node --version)），正在升级……"
  pkg upgrade -y nodejs
fi

cd "$PROJECT_DIR"

if [ ! -f node_modules/next/package.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "正在同步网页依赖……"
  npm ci
fi

case "$MODE" in
  development|production) ;;
  *)
    echo "MODE 只能是 development 或 production。" >&2
    exit 2
    ;;
esac

echo
echo "网页地址：http://localhost:$PORT/"
echo "请保持 Termux 运行，按 Ctrl+C 停止。"
echo

# Turbopack requires native bindings that Next.js does not provide for
# Android/arm64. Webpack works with the WASM bindings available in Termux.
if command -v termux-open-url >/dev/null 2>&1; then
  (sleep 4; termux-open-url "http://localhost:$PORT/" >/dev/null 2>&1 || true) &
fi

if [ "$MODE" = production ]; then
  echo "正在创建生产构建（低内存手机可能需要几分钟）……"
  npm run build -- --webpack
  exec npm run start -- --hostname 0.0.0.0 --port "$PORT"
fi

exec npm run dev -- --webpack --hostname 0.0.0.0 --port "$PORT"
