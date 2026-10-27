# 航启主页 / BUAA-Start 二阶段 TRD

> 三阶段变更：认证与凭据来源改为中继统一登录与加密保存，见 [trd-phase3.md](trd-phase3.md)。本文中“前端保存凭据、随请求头发送”的约定自三阶段起不再适用；1.2 的“应用内统一登录、中继加密存储凭据”两项已在三阶段实现。SPOC、博雅、阳光、番茄钟的业务行为与缓存规则仍有效。

## 1. 技术路线与已确认决策

- 前端继续使用 Vue 3 Composition API + `<script setup lang="ts">`、TypeScript strict、Vite、Tailwind CSS、Vue Router 4；不引入 Pinia、React、SSR。
- 后端仍是随 Vite 启停的本地只读中继：Node 22 LTS TypeScript 模块，挂到 dev 与 preview，只监听 `127.0.0.1`。不新增第二个后端进程。
- 对外只暴露资源型只读 `GET /api/*`；中继内部再调用上游的 GET/POST、AES/RSA、Token 头。前端不接触上游路径。
- 二阶段新增数据源：
  - 博雅：`auth_token`，加密 `POST /sscv/*`。
  - 阳光：`uid` + `token`，表单 `POST /api/Front/Clockin/*`。
  - SPOC：沿用一阶段已实现的接口，二阶段只启用设置页与主页聚合，不再显示“待接入”。
  - byxt：课表、考试接口不变。
- 博雅请求加密/解密使用 Node 内置 `node:crypto`，不引入第三方加密库：
  - RSA/ECB/PKCS1Padding
  - AES-128-ECB/PKCS5Padding
  - SHA-1
- 番茄钟采用 **A. 浏览器运行**：计时状态只在页面内，刷新/关闭页面即重置；不新增计时后端、不新增可写接口、不使用 Web Push/Service Worker。
- 缓存继续使用 localStorage，按数据源分键，缓存优先 + 后台刷新；不做定时轮询。
- 所有时间按 `Asia/Shanghai` 解释上游值；前端按浏览器本地时区显示。
- 二阶段仍只做只读：不提供 SPOC 提交/附件下载、博雅选退课/签到、阳光打卡/上传、教务管理入口。

### 1.1 已确认口径

- 专注计时选 A：浏览器计时，关闭或刷新页面即重置，浏览器发送通知。
- 博雅认证按 PRD：设置页只收 `auth_token`，不增加 Cookie 字段。
  - HAR `private/har/sscv` 已确认 `auth_token`、`authtoken`、`ak`、`sk`、`ts` 的请求头形态与 200 响应；HAR 未导出 Cookie，因此“仅 token 可用”仍需在真实联调时最终确认。
  - 若真实请求返回认证失效，再单独评估是否增加可选 Cookie 字段；本期不提前扩展。
- 博雅已选课程使用 `getAllConfig` 解析当前学期起止日期，再调用 `queryChosenCourse`。
- 博雅课程广场使用不过滤状态的课程分页；已过期、选课结束也要展示，状态由中继计算。
- 阳光概览只调用分类、次数、学期三个上游接口；不调用项目列表、记录列表、上传、打卡。
- 阳光学期目标优先取系统值，系统缺失或为 0 时取用户设置；周限制始终取用户设置。

### 1.2 本期不做

- 快捷入口自定义图标/分组、应用内统一登录、中继加密存储凭据。
- 博雅选课/退课/签到、广场筛选与搜索、已选课程独立页面。
- 阳光详情页、打卡/补卡/上传。
- SPOC 提交/附件下载、已提交/已截止作业视图。
- 番茄钟专注统计、待办关联、自定义通知文案。
- 研究生 GSMIS、管理后台、成绩管理、教室预约。
- 番茄钟后端计时、跨刷新恢复、页面关闭后通知。

## 2. 目录结构

在现有结构上新增：

```text
server/
  bykc.ts              博雅上游调用、加密、状态计算、归一化
  bykcCrypto.ts        博雅 RSA/AES/SHA1 固定协议
  ygdk.ts              阳光上游调用与概览归一化
  routes.ts            增加 /api/bykc/*、/api/ygdk/*
  types.ts             增加博雅/阳光中继类型
  errors.ts            增加认证/分页/解密错误映射

src/
  api/bykc.ts          /api/bykc/*
  api/ygdk.ts          /api/ygdk/*
  composables/useBykc.ts
  composables/useYgdk.ts
  components/BykcCourseCard.vue
  components/BykcCourseModal.vue
  components/YgdkCard.vue
  views/BykcView.vue
  utils/bykc.ts        状态标签、日期/周范围、课程合并
  utils/pomodoro.ts    增加自动流转与通知调度
  views/HomeView.vue   接入博雅日程、阳光卡片、博雅广场卡片
  views/ScheduleView.vue
  views/SettingsView.vue
  components/FocusCard.vue
  types.ts
```

