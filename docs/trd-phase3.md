# 航启主页 / BUAA-Start 三阶段 TRD

## 1. 技术路线与已确认决策

- 前端继续使用 Vue 3 Composition API + `<script setup lang="ts">`、TypeScript strict、Vite、Tailwind CSS、Vue Router 4；不引入 Pinia、React、SSR。
- 后端仍是随 Vite 启停的本地中继：Node 22 LTS TypeScript 模块，挂到 dev 与 preview，只监听 `127.0.0.1`。不新增第二个后端进程。
- 三阶段把认证从“浏览器保存四类凭据、随请求头发送”改为“设置页一次登录、中继保存并注入”：
  - 中继完成 SSO 登录、UC 激活，并派生 byxt Cookie、SPOC Token + RoleCode、博雅 `auth_token`、阳光 `uid` + `token`。
  - 前端不再保存、不再发送任何凭据请求头。
  - 业务数据接口仍只读 `GET`；新增的写方法仅限登录、登出、验证码、会话状态与本机背景目录设置。
- 凭据用 **AES-256-GCM** 加密保存，密钥单独存放，使用 Node 内置 `node:crypto`，不引入第三方加密库。
- 登录成功后，四类数据源在后台**异步派生**；前端轮询 `GET /api/auth/status` 显示“派生中 / 已派生 / 失败 / 已失效”，单源失败不阻塞整体。
- 本机背景目录由**中继保存**，前端只提交目录路径；取图接口只接受该目录内的文件名。
- 主页卡片开关后**固定 11 行**，关闭卡片只让同列后续卡片上移并重算右列横向对齐，快捷方式可用行数与行号不变；规则见 `docs/ui-lowfi.md` 主页与本文 7.4。
- 保留一阶段本地待办、快捷入口、番茄钟；保留二阶段 SPOC、博雅、阳光与番茄钟自动流转。

### 1.1 已确认口径

- 保存学号与密码，用加密文件保存，用于 SSO 会话失效后的自动重登；密码不写 localStorage、不返回前端、不写日志。
- 凭据加密选 **AES-256-GCM + 独立密钥文件**；不使用 Windows DPAPI、keychain 或原生依赖。
- 登录成功即整体成功；四源异步派生，设置页轮询状态，失败项可单独重试。
- 背景目录路径由中继保存在本机配置文件中；`GET /api/background/image` 只接受当前目录内的第一层图片文件名。
- 遇到“密码过期 / 账号存在安全风险”页时**中止登录并提示用户处理**，不自动提交 `ignoreAndContinue`。
- 卡片关闭后功能区固定 11 行；`docs/prd-phase3.md` 4.3 的“可用行数随布局变化”已按本口径同步，`docs/ui-lowfi.md` 与 PRD 一致。

### 1.2 本期不做

- WebVPN、校外加密接入、连接模式选择。
- 注册、找回密码、修改密码；验证码识别、自动填写、第三方打码。
- 多用户、账号切换、云端同步。
- 快捷入口自定义图标/分组、卡片顺序拖拽。
- 背景轮播、定时切换、模糊度等外观自定义；背景图片不复制进仓库。
- 任何教务业务写操作：提交、打卡、选退课、签到、附件下载。
- 研究生 GSMIS、管理后台、成绩管理、教室预约。
- 移动端布局、SSR、Pinia、React。

## 2. 目录结构

在现有结构上新增：

```text
server/
  authCas.ts          SSO 登录页解析、表单构建、跳转与错误分类
  authCrypto.ts       AES-256-GCM、密钥生成、原子写
  authStore.ts        凭据文件读写、损坏处理、退出清理
  authSession.ts      内存会话、Cookie 罐、自动重登、单飞
  authDerive.ts       byxt / SPOC / 博雅 / 阳光派生
  authTypes.ts        认证与派生类型
  background.ts       背景目录扫描、文件名校验、图片读取
  settingsStore.ts    背景目录配置文件
  routes.ts           新增 /api/auth/*、/api/background/*
  relayPlugin.ts      POST body、Origin/Content-Type 校验、二进制响应
  errors.ts           新增认证与背景错误码
  types.ts            新增中继类型

src/
  api/auth.ts         /api/auth/*
  api/background.ts   /api/background/*
  api/client.ts       去掉凭据请求头，增加 POST 与二进制地址
  composables/useAuth.ts
  composables/useBackground.ts
  composables/useHomeCards.ts      五张卡片的开关与持久化
  composables/useHomeDisplay.ts
  components/LoginSection.vue
  components/SourceStateList.vue
  views/SettingsView.vue
  views/HomeView.vue
  utils/homeLayout.ts              卡片开关后的功能区重排
  App.vue             自定义背景层
  types.ts            认证、背景、显示状态类型
```

`views/` 不直接 `fetch`；`components/` 不读写 localStorage；`composables/` 负责模块级状态与流程；`server/` 不引用前端代码。

## 3. 中继 API

### 3.1 通用约定

- 监听与 Host 校验不变：只接受 `127.0.0.1`、`localhost`、`[::1]`；非本机请求返回 `404 NOT_FOUND`。
- 方法：
  - 业务数据仍只接受 `GET`。
  - 仅以下路径接受 `POST`：
    - `/api/auth/preload`
    - `/api/auth/login`
    - `/api/auth/logout`
    - `/api/auth/sources/:source/retry`
    - `/api/background/directory`
    - `/api/background/rescan`
  - 其他路径的 `POST` 返回 `405 METHOD_NOT_ALLOWED`。
