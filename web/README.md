# RYM Visualizer

## Windows 一键启动

安装 Node.js 22 或更高版本后，双击 `start-windows.cmd`。首次运行会自动安装依赖，随后打开浏览器。

## Android / Termux 一键启动

在 Termux 中执行：

```bash
pkg install -y git
git clone <仓库地址>
cd <仓库目录>
bash deploy-termux.sh
```

首次运行会自动安装 Node.js 和项目依赖。网页地址为 `http://127.0.0.1:3000/`，按 `Ctrl+C` 停止。

## 手动启动

```bash
npm ci
npm run dev
```