`views/` 不直接 `fetch`；`components/` 不读写 localStorage；`composables/` 负责模块级状态、缓存与流程；`server/` 不引用前端代码。

## 3. 中继 API

### 3.1 通用约定

- 监听：`127.0.0.1:5173`（dev）/ `127.0.0.1:4173`（preview）；只接受 Host 为 `127.0.0.1`、`localhost` 或 `[::1]`。
- 方法：只接受 `GET`；其他方法返回 `405 METHOD_NOT_ALLOWED`。
- 路径：未列出的 `/api/*` 返回 `404 NOT_FOUND`，不回退到 SPA。
- 请求头：
  - `X-Byxt-Cookie`：byxt Cookie
  - `X-Spoc-Token`、`X-Spoc-Role`：SPOC Token / RoleCode
  - `X-Bykc-Token`：博雅 `auth_token`
  - `X-Ygdk-Uid`：阳光 `uid`，十进制整数
  - `X-Ygdk-Token`：阳光 `token`
- 凭据只出现在请求头；不写入 URL、查询串、请求体、日志。
- 响应：`Content-Type: application/json; charset=utf-8`，`Cache-Control: no-store`。
- 错误响应沿用一阶段结构：

```json
{
  "error": {
    "code": "AUTH_EXPIRED",
    "message": "登录状态已失效",
    "upstreamStatus": 200
  }
}
```

- 错误码：

| code | HTTP | 含义 |
| --- | --- | --- |
| `NO_CREDENTIAL` | 401 | 缺少对应凭据 |
| `AUTH_EXPIRED` | 401 | 上游判定登录失效 |
| `INVALID_REQUEST` | 400 | 参数不合法 |
| `INVALID_PAGE` | 400 | 页码/每页数量不合法 |
| `NOT_FOUND` | 404 | 资源不存在（如博雅课程） |
| `METHOD_NOT_ALLOWED` | 405 | 非 GET |
| `UPSTREAM_TIMEOUT` | 504 | 上游超时 |
| `UPSTREAM_ERROR` | 502 | 上游非 2xx、业务码非成功或响应异常 |
| `BAD_RESPONSE` | 502 | 响应不是预期 JSON，或解密失败 |
| `INTERNAL` | 500 | 中继自身异常 |

- 日志只记录 `method`、`path`、`status`、`durationMs`；不记录请求头、Token、Cookie、`ak/sk/ts`、响应体。

### 3.2 接口清单

#### `GET /api/bykc/status`

校验博雅 `auth_token`，上游调用 `getUserProfile`。

```json
{
  "user": { "name": "张三" },
  "term": { "name": "2026-2027-1" }
}
```

- 失败：缺凭据 `401 NO_CREDENTIAL`；上游认证失效 `401 AUTH_EXPIRED`；其他 `502`。

#### `GET /api/bykc/chosen`

读取当前学期已选博雅课程。

```json
{
  "term": {
    "name": "2026-2027-1",
    "startDate": "2026-09-01 00:00:00",
    "endDate": "2027-01-31 23:59:59"
  },
  "courses": [
    {
      "courseId": 101,
      "courseName": "中国传统文化",
      "startTime": "2026-10-28 19:00:00",
      "endTime": "2026-10-28 21:00:00",
      "place": "学院路校区主M101",
      "teacher": "张老师"
    }
  ]
}
```

- 上游：`getAllConfig` → `queryChosenCourse`。
- `getAllConfig` 的 `semester[]` 按当前时间匹配；无匹配时取结束日期最晚的一项；仍无起止日期返回 `UPSTREAM_ERROR`。
- `courseInfo` 为空的选课记录跳过；同一 `courseId + startTime` 去重。
- 已选课程不按时间过滤；前端按主页/周视图日期范围筛选。

#### `GET /api/bykc/courses?page=<n>&pageSize=12`

博雅课程广场分页。

```json
{
  "page": 1,
  "pageSize": 12,
  "total": 37,
  "totalPages": 4,
  "courses": [
    {
      "id": 101,
      "courseName": "中国传统文化",
      "startTime": "2026-10-28 19:00:00",
      "endTime": "2026-10-28 21:00:00",
      "place": "学院路校区主M101",
      "teacher": "张老师",
      "status": "available",
      "selected": false,
      "currentCount": 10,
      "maxCount": 30
    }
  ]
}
```