- 路由表按 `method + path` 匹配；`/api/spoc/assignments/:id` 与 `/api/bykc/courses/:id` 继续按前缀匹配，方法仍为 `GET`。
- `POST` 请求体：
  - 有请求体时，`Content-Type` 必须是 `application/json`（可带 `charset=utf-8`）；其他类型返回 `415 UNSUPPORTED_MEDIA`。
  - 无请求体的接口（重试、登出、重新扫描）允许空 body。
  - 最大 16 KB；超过返回 `413 PAYLOAD_TOO_LARGE`。
  - 有 body 时必须是 JSON 对象；解析失败返回 `400 INVALID_REQUEST`。
- 跨站防护：
  - 中继不返回 CORS 头。
  - `POST` 要求 `Origin` 为当前页面源（`http://127.0.0.1:<port>` 或 `http://localhost:<port>`）；缺失或不匹配返回 `403 FORBIDDEN_ORIGIN`。
  - 拒绝 `Sec-Fetch-Site: cross-site`。
- 响应：
  - JSON 接口：`Content-Type: application/json; charset=utf-8`，`Cache-Control: no-store`。
  - 图片接口：按扩展名返回 `image/*`，`Cache-Control: no-store`，`X-Content-Type-Options: nosniff`。
- 错误响应沿用一阶段结构：

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "学号或密码错误"
  }
}
```

- 新增错误码：

| code | HTTP | 含义 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 尚未登录 |
| `INVALID_CREDENTIALS` | 401 | 学号或密码错误 |
| `CAPTCHA_REQUIRED` | 401 | 需要验证码；前端重新预加载 |
| `CAPTCHA_INVALID` | 401 | 验证码错误或过期 |
| `PASSWORD_EXPIRED` | 403 | 密码过期或账号存在安全风险，需用户处理 |
| `AUTH_EXPIRED` | 401 | 会话失效且自动重登失败 |
| `LOGIN_IN_PROGRESS` | 409 | 已有登录请求在处理 |
| `SOURCE_UNKNOWN` | 400 | 数据源不是 byxt/spoc/bykc/ygdk |
| `SOURCE_BUSY` | 409 | 该数据源正在派生 |
| `SOURCE_DERIVATION_FAILED` | — | 单源派生失败；作为 `sources[].error.code` 返回，不单独作为 HTTP 状态 |
| `FORBIDDEN_ORIGIN` | 403 | POST 来源不合法 |
| `UNSUPPORTED_MEDIA` | 415 | POST 不是 JSON |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过 16 KB |
| `INVALID_PATH` | 400 | 背景路径不是本机绝对路径、是 UNC/设备路径，或文件名含路径分隔符/`..` |
| `PATH_UNAVAILABLE` | 422 | 背景目录不存在、不是目录或无权限 |

- 原有错误码保留：`NO_CREDENTIAL`、`AUTH_EXPIRED`、`INVALID_REQUEST`、`INVALID_WEEK`、`INVALID_PAGE`、`NOT_FOUND`、`METHOD_NOT_ALLOWED`、`UPSTREAM_TIMEOUT`、`UPSTREAM_ERROR`、`BAD_RESPONSE`、`INTERNAL`。
- `UPSTREAM_ERROR`、`UPSTREAM_TIMEOUT`、`BAD_RESPONSE` 表示网络或上游不可用/异常，**不表示登录失效**；只有 `AUTH_EXPIRED` 需要重新登录。上游 408/429/5xx、连接失败、DNS 失败与超时均归入此类。
- 日志只记录 `method`、`path`、`status`、`durationMs`；不记录请求头、请求体、密码、验证码、Cookie、Token、`ak/sk/ts`、响应体。

### 3.2 认证接口

#### `POST /api/auth/preload`

获取登录页状态、验证码与一次登录尝试的 `loginId`。

请求：

```json
{}
```

响应 200：

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

- `loginId` 是随机不可猜测字符串，只在本次登录尝试内有效，默认 10 分钟。
- 中继在内存中保存该次尝试的 Cookie 罐、`execution`、`captchaId`、创建时间；上限 5 个，超出淘汰最旧。
- `captchaRequired:false` 时不返回 `captcha`。
- SSO 已有会话时返回：

```json
{
  "loginId": "01J8Z0...",
  "captchaRequired": false,
  "alreadyLoggedIn": true
}
```

- 此时前端可只提交 `loginId`，由中继用现有 SSO 会话完成 UC 激活；由于没有本次输入的密码，不会更新密码；若此前也没有持久化密码，则 `persisted:false`，自动重登不可用。
- 上游失败：`502 UPSTREAM_ERROR`；超时：`504 UPSTREAM_TIMEOUT`。

#### `POST /api/auth/login`

请求：

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
  4. 激活 UC，`GET https://uc.buaa.edu.cn/api/uc/status` 校验。
  5. 成功后建立内存会话，异步启动四源派生。
  6. 尽力加密落盘；失败不阻塞本次运行。
- 成功响应 200：

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
- 账号或密码错误：`401 INVALID_CREDENTIALS`，文案“学号或密码错误”。
- 验证码错误或过期：`401 CAPTCHA_INVALID`，文案“验证码错误或已过期，请刷新后重试”；前端重新预加载。
- 密码过期/安全风险：`403 PASSWORD_EXPIRED`，文案“密码已过期或账号存在安全风险，请先在浏览器完成处理”。
- 需要验证码但未提供：`401 CAPTCHA_REQUIRED`；前端重新预加载。
- 上游 5xx/HTML：`502 UPSTREAM_ERROR`；超时：`504 UPSTREAM_TIMEOUT`。
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

