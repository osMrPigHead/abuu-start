# 航启主页 / ABUU-Start TRD

> 本文是当前唯一的技术设计文档，描述已实现的功能与实现口径。需求见 [prd.md](prd.md)，UI 布局见 [ui-lowfi.md](ui-lowfi.md)，北航上游接口见 [api.md](api.md)。目录分层与编码约束同时见仓库根目录 `AGENTS.md`。

## 1. 技术路线与范围

### 1.1 技术栈与部署

- 前端：WXT 浏览器扩展 + Vue 3 Composition API + `<script setup lang="ts">`，TypeScript strict，Vite 构建，Tailwind CSS，Vue Router 4（hash 模式）；不引入 Pinia、React、SSR。
- 目标浏览器：Chrome/Edge MV3 与 Firefox MV2；两者都通过本机未打包扩展验收。
- 扩展形态：只接管新标签页，manifest 声明 `chrome_url_overrides.newtab`、`notifications` 与 loopback 主机权限；Chrome/Edge 通过固定 `key` 稳定扩展 ID，Firefox 通过 `browser_specific_settings.gecko.id` 固定扩展 ID；Chrome/Edge MV3 写入 `host_permissions`，Firefox MV2 将主机权限并入 `permissions`；不生成 popup、options、background、content script。
- 状态：`reactive` / `ref` composable，模块级单例；跨页面共享的数据只通过 composable 暴露，不引入全局 store 库。
- 中继：Node.js >=22.12 的 TypeScript 模块，开发态由 `npm start` 直接运行；发布态可用 `npm run build:server` 生成 Windows x64 单文件 exe（Node SEA + esbuild + postject，内嵌 Node 运行时，目标机无需安装 Node）。构建时用 `resedit` 写入应用图标与版本信息，并用随 `@electron/windows-sign` 提供的 `signtool` 以本地自签名证书签名，默认附带 DigiCert RFC3161 时间戳。只提供 `/api`，不托管页面或静态资源；只监听 `127.0.0.1:3000`（`PORT` 可覆盖）。托盘由 `tray-hook` 实现，显示运行中/启动失败并提供退出入口；exe 首次启用托盘时把托盘客户端、原生二进制、图标与许可释放到 `%LOCALAPPDATA%\abuu-start\runtime\tray-hook\<runtimeId>\`，释放失败时降级为无托盘。
- 扩展访问中继：扩展页面与中继不同源，所有 `/api` 请求使用绝对地址；默认 `http://127.0.0.1:3000`，构建时可用 `WXT_RELAY_ORIGIN` 覆盖。
- 对外接口：业务数据只读 `GET /api/*`；仅登录、登出、验证码预加载、单源重试与背景目录设置/重新扫描使用白名单 `POST`。中继内部再调用上游的 GET/POST、AES/RSA、Token 头；前端不接触上游路径。
- HTTP：前端所有请求统一走 `src/api/client.ts`，基址由 `src/api/base.ts` 的 `relayUrl()` 生成；`request` 负责 `GET`，`postJson` 只用于白名单 `POST`，网络失败与非 JSON 响应统一映射为 `RELAY_UNREACHABLE`。
- 缓存：前端 localStorage，按数据源分键，缓存优先 + 后台刷新；不做定时轮询。
- 分层：`shared/` 保持在仓库根，放前后端共用类型、无副作用常量与纯校验函数，前端通过 `@shared` 别名引用，不复制；`src/domain/` 放无 Vue 依赖的领域规则；`src/cache/` 放 localStorage 读写与归一化；`src/composables/` 放模块级状态与流程；`views/` 不直接 `fetch`，`components/` 不读写 localStorage；`server/` 不引用前端代码。
- 单用户、本机数据、桌面优先；不做移动端布局、账号切换与云端同步。

### 1.2 功能范围

- 主页：时钟与日期、Bing 搜索、随机背景（内置图 + 本机目录）、快捷入口。
- 本地待办 + SPOC 作业聚合；番茄钟与桌面通知。
- 统一登录：中继完成学校统一认证，派生 byxt、SPOC、博雅、阳光四类数据源凭据。
- 教务聚合：byxt 课表与考试、博雅已选课程与课程广场、SPOC 作业、阳光打卡概览。
- 主页卡片开关与“仅时钟与背景模式”。
- 浏览器扩展在 Chrome/Edge 与 Firefox 中接管新标签页；本地中继托盘显示运行状态并提供退出入口。
- 桌面端响应式布局；不做移动端布局；具体响应式规则以 [ui-lowfi.md](ui-lowfi.md) 为准。

### 1.3 非目标

- 多用户、账号体系、权限管理、账号切换、云端同步。
- 移动端布局、SSR、Pinia、React。
- 扩展的 popup、options、background、content script、侧边栏、快捷键、右键菜单。
- 应用商店发布与自动更新；只验证本机加载的未打包扩展。
- 受信任证书的正式代码签名、安装包、自动更新、跨平台交叉编译与隐藏控制台窗口。
- 中继托管前端页面或静态资源。
- 托盘点击行为、开机自启与 HTTP 退出接口。
- 任何教务业务写操作：作业提交、阳光打卡、博雅选退课/签到、教务管理操作、附件下载。
- 研究生 GSMIS 课表；仅支持本科 byxt。
- 注册、找回密码、修改密码；验证码识别、自动填写或第三方打码。
- WebVPN、校外加密接入、连接模式选择。
- 快捷入口自定义图标/分组、卡片顺序拖拽。
- 博雅广场筛选与搜索、已选课程独立页面；阳光详情页；番茄钟专注统计、待办关联、自定义通知文案。
- 背景轮播、定时切换、模糊度等外观自定义；用户目录图片复制进仓库。
- 番茄钟后端计时、跨刷新恢复、页面关闭后通知；Web Push 与 Service Worker。

### 1.4 已确认口径

- 保存学号与密码，用加密文件保存，用于 SSO 会话失效后的自动重登；密码不写 localStorage、不返回前端、不写日志。
- 凭据加密使用 **AES-256-GCM + 独立密钥文件**；不使用 Windows DPAPI、keychain 或原生依赖。
- 登录成功即整体成功；四源异步派生，设置页轮询状态，失败项可单独重试，单源失败不阻塞整体。
- 本机背景目录路径由中继保存在本机配置文件中；取图接口只接受当前目录内的第一层图片文件名。
- 遇到“密码过期 / 账号存在安全风险”页时中止登录并提示用户处理，不自动提交 `ignoreAndContinue`。
- 主页卡片关闭后功能区固定 11 行；关闭的卡片不占位，同列后续卡片上移。
- 番茄钟只在页面内运行；刷新或关闭页面重置运行态，不新增计时后端。
- 所有教务数据只读；不执行提交、打卡、选退课、签到、附件下载。
- 前端改为 WXT 扩展，只接管新标签页；`shared/` 不复制，通过 `@shared` 别名引用仓库根。
- Chrome/Edge 与 Firefox 均为验收目标：Chrome/Edge 构建 MV3，Firefox 构建 MV2。
- 中继与扩展不同源：扩展用绝对地址访问中继，默认 `http://127.0.0.1:3000`；地址可用 `WXT_RELAY_ORIGIN` 覆盖。
- 中继只提供 `/api`，非 `/api` 请求返回 404；不再使用 Vite 插件，也不再提供 SPA fallback。
- `POST` 来源校验：Host 必须是 loopback；普通网页仍要求同源且非 `cross-site`；Chrome/Edge 只放行 `chrome-extension://<固定扩展 ID>`；Firefox 因内部 UUID 每次安装随机，RC 仍放行任意 `moz-extension://`（见 §9、§12）。
- 托盘只显示运行中/启动失败两态；菜单“退出”与 SIGINT/SIGTERM 都优雅关闭；`TRAY=0` 时不创建托盘。
- 中继发布态只构建 Windows x64 单文件 exe；`npm start` 保留；exe 默认写入应用图标/版本信息，并用 `private/code-signing` 下的本地自签名证书签名，默认附带 `http://timestamp.digicert.com` 时间戳；可用 `--no-sign` 跳过签名、`--no-timestamp` 跳过时间戳，首次启用托盘时释放托盘组件到本机用户目录。
- 路由使用 hash 模式，扩展页刷新不丢路由。

## 2. 目录结构

```text
wxt.config.ts                 WXT 配置：srcDir、newtab、固定扩展 ID manifest、dev 4000、@shared 别名
extension.config.ts           Chrome/Edge 固定公钥与派生 ID、Firefox gecko ID
tsconfig.json / vitest.config.ts

src/
  entrypoints/newtab/          index.html、main.ts：扩展唯一入口
  api/                        base.ts、client.ts、auth.ts、background.ts、byxt.ts、spoc.ts、
                              bykc.ts、ygdk.ts、relay.ts、errors.ts
  cache/                      storage.ts、schedule.ts、exams.ts、spoc.ts、bykc.ts、ygdk.ts
  composables/                模块级状态与流程；如 useAuth、useBackground、useHomeCards、
                              useHomeDisplay、useHomeBoard、useSchedule、useExams、useSpoc、
                              useBykcChosen、useBykcList、useBykcDetail、useYgdk、useTodos、
                              usePomodoro、useShortcuts、useSourceState、useDataSourceActions
  components/                 auth/、bykc/、common/、exams/、home/、schedule/、settings/、
                              spoc/、todo/
  domain/                     无 Vue 依赖的领域规则：schedule、week、exams、bykc、spoc、
                              ygdk、todo、repeat、pomodoro、shortcut、homeLayout、sourceStatus
  views/                      HomeView、ScheduleView、ExamsView、SpocListView、BykcView、SettingsView
  utils/                      日期、favicon、id、guards、番茄钟音频/通知
  assets/backgrounds/         仓库内置背景图与来源清单
  router.ts、types.ts、App.vue、main.ts、style.css、vite-env.d.ts

public/icon/                  扩展图标 16/32/48/96/128

shared/                       api.ts、auth.ts、errors.ts、guards.ts、schedule.ts、validation.ts

server/
  index.ts                    启动、信号、托盘编排与优雅退出
  app/                        config.ts、createApp.ts、routes.ts、relayHttp.ts：/api 边界
  tray/                       controller.ts、packaged.ts、status.ts、tray-hook.LICENSE、
                              assets/{running,error}.png、assets/app.ico：托盘状态、SEA 资产释放与 exe 图标
  auth/                       session.ts、state.ts、preload.ts、login.ts、relogin.ts、
                              deriveRunner.ts、derive.ts、deriveHelpers.ts、cas.ts、
                              http.ts、cookieJar.ts、store.ts、crypto.ts、types.ts
  core/                       datetime.ts、errors.ts、guards.ts、htmlText.ts、json.ts
  http/                       fetch.ts、upstream.ts：上游 fetch、信封读取与超时
  local/                      background.ts、settingsStore.ts：本机背景与设置
  sources/                    byxt.ts、byxtWeek.ts、spoc.ts、bykc.ts、ygdk.ts：业务归一化
  upstreams/                  urls.ts、byxtApi.ts、spocApi.ts、spocCrypto.ts、
                              bykcApi.ts、bykcCrypto.ts、ygdkApi.ts、types.ts：协议层

scripts/check-shared-usage.mjs
scripts/build-server-exe.mjs  Windows x64 单文件中继构建
scripts/make-app-icon.mjs     从 public/icon 生成 server/tray/assets/app.ico
scripts/sign-server-exe.ps1   自签名证书生成与 signtool 签名
.output/                      扩展构建产物：chrome-mv3 / firefox-mv2，不提交
dist/server/                  中继可执行产物 abuu-start-relay.exe，不提交
private/code-signing/         本地代码签名证书、密码与 CER，不提交
```

## 3. 中继 API

### 3.1 通用约定

