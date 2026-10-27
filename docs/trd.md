# 航启主页 / BUAA-Start TRD

> 三阶段变更：统一登录、中继加密凭据、背景目录、主页显示开关与卡片开关以 [trd-phase3.md](trd-phase3.md) 为准。本文第 1 节“凭据随请求头发送”的机制自三阶段起不再适用。

## 1. 技术路线

- 前端：Vue 3 Composition API + `<script setup lang="ts">`，TypeScript strict，Vite，Tailwind CSS，Vue Router 4。
- 状态：`reactive` / `ref` composable，不引入 Pinia；跨页面共享的数据用模块级单例 composable。
- 中继：Node 22 LTS 的 TypeScript 模块，作为 Vite 插件同时挂到开发服务器与 `vite preview`，只监听 `127.0.0.1`。
- 对外接口：资源型只读 `GET /api/*`；中继内部再调用上游的 GET/POST、AES、Token 头。前端不接触上游路径。
- byxt 认证：用户在设置页粘贴浏览器 Cookie；中继通过 `X-Byxt-Cookie` 请求头接收，原样转发。
- SPOC 认证：用户粘贴 `Token` 与 `RoleCode`；中继通过 `X-Spoc-Token`、`X-Spoc-Role` 请求头接收，原样转发。HAR 已确认 SPOC 业务请求不带 Cookie。
- 数据源：byxt 仅使用 `currentUser`、`getTermWeeks`、`getMyScheduleDetail`、`exams`；SPOC 使用 `queryOne`（失败回退 `queryList`）、`queryKclb`、`queryListByPage`、`queryKczyInfoByid`、`queryXsSubmitKczyInfo`。详见 [api.md](docs/api.md)。
- 缓存：前端 localStorage，按数据源分键，缓存优先 + 后台刷新；不做定时轮询。
- 本期不做：博雅、阳光打卡、多用户、移动端、SSR、Pinia、React、任何写操作。

### 1.1 已同步的实施口径

- 本期仅支持本科 byxt；研究生 GSMIS 课表与考试不在范围。
- SPOC 凭据为 Token + RoleCode（HAR 确认 SPOC 业务请求不带 Cookie）；PRD 3.8 已同步该措辞。
- 日程详情按 [ui-lowfi.md](docs/ui-lowfi.md) 的“一行一天”实现，即周一至周日 7 行纵向周视图；PRD 3.5 已同步该表述。
- 日程高亮沿用参考 A：课程开始前 N 分钟内暖色并以 1.1s 周期闪烁、进行中冷色；主页日程卡片首行提示在两者同时成立时显示“正在上课”但使用暖色，仅进行中时冷色，其余不高亮。N 默认 30，范围 0–180，0 表示关闭提前高亮。
- 考试本期不接入数据：主页考试信息行与 `/exams` 保持占位，`/schedule` 不渲染考试标记；设置页 SPOC 凭据区保留但禁用。
- 考试详情后续口径：未开始考试按月分组，已结束考试统一置底并标注；PRD 与 UI 文档均按此口径。
- UI 文档已补齐状态行、成绩/附件、番茄钟阶段/轮次、增删改入口、详情/设置入口；专注卡片的“终止”已改为“重置”。
- PRD、UI 文档、API 文档与本 TRD 已按上述口径对齐。

## 2. 目录结构

```text
server/
  relayPlugin.ts      Vite 插件：挂载 /api 中间件
  routes.ts           路由表与请求分发
  byxt.ts             byxt 上游调用与归一化
  spoc.ts             SPOC 上游调用与归一化
  spocCrypto.ts       SPOC 固定 AES 参数
  http.ts             fetch 超时、错误、JSON 响应
  errors.ts           错误码与 HTTP 状态映射
  types.ts            中继侧类型
src/
  api/client.ts       fetch 封装、错误映射
  api/byxt.ts         /api/byxt/*
  api/spoc.ts         /api/spoc/*
  composables/        useClock、useTodos、usePomodoro、useCredentials、useSchedule、useExams、useSpoc...
  components/         卡片、状态行、弹窗、周导航、课程块...
  views/              Home、Schedule、Exams、SpocList、Settings
  router.ts           Vue Router 4
  types.ts            前端类型
  utils/              日期、重复任务、番茄钟、favicon、存储
  App.vue
  main.ts
  style.css
vite.config.ts
```