- 上游：`queryStudentSemesterCourseByPage`，请求体 `{ pageNumber, pageSize }`，页码从 1 开始。
- `page` 默认 1；`pageSize` 默认 12，范围 1–50；非法返回 `INVALID_PAGE`。
- 不做前端排序，保持上游 `content` 顺序。
- 不按状态过滤；状态由中继计算后返回。

#### `GET /api/bykc/courses/:id`

博雅课程详情。

```json
{
  "course": {
    "id": 101,
    "courseName": "中国传统文化",
    "startTime": "2026-10-28 19:00:00",
    "endTime": "2026-10-28 21:00:00",
    "place": "学院路校区主M101",
    "teacher": "张老师",
    "status": "available",
    "selected": false,
    "currentCount": 10,
    "maxCount": 30,
    "descriptionText": "课程简介纯文本"
  }
}
```

- 上游：`queryCourseById`，请求体 `{ id }`。
- `id` 只允许十进制整数，且不超过安全整数范围；非法 `INVALID_REQUEST`。
- `courseDesc` 可能是 HTML；中继转纯文本后返回 `descriptionText`，前端不使用 `v-html`。
- 上游无该课程或返回空 `data`：`404 NOT_FOUND`。

#### `GET /api/ygdk/overview`

阳光打卡概览。

```json
{
  "termName": "2026-2027-1",
  "termCount": 5,
  "termTarget": 20,
  "weekCount": 2,
  "weekTarget": 4
}
```

- 上游：`Classify/getList` → `Clockin/getCount`；`Term/get` 失败不阻塞，`termName` 为 `null`。
- `termCount` 取 `term_good_count_show ?? term_good_count ?? term_count_show ?? term_count ?? 0`。
- `termTarget` 取 `term_num ?? classify.term_num ?? 0`；0 表示系统未给目标，由前端使用用户设置。
- `weekCount` 取 `week_count ?? 0`。
- `weekTarget` 取 `week_num ?? classify.week_num ?? 0`；仅作为系统参考，主页周限制按 PRD 使用用户设置。
- 缺凭据 `401 NO_CREDENTIAL`；`code === -98` 映射 `401 AUTH_EXPIRED`；其他失败 `502`。

#### 现有接口

`/api/health`、`/api/byxt/status`、`/api/byxt/schedule`、`/api/byxt/exams`、`/api/spoc/status`、`/api/spoc/assignments`、`/api/spoc/assignments/:id` 沿用一阶段实现。

SPOC 二阶段只做启用：设置页 Token/RoleCode 可保存、校验、清除；主页待办 SPOC 段与 `/spoc` 列表按一阶段接口工作。

### 3.3 上游调用细节

#### 博雅

- 基址：`https://bykc.buaa.edu.cn/sscv/`。
- 认证：`auth_token` 与 `authtoken` 两个请求头取同一值。
- 请求头：
  - `Accept: application/json`
  - `Content-Type: application/json;charset=UTF-8`
  - `Origin: https://bykc.buaa.edu.cn`
  - `Referer: https://bykc.buaa.edu.cn/system/course-select`
  - `ak`、`sk`、`ts`
- 不发送 Cookie（按 1.1 决策）。
- 每次请求生成新的 16 字节 AES key；字符集：
  `ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678`
- `ak`：AES key 用固定 RSA 公钥做 `RSA/ECB/PKCS1Padding`，Base64。
- `sk`：请求 JSON 的 UTF-8 字节做 SHA-1，转小写十六进制字符串，再对字符串 UTF-8 字节做 RSA 加密，Base64。
- 请求体：请求 JSON 用 `AES-128-ECB/PKCS5Padding` 加密，Base64。
- `ts`：`Date.now()` 毫秒字符串。
- 固定 RSA 公钥（Base64 DER，来自参考 B `BykcCrypto.kt`）：

```text
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDlHMQ3B5GsWnCe7Nlo1YiG/YmHdlOiKOST5aRm4iaqYSvhvWmwcigoyWTM+8bv2+sf6nQBRDWTY4KmNV7DBk1eDnTIQo6ENA31k5/tYCLEXgjPbEjCK9spiyB62fCT6cqOhbamJB0lcDJRO6Vo1m3dy+fD0jbxfDVBBNtyltIsDQIDAQAB
```

