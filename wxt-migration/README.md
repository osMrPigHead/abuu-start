# 航启 · WXT 扩展

把根项目的 Vue 3 前端迁移到 WXT，作为接管浏览器新标签页的扩展。根项目的 `src/`、`shared/`、`server/`、`docs/` 全部保留；本目录只承载扩展工程。

## 结构

- `src/`：从根 `src/` 复制过来的 SPA，保留原有 `api/cache/components/composables/domain/utils/views/assets` 分层。
- `src/entrypoints/newtab/`：唯一入口，WXT 会自动写入 `chrome_url_overrides.newtab`。
- `shared/`：**不在本目录复制**，通过 `@shared` 别名引用仓库根的 `../shared`，与本地中继共用同一份契约。
- `public/icon/`：扩展图标占位图（深色底 + “航”字）。

## 运行

先在仓库根目录安装依赖（本地中继需要 `express`）：

```bash
npm install
```

在本目录安装扩展依赖：

```bash
npm install --cache ../.npm-cache
```

终端 1：启动根项目的本地中继（`127.0.0.1:3000`）：

```bash
npm run relay
```

终端 2：启动 WXT 开发模式（开发服务器在 `localhost:4000`，并启动 Chrome）：

```bash
npm run dev
```

WXT 开发服务器使用 4000，避免与本地中继的 3000 冲突。扩展默认请求 `http://127.0.0.1:3000`。

## 构建与加载

```bash
npm run build
```

产物在 `.output/chrome-mv3`。Chrome/Edge 打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”并指向该目录。新标签页会被航启接管。

## 中继地址

默认 `http://127.0.0.1:3000`。需要换端口时设置环境变量再启动/构建：

```bash
WXT_RELAY_ORIGIN=http://127.0.0.1:5173 npm run dev
```

Windows PowerShell：

```powershell
$env:WXT_RELAY_ORIGIN = "http://127.0.0.1:5173"; npm run dev
```

中继需要同时监听对应地址；`manifest.json` 的 `host_permissions` 已放行 `127.0.0.1` 与 `localhost` 的任意端口。

## 检查

```bash
npm run compile   # vue-tsc
npm test          # 复制的 35 个测试 + api/base.test.ts
npm run build
```

## 说明

- 本次只生成 `newtab` 入口，没有 popup、options、background、content script。
- 番茄钟通知沿用 Web Notification；manifest 声明了 `notifications` 权限。
- 扩展通过 `host_permissions` 直接访问 loopback 中继；中继已放宽 POST 来源校验以接受 `chrome-extension://` / `moz-extension://`。
- Firefox 构建脚本保留，但本次只在 Chrome/Edge 验收。