- 未登录：

```json
{
  "authenticated": false,
  "user": null,
  "authenticatedAt": null,
  "persisted": false,
  "deriving": false,
  "sources": {
    "byxt": { "status": "unconfigured", "updatedAt": null, "error": null },
    "spoc": { "status": "unconfigured", "updatedAt": null, "error": null },
    "bykc": { "status": "unconfigured", "updatedAt": null, "error": null },
    "ygdk": { "status": "unconfigured", "updatedAt": null, "error": null }
  }
}
```

- `status` 取值：`unconfigured`、`pending`、`ready`、`failed`、`expired`。
- `deriving` 为任一源 `pending`。
- `?validate=1`：若已登录，额外调用一次 UC status 校验会话；设置页首次加载使用，轮询不带该参数。
- `?validate=1` 的失败分两类处理：
  - 认证失败（UC 返回未登录、非 JSON 或非 2xx）：先尝试一次自动重登；仍失败则保留 `authenticated:true` 与 `authenticatedAt`，把四个源标记为 `expired`，并附 `warning:"登录状态已失效，请重新登录"`，避免把缓存误显示为“无数据”。
  - 网络或上游不可用（请求抛 `UPSTREAM_ERROR`/`UPSTREAM_TIMEOUT`，或 UC 返回 408/429/5xx）：**不重登、不改四源状态**，保留 `authenticated:true` 与原状态，附 `warning:"无法连接统一认证，登录状态未校验"`。
- 凭据文件损坏/密钥缺失：返回未登录，并带 `warning:"登录状态无法读取，请重新登录"`；不白屏。

#### `POST /api/auth/sources/:source/retry`

- `source` 只能是 `byxt`、`spoc`、`bykc`、`ygdk`；否则 `400 SOURCE_UNKNOWN`。
- 未登录：`401 AUTH_REQUIRED`。
- 该源已在派生：`409 SOURCE_BUSY`。
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
    { "name": "a.jpg", "size": 123456, "modifiedAt": "2026-10-20T21:00:00+08:00" },
    { "name": "b.png", "size": 654321, "modifiedAt": "2026-10-21T09:30:00+08:00" }
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
- 校验：
  - 非空，长度 ≤ 255。
  - 不含 `/`、`\`、`:`、NUL、`..`。
  - `path.basename(name) === name`。
  - 解析后的绝对路径必须以当前目录 + 分隔符开头。
  - 必须是当前清单中的第一层普通文件，扩展名在白名单内。
- 成功：返回图片字节，`Content-Type` 按扩展名，`Content-Length`，`Cache-Control: no-store`。
- 失败：
  - 非法名：`400 INVALID_PATH`。
  - 不在清单/文件已删除：`404 NOT_FOUND`。
  - 扩展名不支持：`415 UNSUPPORTED_MEDIA`。
  - 读取失败：`500 INTERNAL`。
- 前端单张失败时换下一张；连续失败 3 张或全部失败才回退内置背景。

#### `POST /api/background/directory`

请求：

```json
{ "path": "D:\\Pictures\\wallpapers" }
```

- `path` 必须是本机绝对路径，长度 ≤ 1024。
- 拒绝 UNC 路径（`\\server\share`）与设备路径（`\\?\`），只接受本地盘符/根路径。
- 中继校验：存在、是目录、可读；用 `fs.realpath` 规范化后保存。
- 保存成功后立即扫描第一层并返回与 `GET /api/background` 相同的结构。
- `path` 为空字符串或 `null`：清除已保存目录，返回 `{ configured:false, directory:null, images:[], warning:null }`。
- 目录不存在/不是目录/无权限：`422 PATH_UNAVAILABLE`，不覆盖旧设置。
- 不是绝对路径：`400 INVALID_PATH`。
- 配置文件写入失败：`500 INTERNAL`。

#### `POST /api/background/rescan`

- 无请求体；重新扫描已保存目录并返回清单。
- 未配置目录：返回 `configured:false`。
- 目录不可用：返回 200 + `warning`，不清除路径。

### 3.4 背景扫描规则

- 只扫描所选目录第一层；子目录、符号链接、其他文件忽略。
- 扩展名白名单：`jpg`、`jpeg`、`png`、`webp`、`gif`、`bmp`、`avif`。
- 文件大小 1 字节至 20 MB；超过 20 MB 跳过。
- 用文件头 magic bytes 判断格式，至少识别：
  - JPEG：`FF D8 FF`
  - PNG：`89 50 4E 47 0D 0A 1A 0A`
  - GIF：`GIF87a` / `GIF89a`
  - WebP：`RIFF....WEBP`
  - BMP：`BM`
  - AVIF：`ftyp` 且 brand 含 `avif`/`avis`
- 文件头与扩展名不符、无法读取、损坏的图片跳过，不阻塞其他图片。
- 图片内容不复制进仓库、不写入 localStorage、不写入凭据文件。
- `settings.json`：

```json
{
  "version": 1,
  "backgroundDirectory": "D:\\Pictures\\wallpapers"
}
```

- 位于 `%LOCALAPPDATA%\buaa-start\settings.json`，明文保存路径；路径不是凭据。
- 原子写；损坏时忽略并视为未配置，不阻塞应用。

### 3.5 既有业务接口变化

- 所有 `src/api/byxt.ts`、`spoc.ts`、`bykc.ts`、`ygdk.ts` 不再发送 `X-Byxt-Cookie`、`X-Spoc-Token`、`X-Spoc-Role`、`X-Bykc-Token`、`X-Ygdk-Uid`、`X-Ygdk-Token`。
- 中继从内存会话注入：
  - byxt：按 `byxt.buaa.edu.cn` 匹配的 Cookie。
  - SPOC：`Token: Inco-<token>`、`RoleCode`。
  - 博雅：`auth_token`、`authtoken`。
  - 阳光：表单 `uid`、`token`。
- 未登录：`401 AUTH_REQUIRED`。
- 上游认证失效（3xx/401/403、HTML 登录页、业务码表明未登录）：
  1. 尝试自动重登一次，重登前不预先标记 `expired`。
  2. 重登成功则重新派生该源并重试原请求一次；仍失败返回 `401 AUTH_EXPIRED` 并标记该源 `expired`。
  3. 重登因网络/上游 5xx 失败时返回 `502 UPSTREAM_ERROR` 或 `504 UPSTREAM_TIMEOUT`，不改数据源状态、不要求重新登录。
  4. 上游 408/429/5xx 不视为认证失效，直接返回 `UPSTREAM_ERROR`。
- 业务接口路径、参数、响应结构保持二阶段不变；只改变凭据来源。
- 上游请求优先用 Node 内置 `fetch` + `redirect: 'manual'` + `headers.getSetCookie()`；若 `fetch` 对 `Cookie` 头有限制，则用 `node:https` 实现手动跳转与 Cookie 罐，不引入第三方 HTTP 库。
- `/api/byxt/status`、`/api/spoc/status`、`/api/bykc/status`、`/api/ygdk/overview` 保留，用于设置页与卡片校验。

## 4. 凭据存储与加密

### 4.1 位置

- 目录：`%LOCALAPPDATA%\buaa-start\`。
- 文件：
  - `credentials.enc`：密文凭据。
  - `credentials.key`：32 字节随机密钥，单独存放。
  - `settings.json`：背景目录等非敏感设置。
- 目录创建为 `0o700`；文件写入后 `chmod 0o600`。
- Windows 上 `%LOCALAPPDATA%` 本身按用户隔离，继承当前用户 ACL；不额外调用 `icacls`，不引入原生依赖。
- 非 Windows 开发环境回退到 `~/.local/state/buaa-start/`。

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

- `iv`：12 字节随机数。
- `tag`：16 字节 GCM 认证标签。
- `data`：密文。
- AAD：`buaa-start/credentials/v1`。
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
- 解密失败、GCM 校验失败、JSON 解析失败、版本不支持：
  - 不把密文当明文使用。
  - 将 `credentials.enc` 重命名为 `credentials.enc.corrupt-<timestamp>`，保留现场。
  - 清空内存会话，返回未登录与提示；不白屏。
- 凭据目录不可写：保留内存会话，`persisted:false`，设置页提示“无法保存登录状态，本次运行内仍可使用”。
- 退出登录：
  - 先尽力 SSO logout，再清内存，最后删 `credentials.enc`、`credentials.key`。
  - 删除失败只记录日志，不把密码或路径写进错误响应。
- 业务数据缓存与凭据分离；清除缓存不影响登录状态。

### 4.5 旧凭据迁移

- 三阶段启动时删除旧键 `buaa-start.credentials.v1`，不尝试迁移明文。
- 旧 `X-*` 凭据请求头不再被中继读取；前端也不再发送。
- 升级后首次使用必须重新登录一次。
- 旧缓存保留，登录后按缓存优先刷新。

## 5. 类型

### 5.1 中继

```ts
type SourceId = 'byxt' | 'spoc' | 'bykc' | 'ygdk'
type SourceStatus = 'unconfigured' | 'pending' | 'ready' | 'failed' | 'expired'