- 响应：
  - 若响应体是 JSON 字符串（以 `"` 开头），先 `JSON.parse` 得到 Base64；否则按裸 Base64。
  - 用本次请求的 AES key 做 `AES-128-ECB/PKCS5Padding` 解密。
  - 解密失败时回退为原始响应文本，按普通 JSON 解析。
  - 解析后要求 `status === "0"`；`data` 为业务数据。
- 认证失效判定：
  - HTTP 3xx 或非 200；
  - 解密后文本包含 `会话已失效` 或 `未登录`；
  - `status !== "0"` 且 `errmsg` 含 `登录`、`会话`、`未登录`、`认证`。
- 其他非成功：`502 UPSTREAM_ERROR`。
- 解密后不是 JSON：`502 BAD_RESPONSE`。

博雅上游调用：

| 用途 | `apiName` | 请求 JSON |
| --- | --- | --- |
| 校验 | `getUserProfile` | `{}` |
| 学期配置 | `getAllConfig` | `{}` |
| 已选课程 | `queryChosenCourse` | `{ "startDate": "...", "endDate": "..." }` |
| 广场分页 | `queryStudentSemesterCourseByPage` | `{ "pageNumber": 1, "pageSize": 12 }` |
| 课程详情 | `queryCourseById` | `{ "id": 101 }` |

博雅状态计算顺序（以 `Asia/Shanghai` 当前时间）：

1. `courseStartDate` 已过 → `expired`（已过期）
2. `selected === true` → `selected`（已选）
3. `courseSelectEndDate` 已过 → `ended`（选课结束）
4. `courseCurrentCount != null && courseMaxCount > 0 && courseCurrentCount >= courseMaxCount` → `full`（人数已满）
5. `courseSelectStartDate` 未到 → `preview`（预告）
6. 否则 → `available`（可选）

- 时间统一返回 `YYYY-MM-DD HH:mm:ss`；上游空字符串转 `null`。
- `courseMaxCount` 缺失按 0；`courseCurrentCount` 缺失不判定满员。
- `courseDesc` 先去掉标签、解码常见实体、折叠空白，再返回。

#### 阳光

- 基址：`https://ygdk.buaa.edu.cn/api`。
- 全部 `POST application/x-www-form-urlencoded; charset=UTF-8`。
- 表单固定追加 `uid`、`token`；`uid` 同时作为 `user_id` 传给次数接口。
- 请求头：`X-Requested-With: XMLHttpRequest`。
- `uid`/`token` 只放表单，不放 URL；日志不记录表单。
- 响应：`{ "code": 1, "result": ... }`；`code === -98` 为认证失效。
- 时序：
  1. `Classify/getList`：取名称含“体育”的分类；否则 `classify_id === 1`；否则第一项。
  2. `Clockin/getCount`：表单 `classify_id`、`user_id`。
  3. `Term/get`：可选，失败不阻塞。
- 不调用 `Item/getList`、`Clockin/getList`、`Upload/File/post`、`Clockin/clockin`。

#### SPOC 与 byxt

- SPOC 认证：`Token` + `RoleCode`；AES 固定参数、`queryOne`/`queryList`、分页与详情字段沿用一阶段。
- byxt：`currentUser`、`getTermWeeks`、`getMyScheduleDetail`、`exams.do` 不变。
- `/schedule` 仍不渲染考试标记；考试只在主页与 `/exams` 使用。

### 3.4 超时与主机

- 单次上游 15 秒；博雅/阳光同样。
- 上游 fetch 使用 `redirect: "manual"`；博雅 3xx 按认证失效，阳光 3xx 按上游错误。
- 中继只监听本机；Host 非本机拒绝；不设置 CORS。

## 4. 数据类型

```ts
type BykcCourseStatus =
  | 'expired'
  | 'selected'
  | 'preview'
  | 'ended'
  | 'full'
  | 'available';

type BykcCourse = {
  id: number;
  courseName: string;
  startTime: string | null; // YYYY-MM-DD HH:mm:ss
  endTime: string | null;
  place: string | null;
  teacher: string | null;
  status: BykcCourseStatus;
  selected: boolean;
  currentCount: number | null;
  maxCount: number;
};

type BykcCourseDetail = BykcCourse & {
  descriptionText: string | null;
};

type BykcChosenCourse = {
  courseId: number;
  courseName: string;
  startTime: string | null;
  endTime: string | null;
  place: string | null;
  teacher: string | null;
};

type BykcChosenResponse = {
  term: { name: string; startDate: string; endDate: string };
  courses: BykcChosenCourse[];
};

type BykcCoursePage = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  courses: BykcCourse[];
};

type YgdkOverview = {
  termName: string | null;
  termCount: number;
  termTarget: number;
  weekCount: number;
  weekTarget: number;
};

type YgdkSettings = {
  termTarget: number; // 1-100，默认 20
  weekTarget: number; // 1-14，默认 4
};

type PomodoroSettings = {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  roundsPerLongBreak: number;
};

type PomodoroRuntime = {
  phase: 'focus' | 'short-break' | 'long-break';
  endsAt: number | null;
  remainingSeconds: number;
  running: boolean;
  paused: boolean;
  completedRounds: number;
  phaseDurationSeconds: number;
  oneMinuteNotified: boolean;
};
```