## 3. 中继 API

### 3.1 通用约定

- 监听：`127.0.0.1:5173`（dev）/ `127.0.0.1:4173`（preview）；只接受 Host 为 `127.0.0.1`、`localhost` 或 `[::1]` 的请求。
- 方法：只接受 `GET`；其他方法返回 `405 METHOD_NOT_ALLOWED`。
- 路径：未列出的 `/api/*` 返回 `404 NOT_FOUND`，不回退到 SPA。
- 请求头：
  - `X-Byxt-Cookie`：byxt Cookie 原文
  - `X-Spoc-Token`：SPOC Token，可带或不带 `Inco-` 前缀
  - `X-Spoc-Role`：SPOC RoleCode，如 `01`
- 凭据只出现在请求头；不写入 URL、查询串、请求体、日志。
- 响应：`Content-Type: application/json; charset=utf-8`，`Cache-Control: no-store`。
- 错误响应：

```json
{
  "error": {
    "code": "AUTH_EXPIRED",
    "message": "登录状态已失效",
    "upstreamStatus": 200
  }
}
```

- 错误码与 HTTP 状态：

| code | HTTP | 含义 |
| --- | --- | --- |
| `NO_CREDENTIAL` | 401 | 缺少对应凭据 |
| `AUTH_EXPIRED` | 401 | 上游判定登录失效 |
| `INVALID_REQUEST` | 400 | 参数不合法 |
| `INVALID_WEEK` | 400 | 周次越界或非整数 |
| `NOT_FOUND` | 404 | 资源不存在（如 SPOC 作业） |
| `METHOD_NOT_ALLOWED` | 405 | 非 GET |
| `UPSTREAM_TIMEOUT` | 504 | 上游超时 |
| `UPSTREAM_ERROR` | 502 | 上游非 2xx、业务码非成功或响应异常 |
| `BAD_RESPONSE` | 502 | 响应不是预期 JSON |
| `INTERNAL` | 500 | 中继自身异常 |

- 日志：只记录 `method`、`path`、`status`、`durationMs`；不记录请求头、Cookie、Token、响应体。

### 3.2 接口

#### `GET /api/health`

返回 `{ "ok": true }`。用于前端判断中继是否启动。

#### `GET /api/byxt/status`

校验 byxt Cookie，返回：

```json
{
  "user": { "id": "2418...", "name": "张三" },
  "term": { "code": "2026-20271", "name": "2026秋季" }
}
```

上游依次调用 `currentUser`。失败返回 401 或 502。

#### `GET /api/byxt/schedule?week=<n>`

`week` 可省略；省略时按当前教学周。返回：

```json
{
  "term": { "code": "2026-20271", "name": "2026秋季" },
  "weeks": [
    {
      "serialNumber": 1,
      "name": "第1周",
      "startDate": "2026-09-07",
      "endDate": "2026-09-13",
      "curWeek": false
    }
  ],
  "currentWeek": 8,
  "weekSource": "weeks",
  "week": {
    "number": 8,
    "sectionTimes": [{ "section": 1, "start": "08:00", "end": "08:45" }],
    "courses": [
      {
        "courseCode": "B090011036",
        "courseName": "工科高等代数",
        "beginSection": 1,
        "endSection": 2,
        "beginTime": "08:00",
        "endTime": "09:35",
        "placeName": "主M101",
        "weeksAndTeachers": "1-16周 郎荣玲",
        "dayOfWeek": 1
      }
    ]
  },
  "warning": null
}
```

- 上游：`currentUser` → `getTermWeeks` → `getMyScheduleDetail`。
- `currentWeek`：优先按周次表日期；否则用 `welcomeInfo.classWeek`；都没有时为 `null`，`weekSource="default"`，取第 1 周并返回 `warning`。
- `week` 越界或非整数：`INVALID_WEEK`。
- `sectionTimes` 缺失时用固定作息表兜底（见 [api.md](docs/api.md)）。
- 课程按 `dayOfWeek`、`beginSection`、`courseName` 稳定排序。