type SourceError = {
  code: string
  message: string
}

type SourceState = {
  status: SourceStatus
  updatedAt: string | null
  error: SourceError | null
}

type AuthUser = {
  name: string
  schoolid: string
}

type StoredCookie = {
  name: string
  value: string
  domain: string
  path: string
  expiresAt: number | null
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
}

type AuthSession = {
  username: string
  password: string | null
  user: AuthUser
  authenticatedAt: string
  cookies: StoredCookie[]
  spoc: { token: string; roleCode: string } | null
  bykc: { token: string } | null
  ygdk: { uid: number; token: string } | null
  sources: Record<SourceId, SourceState>
}

type LoginAttempt = {
  id: string
  cookieJar: CookieJar
  execution: string | null
  captchaId: string | null
  createdAt: number
}

type BackgroundImage = {
  name: string
  size: number
  modifiedAt: string
}

type BackgroundManifest = {
  directory: string | null
  configured: boolean
  images: BackgroundImage[]
  warning: string | null
}
```

### 5.2 前端

```ts
type AuthState = {
  authenticated: boolean
  user: AuthUser | null
  authenticatedAt: string | null
  persisted: boolean
  deriving: boolean
  loading: boolean
  error: string
  warning: string
  sources: Record<SourceId, SourceState>
}

type HomeCardId = 'schedule' | 'bykc' | 'todo' | 'focus' | 'ygdk'

type HomeCardVisibility = Record<HomeCardId, boolean>

type HomeCardPlacement = {
  id: HomeCardId
  row: number // 0 起
  rows: number
  xRem: number
  widthRem: number
}