## 5. 本地存储

| key | 内容 |
| --- | --- |
| `buaa-start.credentials.v1` | `{ byxtCookie, spocToken, spocRoleCode, bykcToken, ygdkUid, ygdkToken }` |
| `buaa-start.cache.byxt.schedule.v1` | 沿用一阶段 |
| `buaa-start.cache.byxt.exams.v1` | 沿用一阶段 |
| `buaa-start.cache.spoc.assignments.v1` | 沿用一阶段 |
| `buaa-start.cache.spoc.detail.v1.<id>` | 沿用一阶段 |
| `buaa-start.cache.bykc.chosen.v1` | `{ savedAt, term, courses }` |
| `buaa-start.cache.bykc.courses.v1.<page>.<pageSize>` | `{ savedAt, page, pageSize, total, totalPages, courses }` |
| `buaa-start.cache.bykc.course.v1.<id>` | `{ savedAt, course }` |
| `buaa-start.cache.ygdk.overview.v1` | `{ savedAt, overview }` |
| `buaa-start.ygdk.settings.v1` | `YgdkSettings` |
| `buaa-start.pomodoro.settings.v1` | `PomodoroSettings` |
| `buaa-start.pomodoro.notifications.v1` | `boolean`；未明确关闭时默认 `true`，用户主动关闭后 `false` |
| `buaa-start.todos.v1` | 沿用一阶段 |
| `buaa-start.shortcuts.v1` | 沿用一阶段 |
| `buaa-start.schedule.highlightLeadMinutes.v1` | 沿用一阶段 |

- 凭据不写入缓存；缓存数据不含 Cookie/Token。
- 清除缓存只删 `buaa-start.cache.*`；清除凭据只删 `buaa-start.credentials.v1`；两者互不影响。
- `buaa-start.ygdk.settings.v1` 与 `buaa-start.pomodoro.notifications.v1` 是用户偏好，不随“清除缓存”删除。
- 存储不可用或损坏时，沿用一阶段安全存储工具：返回 `null`、降级为内存状态，并提示一次。

## 6. 页面与组件

| 路由 | 页面 | 主要内容 |
| --- | --- | --- |
| `/` | HomeView | 日程卡片（byxt + 博雅）、考试、待办（本地 + SPOC）、阳光卡片、博雅广场卡片、专注卡片 |
| `/schedule` | ScheduleView | byxt + 博雅合并的 7 行周视图；博雅来源标记；不显示考试标记 |
| `/bykc` | BykcView | 课程广场分页列表（每页 12 条）；详情 modal |
| `/spoc` | SpocListView | 未提交且未截止作业（沿用） |
| `/spoc/:assignmentId` | SpocListView + SpocDetailDialog | 列表页上打开只读详情 modal（直达时自动打开，沿用列表口径） |
| `/exams` | ExamsView | 本学期已排定考试（沿用） |
| `/settings` | SettingsView | byxt、SPOC、博雅、阳光凭据；阳光目标/周限制；番茄通知开关与测试；状态与清除 |

- 未知路由重定向 `/`。
- `/bykc` 的页码使用查询参数 `?page=n`，便于刷新/直达；非法页码回退 1。
- 博雅、SPOC 详情均使用 modal；SPOC 保留 `/spoc/:assignmentId` 直达路由，直达时在列表页打开对应 modal。
- 二阶段新增卡片、modal、设置区的视觉布局尚未写入 `docs/ui-lowfi.md`；本 TRD 只定义组件职责、字段与交互结果，不定义布局。实施前需先补 UI 文档。

### 6.1 组件职责