#### `GET /api/byxt/exams`

返回：

```json
{
  "term": { "code": "2026-20271", "name": "2026秋季" },
  "exams": [
    {
      "courseName": "工科高等代数",
      "examDate": "2026-11-10",
      "startTime": "08:00",
      "endTime": "10:00",
      "examPlace": "主M101",
      "examSeatNo": "12",
      "week": 10,
      "examTimeDescription": "第10周 周二 08:00-10:00"
    }
  ]
}
```

- 上游：`currentUser` → `exams.do?termCode=`。
- 只返回已排定条目：`examDate` 或 `startTime` 至少有一个。
- 原样返回时间字符串，由前端按多格式解析；缺时间时用 `examTimeDescription` 展示。

#### `GET /api/spoc/status`

返回：

```json
{ "term": { "code": "2026-20271", "name": "2026秋季" } }
```

- 上游：`queryOne`；`dqxq`/`mrxq` 缺失时回退 `queryList`，取 `sfdqxq === "1"` 的学期。
- 失败返回 401/502。

#### `GET /api/spoc/assignments`

返回：

```json
{
  "term": { "code": "2026-20271", "name": "2026秋季" },
  "assignments": [
    {
      "assignmentId": "08a0...",
      "courseId": "2026-2027-1-B090011036-081011",
      "courseName": "工科高等代数",
      "teacherName": "郎荣玲",
      "title": "20261026作业",
      "startTime": "2026-10-26 00:00:00",
      "dueTime": "2026-11-01 00:00:00",
      "submissionStatus": "unsubmitted",
      "submissionStatusText": "未提交"
    }
  ]
}
```

- 上游：`queryOne`（失败回退 `queryList`）→ `queryKclb` → `queryListByPage`（翻页）。
- 返回全部作业（含已提交、已截止）；前端按 PRD 过滤“未提交且未截止”。
- 按 `dueTime` 升序，无截止时间置后；再按课程名、标题。
- `queryKclb` 失败时继续：课程名用列表里的 `kcmc`，教师为 `null`。

#### `GET /api/spoc/assignments/:assignmentId`

返回：

```json
{
  "assignment": {
    "assignmentId": "08a0...",
    "courseId": "2026-2027-1-B090011036-081011",
    "courseName": "工科高等代数",
    "teacherName": "郎荣玲",
    "title": "20261026作业",
    "startTime": "2026-10-26 00:00:00",
    "dueTime": "2026-11-01 00:00:00",
    "submissionStatus": "unsubmitted",
    "submissionStatusText": "未提交",
    "score": null,
    "totalScore": "5",
    "contentText": "P139：2（4）、（7）；12，14，16",
    "attachments": [{ "name": "作业要求.pdf" }],
    "submittedAt": null
  }
}
```

- 上游：作业列表 + `queryKczyInfoByid` + `queryXsSubmitKczyInfo`。
- 作业 id 只允许 `[A-Za-z0-9_-]`，长度 1-128；格式不合法返回 `INVALID_REQUEST`。
- 作业 id 不在列表中：`404 NOT_FOUND`。
- `queryXsSubmitKczyInfo` 失败时保留列表里的提交状态，不阻塞详情。
- 分页最多 20 页，防止上游异常导致死循环。
- `score` 取 `pf`；`totalScore` 取 `zyfs`。
- `attachments` 取 `zyfjInfo.wjysmc`；`zyfjid` 存在但名称为空时返回 `附件（名称未返回）`。
- `contentText` 由 `zynr` 去标签、解码常见实体后得到，不返回 HTML。
- 只读：不提供提交、下载、附件打开。

### 3.3 上游细节