- 监听：`127.0.0.1:3000`（`npm start`，可用 `PORT` 覆盖）；只接受 Host 为 `127.0.0.1`、`localhost` 或 `[::1]` 的请求，非本机 Host 返回 `404 NOT_FOUND`。中继不再挂到 Vite 开发服务器或 preview。
- 方法：
  - 业务数据只接受 `GET`。
  - 仅 `/api/auth/preload`、`/api/auth/login`、`/api/auth/logout`、`/api/auth/sources/:source/retry`、`/api/background/directory`、`/api/background/rescan` 接受 `POST`。
  - 非 `GET` / `POST` 方法返回 `405 METHOD_NOT_ALLOWED`；未列出的 `/api/*` 路径或方法组合返回 JSON `404 NOT_FOUND`；非 `/api` 请求返回文本 404，不回退到页面或静态资源。
- 路由表按 `method + path` 匹配；`/api/spoc/assignments/:assignmentId` 与 `/api/bykc/courses/:id` 按前缀匹配，方法仍为 `GET`。
- `POST` 请求体：
  - 有请求体时，`Content-Type` 必须是 `application/json`（可带 `charset=utf-8`）；其他类型返回 `415 UNSUPPORTED_MEDIA`。
  - 无请求体的接口（重试、登出、重新扫描）允许空 body。
  - 最大 16 KB；超过返回 `413 PAYLOAD_TOO_LARGE`。
  - 有 body 时必须是 JSON 对象；解析失败返回 `400 INVALID_REQUEST`。
- 跨站防护：中继不返回 CORS 头。`POST` 先要求 Host 为 loopback 且 `Origin` 存在；Chrome/Edge 只接受 `chrome-extension://<固定扩展 ID>`，其他 Chromium 扩展来源返回 `403 FORBIDDEN_ORIGIN`；Firefox 的 `moz-extension://` 主机是每次安装随机生成的内部 UUID，与 gecko ID 无映射，RC 仍放行任意 `moz-extension://` 来源。其他来源仍必须是 `http://127.0.0.1:<port>` 或 `http://localhost:<port>`，且与 Host 完全一致，并拒绝 `Sec-Fetch-Site: cross-site`。缺失或不合法返回 `403 FORBIDDEN_ORIGIN`。
- 响应：
  - JSON 接口：`Content-Type: application/json; charset=utf-8`，`Cache-Control: no-store`。
  - 图片接口：按扩展名返回 `image/*`，`Cache-Control: no-store`，`X-Content-Type-Options: nosniff`。
- 错误响应：

```json
{
  "error": {
    "code": "AUTH_EXPIRED",
    "message": "登录状态已失效，请重新登录"
  }
}
```

- 错误码与 HTTP 状态：

| code | HTTP | 含义 |
| --- | --- | --- |
| `NO_CREDENTIAL` | 401 | 旧“逐项凭据”模式遗留；当前不再产生 |
| `AUTH_REQUIRED` | 401 | 尚未登录 |
| `INVALID_CREDENTIALS` | 401 | 学号或密码错误 |
| `CAPTCHA_REQUIRED` | 401 | 需要验证码 |
| `CAPTCHA_INVALID` | 401 | 验证码错误或过期 |
| `PASSWORD_EXPIRED` | 403 | 密码过期或账号存在安全风险 |
| `AUTH_EXPIRED` | 401 | 会话失效且自动重登失败 |
| `LOGIN_IN_PROGRESS` | 409 | 已有登录请求在处理 |
| `SOURCE_UNKNOWN` | 400 | 数据源不是 byxt/spoc/bykc/ygdk |
| `SOURCE_BUSY` | 409 | 该数据源正在派生 |
| `INVALID_REQUEST` | 400 | 参数或请求体不合法 |
| `INVALID_WEEK` | 400 | 周次越界或非整数 |
| `INVALID_PAGE` | 400 | 页码或每页数量不合法 |
| `INVALID_PATH` | 400 | 背景路径或文件名不合法 |
| `PATH_UNAVAILABLE` | 422 | 背景目录不存在、不是目录或无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `METHOD_NOT_ALLOWED` | 405 | 方法不允许 |
| `FORBIDDEN_ORIGIN` | 403 | POST 来源不合法 |
| `UNSUPPORTED_MEDIA` | 415 | POST 不是 JSON 或图片格式不支持 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体过大 |
| `UPSTREAM_TIMEOUT` | 504 | 上游超时 |
| `UPSTREAM_ERROR` | 502 | 上游非 2xx、业务码非成功或响应异常 |
| `BAD_RESPONSE` | 502 | 响应不是预期 JSON |
| `INTERNAL` | 500 | 中继自身异常 |

- `SOURCE_DERIVATION_FAILED` 只作为 `sources[].error.code` 返回，不单独作为 HTTP 状态。
- `UPSTREAM_ERROR`、`UPSTREAM_TIMEOUT`、`BAD_RESPONSE` 表示网络或上游异常，不表示登录失效；只有 `AUTH_EXPIRED` 需要重新登录。上游 408/429/5xx、连接失败、DNS 失败与超时均归入此类。
- 日志只记录 `method`、`path`、`status`、`durationMs`；不记录请求头、请求体、密码、验证码、Cookie、Token、`ak/sk/ts`、响应体。

### 3.2 认证接口

#### `POST /api/auth/preload`

获取登录页状态、验证码与一次登录尝试的 `loginId`。请求体为 `{}`。

```json
{
  "loginId": "01J8Z0...",
  "captchaRequired": true,
  "captcha": {
    "image": "data:image/jpeg;base64,...",
    "expiresAt": "2026-10-27T10:30:00+08:00"
  },
  "alreadyLoggedIn": false
}
```

- `loginId` 是随机不可猜测字符串，只在本次登录尝试内有效，默认 10 分钟；中继在内存中保存该次尝试的 Cookie 罐、`execution`、`captchaId` 与创建时间，上限 5 个，超出淘汰最旧。
- `captchaRequired:false` 时不返回 `captcha`。
- SSO 已有会话时返回 `alreadyLoggedIn:true`；前端可只提交 `loginId`，由中继用现有 SSO 会话完成 UC 激活。由于没有本次输入的密码，不会更新密码；若此前也没有持久化密码，则 `persisted:false`，自动重登不可用。
- 上游失败 `502 UPSTREAM_ERROR`；超时 `504 UPSTREAM_TIMEOUT`。

#### `POST /api/auth/login`

```json
{
  "loginId": "01J8Z0...",
  "username": "2418xxxx",
  "password": "********",
  "captcha": "ab12"
}
```

- `loginId` 必须存在且未过期；否则 `400 INVALID_REQUEST`。
- `username`、`password` 在 `alreadyLoggedIn:false` 时必填；`captcha` 在预加载要求验证码时必填。
- 同一时间只允许一个登录请求；重复提交返回 `409 LOGIN_IN_PROGRESS`。
- 流程：
  1. 取出该 `loginId` 的 Cookie 会话。
  2. `alreadyLoggedIn:false` 时提交 SSO 表单；`alreadyLoggedIn:true` 时跳过提交。
  3. 手动跟随跳转，处理 HTTP → HTTPS 升级与相对 `Location`。
  4. 激活 UC，并用 `GET https://uc.buaa.edu.cn/api/uc/status` 校验。
  5. 成功后建立内存会话，异步启动四源派生。
  6. 尽力加密落盘；失败不阻塞本次运行。
- 成功响应：

```json
{
  "authenticated": true,
  "user": { "name": "张三", "schoolid": "2418xxxx" },
  "authenticatedAt": "2026-10-27T10:15:00+08:00",
  "persisted": true,
  "sources": {
    "byxt": { "status": "pending", "updatedAt": null, "error": null },
    "spoc": { "status": "pending", "updatedAt": null, "error": null },
    "bykc": { "status": "pending", "updatedAt": null, "error": null },
    "ygdk": { "status": "pending", "updatedAt": null, "error": null }
  }
}
```

- `persisted:false` 时附加 `warning:"无法保存登录状态，本次运行内仍可使用"`。
- 账号或密码错误：`401 INVALID_CREDENTIALS`；验证码错误或过期：`401 CAPTCHA_INVALID`；需要验证码但未提供：`401 CAPTCHA_REQUIRED`；密码过期/安全风险：`403 PASSWORD_EXPIRED`；上游 5xx/HTML：`502 UPSTREAM_ERROR`；超时：`504 UPSTREAM_TIMEOUT`。
- 登录失败不清除已有缓存、已有设置或已保存的旧会话；只有成功登录才替换会话。

#### `GET /api/auth/status`

返回本地认证快照，不主动请求上游。

```json
{
  "authenticated": true,
  "user": { "name": "张三", "schoolid": "2418xxxx" },
  "authenticatedAt": "2026-10-27T10:15:00+08:00",
  "persisted": true,
  "deriving": true,
  "sources": {
    "byxt": { "status": "ready", "updatedAt": "2026-10-27T10:15:03+08:00", "error": null },
    "spoc": { "status": "pending", "updatedAt": null, "error": null },
    "bykc": { "status": "failed", "updatedAt": "2026-10-27T10:15:08+08:00", "error": { "code": "SOURCE_DERIVATION_FAILED", "message": "博雅派生失败" } },
    "ygdk": { "status": "unconfigured", "updatedAt": null, "error": null }
  }
}
```

- `status` 取值：`unconfigured`、`pending`、`ready`、`failed`、`expired`；前端分别显示“未派生 / 派生中 / 已派生 / 派生失败 / 已失效”。
- `deriving` 为任一源 `pending`。
- `?validate=1`：若已登录，额外调用一次 UC status 校验会话；设置页首次加载使用，轮询不带该参数。
- `?validate=1` 的失败分两类：
  - 认证失败（UC 返回未登录、非 JSON 或非 2xx）：先尝试一次自动重登；仍失败则保留 `authenticated:true` 与 `authenticatedAt`，把四个源标记为 `expired`，并附 `warning:"登录状态已失效，请重新登录"`。
  - 网络或上游不可用（请求抛 `UPSTREAM_ERROR`/`UPSTREAM_TIMEOUT`，或 UC 返回 408/429/5xx）：不重登、不改四源状态，保留 `authenticated:true` 与原状态，附 `warning:"无法连接统一认证，登录状态未校验"`。
- 凭据文件损坏/密钥缺失：返回未登录，并带 `warning:"登录状态无法读取，请重新登录"`；不白屏。

#### `POST /api/auth/sources/:source/retry`

- `source` 只能是 `byxt`、`spoc`、`bykc`、`ygdk`；否则 `400 SOURCE_UNKNOWN`。
- 未登录：`401 AUTH_REQUIRED`；该源已在派生：`409 SOURCE_BUSY`。
- 成功响应：

```json
{
  "source": "bykc",
  "status": "ready",
  "updatedAt": "2026-10-27T10:18:00+08:00",
  "error": null
}
```

- 失败仍返回 200 的业务状态 `failed`，由前端展示错误与再次重试；只有会话整体失效才返回 `401 AUTH_EXPIRED`。
- 派生失败不删除其他源凭据。

#### `POST /api/auth/logout`

- 先用当前 Cookie 尽力调用 `GET https://sso.buaa.edu.cn/logout`，超时 5 秒；失败不阻塞后续清理。
- 清除内存会话、Cookie、派生凭据、密码与登录尝试。
- 无论内存中是否还有会话，都尝试删除 `credentials.enc` 与 `credentials.key`；删除失败也返回成功，并带 `warning`。
- 响应：

```json
{ "ok": true }
```

- 有删除失败时附加 `warning`，例如 `{ "ok": true, "warning": "部分凭据文件未能删除" }`。
- 退出登录不清除本机背景目录设置、待办、快捷方式、番茄钟设置；业务数据缓存由前端在退出后清理。

### 3.3 背景接口

#### `GET /api/background`

返回当前目录与第一层图片清单，不返回图片内容。

```json
{
  "directory": "D:\\Pictures\\wallpapers",
  "configured": true,
  "images": [
    { "name": "a.jpg", "size": 123456, "modifiedAt": "2026-10-20T21:00:00+08:00" }
  ],
  "warning": null
}
```

