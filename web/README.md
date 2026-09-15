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

首次运行会自动安装或升级 Node.js，并同步项目依赖。网页地址为 `http://localhost:3000/`，按 `Ctrl+C` 停止。脚本会避开 Android 上缺少原生绑定的 Turbopack，改用 Webpack。

可通过环境变量修改端口：

```bash
PORT=8080 bash deploy-termux.sh
```

默认启动开发服务器，适合本机查看和调试。需要长期运行时可使用生产模式；每次启动会先构建，以确保代码更新生效：

```bash
MODE=production bash deploy-termux.sh
```

如果仓库位于 Android 共享存储（例如 `/sdcard`），npm 可能因文件权限或符号链接失败。建议将仓库放在 Termux 的主目录下。

## 手动启动

```bash
npm ci
npm run dev
```