- `BykcCourseCard`：课程名、时间、地点、教师（有则显示）、状态标签；点击打开 modal。
- `BykcCourseModal`：列表四项 + 课程简介纯文本 + 状态；关闭返回列表；失败显示错误与重试。
- `SpocDetailDialog`：标题、课程、教师、开始/截止时间、提交状态、成绩、说明纯文本、附件名；无成绩显示“暂无成绩”，无附件不显示附件区；打开时先展示列表现有字段，关闭返回列表，失败显示错误与重试。
- `YgdkCard`：学期次数/目标/进度、周次数/限制、周进度；无详情入口。
- `FocusCard`：专注态在剩余时间上方显示当前阶段（专注/短休/长休），并显示剩余时间、预计完成（仅运行中且未暂停时）、轮次、开始/暂停/继续/重置；阶段结束自动流转。通知开关与测试入口放在设置页，不在专注卡片内增加通知入口。
- `HomeView`：
  - 日程卡片首行“下一节课”统合 byxt 与博雅。
  - 今日/明日课程合并，按开始时间升序；博雅带来源标记；冲突都显示。
  - 博雅加载失败不影响 byxt；博雅区域显示“未配置/加载失败”与重试。
  - 博雅广场卡片从第 1 页随机 3 门；不足 3 门显示实际数量；“换一批”尽量避开当前 3 门。
- `ScheduleView`：
  - 周范围按当前教学周日期；博雅课程按开始日期落入对应日。
  - 同一天按开始时间合并排序；来源标记区分。
  - 博雅失败不阻塞 byxt；单独状态行。
- `SettingsView`：
  - 博雅 `auth_token`：保存、校验、替换、清除；掩码。
  - 阳光 `uid` + `token`：整数 UID；两项都填才可保存；保存后调概览校验。
  - 阳光目标 1–100、周限制 1–14；非法不保存并提示。
  - 番茄通知开关：未明确关闭时默认开启；首次开启或首次开始专注时请求权限；拒绝则回到关闭并提示；显示权限状态（已授权/待授权/已拒绝/不支持），并提供“测试通知”。
  - 状态：未配置/已配置/已失效/校验中；不持久化状态，刷新后按“有凭据 → 已配置”显示，首次请求失败再改“已失效”。

## 7. 关键流程

### 7.1 博雅认证与状态

- 保存前 `trim`；空值不保存；不添加 `Inco-` 前缀。
- 保存后调用 `/api/bykc/status`：
  - 成功 → 已配置
  - 401 → 已失效
  - 中继不可达 → 连接错误
- 已保存只显示掩码；支持替换、清除。
- 清除博雅凭据只删 `bykcToken`，不清博雅缓存；其他凭据不受影响。
- 未配置且无缓存：主页与周视图不显示博雅课程，博雅区域显示引导；广场卡片显示引导。
- 有缓存：显示缓存并标注“缓存于 YYYY-MM-DD HH:mm”。
- 401 时保留缓存并标记已失效；不自动续期、不保存账号密码。

### 7.2 博雅已选课程与日程合并

- `useBykc` 启动时读缓存，再请求 `/api/bykc/chosen`；成功后写缓存。
- 主页今日/明日：
  - 取 `startTime` 的日期部分与今天/明天比较。
  - 与 byxt 课程按开始时间升序合并。
  - 博雅课程显示“博雅”来源标记。
- `/schedule` 周视图：
  - 由 byxt 周次表得到周一至周日日期。
  - 博雅课程 `startTime` 日期落在该周范围才显示。
  - 与 byxt 同一天课程合并排序；时间冲突两者都显示。
- 下一节课：
  - 在“今天 + 明天”的 byxt 与博雅课程中找进行中；有则显示剩余分钟。
  - 否则找开始时间最近的一节，显示时间与地点。
  - 都没有显示“暂无后续课程”。
- 博雅失败：
  - byxt 正常展示；博雅区域显示错误/缓存状态与重试。
  - 不把博雅失败显示成“无课”。

### 7.3 博雅课程广场

- `/bykc?page=n`：
  - `page` 非法或小于 1 → 1；大于 `totalPages` 时回退到最后一页或 1。
  - 每页 12 条；上一页/下一页；首末页禁用。
- 列表：
  - 字段：课程名、时间、地点、教师（有则显示）。
  - 按上游顺序，不做本地排序。
  - 状态标签：已选/可选/已过期/人数已满/预告/选课结束。
- 详情 modal：
  - 点击列表项打开；请求 `/api/bykc/courses/:id`。
  - 展示四项 + 课程简介纯文本 + 状态。
  - 无写操作按钮；简介不渲染 HTML。
- 缓存：
  - 每页独立缓存；进入页面先读缓存再刷新。
  - 失败保留缓存并标注时间；无缓存显示错误与重试。