- 未配置：`{ "directory": null, "configured": false, "images": [], "warning": null }`。
- 目录被删除/无权限：HTTP 200，`configured:true`、`images:[]`、`warning:"背景目录不可用，已回退内置背景"`；保留已保存路径。
- 目录可用但没有支持的图片：`warning:"目录中没有可用图片，已回退内置背景"`。
- 不排序、不随机；由前端随机选择。`modifiedAt` 为 ISO 8601。

#### `GET /api/background/image?name=<文件名>`

- 只接受文件名，不接受路径。
- 校验：非空、长度 ≤ 255；不含 `/`、`\`、`:`、NUL、`..`；`path.basename(name) === name`；解析后的绝对路径必须以当前目录 + 分隔符开头；必须是当前清单中的第一层普通文件，扩展名在白名单内。
- 成功：返回图片字节，`Content-Type` 按扩展名，`Content-Length`，`Cache-Control: no-store`。
- 失败：非法名 `400 INVALID_PATH`；不在清单/文件已删除 `404 NOT_FOUND`；扩展名不支持 `415 UNSUPPORTED_MEDIA`；读取失败 `500 INTERNAL`。
- 前端单张失败时换下一张；连续失败 3 张或全部失败才回退内置背景。

#### `POST /api/background/directory`

```json
{ "path": "D:\\Pictures\\wallpapers" }
```

- `path` 必须是本机绝对路径，长度 ≤ 1024。
- 拒绝 UNC 路径（`\\server\share`）与设备路径（`\\?\`），只接受本地盘符/根路径。
- 中继校验：存在、是目录、可读；用 `fs.realpath` 规范化后保存。
- 保存成功后立即扫描第一层并返回与 `GET /api/background` 相同的结构。
- `path` 为空字符串或 `null`：清除已保存目录，返回 `{ configured:false, directory:null, images:[], warning:null }`。
- 目录不存在/不是目录/无权限：`422 PATH_UNAVAILABLE`，不覆盖旧设置；不是绝对路径：`400 INVALID_PATH`；配置文件写入失败：`500 INTERNAL`。

#### `POST /api/background/rescan`

- 无请求体；重新扫描已保存目录并返回清单。
- 未配置目录：返回 `configured:false`；目录不可用：返回 200 + `warning`，不清除路径。

### 3.4 背景扫描规则

- 只扫描所选目录第一层；子目录、符号链接、其他文件忽略。
- 扩展名白名单：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`、`avif`。
- 文件大小 1 字节至 20 MB；超过 20 MB 跳过。
- 用文件头 magic bytes 判断格式，至少识别 JPEG、PNG、GIF、WebP、BMP、AVIF；文件头与扩展名不符、无法读取或损坏的图片跳过，不阻塞其他图片。
- 图片内容不复制进仓库、不写入 localStorage、不写入凭据文件。
- `settings.json` 位于 `%LOCALAPPDATA%\abuu-start\settings.json`，明文保存背景目录路径；路径不是凭据。
- `settings.json` 形如：

```json
{
  "version": 1,
  "backgroundDirectory": "D:\\Pictures\\wallpapers"
}
```

- 原子写；损坏时忽略并视为未配置，不阻塞应用。

### 3.5 业务接口与凭据注入

| 方法 | 路径 | 页面/功能 | 上游调用 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 连接状态 | 无（中继自身），返回 `{ "ok": true }` |
| `GET` | `/api/byxt/status` | `/settings` 认证状态 | `currentUser.do` |
| `GET` | `/api/byxt/schedule?week=<n>` | 主页日程卡片、`/schedule` | `currentUser.do` → `getTermWeeks.do` → `getMyScheduleDetail.do` |
| `GET` | `/api/byxt/exams` | 主页日程卡片、`/exams` | `currentUser.do` → `exams.do` |
| `GET` | `/api/spoc/status` | `/settings` 认证状态 | `queryOne`（失败回退 `queryList`） |
| `GET` | `/api/spoc/assignments` | 主页待办卡片、`/spoc` | `queryOne`（失败回退 `queryList`）→ `queryKclb` → `queryListByPage`（翻页） |
| `GET` | `/api/spoc/assignments/:assignmentId` | `/spoc`、`/spoc/:assignmentId` 详情 | 作业列表 + `queryKczyInfoByid` + `queryXsSubmitKczyInfo` |
| `GET` | `/api/bykc/status` | `/settings` 认证状态 | `getUserProfile` |
| `GET` | `/api/bykc/chosen` | 主页日程卡片、`/schedule` | `getAllConfig` → `queryChosenCourse` |
| `GET` | `/api/bykc/courses?page=&pageSize=` | 主页博雅卡片、`/bykc` | `queryStudentSemesterCourseByPage` |
| `GET` | `/api/bykc/courses/:id` | `/bykc` 详情 | `queryCourseById` |
| `GET` | `/api/ygdk/overview` | 主页阳光卡片、`/settings` 认证校验 | `Classify/getList` → `Clockin/getCount` → `Term/get`（可选） |

- 认证路由 `/api/auth/*` 由 `/settings` 统一登录区使用，`retry` 也由失败源卡片触发；背景路由 `/api/background*` 由背景层与 `/settings` 背景区使用。两者都不是北航上游接口，细节见 3.2、3.3。
- 凭据由中继从当前内存会话注入，前端不发送任何 `X-*` 凭据请求头：
  - byxt：按 `byxt.buaa.edu.cn` 匹配的 Cookie。
  - SPOC：`Token: Inco-<token>`、`RoleCode`。
  - 博雅：`auth_token` 与 `authtoken`。
  - 阳光：表单追加 `uid`、`token`。
- 未登录：`401 AUTH_REQUIRED`。
- 上游认证失效（3xx/401/403、HTML 登录页、业务码表明未登录）：
  1. 尝试自动重登一次，重登前不预先标记 `expired`。
  2. 重登成功则重新派生该源并重试原请求一次；仍失败返回 `401 AUTH_EXPIRED` 并标记该源 `expired`。
  3. 重登因网络/上游 5xx 失败时返回 `502 UPSTREAM_ERROR` 或 `504 UPSTREAM_TIMEOUT`，不改数据源状态、不要求重新登录。
  4. 上游 408/429/5xx 不视为认证失效，直接返回 `UPSTREAM_ERROR`。
- 业务接口路径、参数与响应结构以 [api.md](api.md) 和 `shared/api.ts` 为准；前端字段见第 5 节。
- `/api/byxt/schedule`：
  - `week` 可省略；省略时按当前教学周。
  - `currentWeek` 优先按周次表日期；否则用 `welcomeInfo.classWeek`；都没有时为 `null`、`weekSource="default"`，取第 1 周并返回 `warning`。
  - `week` 越界或非整数返回 `INVALID_WEEK`。
  - `sectionTimes` 缺失时用固定作息表兜底；课程按 `dayOfWeek`、`beginSection`、`courseName` 稳定排序。
- `/api/byxt/exams`：只返回已排定条目（`examDate` 或 `startTime` 至少有一个）；时间字符串原样返回，由前端按多格式解析；缺时间时用 `examTimeDescription` 展示。
- `/api/spoc/assignments`：返回全部作业（含已提交、已截止）；前端按“未提交且未截止”过滤。按 `dueTime` 升序，无截止时间置后，再按课程名、标题。`queryKclb` 失败时继续，课程名用列表里的 `kcmc`，教师为 `null`。
- `/api/spoc/assignments/:assignmentId`：作业 id 只允许 `[A-Za-z0-9_-]`，长度 1–128；不在列表中返回 `404 NOT_FOUND`；分页最多 20 页。`score` 取 `pf`，`totalScore` 取 `zyfs`，附件取 `zyfjInfo.wjysmc`，说明由 `zynr` 去标签后返回纯文本。只读，不提供提交、下载或附件打开。
- `/api/bykc/courses`：`page` 默认 1；`pageSize` 默认 12，范围 1–50；非法返回 `INVALID_PAGE`；保持上游顺序，不按状态过滤，状态由中继计算。
- `/api/bykc/courses/:id`：`id` 只允许十进制整数且不超过安全整数范围；`courseDesc` 转纯文本后返回 `descriptionText`；无该课程返回 `404 NOT_FOUND`。
- `/api/ygdk/overview`：`termCount` 依次取 `term_good_count_show ?? term_good_count ?? term_count_show ?? term_count ?? 0`；`termTarget` 取 `term_num ?? classify.term_num ?? 0`；`weekCount` 取 `week_count ?? 0`；`weekTarget` 仅作系统参考。`Term/get` 失败不阻塞。
- 不提供任何业务写接口。

### 3.6 上游调用细节

- 单次上游请求超时 15 秒；派生阶段每个源单独超时 12 秒；超时映射 `UPSTREAM_TIMEOUT`。
- 上游 fetch 使用 `redirect: "manual"`；3xx 按认证失效处理（阳光按上游错误处理），不跟随到 SSO 登录页。
- byxt 请求头：`Accept`、`X-Requested-With: XMLHttpRequest`、`Referer`、`fetch-api: true`、`Cookie`。
- byxt 认证失败判定：408/429/5xx 映射 `UPSTREAM_ERROR`；其他非 2xx、`Content-Type` 非 JSON、响应体以 `<` 开头、JSON 解析失败映射 `AUTH_EXPIRED`。业务码 `code !== "0"` 且 `msg` 含“登录 / 认证 / 会话 / token”时映射 `AUTH_EXPIRED`，否则 `UPSTREAM_ERROR`。
- SPOC 请求头：`Token`（已带 `Inco-` 则不重复添加）、`RoleCode`、`X-Requested-With`、`Content-Type: application/json`（POST）、`Origin`/`Referer`。
- SPOC 认证失败判定：3xx、非 JSON、HTML 登录页，或 `code !== 200` 且 message 含“登录 / token / 未认证 / 未登录 / 权限”；否则 `UPSTREAM_ERROR`。
- SPOC AES：AES-128-CBC/NoPadding，key `inco12345678ocni`，IV `ocni12345678inco`，零填充，Base64。
- 博雅：基址 `https://bykc.buaa.edu.cn/sscv/`；`auth_token` 与 `authtoken` 取同一值；请求头含 `Accept`、`Content-Type: application/json;charset=UTF-8`、`Origin`、`Referer`、`ak`、`sk`、`ts`；每次请求生成新的 AES key，`ak` 用固定 RSA 公钥加密，`sk` 为请求 JSON 的 SHA-1 小写十六进制再 RSA 加密，请求体用 AES-128-ECB/PKCS5Padding 加密，响应按同一 key 解密；固定公钥、算法与 `apiName` 以 [api.md](api.md) 与 `server/upstreams/bykcCrypto.ts` 为准。
- 阳光：基址 `https://ygdk.buaa.edu.cn/api`；全部 `POST application/x-www-form-urlencoded; charset=UTF-8`；表单固定追加 `uid`、`token`；请求头 `X-Requested-With: XMLHttpRequest`；响应 `{ "code": 1, "result": ... }`，`code === -98` 为认证失效。
- 时间：列表 ISO 8601 带偏移 → `Asia/Shanghai` 的 `YYYY-MM-DD HH:mm:ss`；不带偏移的 `YYYY-MM-DD HH:mm:ss` 原样保留；日期取 `YYYY-MM-DD`。

### 3.7 中继进程与托盘

- `server/index.ts` 只做启动编排：读取端口与 `TRAY`、监听 HTTP、注册 SIGINT/SIGTERM、建立托盘；`server/app/createApp.ts` 生成只含 `/api` 的 Express 应用。
- 托盘使用 `tray-hook`，状态只有 `running` 与 `error`：
  - `running`：图标为绿色角标，tooltip 显示运行中与 `127.0.0.1:<PORT>`，菜单状态行显示 `http://127.0.0.1:<PORT>`，菜单提供“退出”。
  - `error`：图标为红色角标，显示端口占用等启动失败原因；进程保持存活，直到用户从托盘退出，退出码为 1。