type HomeDisplayState = {
  showFunctionArea: boolean
  showActionButtons: boolean
  minimalMode: boolean
}
```

- `SourceId`、`SourceStatus`、`SourceState` 与中继保持同名字段，避免转换层。

## 6. 认证流程

### 6.1 预加载

1. 设置页点击“登录”或首次进入时调用 `POST /api/auth/preload`。
2. 中继为该次尝试创建独立 Cookie 罐；若已有持久化会话，则复制其未过期 Cookie 作为初始值，用于识别“SSO 已登录”。
3. `GET https://sso.buaa.edu.cn/login`；若返回 302，标记 `alreadyLoggedIn:true`。
4. 解析 `execution` 与 `config.captcha`。
5. 需要验证码时，用同一 Cookie 罐 `GET /captcha?captchaId=`，返回 JPEG 的 data URL。
6. 返回 `loginId`；前端只在内存保存，不写 localStorage。
7. 用户点击“刷新验证码”时重新预加载，旧 `loginId` 作废。

### 6.2 登录

1. 前端提交 `loginId`、学号、密码、验证码。
2. 中继校验 `loginId`，锁定单飞。
3. 构建表单：
   - 复制登录页 `form#fm1` 的 hidden 字段。
   - 覆盖 `username`、`password`、`execution`、`_eventId=submit`、`submit=登录`、`type=username_password`。
   - 有验证码时补 `captcha`、`captchaResponse`。
4. `POST https://sso.buaa.edu.cn/login`，手动跟随跳转。
5. 错误判定：
   - 页面含“验证码”错误 → `CAPTCHA_INVALID`。
   - 页面含账号/密码错误，或提交后又回到含 `execution` 的登录页 → `INVALID_CREDENTIALS`。
   - 页面含 `continueForm`、`ignoreAndContinue`、`账号存在安全风险`、`密码过期` → `PASSWORD_EXPIRED`，不自动跳过。
   - URL 含 `exception.message=` → 取参数作为提示，映射为 `UPSTREAM_ERROR`。
   - 其他 HTML/非 JSON → `UPSTREAM_ERROR`。
6. 成功后 `GET https://uc.buaa.edu.cn/api/login?target=...`，跟随跳转。
7. `GET https://uc.buaa.edu.cn/api/uc/status`，`code === 0` 且 `data` 非空才算成功。
8. 建立会话：
   - 保存 Cookie、用户、登录时间、密码、四个源 `pending`。
   - 尽力加密落盘。
   - 返回 200，并异步启动派生。
9. 删除本次登录尝试；失败也删除，前端重新预加载。

### 6.3 异步派生

- 顺序执行 `byxt → spoc → bykc → ygdk`，避免共享 Cookie 罐并发写 `Set-Cookie`。
- 每个源单独超时 12 秒；失败只更新该源，不抛出到整体。
- 每完成一个源：
  - 更新 `sources[source]` 为 `ready` 或 `failed`，写 `updatedAt` 与 `error`。
  - 串行写一次凭据文件；写失败不改变内存状态。
- 全部结束后 `deriving=false`。
- 派生使用统一认证后的共享 Cookie 罐：
  - byxt：`currentUser.do` 跟随跳转，最终 JSON `code === "0"`。
  - SPOC：`/spocnewht/cas` 跳转取 token，`casLogin` 取 RoleCode，`queryKclb` 校验。
  - 博雅：`/sscv/cas/login` 跳转取 `token`，`getUserProfile` 校验。
  - 阳光：oauth 跳转取 `code`，`campusAppLogin` 取 `uid`/`token`，`Classify/getList` + `Clockin/getCount` 校验。
- 派生期间用户退出登录：用会话代际号丢弃迟到结果，不写回已清除的会话。

### 6.4 自动重登

- 触发条件：业务请求收到上游 401、SPOC `-98`、博雅会话失效、byxt 登录页 HTML、阳光 `code === -98`。
- 同一时间只允许一次自动重登。
- 流程：
  1. 有会话且有保存的密码，否则直接 `AUTH_EXPIRED`。
  2. 冷却：认证类失败（账号被拒、验证码、无密码）5 分钟内不重复；网络或上游 5xx 的瞬时失败 30 秒内不重复。
  3. 新建 Cookie 罐，不重用已失效 Cookie。
  4. `GET sso/login`；若要求验证码，标记 `needsManualLogin`，返回失败。
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
3. 前端清 `useAuth`、`useBackground` 的会话状态与本次登录尝试。
4. 前端清所有业务数据缓存（`buaa-start.cache.*`），但保留待办、快捷方式、番茄钟、背景目录与显示开关。
5. 设置页回到未登录；主页各卡片显示“未登录，前往设置”引导，不显示成“无数据”。

## 7. 前端

### 7.1 `useAuth`

模块级单例，暴露：

```ts
{
  state: AuthState,
  hydrate(): Promise<void>,
  refreshStatus(validate?: boolean): Promise<void>,
  preload(): Promise<{ loginId: string; captchaImage: string | null }>,
  login(input: { username: string; password: string; captcha?: string }): Promise<boolean>,
  retrySource(source: SourceId): Promise<void>,
  logout(): Promise<void>,
}
```

- `hydrate()` 只在首次调用时请求 `GET /api/auth/status?validate=1`。
- `preload()` 把 `loginId` 保存在模块级内存；验证码图片由设置页展示。
- `login()`：
  - 复用当前 `loginId`；没有时才调用 `preload()`。
  - 密码只保存在函数局部变量与请求体，不写 localStorage。
  - 成功后清空密码、验证码与 `loginId`；验证码错误时保留学号与密码，调用 `preload()` 刷新验证码后可直接重试。
  - 账号密码错误时清空密码，保留学号。