- 主页广场卡片：
  - 使用第 1 页缓存/请求；随机取 3 门。
  - 不足 3 门显示实际数量。
  - “换一批”在当前第 1 页课程中重新随机；尽量不与当前 3 门重复，无法避免时允许重复。
  - 无凭据且无缓存显示引导；有缓存显示缓存并标注；失败保留缓存与重试。

### 7.4 阳光概览

- 保存凭据后调用 `/api/ygdk/overview` 校验。
- 主页卡片：
  - 学期次数、学期目标、学期进度。
  - 当周次数、周限制、周进度。
- 目标优先级：
  - `systemTermTarget > 0` 时使用系统值；否则使用用户 `termTarget`；用户值非法回退 20。
  - 周限制始终使用用户 `weekTarget`，默认 4；不使用系统 `weekTarget`。
- 进度：
  - 学期进度 = `termCount / termTarget`。
  - 周进度 = `weekCount / weekTarget`；超过限制进度条封顶 100%，文字显示实际次数。
- 设置页修改目标/周限制后立即写入 `buaa-start.ygdk.settings.v1`，主页响应式更新。
- 失败：
  - 保留缓存并标注时间；无缓存显示错误与重试。
  - 不显示成“0 次”。
- 不设详情路由；不提供打卡、补卡、上传。

### 7.5 番茄钟：自动流转与通知

#### 状态

- 配置仍为 25/5/15 分钟、每 4 轮长休；配置写 `buaa-start.pomodoro.settings.v1`。
- 通知开关写 `buaa-start.pomodoro.notifications.v1`；未明确关闭时默认 `true`，用户主动关闭后持久化 `false`。
- 运行态只在内存：`phase`、`endsAt`、`remainingSeconds`、`running`、`paused`、`completedRounds`、`phaseDurationSeconds`、`oneMinuteNotified`。
- 刷新/关闭页面重置；不写运行态到 localStorage，不新增后端接口。

#### 自动流转

- 首次开始仍由用户点击；开始后专注阶段自动计时。
- 阶段自然结束：
  1. 播放提示音。
  2. 专注结束则 `completedRounds += 1`。
  3. 按 `nextPomodoroPhase` 决定短休/长休/专注。
  4. 立即进入下一阶段并自动开始，`endsAt = 原结束时间 + 下一阶段时长`。
  5. 发送“阶段结束”通知（若开启）。
  6. 重置 `oneMinuteNotified`。
- 后台/休眠导致跨过多个阶段：
  - 从旧 `endsAt` 开始循环推进，直到 `endsAt > now`。
  - 循环中照常累计专注轮次，但不补发历史提示音与通知。
  - 若只跨过一个阶段，按正常结束处理，发送一次结束通知。
  - 循环上限 10000 次，防止异常数据导致死循环。
- 页面恢复可见时立即执行一次 `tick`，不等待下一个 250ms 定时器。

#### 通知

- 开关未明确关闭时默认开启；首次开启或首次开始/继续（用户手势）时若权限为 `default`，请求一次权限；用户主动关闭后不再自动请求。
  - `Notification` 不存在 → 开关回到关闭并提示。
  - 权限为 `default` → 首次开启或首次开始时 `Notification.requestPermission()`；拒绝或忽略后关闭并持久化 `false`。
  - 权限为 `denied` → 开关回到关闭并提示；不反复请求。
- 设置页显示权限状态（已授权/待授权/已拒绝/当前浏览器不支持），并提供“测试通知”按钮；测试通知用于确认浏览器与系统通知是否放行。
- 结束前 1 分钟：
  - 仅当阶段时长 > 60 秒。
  - 在 `endsAt - 60_000` 后首次 `tick` 发送一次。
  - 暂停时若已跨过该边界，标记为已通知；恢复后不补发。
  - 暂停时未跨过该边界，恢复后继续计时，跨过时发送一次。
- 阶段结束：
  - 文案含刚结束阶段与下一阶段，如“专注结束，已开始 5 分钟短休”。
  - 与 1 分钟通知使用不同 `tag`，避免互相替换；创建通知时使用 `renotify: true`，同一 tag 替换旧通知时仍提醒。
- 点击通知：`window.focus()`，关闭通知。
- 通知不可用/权限被拒绝：提示音与自动流转仍正常；不阻塞计时。
- 不自定义通知文案；不注册 Service Worker；页面关闭后不发通知。

#### 按钮

- 开始：校验配置，从专注第 1 轮开始并自动计时。
- 暂停：保留剩余秒数，停止 ticker。
- 继续：从剩余秒数重新计算 `endsAt`。
- 重置：停止，回到当前阶段完整时长；已完成轮次保持不变。
- 编辑配置：停止并清空本次会话，保留已保存配置。