- `TRAY=0` 时不创建托盘；`tray-hook` 二进制缺失、无桌面环境或初始化失败时只记录警告，API 继续提供。
- 菜单“退出”、SIGINT 与 SIGTERM 统一走优雅关闭：停止接收新请求，最多等待 2 秒让在途请求结束，再关闭托盘并让事件循环自然退出；不在信号处理器中直接 `process.exit()`。
- 发布态 exe 复用同一启动编排与 `PORT`/`TRAY` 环境变量；构建与托盘资产释放见 3.8。

### 3.8 可执行文件构建与运行

- 仅支持 Windows x64；构建机需 Node >=22.12，并在仓库根执行 `npm install`（包含 `tray-hook` 的 optionalDependencies 与 `resedit`、`@electron/windows-sign`）。
- 构建顺序：
  1. esbuild 把 `server/index.ts` 与 tray-hook 客户端打成 CJS。
  2. Node SEA 生成 blob。
  3. 复制当前 Node 为 `dist/server/abuu-start-relay.exe`，用 postject 注入 SEA blob。
  4. 用 `resedit` 写入 `server/tray/assets/app.ico` 图标与版本信息；此步骤同时重写 PE，修复 postject 后的文件结构，使 Authenticode 签名可写入。
  5. 用 `@electron/windows-sign` 自带的 `signtool.exe` 签名。
  6. 默认执行一次 `TRAY=0` + 随机端口的 `/api/health` 冒烟测试。
- 图标：默认 `server/tray/assets/app.ico`，由 `scripts/make-app-icon.mjs` 从 `public/icon/{16,32,48,96,128}.png` 生成；文件缺失时构建脚本自动生成。可用 `--icon <path>` 或 `ABUU_APP_ICON` 替换。
- 版本信息：取 `package.json` 的 `version`（写成四段，如 `0.1.0.0`），写入 `FileDescription=航启本地中继`、`ProductName=航启`、`CompanyName=abuu-start`、`LegalCopyright=MIT License` 等字段。
- 签名：默认使用本地自签名证书，文件位于 `private/code-signing/abuu-start-dev.pfx`、`.cer`、`.password.txt`（不提交）。PFX 缺失时自动生成；可用 `ABUU_SIGN_PFX`、`ABUU_SIGN_PFX_PASSWORD`、`ABUU_SIGN_PFX_PASSWORD_FILE` 替换为真实证书。`--no-sign` 或 `ABUU_SIGN=0` 跳过签名。
- 时间戳：默认对签名附加 RFC3161 时间戳，地址 `http://timestamp.digicert.com`；可用 `--timestamp <url>` 或 `ABUU_SIGN_TIMESTAMP_URL` 覆盖，`--no-timestamp` 关闭。默认时间戳失败会使构建失败，避免产出无时间戳的发布件。
- 签名状态：自签名证书未安装到受信任根时通常为 `NotTrusted`/`UnknownError`，签名仍有效但 Windows 可能显示未知发布者；构建脚本会读取签名证书指纹与时间戳证书并输出状态。可选把 CER 安装到 `CurrentUser\Root` 与 `TrustedPublisher` 以本地信任。
- `npm run build:server -- --no-smoke` 可跳过冒烟测试；`npm run build:server -- --no-sign` 可跳过签名；`npm run build:server -- --no-timestamp` 可跳过时间戳。
- 产物是单文件；不随包分发 `node_modules`。exe 内嵌的 Node 版本等于构建机 Node 版本，不保证跨版本一致。
- 运行时首次启用托盘前，把内嵌的 `tray-hook.cjs`、`tray-hook.exe`、`running.png`、`error.png`、`tray-hook.LICENSE` 释放到 `%LOCALAPPDATA%\abuu-start\runtime\tray-hook\<runtimeId>\`；`runtimeId` 由资产哈希生成。文件大小一致时复用，缺失或大小不符时重写；目录不可写、文件被占用或释放失败时只记录警告并继续提供 `/api`。
- `TRAY=0` 时不释放托盘资产；`PORT`、SIGINT/SIGTERM、端口占用错误态与源码运行一致。凭据、`settings.json`、背景目录仍位于 `%LOCALAPPDATA%\abuu-start\`，与启动方式无关。
- 自签名证书只适合本地；正式发布需替换为受信任 CA 证书。不提供安装包、自动更新、自定义安装器或隐藏控制台窗口；仅 Windows x64 验收。

## 4. 凭据存储与加密

### 4.1 位置

- 目录：`%LOCALAPPDATA%\abuu-start\`。
- 文件：`credentials.enc`（密文凭据）、`credentials.key`（32 字节随机密钥）、`settings.json`（背景目录等非敏感设置）。
- 目录创建为 `0o700`；文件写入后 `chmod 0o600`。
- Windows 上 `%LOCALAPPDATA%` 本身按用户隔离，继承当前用户 ACL；不额外调用 `icacls`，不引入原生依赖。
- 非 Windows 开发环境回退到 `~/.local/state/abuu-start/`。

### 4.2 密文格式

`credentials.enc` 是 JSON 文本，不是裸二进制：

```json
{
  "version": 1,
  "alg": "AES-256-GCM",
  "iv": "base64",
  "tag": "base64",
  "data": "base64"
}
```

- `iv`：12 字节随机数；`tag`：16 字节 GCM 认证标签；`data`：密文；AAD：`abuu-start/credentials/v1`。
- 明文 JSON：

```json
{
  "version": 1,
  "username": "2418xxxx",
  "password": "********",
  "user": { "name": "张三", "schoolid": "2418xxxx" },
  "authenticatedAt": "2026-10-27T10:15:00+08:00",
  "cookies": [
    {
      "name": "JSESSIONID",
      "value": "...",
      "domain": "byxt.buaa.edu.cn",
      "path": "/",
      "expiresAt": 1760000000000,
      "secure": true,
      "httpOnly": true,
      "hostOnly": true
    }
  ],
  "spoc": { "token": "...", "roleCode": "01" },
  "bykc": { "token": "..." },
  "ygdk": { "uid": 123, "token": "..." },
  "sources": {
    "byxt": { "status": "ready", "updatedAt": "2026-10-27T10:15:03+08:00" },
    "spoc": { "status": "ready", "updatedAt": "2026-10-27T10:15:05+08:00" },
    "bykc": { "status": "ready", "updatedAt": "2026-10-27T10:15:07+08:00" },
    "ygdk": { "status": "ready", "updatedAt": "2026-10-27T10:15:09+08:00" }
  }
}
```

- 不保存 `execution`、验证码、登录尝试 Cookie、CSRF token。
- 明文中的 `password` 只在用户成功登录后写入；`alreadyLoggedIn` 且未输入密码时不写。
- `cookies` 保存 SSO、UC、byxt、SPOC、博雅、阳光实际用到的 Cookie；加载时过滤已过期项。
- `sources` 只保存状态与时间，不保存错误详情中的上游响应体。
- 加载时若某源为 `pending`，说明上次派生被中断：改为 `failed`，错误文案“上次派生未完成，请重试”，不自动重跑四源。

### 4.3 密钥

- 首次保存时生成 `crypto.randomBytes(32)`，写入 `credentials.key`。
- 密钥文件只含 32 字节原始值，不 base64、不换行。
- 密钥不返回前端、不写日志、不进入 `settings.json`。
- 密钥缺失但密文存在：视为损坏，不尝试猜测；标记未登录，提示重新登录。
- 退出登录删除密钥；下次登录重新生成。

### 4.4 写入、损坏与清理

- 写入顺序：生成临时文件 → 写入 → `fsync` → `rename` 覆盖；密钥首次创建同样原子写。
- 写入串行化，避免并发派生互相覆盖。
- 解密失败、GCM 校验失败、JSON 解析失败、版本不支持：不把密文当明文使用；将 `credentials.enc` 重命名为 `credentials.enc.corrupt-<timestamp>`，保留现场；清空内存会话，返回未登录与提示；不白屏。
- 凭据目录不可写：保留内存会话，`persisted:false`，设置页提示“无法保存登录状态，本次运行内仍可使用”。
- 退出登录：先尽力 SSO logout，再清内存，最后删 `credentials.enc`、`credentials.key`；删除失败只记录日志，不把密码或路径写进错误响应。
- 业务数据缓存与凭据分离；清除缓存不影响登录状态。

### 4.5 旧凭据迁移

- 启动时删除旧键 `abuu-start.credentials.v1`，不尝试迁移明文。
- 旧 `X-*` 凭据请求头不再被中继读取；前端也不再发送。
- 升级后首次使用必须重新登录一次；旧业务缓存保留，登录后按缓存优先刷新。

## 5. 数据类型

### 5.1 共享契约

`shared/api.ts` 定义业务响应：`Term`、`Week`、`SectionTime`、`Course`、`Exam`、`SpocAssignment`、`SpocAssignmentDetail`、`BykcCourse`、`BykcCourseDetail`、`BykcCoursePage`、`BykcChosenCourse`、`BykcChosenResponse`、`YgdkOverview`、`BackgroundImage`、`BackgroundManifest` 与各响应包装类型。字段映射见 [api.md](api.md)。

`shared/auth.ts` 定义认证契约：

```ts
type AuthSourceId = "byxt" | "spoc" | "bykc" | "ygdk";
type AuthSourceStatus = "unconfigured" | "pending" | "ready" | "failed" | "expired";

type AuthSourceError = { code: string; message: string };
type AuthSourceState = {
  status: AuthSourceStatus;
  updatedAt: string | null;
  error: AuthSourceError | null;
};
type AuthSources = Record<AuthSourceId, AuthSourceState>;
type AuthUser = { name: string; schoolid: string };

type AuthStatusResponse = {
  authenticated: boolean;
  user: AuthUser | null;
  authenticatedAt: string | null;
  persisted: boolean;
  deriving: boolean;
  sources: AuthSources;
  warning?: string;
};

type AuthPreloadResponse = {
  loginId: string;
  captchaRequired: boolean;
  captcha?: { image: string; expiresAt: string };
  alreadyLoggedIn: boolean;
};

type AuthLoginResponse = {
  authenticated: true;
  user: AuthUser;
  authenticatedAt: string;
  persisted: boolean;
  sources: AuthSources;
  warning?: string;
};

type AuthSourceRetryResponse = {
  source: AuthSourceId;
  status: AuthSourceStatus;
  updatedAt: string | null;
  error: AuthSourceError | null;
};

type AuthLogoutResponse = { ok: true; warning?: string };
```

`shared/errors.ts` 定义统一错误码 `RelayErrorCode` 与 `ErrorEnvelope`；`shared/validation.ts` 定义博雅分页默认值、SPOC 作业 id 与阳光 UID 校验；`shared/schedule.ts` 定义共享作息与排课常量。

### 5.2 前端状态

```ts
type AuthState = {
  authenticated: boolean;
  user: AuthUser | null;
  authenticatedAt: string | null;
  persisted: boolean;
  deriving: boolean;
  checking: boolean;
  checkFailed: boolean;
  loading: boolean;
  error: string;
  warning: string;
  lastErrorCode: string;
  captchaRequired: boolean;
  captchaImage: string | null;
  alreadyLoggedIn: boolean;
  sources: AuthSources;
};

type HomeCardId = "schedule" | "bykc" | "todo" | "focus" | "ygdk";
type HomeCardVisibility = Record<HomeCardId, boolean>;

type SourceStatus = "idle" | "loading" | "ok" | "cached" | "error" | "no-credential" | "auth-expired";
type ApiErrorCode = RelayErrorCode | "RELAY_UNREACHABLE";
```

- 前端的 `SourceStatus` 表示单个数据源的展示状态，中继的 `AuthSourceStatus` 表示认证派生状态；两者语义不同，不要混用。
- 课表合并模型在 `src/types.ts` 的 `Course` 上增加可选 `source: "byxt" | "bykc"`，用于来源标记。

### 5.3 本地数据

```ts
type Shortcut = { id: string; title: string; url: string; row: number };