- 超时：单次上游 15 秒；超时映射 `UPSTREAM_TIMEOUT`。
- 上游 fetch 使用 `redirect: "manual"`；3xx 按认证失效处理，不跟随到 SSO 登录页。
- byxt 请求头：`Accept`、`X-Requested-With: XMLHttpRequest`、`Referer`、`fetch-api: true`、`Cookie`。
- byxt 认证失败判定：非 2xx、`Content-Type` 非 JSON、响应体以 `<` 开头、JSON 解析失败。返回 401 `AUTH_EXPIRED`，不把登录页当业务数据。
- byxt 业务码：`code !== "0"` 时，若 `msg` 含“登录 / 认证 / 会话”返回 401 `AUTH_EXPIRED`，否则 502 `UPSTREAM_ERROR`。
- SPOC 请求头：`Token`（已带 `Inco-` 则不重复添加）、`RoleCode`、`X-Requested-With`、`Content-Type: application/json`（POST）、`Origin`/`Referer`。
- SPOC 认证失败判定：3xx、非 JSON、HTML 登录页，或 `code !== 200` 且 message 含“登录 / token / 未认证 / 未登录 / 权限”；否则 502。
- SPOC AES：AES-128-CBC/NoPadding，key `inco12345678ocni`，IV `ocni12345678inco`，零填充，Base64。
- SPOC 固定值：`queryOne` 的 `param`、`queryList` 的回退 `param`、`queryListByPage` 的 `sqlid` 按 [api.md](docs/api.md) 的常量。
- 时间：列表 ISO 8601 带偏移 → `Asia/Shanghai` 的 `YYYY-MM-DD HH:mm:ss`；不带偏移的 `YYYY-MM-DD HH:mm:ss` 原样保留；日期取 `YYYY-MM-DD`。

## 4. 数据类型

```ts
type Week = {
  serialNumber: number;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  curWeek: boolean;
};

type SectionTime = { section: number; start: string; end: string };

type Course = {
  courseCode: string;
  courseName: string;
  beginSection: number | null;
  endSection: number | null;
  beginTime: string | null;  // HH:mm
  endTime: string | null;    // HH:mm
  placeName: string | null;
  weeksAndTeachers: string | null;
  dayOfWeek: number | null;  // 1-7
};

type Exam = {
  courseName: string;
  courseNo?: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  examPlace?: string;
  examSeatNo?: string;
  week?: number;
  examTimeDescription?: string;
};

type SpocAssignment = {
  assignmentId: string;
  courseId: string;
  courseName: string;
  teacherName: string | null;
  title: string;
  startTime: string | null;
  dueTime: string | null;
  submissionStatus: 'submitted' | 'unsubmitted' | 'unknown';
  submissionStatusText: string;
};

type SpocAssignmentDetail = SpocAssignment & {
  score: string | null;
  totalScore: string | null;
  contentText: string | null;
  attachments: { name: string }[];
  submittedAt: string | null;
};

type Shortcut = { id: string; title: string; url: string; row: number }; // row: 0-9

type Todo = {
  id: string;
  title: string;
  dueAt: string | null; // YYYY-MM-DDTHH:mm，本地时间
  note: string;
  priority: 'high' | 'medium' | 'low';
  repeat: 'none' | 'daily' | 'weekly';
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
```

## 5. 本地存储

| key | 内容 |
| --- | --- |
| `buaa-start.credentials.v1` | `{ byxtCookie, spocToken, spocRoleCode }` |
| `buaa-start.cache.byxt.schedule.v1` | `{ savedAt, term, weeks, currentWeek, weekSource, lastWeek, byWeek: { [week]: { savedAt, sectionTimes, courses } } }` |
| `buaa-start.cache.byxt.exams.v1` | `{ savedAt, term, exams }` |
| `buaa-start.cache.spoc.assignments.v1` | `{ savedAt, term, assignments }` |
| `buaa-start.cache.spoc.detail.v1.<id>` | `{ savedAt, assignment }` |
| `buaa-start.todos.v1` | `Todo[]` |
| `buaa-start.shortcuts.v1` | `Shortcut[]` |
| `buaa-start.pomodoro.settings.v1` | `PomodoroSettings` |
| `buaa-start.schedule.highlightLeadMinutes.v1` | `number`（0–180，默认 30；不属于缓存，清缓存不删除） |