- 轮询：
  - 设置页挂载时若 `state.deriving`，每 1.5 秒调用 `refreshStatus()`，直到 `deriving=false` 或 60 秒。
  - 轮询不带 `validate=1`，避免频繁请求 UC。
- `logout()` 成功后清 `loginId`、密码、验证码与四源状态。

### 7.2 设置页

移除四个手动凭据区与“清除全部凭据”，新增：

- 统一登录区：
  - 未登录：学号、密码、验证码（按需）、登录、刷新验证码。
  - 已登录：姓名、学号、登录时间、退出登录。
  - 四源状态：byxt、SPOC、博雅、阳光；状态为“已派生 / 派生中 / 派生失败 / 已失效”，失败项提供“重试”。
  - 登录中禁用按钮；错误按 `INVALID_CREDENTIALS`、`CAPTCHA_INVALID`、`PASSWORD_EXPIRED`、`UPSTREAM_ERROR` 分类显示。
- 背景区：绝对路径输入框、保存、清除、重新扫描；显示当前目录、图片数量与 `warning`。
- 主页显示区：显示功能区、显示功能按钮两个开关。
- 主页卡片区：五个开关（日程、博雅课程广场、待办、专注、阳光打卡），默认全开，切换立即生效并持久化；位于「日程高亮」之后。
- 连接状态、清除缓存保留；清除缓存不影响登录。

具体视觉布局以 `docs/ui-lowfi.md` 为准；主页卡片区已补入，统一登录区、背景区、主页显示开关与“仅时钟”按钮待补。本文只定义字段与行为。

### 7.3 凭据相关代码移除

- 删除 `useCredentials` 与设置页四个凭据表单。
- 删除 `types.ts` 中的 `Credentials` 与 `storage.ts` 的凭据读写；保留启动时删除旧键。
- 删除各 `api/*` 的凭据请求头参数。
- `markByxtAuthExpired`、`markSpocAuthExpired`、`markBykcAuthExpired`、`markYgdkAuthExpired` 改为更新 `useAuth.state.sources`。
- `api/client.ts` 增加 `postJson` 与错误体解析；不增加凭据参数。

### 7.4 主页卡片与显示状态

主页卡片开关已实施，代码位置：`src/utils/homeLayout.ts`（重排算法）、`src/composables/useHomeCards.ts`（开关状态）、`src/views/HomeView.vue`（渲染与取数门控）、`src/views/SettingsView.vue`（开关区）。主页显示状态由 `src/composables/useHomeDisplay.ts` 实现（键 `buaa-start.home.display.v1`），其中仅时钟与背景模式已接入主页；`showFunctionArea`、`showActionButtons` 的渲染与取数门控已就绪，设置页开关 UI 待 `docs/ui-lowfi.md` 补齐。

#### 卡片开关

- `useHomeCards` 为模块级 reactive 单例，五个开关默认开启，localStorage 键 `buaa-start.home.cards.v1`。
- 存储值形如 `{ "schedule": true, "bykc": false, "todo": true, "focus": true, "ygdk": true }`；缺失、不是对象或字段不严格等于 `false` 时一律按开启处理。
- 设置页「日程高亮」之后新增「主页卡片」区：五个开关，切换立即写 localStorage 并生效，无保存按钮；写入失败提示“已保存到本次会话，但本地存储不可用”。
- 五张卡片全部关闭时功能区只渲染快捷方式，仍为 11 行，不报错。

#### 重排规则

`computeHomeLayout(visibility)` 只依赖开关状态，返回每张卡的位置、每行大卡右缘、每行快捷方式起点与画布宽度：

- 卡片顺序固定：日程 → 博雅课程广场 → 待办 → 专注 → 阳光打卡；左列只放日程、待办，右列只放博雅、专注、阳光。
- 每列自第 1 行起连续堆叠；关闭的卡片不占位，同列后续卡片整体上移，卡片之间不留空行。
- 功能区行数恒为 11，行高 3rem、行距 0.75rem，画布高度 40.5rem。
- 右列卡片横坐标 = 起始行不晚于它的最后一张左列大卡的右缘 + 0.75rem；左列没有可见卡片时从 0 开始。
- 五张卡片全部开启时：日程 38rem × 5 行（行 1，x 0）、博雅 22.4rem × 5 行（行 1，x 38.75）、待办 34rem × 6 行（行 6，x 0）、专注 22.4rem × 4 行（行 6，x 34.75）、阳光 22.4rem × 2 行（行 10，x 34.75），与二阶段布局逐项一致。
- 每行快捷方式起点 = 该行所有大卡的最大右缘 + 0.75rem；该行没有大卡时从 0 开始。
- 画布宽度 = max(各行大卡右缘、各行起点 + 快捷方式最小宽度 7.5rem、所有快捷方式右缘)。
- 行数固定，快捷方式的 `row` 不因开关变化改写；编辑态放置区仍为 11 行，拖拽行号范围不变。

#### 取数与缓存

- 首次挂载先读缓存（`hydrate*` 只读 localStorage，不发请求），再按开关决定是否刷新：

| 卡片 | 关闭时不请求 |
| --- | --- |
| 日程 | `/api/byxt/schedule`（当前周与明日预加载）、`/api/byxt/exams`、`/api/bykc/chosen` |
| 博雅课程广场 | `/api/bykc/courses?page=1` |
| 待办 | `/api/spoc/assignments` |
| 专注 | 无数据源 |
| 阳光打卡 | `/api/ygdk/overview` |