type Todo = {
  id: string;
  title: string;
  dueAt: string | null;
  note: string;
  priority: "high" | "medium" | "low";
  repeat: "none" | "daily" | "weekly";
  done: boolean;
  completedAt: string | null;
  createdAt: string;
};

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  roundsPerLongBreak: number;
};

type PomodoroRuntime = {
  phase: "focus" | "short-break" | "long-break";
  endsAt: number | null;
  remainingSeconds: number;
  running: boolean;
  paused: boolean;
  completedRounds: number;
  phaseDurationSeconds: number;
  oneMinuteNotified: boolean;
};

type YgdkSettings = { termTarget: number; weekTarget: number };
```

## 6. 认证流程

### 6.1 预加载

1. 设置页点击“登录”或首次进入时调用 `POST /api/auth/preload`。
2. 中继为该次尝试创建独立 Cookie 罐；若已有持久化会话，则复制其未过期 Cookie 作为初始值，用于识别“SSO 已登录”。
3. `GET https://sso.buaa.edu.cn/login`；若返回 302，标记 `alreadyLoggedIn:true`。
4. 解析 `execution` 与 `config.captcha`。
5. 需要验证码时，用同一 Cookie 罐请求验证码图片，返回 data URL。
6. 返回 `loginId`；前端只在内存保存，不写 localStorage。
7. 用户点击“刷新验证码”时重新预加载，旧 `loginId` 作废。

### 6.2 登录

1. 前端提交 `loginId`、学号、密码、验证码。
2. 中继校验 `loginId`，锁定单飞。
3. 构建表单：复制登录页 `form#fm1` 的 hidden 字段；覆盖 `username`、`password`、`execution`、`_eventId=submit`、`submit=登录`、`type=username_password`；有验证码时补 `captcha`、`captchaResponse`。
4. `POST https://sso.buaa.edu.cn/login`，手动跟随跳转。
5. 错误判定：
   - 页面含“验证码”错误 → `CAPTCHA_INVALID`。
   - 页面含账号/密码错误，或提交后又回到含 `execution` 的登录页 → `INVALID_CREDENTIALS`。
   - 页面含 `continueForm`、`ignoreAndContinue`、`账号存在安全风险`、`密码过期` → `PASSWORD_EXPIRED`，不自动跳过。
   - URL 含 `exception.message=` → 取参数作为提示，映射为 `UPSTREAM_ERROR`。
   - 其他 HTML/非 JSON → `UPSTREAM_ERROR`。
6. 成功后 `GET https://uc.buaa.edu.cn/api/login?target=...`，跟随跳转。
7. `GET https://uc.buaa.edu.cn/api/uc/status`，`code === 0` 且 `data` 非空才算成功。
8. 建立会话：保存 Cookie、用户、登录时间、密码、四个源 `pending`；尽力加密落盘；返回 200，并异步启动派生。
9. 删除本次登录尝试；失败也删除，前端重新预加载。

### 6.3 异步派生

- 顺序执行 `byxt → spoc → bykc → ygdk`，避免共享 Cookie 罐并发写 `Set-Cookie`。
- 每个源单独超时 12 秒；失败只更新该源，不抛出到整体。
- 每完成一个源：更新 `sources[source]` 为 `ready` 或 `failed`，写 `updatedAt` 与 `error`；串行写一次凭据文件，写失败不改变内存状态。
- 全部结束后 `deriving=false`。
- 派生使用统一认证后的共享 Cookie 罐：
  - byxt：`currentUser.do` 跟随跳转，最终 JSON `code === "0"`。
  - SPOC：`/spocnewht/cas` 跳转取 token，`casLogin` 取 RoleCode，`queryKclb` 校验。
  - 博雅：`/sscv/cas/login` 跳转取 `token`，`getUserProfile` 校验。
  - 阳光：oauth 跳转取 `code`，`campusAppLogin` 取 `uid`/`token`，`Classify/getList` + `Clockin/getCount` 校验。
- 派生期间用户退出登录：用会话代际号丢弃迟到结果，不写回已清除的会话。
- 业务请求遇到该源正在派生时，先等待该源结束，避免直接返回 `409`。

### 6.4 自动重登

- 触发条件：业务请求收到上游 401、SPOC `-98`、博雅会话失效、byxt 登录页 HTML、阳光 `code === -98`。
- 同一时间只允许一次自动重登。
- 流程：
  1. 有会话且有保存的密码，否则直接 `AUTH_EXPIRED`。
  2. 冷却：认证类失败（账号被拒、验证码、无密码）5 分钟内不重复；网络或上游 5xx 的瞬时失败 30 秒内不重复。
  3. 新建 Cookie 罐，不重用已失效 Cookie。
  4. `GET sso/login`；若要求验证码，标记需要手动登录，返回失败。
  5. 用保存的学号密码提交，激活 UC，校验 UC status。
  6. 成功：替换会话 Cookie、`authenticatedAt`；同步重新派生失败源（其他源后台刷新）；写盘。
  7. 失败按原因区分：
     - 认证失败（账号被拒、验证码、UC 未登录）：标记会话 `AUTH_EXPIRED`，保留密码与缓存；不自动重试。
     - 网络或上游不可用：返回 `upstream` 原因，由调用方映射为 `UPSTREAM_ERROR`/`UPSTREAM_TIMEOUT`，不改数据源状态、不要求重新登录。
- 自动重登成功后，原业务请求只重试一次；仍失败按认证失败返回 `AUTH_EXPIRED`。
- 不因自动重登失败而删除密码；用户手动登录成功后覆盖。

### 6.5 退出

1. 前端 `POST /api/auth/logout`。
2. 中继先尽力 SSO logout，再清内存、删密文与密钥。
3. 前端清 `useAuth` 的会话状态与本次登录尝试。
4. 前端清所有业务数据缓存（`abuu-start.cache.*`），但保留待办、快捷方式、番茄钟、背景目录与主页偏好。
5. 设置页回到未登录；主页各卡片显示“未登录，前往设置”引导，不显示成“无数据”。

## 7. 前端

### 7.1 useAuth 与启动

`useAuth` 是模块级单例，暴露：

```ts
{
  state: AuthState,
  hydrate(): Promise<void>,
  refreshStatus(validate?: boolean): Promise<boolean>,
  preload(): Promise<AuthPreloadResponse | null>,
  login(input: { username: string; password: string; captcha?: string }): Promise<boolean>,
  retrySource(source: AuthSourceId): Promise<void>,
  logout(): Promise<boolean>,
  isAuthBlocked(): boolean,
  pollWhileDeriving(): () => void,
}
```

- `hydrate()` 只在首次调用时请求 `GET /api/auth/status?validate=1`；调用方不等待，首次调用后复用同一 Promise。
- 认证校验期间 `checking=true`；成功后 `checking=false`、`checkFailed=false`；失败后 `checking=false`、`checkFailed=true`，仅写 `warning`。
- `isAuthBlocked()` 仅在 `checking=false`、`checkFailed=false` 且 `authenticated=false` 时为真；为真时各数据源直接显示“未登录”，否则照常取数。
- 登录成功或退出登录后丢弃迟到的校验结果；后续 `refreshStatus()` 成功会清除 `checkFailed`。
- `preload()` 把 `loginId` 保存在模块级内存；验证码图片由设置页展示。
- `login()` 复用当前 `loginId`；没有时才调用 `preload()`。密码只保存在函数局部变量与请求体，不写 localStorage；成功后清空密码、验证码与 `loginId`；验证码错误时保留学号与密码并刷新验证码；账号密码错误时清空密码，保留学号。
- 轮询：设置页挂载时若 `state.deriving`，每 1.5 秒调用 `refreshStatus()`，直到 `deriving=false` 或 60 秒；轮询不带 `validate=1`。
- 启动顺序：
  1. `bootstrap()` 删除旧凭据键后立即 `mount`，不等待认证校验。
  2. 挂载后调用 `void hydrate()`；主页与子页面同时读缓存并按开关刷新。
  3. 认证校验与业务取数并行；认证未决或校验失败时，缓存标为 `cached`，不得标为 `no-credential`。
  4. 校验失败只记录 `warning`，不拦截取数；卡片按各数据源响应显示“加载失败 / 缓存于… + 重试”。

### 7.2 设置页

设置页包含以下区块，顺序与视觉以 [ui-lowfi.md](ui-lowfi.md) 为准：

- 统一登录区：
  - 未登录：学号、密码、验证码（按需）、登录、刷新验证码。
  - 已登录：姓名、学号、登录时间、退出登录。
  - 四源状态：byxt、SPOC、博雅、阳光；状态为“未派生 / 派生中 / 已派生 / 派生失败 / 已失效”，失败项提供“重试”。
  - 登录中禁用按钮；错误按 `INVALID_CREDENTIALS`、`CAPTCHA_INVALID`、`CAPTCHA_REQUIRED`、`PASSWORD_EXPIRED`、`UPSTREAM_ERROR` 分类显示。
  - 不出现任何 Cookie、Token、RoleCode、UID 输入框，也不提供逐项清除入口。
- 阳光打卡目标：学期目标 1–100、周限制 1–14（默认 4）；非法值不保存并提示；保存后主页立即更新。
- 日程高亮：提前高亮分钟数，默认 30，范围 0–180，0 表示不提前高亮；保存后立即生效并写 localStorage。
- 主页卡片：五个开关（日程、博雅课程广场、待办、专注、阳光打卡），默认全开；切换立即生效并持久化；无保存按钮。
- 背景区：绝对路径输入框、保存、重新扫描、清除；显示当前目录、图片数量与 `warning`。
- 下方操作区：番茄钟桌面通知开关、权限状态、“测试通知”、清除缓存。
- 连接状态：显示本地中继是否可用。
- 清除缓存只删 `abuu-start.cache.*`；退出登录清业务缓存，但保留待办、快捷方式、番茄钟设置、背景目录、主页卡片与仅时钟模式等偏好。

### 7.3 路由与页面

| 路由 | 页面 | 主要内容 |
| --- | --- | --- |
| `/` | HomeView | 时钟/日期、Bing 搜索、随机背景、日程卡片、待办卡片、专注卡片、快捷方式；支持仅时钟与背景模式 |
| `/schedule` | ScheduleView | 页首与页尾周次切换、7 行纵向周视图、课程高亮、缓存与刷新；不显示考试标记 |
| `/exams` | ExamsView | 本学期已排定考试、按月分组、倒计时、已结束置底 |
| `/spoc` | SpocListView | 未提交且未截止作业、状态、开始/截止时间、点击打开详情 modal |
| `/spoc/:assignmentId` | SpocListView + SpocDetailDialog | 列表页上打开只读详情 modal（直达时自动打开） |
| `/bykc` | BykcView | 博雅课程广场分页、详情 modal |
| `/settings` | SettingsView | 统一登录、阳光目标、日程高亮、主页卡片、背景、通知与缓存、连接状态 |

- 本文路由均为逻辑路径；扩展页使用 hash 模式，实际地址形如 `chrome-extension://<id>/newtab.html#/schedule` 或 `moz-extension://<uuid>/newtab.html#/schedule`，刷新或重开扩展页保持当前路由。
- 未知路由重定向 `/`；不依赖服务器回退，不使用 history 模式。
- 不设登录页；登录只在 `/settings` 的统一登录区。
- 仅时钟与背景模式只在 `/` 生效；其他页面正常显示。
- 主页时钟：日期 `YYYYMMDD DDD`（如 `20261026 Mon`），时间 `HH:mm:ss`，每秒更新。
- 搜索固定 Bing；回车在当前标签页跳转，空输入不跳转。
- 背景与视觉样式以 [ui-lowfi.md](ui-lowfi.md) 为准。

### 7.4 主页布局与卡片开关

#### 布局规则