### 7.6 缓存、刷新与错误

- 每个数据源独立 `SourceState`：`idle | loading | ok | cached | error | no-credential | auth-expired`。
- 有缓存先渲染并显示“缓存于 YYYY-MM-DD HH:mm”；后台成功后更新为“已同步”及时间；失败保留缓存。
- 无缓存且失败：显示错误与重试，不显示空数据。
- 无凭据：显示引导到 `/settings`，不显示“无数据”。
- 手动刷新按模块提供；不做定时轮询。
- 中继不可达：映射 `RELAY_UNREACHABLE`，显示连接错误与启动提示；本地待办、番茄钟、快捷入口仍可用。

### 7.7 认证状态

- 四类凭据独立保存、校验、清除；单源失效不影响其他源。
- 状态：`未配置/已配置/已失效/校验中`；状态不持久化。
- 保存博雅调用 `/api/bykc/status`；保存阳光调用 `/api/ygdk/overview`；保存 SPOC 调用 `/api/spoc/status`；保存 byxt 调用 `/api/byxt/status`。
- 已保存凭据只显示掩码；清除单个、清除全部、清除缓存分开。
- 清除凭据不清缓存；清除缓存不清凭据。

## 8. 启动与脚本

```bash
npm install
npm run dev       # Vite + 中继，127.0.0.1:5173
npm run build     # vue-tsc + vite build
npm run preview   # Vite preview + 中继，127.0.0.1:4173
```

- 不新增依赖；博雅加密使用 Node 内置 `node:crypto`。
- `vite.config.ts` 仍挂载 `relayPlugin()`；不单独启动第二个进程。
- 端口被占用时由 Vite 自动顺延，以终端输出为准。

## 9. 安全与边界

- 中继只监听本机；Host 校验；不设置 CORS。
- 对外只暴露只读 GET；中继内部只调用白名单上游接口，不接受任意 URL/路径。
- 凭据只出现在前端到中继的请求头；不写 URL、日志、缓存。
- 博雅 `ak/sk/ts` 与 AES key 每次请求重新生成，不记录日志。
- 博雅课程简介、SPOC 作业说明只按纯文本展示，不使用 `v-html`。
- 不执行任何提交、打卡、选退课、签到、附件下载。
- 博雅 Cookie 字段本期不实现；若后续确认必须，需更新 PRD、API、UI 与本 TRD 后再加。
- 番茄钟通知只由页面发送；不注册 Service Worker，不申请推送订阅。
- 背景、字体等资源本地打包；favicon 失败显示首字母。

## 10. 验收与文档

- 类型检查：`npm run build` 通过（含 `vue-tsc`）。
- 中继检查：
  - 非 GET 返回 405；未列路径 404；无凭据 401；Host 非本机拒绝。
  - 博雅加密请求可被上游接受；响应解密失败映射 `BAD_RESPONSE`。
  - 阳光 `code -98` 映射认证失效；日志无凭据。
- 无凭据验收：
  - 博雅、阳光显示引导；不显示成“无课程/0 次”。
  - byxt、SPOC、本地待办、番茄钟仍可用。
- 有凭据验收：
  - 博雅已选课程进入主页与周视图，来源标记、合并排序、冲突显示、下一节课正确。
  - 博雅广场分页、边界禁用、详情 modal、状态标签、简介纯文本正确。
  - 主页广场随机 3 门与“换一批”正确。
  - 阳光学期/周次数、目标、进度、封顶、设置持久化正确。
  - 番茄钟自动流转、阶段显示、轮次、长短休、暂停/继续/重置、默认开启与权限请求、测试通知、1 分钟通知、结束通知、点击聚焦正确。
  - 通知拒绝/不支持时提示音与自动流转不受影响。
- 缓存与错误：
  - 各源独立缓存与状态；失败保留缓存并标注时间；无缓存显示错误与重试。
  - 刷新与关闭页面后番茄钟重置；不残留运行态。
- 文档状态：
  - 本 TRD 依据 `docs/prd-phase2.md` 与 `private/har/sscv` 编写。
  - `docs/api.md` 已补入博雅/阳光二阶段接口、认证与字段映射。
  - `docs/ui-lowfi.md` 尚未包含二阶段新增卡片、modal、设置区；实施前需补入。
  - 一阶段 `docs/trd.md` 仍描述“本期不做博雅/阳光”，二阶段以本文件为准；后续变更需同步 PRD、UI、API 与两份 TRD 的相关条目。