- 考试区随日程卡片、SPOC 段随待办卡片一起隐藏，没有独立开关。
- 重新开启后再次进入主页，按“缓存优先 + 后台刷新”执行。
- 子页面（`/schedule`、`/exams`、`/spoc`、`/bykc`）不受开关影响，仍按各自流程取数。

#### 主页显示开关

- 新增 `useHomeDisplay`：
  - 键 `buaa-start.home.display.v1`。
  - `showFunctionArea`、`showActionButtons` 默认 `true`。
  - `minimalMode` 默认 `false`。
  - 非法或缺省值按默认值处理。
- 生效规则：
  - `minimalMode` 只在 `/` 生效；离开 `/` 时隐藏仅时钟视觉，但保留持久化状态。
  - `showFunctionArea=false`：隐藏卡片与快捷方式区域；搜索框、时钟、设置/编辑/新建按钮保留。
  - `minimalMode=true`：隐藏搜索框、设置/编辑/新建按钮、整个功能区；只显示时钟与背景。
  - 仅时钟模式不显示切换按钮：用全屏透明 `button` 承接“点击视口任意位置”，`minimal-clock` 为 `pointer-events: none`，点击穿透到该按钮；键盘可 Tab 聚焦后按 Enter 退出。
  - `showActionButtons=false`：隐藏设置/编辑/新建；“仅时钟”按钮仍显示。
  - “仅时钟”按钮位于设置/编辑/新建左侧，图标为眼睛；不受 `showActionButtons` 影响。
- 取数规则：
  - `minimalMode` 或 `showFunctionArea=false` 时，不调用日程、博雅、待办/SPOC、专注、阳光的加载函数。
  - 恢复显示时，先读缓存，再后台刷新。
- 编辑态：`showActionButtons=false` 或 `minimalMode=true` 时不可进入编辑；已在编辑态时先退出。

### 7.5 背景

新增 `useBackground` 模块级单例：

```ts
{
  state: {
    directory: string | null,
    configured: boolean,
    images: BackgroundImage[],
    selectedName: string | null,
    warning: string | null,
    message: string,
    busy: 'save' | 'rescan' | 'clear' | null,
    fallback: boolean,
    hydrated: boolean,
  },
  hydrate(): Promise<void>,
  saveDirectory(path: string): Promise<boolean>,
  clearDirectory(): Promise<boolean>,
  rescan(): Promise<boolean>,
  imageUrl(name: string): string,
  markLoaded(name: string): void,
  markFailed(name: string): void,
}
```

- `hydrate()` 在应用启动时调用一次 `GET /api/background`。
- 从 `images` 随机选一张作为 `selectedName`；同一 SPA 会话内所有页面共用。
- 浏览器刷新后重新随机；子页面不重新选图。
- 图片地址：`/api/background/image?name=<encodeURIComponent(name)>`。
- 选中文件名后不再预加载；由 `App.vue` 的 `<img>` 加载成功调用 `markLoaded(name)`，失败调用 `markFailed(name)`。
- 单张加载失败：`markFailed(name)` 从未失败的图片中再随机选一张；连续失败 3 张或全部失败，设 `fallback=true`。
- 自定义图加载期间不渲染内置图；加载成功后渐入。`fallback=true` 时渲染内置图。
- `saveDirectory(path)` 调用 `POST /api/background/directory`；成功后重新选图。
- `clearDirectory()` 提交空路径；回到内置背景。
- `rescan()` 调用 `POST /api/background/rescan`；若当前图不在新清单，重新选。
- 图片不写入 localStorage、不复制进仓库；仅浏览器 HTTP 缓存，且响应 `no-store`。

### 7.6 背景层

- `App.vue` 顶层渲染单个固定 `<img>` 背景层，`HomeView`、`ScheduleView` 等子页面共用。
- 图片层：`position: fixed; inset: 0; z-index: 0; width/height: 100%; object-fit: cover; object-position: center`；不再使用 `background-image` 与 `background-attachment`，避免触摸板/页面滚动时背景位移。
- `opacity: 0`，`transition: opacity 500ms ease-out`；加载成功后加 `.is-loaded` 变为 `opacity: 1`，实现渐入。
- `src` 取值：自定义图可用时为自定义图；`hydrated && (!configured || fallback)` 时为内置图；其余为空。为空或自定义图加载中时不渲染内置图，只保留 `body` 深色底。
- `:key="src"` 保证换图时移除旧图；`pointer-events: none`、`draggable="false"`、`decoding="async"`、空 `alt`，背景层不拦截点击、不可拖拽。
- 自定义图 `@load` 调 `markLoaded`，`@error` 调 `markFailed`；内置图直接以 `.is-loaded` 显示。
- 现有暗角/遮罩层保持不变，位于背景层之上、内容之下；文字可读性不下降。
- 黑色遮罩拆为 `.home-backdrop::before`（完全功能模式）与 `::after`（仅时钟模式）两层：`position: fixed; inset: 0; z-index: -1; pointer-events: none`，切换模式只过渡 `opacity`（200ms ease-out）；根元素用 `isolation: isolate` 建立层叠上下文，使遮罩位于背景图之上、内容之下。渐变不做插值，避免逐帧重绘。

## 8. 主页与路由

- 路由不变：`/`、`/schedule`、`/bykc`、`/spoc`、`/spoc/:assignmentId`、`/exams`、`/settings`。
- 不新增登录页；登录只在 `/settings` 的统一登录区。
- `minimalMode` 只影响 `/`；其他页面正常显示。
- 未登录时主页不新增横幅；各卡片沿用标题状态标签引导到 `/settings`。
- 本地待办、番茄钟、快捷入口不依赖登录，未登录仍可用。