- 二阶段新增 `buaa-start.pomodoro.notifications.v1`（番茄钟通知开关偏好，未明确关闭时默认开启），见 [trd-phase2.md](docs/trd-phase2.md) 5。
- 读写统一包在安全存储工具里：`JSON.parse` 失败、配额不足、隐私模式不可用时返回 `null` / 降级为内存状态，并给出一次页面提示。
- 清除缓存只删 `buaa-start.cache.*`；清除凭据只删 `buaa-start.credentials.v1`；两者互不影响。
- 凭据不写入 URL、日志、缓存；缓存数据不含 Cookie/Token。

## 6. 页面与组件

| 路由 | 页面 | 主要内容 |
| --- | --- | --- |
| `/` | HomeView | 时钟/日期、Bing 搜索、随机背景、日程卡片、待办卡片、专注卡片、快捷方式卡片 |
| `/schedule` | ScheduleView | 页首与页尾的周次切换、7 行周视图、课程高亮、缓存与刷新 |
| `/exams` | ExamsView | 本期占位页；后续为未开始考试分组、倒计时、空状态 |
| `/spoc` | SpocListView | 未提交且未截止作业、状态、开始/截止时间、点击打开详情 modal |
| `/spoc/:assignmentId` | SpocListView + SpocDetailDialog | 列表页上打开只读详情 modal（直达时自动打开） |
| `/settings` | SettingsView | byxt Cookie、SPOC 占位、日程高亮边界、状态、校验、清除凭据/缓存 |

- 未知路由重定向 `/`；history 模式；Vite dev/preview 自带 SPA fallback。
- 主页时钟：日期 `YYYYMMDD DDD`（如 `20261026 Mon`），时间 `HH:mm:ss`，每秒更新。
- 搜索：固定 Bing，回车在当前标签页跳转，空输入不跳转。
- 背景：从仓库内置图片随机一张，加载失败回退渐变；不做上传/外链。
- 快捷方式：预置 PRD 3.2 的 6 个入口；新增/编辑/删除，字段只有标题 + URL；只允许 `http:`/`https:`；favicon 取站点自身 `/favicon.ico`，失败显示首字母；可拖到 10 行中的任意一行，每行数量不限，超出后横向滚动。
- 日程卡片：首行下一节课摘要、今日/明日课程、考试信息占位行；不显示博雅课程。
- 待办卡片：本地待办在前，SPOC 在后；不显示阳光打卡行。本地待办支持新增/编辑/删除/勾选；SPOC 段只读，点击打开详情 modal。
- 主页入口：日程卡片点击进 `/schedule`；考试区点击进 `/exams`；SPOC 区点击进 `/spoc`；时钟行右侧设置、新建、编辑按钮分别进入 `/settings`、新建快捷方式弹窗、切换快捷方式编辑状态。
- 子页面返回：`/schedule`、`/exams`、`/spoc`、`/bykc`、`/settings` 标题行右侧统一使用 `BackHomeLink` 返回 `/`；`/spoc/:assignmentId` 关闭 modal 后仍在 `/spoc` 列表。
- 课程块：节次/时间、课程名、地点；教师有则附在地点行末尾（`地点 · 教师/周次描述`），数据用 `weeksAndTeachers` 的周次/教师合并描述。
- 课程高亮：`courseHighlightState` 将课程日期与节次/时间换算为绝对起止时间；开始前 N 分钟内暖色并以 1.1s 周期闪烁、进行中冷色，其余不高亮。`CourseBlock` 通过 `highlight` 控制状态，`useScheduleSettings` 保存提前分钟数，主页与详情共用。
- 专注卡片：设置态显示居中排列的时长与轮次配置；专注态显示当前阶段（专注/短休/长休）、剩余时间、预计完成（仅运行中且未暂停时显示）、已完成轮次，按钮为开始/暂停/继续/重置。
- 视觉样式以 [ui-lowfi.md](docs/ui-lowfi.md) 为准；本节结构与 UI 文档已对齐，不新增视觉体系。
- 桌面优先，最小支持宽度约 1024px；不做移动端布局。