- 功能区固定 11 行；行号从 0 起，覆盖全部 11 行。
- 卡片顺序固定：日程 → 博雅课程广场 → 待办 → 专注 → 阳光打卡；左列只放日程、待办，右列只放博雅、专注、阳光。
- 每列自第 1 行起连续堆叠；关闭的卡片不占位，同列后续卡片整体上移，卡片之间不留空行。
- 右列卡片紧贴起始行不晚于它的最后一张左列大卡的右缘，间距按 UI 文档；左列没有可见卡片时从最左侧开始。
- 功能区行数恒为 11，关闭卡片不改变行数，也不改变快捷方式可用行数与已保存行号。
- 每行快捷方式从该行所有大卡的最大右缘之后开始排列；该行没有大卡时从最左侧开始。
- 快捷方式显式保存 `row`（0–10），同一行按数组顺序排列；每行数量不限，超出视口后横向滚动，不自动换行。
- 画布宽度取所有行内容与快捷方式右缘的最大值，并保证空行也能放下第一张快捷方式；纵向溢出隐藏，横向可滚动。
- 行高、行距、卡片宽度、快捷方式宽度与画布尺寸不在本文重复；以 [ui-lowfi.md](ui-lowfi.md) 与 `src/domain/homeLayout.ts`、`src/domain/shortcut.ts` 为准。

#### 交互

- 拖拽在整块功能区处理：纵向位置换算行号，横向位置换算该行的插入序号（排除被拖卡片）；空行、行末空白均可放置。
- 编辑态显示 11 行放置区，高亮目标行，并用竖线显示插入位置；每个快捷方式右侧显示编辑按钮，点击打开编辑弹窗（含删除）。
- 新建快捷方式默认追加到首行末尾，并横向滚动到新卡片；预置入口只在首次使用写入，之后以 localStorage 为准。
- 预置入口、旧数据缺少 `row` 时的迁移、`favicon` 回退等规则在 `src/composables/useShortcuts.ts` 与 `src/utils/favicon.ts` 中实现。

#### 卡片开关

- `useHomeCards` 为模块级 reactive 单例，五个开关默认开启，localStorage 键 `abuu-start.home.cards.v1`。
- 存储值形如 `{ "schedule": true, "bykc": false, "todo": true, "focus": true, "ygdk": true }`；缺失、不是对象或字段不严格等于 `false` 时一律按开启处理。
- 设置页切换立即写 localStorage 并生效，无保存按钮；写入失败提示“已保存到本次会话，但本地存储不可用”。
- 五张卡片全部关闭时功能区只渲染快捷方式，仍为 11 行，编辑与拖拽仍可用。

#### 取数与缓存

- 首次挂载先读缓存（`hydrate*` 只读 localStorage，不发请求），再按开关决定是否刷新；认证校验与刷新并行，不等待校验结果。

| 卡片 | 关闭时不请求 |
| --- | --- |
| 日程 | `/api/byxt/schedule`（当前周与明日预加载）、`/api/byxt/exams`、`/api/bykc/chosen` |
| 博雅课程广场 | `/api/bykc/courses?page=1` |
| 待办 | `/api/spoc/assignments` |
| 专注 | 无数据源 |
| 阳光打卡 | `/api/ygdk/overview` |

- 认证未决或校验失败时，缓存按 `cached` 展示；只有 `isAuthBlocked()` 为真才置 `no-credential`。
- 未登录时业务请求可能先行返回 `AUTH_REQUIRED`，卡片随即显示“未登录”；这是数据源的明确结果，不属于提前误判。
- 认证校验失败（中继不可达或超时）不拦截取数；卡片按自身请求结果显示“加载失败 / 缓存于… + 重试”，不显示成“未登录”。
- 考试区随日程卡片、SPOC 段随待办卡片一起隐藏，没有独立开关。
- 重新开启后再次进入主页，按“缓存优先 + 后台刷新”执行。
- 子页面（`/schedule`、`/exams`、`/spoc`、`/bykc`）不受开关影响，仍按各自流程取数。

#### 仅时钟与背景模式

- `useHomeDisplay` 维护 `minimalMode`，键 `abuu-start.home.display.v1`，默认 `false`；非法或缺省值按默认值处理。
- `minimalMode` 只在 `/` 生效；离开 `/` 时隐藏仅时钟视觉，但保留持久化状态。
- 进入后隐藏搜索框、时钟行按钮与整个功能区，只显示时钟与背景；不显示切换按钮。
- 点击视口任意位置退出；键盘可 Tab 聚焦后按 Enter 退出。
- 仅时钟模式下不调用日程、博雅、待办/SPOC、专注、阳光的加载函数；恢复显示时先读缓存，再后台刷新。
- 背景遮罩的交叉淡变与时钟动画按 [ui-lowfi.md](ui-lowfi.md) 执行。

### 7.5 背景

`useBackground` 为模块级单例，状态包含目录、清单、选中文件名、`warning`、`busy`、`fallback` 与 `hydrated`。

- `hydrate()` 在应用启动时调用一次 `GET /api/background`（绝对地址），记忆化后不再重跑；页面不得重复调用，否则会重新随机选图。
- 从 `images` 随机选一张作为 `selectedName`；同一 SPA 会话内所有页面共用。
- 浏览器刷新后重新随机；子页面不重新选图。
- 图片地址由 `relayUrl("/api/background/image?name=...")` 生成，默认 `http://127.0.0.1:3000/api/background/image?name=<encodeURIComponent(name)>`。
- 选中文件名后不预加载；由 `App.vue` 的 `<img>` 加载成功调用 `markLoaded(name)`，失败调用 `markFailed(name)`。
- 单张加载失败：从未失败的图片中再随机选一张；连续失败 3 张或全部失败，设 `fallback=true`。
- 自定义图加载期间不渲染内置图；加载成功后渐入；`fallback=true` 时渲染内置图。
- `saveDirectory(path)` 调用 `POST /api/background/directory`；成功后重新选图。`clearDirectory()` 提交空路径；`rescan()` 调用 `POST /api/background/rescan`，若当前图不在新清单则重新选。
- 图片不写入 localStorage、不复制进仓库；仅浏览器 HTTP 缓存，且响应 `no-store`。

### 7.6 背景层

- `App.vue` 顶层渲染单个固定 `<img>` 背景层，`HomeView`、`ScheduleView` 等子页面共用。
- 图片层固定铺满视口，`object-fit: cover`，`object-position: center`；不使用 `background-image` 与 `background-attachment`，避免页面滚动或触摸板滑动时背景位移。
- 初始透明，加载成功后按 UI 文档渐入；`:key="src"` 保证换图时移除旧图。
- 背景层 `pointer-events: none`、`draggable="false"`、`decoding="async"`、空 `alt`，不拦截点击、不可拖拽。
- `src` 取值：自定义图可用时为自定义图；`hydrated && (!configured || fallback)` 时为内置图；其余为空。为空或自定义图加载中时不渲染内置图，只保留深色底。
- 现有暗角/遮罩层保持不变，位于背景层之上、内容之下；完全功能模式与仅时钟模式使用不同遮罩层，切换时按 UI 文档交叉淡变。
- 根元素建立层叠上下文，使遮罩位于背景图之上、内容之下。

### 7.7 本地存储与缓存

| key | 内容 |
| --- | --- |
| `abuu-start.cache.byxt.schedule.v1` | `{ savedAt, term, weeks, currentWeek, weekSource, lastWeek, byWeek }` |
| `abuu-start.cache.byxt.exams.v1` | `{ savedAt, term, exams }` |
| `abuu-start.cache.spoc.assignments.v1` | `{ savedAt, term, assignments }` |
| `abuu-start.cache.spoc.detail.v1.<id>` | `{ savedAt, assignment }` |
| `abuu-start.cache.bykc.chosen.v1` | `{ savedAt, term, courses }` |
| `abuu-start.cache.bykc.courses.v1.<page>.<pageSize>` | `{ savedAt, page, pageSize, total, totalPages, courses }` |
| `abuu-start.cache.bykc.course.v1.<id>` | `{ savedAt, course }` |
| `abuu-start.cache.ygdk.overview.v1` | `{ savedAt, overview }` |
| `abuu-start.ygdk.settings.v1` | `YgdkSettings` |
| `abuu-start.todos.v1` | `Todo[]` |
| `abuu-start.shortcuts.v1` | `Shortcut[]` |
| `abuu-start.pomodoro.settings.v1` | `PomodoroSettings` |
| `abuu-start.pomodoro.notifications.v1` | `boolean`；未明确关闭时默认 `true` |
| `abuu-start.schedule.highlightLeadMinutes.v1` | `number`（0–180，默认 30） |
| `abuu-start.home.cards.v1` | `HomeCardVisibility` |
| `abuu-start.home.display.v1` | `{ minimalMode }` |
- 旧明文凭据键 `abuu-start.credentials.v1` 只在启动时删除，不再读写；localStorage 中不保存任何 Cookie、Token、RoleCode、UID 或密码。
- 读写统一包在 `src/cache/storage.ts`：`JSON.parse` 失败、配额不足、隐私模式不可用时返回 `null` / 降级为内存状态，并给出一次页面提示。
- 清除缓存只删 `abuu-start.cache.*`；清除凭据由“退出登录”完成；两者互不影响。
- 退出登录清业务缓存，但保留待办、快捷方式、番茄钟设置、背景目录、主页卡片与仅时钟模式。
- 缓存数据不含 Cookie/Token；缓存优先 + 后台刷新，不做定时轮询。
- 每个数据源独立 `SourceState`，状态为 `idle | loading | ok | cached | error | no-credential | auth-expired`。
- 主页标题标签由 `src/domain/sourceStatus.ts` 统一生成：已失效 > 未登录 > 加载失败 > 同步中 > 缓存于 `YYYY-MM-DD HH:mm` > 已同步 > 待接入；`loading` 为真时（含后台刷新）显示“同步中”。日程按课表、博雅已选课程、考试三个源聚合，缓存时间取三者最早的 `savedAt`。
- 有缓存先渲染并保留数据；后台请求成功后更新为“已同步”及时间；普通请求失败保留缓存并标注缓存时间；认证失效或未登录时标签显示“已失效/未登录”，缓存内容仍展示。
- 无缓存且失败：显示错误与重试，不显示空数据；首次未登录且无缓存：显示引导到 `/settings` 的空状态。
- 已登录但单源派生失败：该源显示“派生失败”与重试，其余源正常；会话过期且自动重登失败：对应数据源显示“已失效”，保留缓存并标注时间。

### 7.8 本地功能与偏好

- 本地待办、快捷方式、番茄钟、日程高亮、阳光目标、主页卡片开关与仅时钟模式不依赖登录，未登录仍可用。
- 背景目录保存在中继 `settings.json`，不属于 localStorage；退出登录不清除。
- 番茄钟运行态不写入 localStorage；配置与通知开关持久化。
- 清除缓存与退出登录分开；清除缓存不影响登录状态。

## 8. 业务规则

### 8.1 课表与考试