## 9. 安全

- 凭据只在以下位置出现：
  - 登录请求体（仅 loopback，`no-store`）。
  - 中继内存会话。
  - AES-256-GCM 密文文件。
- 凭据不出现于：localStorage、URL、查询串、日志、错误响应、前端状态、Git 仓库。
- 密码只用于 SSO 登录与自动重登；不参与派生。
- 文件权限：目录 `0700`、文件 `0600`；密钥与密文分开。
- 背景接口防路径穿越：文件名白名单校验 + `realpath` 前缀校验 + 只读清单；不接受绝对路径、`..`、分隔符。
- 背景目录可读取任意用户指定目录，但只返回白名单图片且只第一层；不提供目录浏览接口。
- POST 同源校验 + JSON Content-Type；不启用 CORS；Host 校验保持。
- 登录单飞、自动重登节流（失败后 5 分钟内不重复）；密码错误不自动重试。
- 上游错误只返回固定中文文案；不回显 HTML、Token、Cookie。
- 现有 `server/http.ts` 的异常包装不得把请求体、Cookie 或上游 HTML 拼进错误消息；认证错误在 `authCas.ts` 统一映射。
- 退出登录删除密钥与密文；业务缓存由前端清理。
- 不实现 WebVPN；不把凭据发往第三方。

## 10. 验收与文档同步

### 10.1 实施验收

- 类型检查与构建通过：`npm run build`（含 `vue-tsc`）。
- 首次登录（无验证码）：学号密码登录成功，显示姓名/学号/时间，四源异步派生。
- 首次登录（有验证码）：验证码图片显示、刷新变化、错误提示可区分、可重试。
- 错误密码、错误验证码、密码过期/安全风险页分别显示对应文案；密码过期不自动跳过。
- 单源派生失败：其余源正常，失败源显示“派生失败”与重试；重试成功后状态更新。
- 重启中继/浏览器：已保存会话免登录；`GET /api/auth/status` 返回已登录与四源状态。
- 删除/损坏 `credentials.enc` 或 `credentials.key`：不白屏，提示重新登录。
- 凭据目录不可写：本次运行仍可用，设置页提示无法保存。
- 会话失效：自动重登一次；成功恢复；失败显示“已失效”并保留缓存；不循环重试。
- 退出登录：`credentials.enc`、`credentials.key` 不存在；localStorage 无凭据；前端回到未登录。
- 五个卡片开关：独立、持久化、关闭期间无请求、重开后缓存优先、全部关闭只剩快捷方式（已实施）。
- 显示功能区/按钮：独立生效；仅时钟状态可进可退（点击视口任意位置退出）、遮罩交叉淡变、刷新保持、子页面不受影响；隐藏期间无功能区请求。
- 背景：保存/清除/重新扫描；第一层扫描；格式过滤；随机展示；子页面一致；加载期间不显示内置图；加载后 500ms 渐入；失败回退内置；单张失败换图；img 背景层不随滚动/触摸板位移；路径穿越被拒绝；20 MB 以上跳过。
- 中继边界：除白名单 POST 外仍只读；127.0.0.1 与 Host 校验不变；日志无凭据。

### 10.2 文档同步

- `docs/api.md` 已补入统一认证、派生链路与错误判定。
- 本文为三阶段 TRD；`docs/trd.md` 与 `docs/trd-phase2.md` 文首已加注指向本文，原“凭据随请求头发送”章节自三阶段起失效。
- `docs/ui-lowfi.md` 已补入主页卡片区、背景区与功能区重排规则，并与本文 7.4 / 7.5 一致；统一登录区、主页显示开关与“仅时钟”按钮尚未包含，实施前必须补充，并以该文档为唯一布局标准。
- 主页卡片开关与主页显示状态（含仅时钟与背景模式）已按 7.4 实施；“显示功能区/显示功能按钮”的设置 UI 待 `docs/ui-lowfi.md` 补齐。
- 本机背景已按 7.5 / 7.6 实施：单 `img` 背景层、加载失败回退、加载后渐入，不使用 `background-attachment`。
- `docs/prd-phase3.md` 4.3 已按固定 11 行口径同步，与 `docs/ui-lowfi.md` 及本文 7.4 一致。
- 三阶段完成后，将 `docs/trd.md` 的认证、凭据、背景、显示状态章节标记为由本文取代，避免两份文档并存时产生歧义。

## 11. 风险与待验证

- 登录流程没有原始 HAR；SSO 页面结构、验证码配置、错误文案可能随学校更新变化，需真实联调与后续 HAR。
- byxt Cookie 依赖 `byxt → SSO → byxt` 票据链；参考 B 不访问 byxt 首页，若真实环境拿不到 Cookie，需要补一次首页访问。
- 博雅仅 `auth_token` 的可用性尚未被 HAR 最终证明；若返回会话失效，需评估是否补充 Cookie。
- 阳光没有 HAR；`campusAppLogin` 的响应结构与 `uid`/`token` 字段需真实联调验证。
- Windows 文件 ACL 依赖 `%LOCALAPPDATA%` 的用户隔离；如需更强保证，再评估 `icacls` 或 DPAPI（本期不做）。
- 异步派生顺序执行，最坏情况约 48 秒（4 × 12 秒）；设置页需显示“派生中”，避免用户误以为失败。
- `docs/ui-lowfi.md` 未补齐前，不应开始其余三阶段 UI 实现（主页卡片区、背景区与显示/仅时钟相关变化已补齐并实施，统一登录 UI 仍待补充）。