### 6.1 主页行式瀑布流

- 主页功能区采用“固定行 + 行内绝对定位”，不使用 CSS Grid，也不使用按列填充的 flex 瀑布；固定 10 行，快捷方式不做按宽度自动换行。
- 单行高度 `3rem`，行间距 `0.75rem`；跨 `n` 行的卡片高度为 `n × 3rem + (n − 1) × 0.75rem`，纵向位置为 `row × (3rem + 0.75rem)`；快捷方式固定只占 1 行（高 `3rem`）。
- 大卡使用固定锚点：日程 `38rem × 5 行` 位于左上，待办 `34rem × 5 行` 位于左下（从第 5 行开始），专注 `22.4rem × 5 行`（原 28rem 的 4/5）与待办同一行、位于待办右侧（`left = 34.75rem`）。
- 每个快捷方式显式保存 `row`（0–9）；同一行从该行大卡右缘加 `0.75rem` 开始顺序排列，行内位置由顺序推算：`x = 行起点 + 前面快捷方式宽度之和 + 间隔`。第 1–5 行仅日程，起点为 `38 + 0.75 = 38.75rem`；第 6–10 行在专注右侧，起点为 `34.75 + 22.4 + 0.75 = 57.9rem`。
- 快捷方式宽度按图标与标题内容取 `7.5–10.5rem`；编辑态为右侧编辑按钮额外预留 `2.5rem`，仍受 `10.5rem` 上限。每行数量不限，不设旧版的 `104rem` 行宽上限。
- 行宽取该行最右端；画布宽度取所有行宽的最大值，且不小于“最大行起点 + 一张快捷方式最小宽度”（当前 `57.9 + 7.5 = 65.4rem`），保证空行也能接收拖拽。画布高度固定为 `10 × 3rem + 9 × 0.75rem = 36.75rem`；外层 `overflow-x: auto`，纵向溢出隐藏。
- 拖拽在整块功能区上处理：纵向位置换算行号，横向位置换算该行的插入序号（排除被拖卡片），空行、行末空白均可放置；编辑态显示 10 行放置区、高亮目标行，并用竖线显示插入位置。
- 行号与顺序写入 `buaa-start.shortcuts.v1` 的 `Shortcut.row` 和数组顺序；旧数据缺少 `row` 时按每行 4 个迁移。新建快捷方式默认追加到第 1 行末尾，并横向滚动到新卡片。6 个预置入口默认第 1 行 4 个、第 2 行 2 个，画布宽度随行内容增长。
- 常量在 `HomeView`，行号/宽度工具在 `src/utils/shortcut.ts`，持久化在 `useShortcuts`；相关样式在 `src/style.css` 的 `.waterfall-scroll` 与 `.waterfall-board`。

## 7. 关键流程

### 7.1 认证与设置

- 保存 byxt Cookie 前做规范化：去掉 `Cookie:` 前缀，多行合并为 `; `，要求至少一个 `name=value`。
- 保存 SPOC Token/RoleCode 前做 trim；Token 已带 `Inco-` 则不重复添加。
- 保存 byxt Cookie 后调 `/api/byxt/status`；成功 `已配置`，401 `已失效`，中继不可达显示连接错误。
- 保存 SPOC Token + RoleCode 后调 `/api/spoc/status`；两者都必填。
- 状态分：`未配置` / `已配置` / `已失效` / `校验中`；状态不持久化，刷新后按“有凭据 → 已配置”显示，首次请求失败再改“已失效”。
- 已保存的凭据只显示掩码，可替换或清除；设置页给出获取 Token/RoleCode 的简短说明（开发者工具 → Network → 任一 SPOC 请求 → Request Headers）。
- 清除单个凭据、清除全部凭据、清除缓存三个动作分开；清除凭据不清缓存。
- 本期设置页仅启用 byxt Cookie；SPOC 凭据区保留字段与按钮但禁用，标注“待接入”。
- 设置页同时提供“日程高亮”偏好：提前高亮分钟数，默认 30，范围 0–180，0 表示不提前高亮；保存后立即生效并写 localStorage。