- 课表按“缓存优先”：先读 `byWeek[lastWeek]` 或当前周缓存渲染，再请求；成功后写缓存。
- 主页需要今日/明日：取当前周；若明日跨周（周日），再请求下一周并合并；博雅已选课程按日期并入。
- 今日/明日课程按开始时间排序；无课显示“无课”，取数失败显示错误，不显示成“无课”。
- 下一节课摘要：显示在日程卡片首行；在“今天 + 明天”的 byxt 与博雅课程中找进行中课程，显示剩余分钟；否则找下一节，显示时间与地点；都没有显示“暂无后续课程”。
- 课程高亮：开始时间在提前边界内的课程暖色高亮并闪烁，进行中的课程冷色高亮；提前边界默认 30 分钟，可在设置页调整；闪烁节奏与样式以 [ui-lowfi.md](ui-lowfi.md) 为准。
- 首行提示高亮：仅进行中时冷色；即将开始落在边界内时暖色；二者同时成立时文案仍显示“正在上课”，但使用暖色；两者都不成立不高亮。
- 当前周：`currentWeek` 来自周次表或 `classWeek`；都无则第 1 周并显示提示。
- `weeks` 为空时，7 行日期按当前日期所在自然周（周一至周日）推算，并保留“无法确定教学周，默认第 1 周”的提示。
- 首周/末周禁用上一周/下一周；周次选择只允许 `1..weeks.length`；页首与页尾均提供上一周、跳转周、下一周。
- 课程块：节次/时间、课程名、地点；教师有则附在地点行末尾（`地点 · 教师/周次描述`），数据用 `weeksAndTeachers` 的周次/教师合并描述。
- 博雅课程带“博雅”来源标记；与 byxt 课程按开始时间合并排序；时间冲突时两者都显示。
- `/schedule` 不渲染考试标记；考试只在主页与 `/exams` 使用。
- 考试解析兼容 `YYYY-MM-DD`、`YYYY-MM-DD HH:mm`、ISO 8601 与中文/斜杠日期；`examDate` 常带 `00:00:00`，具体时分以 `startTime` 为准；缺时间时回退 `examTimeDescription`。
- 考试状态：`upcoming` / `ongoing` / `ended` / `unknown`；未结束考试（含进行中）按月分组、组内按开始时间升序在前；已结束考试统一置底并标注，组内按时间倒序；“时间待定”置后。
- 主页取全部未结束考试中开始时间最早的 3 场；没有未结束考试时显示空状态。
- 倒计时：未结束显示剩余天数；当天显示“今天”或“今天 HH:mm”；已结束显示“已结束”；日期计算按浏览器本地时区，跨天由时钟驱动更新。
- 缓存与错误：课表、考试、博雅已选课程各自独立状态；单源失败不阻塞其他源；断网仍可看缓存并显示缓存时间。

### 8.2 博雅课程

- 已选课程：`getAllConfig` 解析当前学期起止日期，再调用 `queryChosenCourse`；`semester[]` 按当前时间匹配，无匹配取结束日期最晚的一项；`courseInfo` 为空的记录跳过；同一 `courseId + startTime` 去重；服务端不按时间过滤，前端按日期筛选。
- 主页今日/明日：取 `startTime` 的日期部分与今天/明天比较，与 byxt 课程合并排序；博雅课程显示来源标记。
- `/schedule`：由 byxt 周次表得到周一至周日日期，博雅课程日期落在该周范围才显示；同一天按开始时间合并排序。
- 下一节课：在“今天 + 明天”的 byxt 与博雅课程中找进行中；否则找开始时间最近的一节；都没有显示“暂无后续课程”。
- 博雅失败不影响 byxt；博雅区域显示“未登录 / 加载失败 / 缓存于…”与重试，不显示成“无课”。
- 课程广场：`/bykc?page=n`；`page` 非法或小于 1 回退 1，大于 `totalPages` 回退末页或 1；每页 12 条；上一页/下一页，首末页禁用；字段为课程名、时间、地点、教师（有则显示）；按上游顺序，不做本地排序。
- 状态标签按顺序计算：`courseStartDate` 已过 → `expired`；`selected === true` → `selected`；`courseSelectEndDate` 已过 → `ended`；人数已满 → `full`；`courseSelectStartDate` 未到 → `preview`；否则 `available`。文案为“已过期 / 已选 / 选课结束 / 人数已满 / 预告 / 可选”。
- 详情 modal：列表四项 + 课程简介纯文本 + 状态；无写操作按钮；简介不渲染 HTML；失败保留列表已有字段并显示错误与重试；无效 id 显示“未找到”并可关闭。
- 缓存：每页独立缓存；进入页面先读缓存再刷新；失败保留缓存并标注时间；无缓存显示错误与重试。
- 主页广场卡片：使用第 1 页缓存/请求，随机取 3 门；不足 3 门显示实际数量；“换一批”在当前第 1 页课程中重新随机，尽量不与当前 3 门重复，无法避免时允许重复；点击课程卡片打开详情 modal，点击“查看全部”进入 `/bykc`。

### 8.3 SPOC

- 列表只显示 `submissionStatus === 'unsubmitted'` 且（`dueTime` 为空或晚于当前时间）的作业；已截止、已提交不显示。
- 无截止时间显示“无截止时间”并置后；按截止时间升序，无截止时间置后。
- 列表字段：课程·教师、标题、开始时间、截止时间、提交状态；点击打开详情 modal。
- 详情 modal 只读：标题、课程、教师、开始/截止、提交状态、成绩、作业说明、附件名称；无成绩显示“暂无成绩”；无附件不显示附件区；说明按纯文本展示，不使用 `v-html`。
- 打开 modal 时先展示列表现有字段，详情加载后补齐成绩、说明与附件；关闭后回到列表。
- 无效 id 显示“未找到”，可关闭 modal 回到 `/spoc`；失败时保留缓存并显示缓存时间；无缓存时显示错误与重试。
- 不提供提交、附件下载或任何写操作。

### 8.4 阳光打卡

- 保存登录状态后由中继派生凭据；主页卡片展示学期次数、学期目标、学期进度、当周次数、周限制、周进度。
- 学期目标：`systemTermTarget > 0` 时使用系统值，否则使用用户 `termTarget`；用户值非法时回退默认值。
- 周限制始终使用用户 `weekTarget`（默认 4），不使用系统 `weekTarget`。
- 进度：学期进度 = `termCount / termTarget`；周进度 = `weekCount / weekTarget`；超过限制进度条封顶 100%，文字显示实际次数。
- 设置页修改目标/周限制后立即写入 `abuu-start.ygdk.settings.v1`，主页响应式更新。
- 失败：保留缓存并标注时间；无缓存显示错误与重试；不显示成“0 次”。
- 不设详情路由；不提供打卡、补卡、上传。

### 8.5 待办

- 本地待办字段：标题、截止时间、备注、优先级（默认中）、重复（无/每天/每周）、完成状态。
- 重复任务必须有截止时间；完成时保留原条目为已完成，并按周期生成新条目。
- 顺延：新截止时间 = 原截止时间 + 周期；若仍不晚于当前时间，继续加周期直到未来最近一次。
- 排序：未完成在前；截止时间升序；无截止时间置后；已完成置后；同截止时间按创建时间。优先级只改变展示，不参与排序。
- 待办卡片左右两栏：左栏本地待办，右栏 SPOC 作业；两栏各自滚动；SPOC 段只读，不显示勾选框，点击打开详情 modal。
- 数据写 `abuu-start.todos.v1`；刷新保留。

### 8.6 番茄钟

- 默认 25/5/15 分钟，每 4 个专注轮次进入长休；配置写 `abuu-start.pomodoro.settings.v1`。
- 配置校验：专注 1–180 分钟，短休/长休 1–60 分钟，轮次 1–12；非法值不保存并提示。
- 运行态只在内存：阶段、剩余秒数、运行中、暂停、已完成专注轮次、结束时间戳、阶段总时长、是否已发 1 分钟通知；刷新页面重置运行态，不写 localStorage，不新增后端接口。
- 计时用 `endsAt` 时间戳 + 250ms 定时器校正，不用累加秒数，避免后台节流漂移。
- 首次开始仍由用户点击；开始后专注阶段自动计时。
- 阶段自然结束：播放提示音；专注结束则轮次 +1；按轮次决定长休/短休/专注；立即进入下一阶段并自动开始，`endsAt = 原结束时间 + 下一阶段时长`；发送“阶段结束”通知（若开启）；重置 1 分钟通知标记。
- 后台/休眠跨过多个阶段：从旧 `endsAt` 开始循环推进，直到 `endsAt > now`；循环中照常累计专注轮次，但不补发历史提示音与通知；只跨过一个阶段时按正常结束处理；循环上限 10000 次。
- 页面恢复可见时立即执行一次 `tick`，不等待下一个 250ms 定时器。
- 开始/暂停/继续/重置：暂停保留剩余；继续从剩余时间开始；重置回到当前阶段完整时长并停止，已完成轮次保持不变。
- 通知：开关未明确关闭时默认开启；首次开启或首次开始/继续（用户手势）时若权限为 `default`，请求一次权限；用户主动关闭后不再自动请求；`Notification` 不存在或权限被拒绝时开关回到关闭并提示；设置页显示权限状态并提供“测试通知”。
- 结束前 1 分钟通知：仅当阶段时长 > 60 秒；在 `endsAt - 60_000` 后首次 `tick` 发送一次；暂停时若已跨过该边界，标记为已通知；恢复后不补发暂停期间的通知。
- 阶段结束通知文案含刚结束阶段与下一阶段；与 1 分钟通知使用不同 `tag`，创建时使用 `renotify: true`；点击通知 `window.focus()` 并关闭通知。
- 通知不可用/权限被拒绝：提示音与自动流转仍正常；不自定义通知文案；不注册 Service Worker；页面关闭后不发通知。
- 提示音用 Web Audio 生成；播放失败不影响计时。

## 9. 安全与边界

- 中继只监听本机；Host 校验；不设置 CORS。
- 对外只暴露只读业务 `GET`；仅登录、登出、验证码预加载、单源重试与背景目录设置/重新扫描使用白名单 `POST`；中继内部只调用白名单上游接口，不接受任意 URL/路径。
- 凭据只出现在：登录请求体（仅 loopback，`no-store`）、中继内存会话、AES-256-GCM 密文文件。
- 凭据不出现于：localStorage、URL、查询串、日志、错误响应、前端状态、Git 仓库。
- 密码只用于 SSO 登录与自动重登；不参与派生；不返回前端。
- 文件权限：目录 `0700`、文件 `0600`；密钥与密文分开。
- 背景接口防路径穿越：文件名白名单校验 + `realpath` 前缀校验 + 只读清单；不接受绝对路径、`..`、分隔符；只返回白名单图片且只第一层，不提供目录浏览接口。
- `POST` 来源校验 + JSON Content-Type；不启用 CORS；Host 校验保持。Chrome/Edge 只放行 `chrome-extension://<固定扩展 ID>`；Firefox 的 `moz-extension://` 内部 UUID 每次安装随机，RC 仍放行任意 `moz-extension://`；普通网页仍要求同源。
- 固定扩展身份：Chrome/Edge 在 manifest 写入固定 `key`，由公钥派生扩展 ID；Firefox 写入 `browser_specific_settings.gecko.id`。中继白名单常量见 `extension.config.ts` 与 `server/app/relayHttp.ts`。
- 登录单飞；自动重登节流（认证失败 5 分钟内不重复，瞬时失败 30 秒内不重复）；密码错误不自动重试。
- 上游错误只返回固定中文文案；不回显 HTML、Token、Cookie；`server/http/upstream.ts` 的异常包装不得把请求体、Cookie 或上游 HTML 拼进错误消息。
- 博雅课程简介、SPOC 作业说明只按纯文本展示，不使用 `v-html`；快捷方式 URL 只允许 `http:`/`https:`。
- 背景图片、字体等资源本地打包；favicon 取站点自身 `/favicon.ico`，失败显示首字母。
- 不执行任何提交、打卡、选退课、签到、附件下载；不实现 WebVPN；不把凭据发往第三方。
- 单用户、本机数据；不做云端同步。

## 10. 启动与脚本

```bash
npm install
npm start             # 本地中继 + 托盘，127.0.0.1:3000
npm run build:server  # Windows x64 单文件中继（图标 + 版本信息 + 自签名 + 时间戳）-> dist/server/abuu-start-relay.exe
node scripts/make-app-icon.mjs # 从 public/icon 重新生成 app.ico
npm run dev           # WXT 开发服务器（Chrome/Edge），localhost:4000
npm run dev:firefox   # WXT 开发服务器（Firefox）
npm run build         # Chrome/Edge MV3 -> .output/chrome-mv3
npm run build:firefox # Firefox MV2 -> .output/firefox-mv2
npm run zip           # 打包 Chrome/Edge 扩展
npm run zip:firefox   # 打包 Firefox 扩展
npm test              # Vitest
npm run type-check
npm run lint
npm run format:check
npm run check         # lint + format:check + type-check + test 并行
npm run check:shared
```

- 中继与 WXT 开发服务器是两个独立进程：先 `npm start`，再按目标浏览器执行 `npm run dev` 或 `npm run dev:firefox`；开发服务器固定 `localhost:4000`，`strictPort` 下端口占用会直接失败。
- 扩展请求默认发往 `http://127.0.0.1:3000`；需要改中继地址时，在构建或开发命令前设置 `WXT_RELAY_ORIGIN`。`PORT` 可改中继端口。
- `npm start` 使用 `node --experimental-strip-types server/index.ts`；`TRAY=0` 可关闭托盘，仅保留 API。
- `npm run build:server` 仅支持 Windows x64，需 Node >=22.12；默认带 `TRAY=0` 冒烟测试，`-- --no-smoke` 可跳过；默认签名，`-- --no-sign` 或 `ABUU_SIGN=0` 可跳过。产物不依赖目标机的 Node 或 `node_modules`。
- 默认附带 RFC3161 时间戳；`-- --no-timestamp` 关闭，`-- --timestamp <url>` 或 `ABUU_SIGN_TIMESTAMP_URL` 覆盖时间戳地址；时间戳失败会使构建失败。
- 图标可用 `-- --icon <path>` 或 `ABUU_APP_ICON` 覆盖；默认 `server/tray/assets/app.ico` 缺失时自动生成。
- 证书默认读写 `private/code-signing/abuu-start-dev.pfx`；可用 `ABUU_SIGN_PFX`、`ABUU_SIGN_PFX_PASSWORD`、`ABUU_SIGN_PFX_PASSWORD_FILE` 覆盖，`ABUU_SIGNTOOL` 可指定其他 signtool。
- 版本信息取 `package.json` 的 `version`；修改版本号后重新构建即可更新 exe 的 FileVersion/ProductVersion。
- 扩展构建产物分别位于 `.output/chrome-mv3` 与 `.output/firefox-mv2`，作为对应浏览器的未打包扩展加载；不再有 `preview`、`dist` 静态托管或 SPA fallback。`dist/server/` 仅用于中继 exe，`npm run build` 清空 `.output/` 时不会删除它。
- Chrome/Edge 与 Firefox 双平台均为验收目标；`npm run zip` 与 `npm run zip:firefox` 分别生成商店用压缩包。
- 不引入其他后端；加密使用 Node 内置 `node:crypto`，托盘使用 `tray-hook`。

## 11. 验收

- 构建与检查：`npm run type-check`、`npm run build`、`npm run build:firefox`、`npm run build:server`、`npm test`、`npm run lint`、`npm run format:check` 通过。
- 扩展构建与双平台：
  - Chrome/Edge：`npm run build` 生成 `.output/chrome-mv3`；`manifest.json` 含 `chrome_url_overrides.newtab`、loopback `host_permissions`、`notifications` 与固定 `key`。
  - Firefox：`npm run build:firefox` 生成 `.output/firefox-mv2`；`manifest.json` 含 `chrome_url_overrides.newtab`、`notifications`、`browser_specific_settings.gecko.id`，loopback 主机权限位于 `permissions`。
  - 两平台产物均不含 popup/content/background。
  - Chrome/Edge 与 Firefox 分别加载未打包扩展后，打开新标签页即显示航启；子页面刷新后保持当前页面。
- 中继检查：
  - 非白名单方法返回 405；未列 `/api` 路径返回 JSON 404；非 `/api` 路径返回文本 404；未登录业务接口 401 `AUTH_REQUIRED`；Host 非本机拒绝；日志无凭据。
  - `POST` + `Origin: chrome-extension://<固定 ID>` 通过；`Origin: chrome-extension://<其他 ID>` 返回 403；`Origin: moz-extension://<任意内部 UUID>` 通过（Firefox 已知限制）；`Origin: https://evil.example` 返回 403；同源 loopback 来源通过。
  - 登录单飞、验证码刷新、密码错误/验证码错误/密码过期分类、四源异步派生与单源重试。
  - 凭据文件损坏/密钥缺失不白屏；目录不可写时本次运行仍可用；退出登录后凭据文件不存在。
  - 背景接口路径穿越被拒绝；超过 20 MB 的图片跳过；非本机 Host 拒绝。
- 托盘验收：
  - 正常启动显示运行中，`/api/health` 返回 200；菜单“退出”与 Ctrl+C 后进程结束。
  - 端口被占用时显示启动失败原因，进程保持到用户从托盘退出，退出码为 1。
  - `TRAY=0` 不创建托盘但 API 正常；托盘二进制缺失时降级为无托盘，API 仍可用。
- 可执行文件验收：
  - Windows x64 上 `npm run build:server` 生成 `dist/server/abuu-start-relay.exe`，默认冒烟测试通过。
  - 资源管理器/`ExtractAssociatedIcon` 显示航启图标；`VersionInfo` 显示 `FileDescription=航启本地中继`、`ProductName=航启`、版本与 `package.json` 一致。
  - `Get-AuthenticodeSignature` 能读取签名证书，证书指纹与 `private/code-signing/abuu-start-dev.cer` 一致；未信任自签名时状态为 `NotTrusted`/`UnknownError`，证书仍存在。
  - 默认构建的签名带 RFC3161 时间戳，`TimeStamperCertificate` 非空；`--no-timestamp` 构建后 `TimeStamperCertificate` 为空；时间戳服务不可达时构建失败。
  - 删除 `server/tray/assets/app.ico` 后构建自动重新生成；删除 `private/code-signing/*` 后构建自动生成新证书并签名。
  - `npm run build:server -- --no-sign` 构建后签名为 `NotSigned`，exe 仍可启动；`npm run build:server -- --icon <path>` 可替换图标，缺失路径时构建失败并提示。
  - 在未安装 Node、无 `node_modules` 的目录只放 exe，启动后 `/api/health` 返回 200；登录、四源派生、背景设置与 `npm start` 一致。
  - 首次启用托盘时释放资产到 `%LOCALAPPDATA%\abuu-start\runtime\tray-hook\<runtimeId>\`；再次启动复用；删除该目录后可重新释放。
  - 托盘、`TRAY=0`、端口占用、SIGINT/SIGTERM 与源码运行一致；释放失败时 API 仍可用。
  - 非 Windows x64 或 Node <22.12 构建得到明确失败提示。
- 认证验收：
  - 无验证码与有验证码登录均可完成；验证码可刷新；错误提示可区分。
  - 登录成功显示姓名、学号、登录时间；四源状态可轮询；失败项可单独重试。
  - 重启中继/浏览器后已保存会话免登录；会话失效自动重登一次；失败显示“已失效”并保留缓存。
  - 登录状态校验失败（中继不可达/超时）不拦截取数，不误显示“未登录”。
- 主页验收：
  - 时钟、搜索、背景、快捷方式增删改与拖拽；快捷方式可放任意行，刷新后保留。
  - 五张卡片开关独立、持久化、关闭期间无请求、重新开启后缓存优先、全部关闭只剩快捷方式。
  - 仅时钟与背景模式可进可退，刷新保持，隐藏期间无功能区请求；子页面不受影响。
  - 背景保存/清除/重新扫描、第一层扫描、格式过滤、随机展示、失败回退、单张换图、加载期间不露内置图、背景不随滚动位移。
- 教务验收：
  - 课表今日/明日、周切换、首末周禁用、无周次提示、课程高亮与提前边界、下一节课摘要。
  - 考试主页最近 3 场、`/exams` 分组与倒计时、已结束置底、失败保留缓存；`/schedule` 无考试标记。
  - 博雅已选课程进入主页与周视图、来源标记、合并排序、冲突显示；广场分页、边界禁用、详情 modal、状态标签、简介纯文本；主页随机 3 门与“换一批”。
  - SPOC 列表过滤与排序、无截止时间标注、详情 modal、无效 id、失败保留缓存。
  - 阳光学期/周次数、目标、进度、封顶、设置持久化。
  - 本地待办增删改与重复顺延；番茄钟自动流转、阶段显示、轮次、暂停/继续/重置、通知权限与测试、1 分钟通知、结束通知、点击聚焦。
- 缓存与错误：
  - 各源独立缓存与状态；失败保留缓存并标注时间；无缓存显示错误与重试；空数据与失败文案分开。
  - 刷新与关闭页面后番茄钟运行态重置，不残留；localStorage 不可用或损坏时降级为内存并提示。
- 文档状态：PRD、UI 文档、API 文档与本文为当前四份文档；后续变更需同时更新相关文档。

## 12. 风险与已知限制

以下仅保留 RC 已知限制与发布前待办；PRD 所述功能已在开发版实机验收通过。

- Windows 文件 ACL 依赖 `%LOCALAPPDATA%` 的用户隔离；RC 接受该现状，如需更强保证，后续再评估 `icacls` 或 DPAPI。
- 异步派生顺序执行，最坏情况约 48 秒（4 × 12 秒）；设置页显示“派生中”，RC 接受该等待时间。
- 验证码只处理图片类型；上游改成滑块、点选或第三方验证码时不在本期范围。
- Firefox MV2 构建仍提示缺少 `data_collection_permissions`；扩展 ID 已通过 `browser_specific_settings.gecko.id` 固定。RC 仅以本机临时扩展验收，不发布 AMO，数据收集声明留待后续发布。
- WXT 开发服务器固定 4000 且启用 `strictPort`；端口被占用时需先释放或修改 `wxt.config.ts`。
- 托盘依赖 `tray-hook` 的平台二进制与桌面环境；缺失或无桌面时降级为无托盘，API 不受影响。
- 可执行文件使用 Node SEA（Stability 1.1）；产物约 90–100 MB，升级 Node 后需重新构建。
- exe 默认使用本地自签名证书，未安装到受信任根时 Windows 仍可能显示未知发布者，SmartScreen 也可能继续警告；正式发布需替换为受信任 CA 证书。不提供安装包与自动更新。
- 自签名私钥、密码与 CER 位于 `private/code-signing/`，不提交；证书默认 5 年有效，过期或更换后需重新构建。替换证书可通过 `ABUU_SIGN_PFX` 等环境变量完成。
- exe 仅支持 Windows x64，且必须在目标平台构建；不提供交叉编译。双击 exe 会保留控制台窗口；图标由 `server/tray/assets/app.ico` 提供，版本信息由 `package.json` 提供。
- 签名依赖 `@electron/windows-sign` 随包的 `signtool.exe`；若该依赖被裁剪或替换，需提供可用的 `ABUU_SIGNTOOL` 或 `--no-sign`。
- 时间戳默认依赖 DigiCert TSA；网络不可达、TSA 拒绝或限流时构建失败，可用 `--no-timestamp` 或更换 `ABUU_SIGN_TIMESTAMP_URL`。时间戳不会让自签名证书变为受信任发布者，只用于证明签名时间并在证书过期后辅助验证。
- `postject` 注入后必须先由 `resedit` 重写 PE，再签名；该顺序用于同时保留 SEA blob、写入图标/版本信息并让 signtool 接受文件。
- 托盘原生二进制与 `tray-hook` 客户端随 exe 释放到用户目录；目录不可写、被杀毒软件锁定或文件被占用时托盘降级，API 不受影响；旧 `runtimeId` 目录不自动清理。
- `tray-hook` 以 MIT 许可随 exe 分发，许可文本保存在 `server/tray/tray-hook.LICENSE`。
- Firefox 的 `moz-extension://` 内部 UUID 每次安装随机，与 gecko ID 无映射；中继无法按 Origin 为 Firefox 做固定扩展 ID 白名单，RC 仍放行任意 `moz-extension://` 来源。Chrome/Edge 已使用固定 `key` 与扩展 ID 白名单。
- 同一浏览器只能有一个扩展接管新标签页；与其他 newtab 扩展同时启用时，以最后启用者为准。