### 7.2 课表与考试

- 课表按“缓存优先”：先读 `byWeek[lastWeek]` 或当前周缓存渲染，再请求；成功后写缓存。
- 主页需要今日/明日：取当前周；若明日跨周（周日），再请求下一周并合并。
- 今日/明日课程按开始时间排序；无课显示“无课”，取数失败显示错误，不显示成“无课”。
- 下一节课摘要：显示在日程卡片首行；在今天+明天课程中找进行中课程，显示剩余分钟；否则找下一节，显示时间与地点；都没有显示“暂无后续课程”。
- 课程高亮：开始时间在提前边界内的课程暖色高亮并以 1.1s 周期闪烁，进行中的课程冷色高亮；提前边界默认 30 分钟，可在设置页调整。
- 首行提示高亮：仅进行中时冷色；即将开始落在边界内时暖色；二者同时成立时文案仍显示“正在上课”，但使用暖色；两者都不成立不高亮。
- 当前周：`currentWeek` 来自周次表或 `classWeek`；都无则第 1 周并显示提示。
- `weeks` 为空时，7 行日期按当前日期所在自然周（周一至周日）推算，并保留“无法确定教学周，默认第 1 周”的提示。
- 首周/末周禁用上一周/下一周；周次选择只允许 `1..weeks.length`。
- 考试本期不接入数据：主页考试区与 `/exams` 保持占位；`/schedule` 不渲染考试标记，以下考试排序/倒计时条目保留为后续口径。
- 考试网格标记：考试日期落在当前周日期范围内时，在对应日行显示标记；考试失败不阻塞课表，单独显示考试错误。
- 考试排序：未开始按考试时间升序，并按月分组；已结束统一放最后，组内按时间倒序并标注“已结束”。
- 主页取全部未开始考试中时间最早的 3 场；没有未开始考试时显示空状态。
- 倒计时：未开始显示剩余天数；当天显示“今天 HH:mm”；结束显示“已结束”。日期计算按浏览器本地时区，跨天由时钟驱动更新。

### 7.3 SPOC

- 列表只显示 `submissionStatus === 'unsubmitted'` 且（`dueTime` 为空或晚于当前时间）的作业。
- 无截止时间显示“无截止时间”并置后；已截止、已提交不显示。
- 列表字段：课程·教师、标题、开始时间、截止时间、状态；点击打开详情 modal。
- 详情 modal 只读：标题、课程、教师、开始/截止、提交状态、成绩、作业说明、附件名称；无成绩显示“暂无成绩”；无附件不显示附件区。
- 打开 modal 时先展示列表现有字段，详情加载后补齐成绩、说明与附件；关闭后回到列表。
- 无效 id 显示“未找到”，可关闭 modal 回到 `/spoc`。
- 失败时保留缓存并显示缓存时间；无缓存时显示错误与重试。

### 7.4 待办

- 本地待办字段：标题、截止时间、备注、优先级（默认中）、重复（无/每天/每周）、完成状态。
- 重复任务必须有截止时间；完成时保留原条目为已完成，并按周期生成新条目。
- 顺延：新截止时间 = 原截止时间 + 周期；若仍不晚于当前时间，继续加周期直到未来最近一次。
- 排序：未完成在前；截止时间升序；无截止时间置后；已完成置后；同截止时间按创建时间。优先级只改变展示，不参与排序。
- SPOC 段只读，不显示勾选框；点击打开详情 modal。本地段在前，SPOC 段在后。
- 数据写 `buaa-start.todos.v1`；刷新保留。

### 7.5 番茄钟

> 二阶段起阶段结束自动开始下一阶段，并增加桌面通知与通知开关；本节保留一阶段口径，当前实现见 [trd-phase2.md](docs/trd-phase2.md) 7.5。

- 默认 25/5/15 分钟，每 4 个专注轮次进入长休；配置写 `buaa-start.pomodoro.settings.v1`。
- 配置校验：专注 1-180 分钟，短休/长休 1-60 分钟，轮次 1-12；非法值不保存并提示。
- 运行态：阶段、剩余秒数、运行中、已完成专注轮次、结束时间戳；刷新页面重置。
- 计时用 `endsAt` 时间戳 + 250ms 定时器校正，不用累加秒数，避免后台节流漂移。
- 阶段结束：播放提示音；专注结束则轮次 +1；按轮次决定下一阶段（长休/短休/专注）；停在下一阶段起点，等待手动开始。
- 开始/暂停/继续/重置：暂停保留剩余；继续从剩余时间开始；重置回到当前阶段完整时长并停止。
- 提示音用 Web Audio 生成；播放失败不影响计时。

### 7.6 缓存、刷新与错误状态

- 每个数据源独立 `SourceState`：

```ts
type SourceStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'cached'
  | 'error'
  | 'no-credential'
  | 'auth-expired';
```

- 主页标题标签由 `src/utils/sourceStatus.ts` 统一生成：已失效 > 未登录 > 加载失败 > 同步中 > 缓存于 YYYY-MM-DD HH:mm > 已同步 > 待接入；`loading` 为真时（含后台刷新）显示“同步中”。日程按三源聚合，缓存时间取三者最早的 `savedAt`。
- 有缓存先渲染并保留数据；后台请求成功后更新为“已同步”及时间；普通请求失败保留缓存并标注缓存时间，认证失效或未登录时标签显示“已失效/未登录”，缓存内容仍展示。
- 无缓存且失败：显示错误与重试，不显示空数据。
- 首次无凭据：显示引导到 `/settings` 的空状态。
- 手动刷新按模块提供；不做定时轮询。
- 前端把 fetch 失败或非 JSON 响应映射为 `RELAY_UNREACHABLE`，显示连接错误与 `npm run dev` 提示；本地待办、时钟、番茄钟、快捷方式仍可用。

## 8. 启动与脚本

```bash
npm install
npm run dev       # Vite + 中继，127.0.0.1:5173
npm run build     # vue-tsc + vite build
npm run preview   # Vite preview + 中继，127.0.0.1:4173
```

- `vite.config.ts` 的 `server.host` / `preview.host` 固定 `127.0.0.1`；端口被占用时由 Vite 自动顺延，以终端输出为准。
- 中继以插件形式挂载，不需要单独启动第二个进程；`preview` 同源提供页面与 `/api`。
- 生产构建后直接 `npm run preview` 即可本机自用；不引入 Express、SSR 或其他后端。

## 9. 安全与边界

- 中继只监听本机；不设置 CORS 响应头；校验 Host。
- 对外只暴露只读 GET；中继内部只调用白名单上游接口，不接受任意 URL/路径。
- Cookie/Token/RoleCode 只走请求头；不写 URL、日志、缓存；前端 fetch 封装不打日志。
- SPOC 作业说明只按纯文本展示，不使用 `v-html`；快捷方式 URL 只允许 `http:`/`https:`。
- 不执行任何提交、打卡、选退课、签到、附件下载。
- 背景图片、字体等资源本地打包；favicon 直接取站点自身 `/favicon.ico`，失败显示首字母。
- 单用户、本机数据；不做云端同步。

## 10. 验收与文档

- 类型检查：`npm run build` 通过（含 `vue-tsc`）。
- 中继检查：非 GET 返回 405；未列路径 404；无凭据 401；Host 非本机拒绝；日志无凭据。
- 无凭据验收：各模块显示引导/空状态；缓存与错误文案区分；中继未启动不白屏。
- 有凭据验收：课表今日/明日、周切换、考试占位、课程高亮与提前边界、SPOC 过滤/排序/详情、设置页状态与清除。
- 本地功能验收：待办增删改与重复顺延、番茄钟阶段与重置、快捷方式增删改与 URL 校验、任意行拖拽与行内数量不限、时钟/搜索/背景。
- 文档状态：PRD、UI 文档、API 文档与本 TRD 已按确认口径同步；后续变更需同时更新这四份文档。
