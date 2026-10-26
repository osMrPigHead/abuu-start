# 北航接口说明

## 0. 来源与状态

- 本研教育管理系统：参考 A 的 `js/schedule-data.js`、`api/buaa.asp`，参考 B 的 `ScheduleService.kt`、`ExamService.kt`。
- SPOC：参考 B 的 `SpocClient.kt`、`SpocSupport.kt`，以及 `private/har/spoc_query1`、`private/har/spoc_query2`。
- HAR 已确认的结论直接写入本文；仍无法确定的内容会在条目中注明。
- 本项目只做只读查询，不调用任何提交、打卡、选退课、签到接口。

## 1. 本研教育管理系统（byxt）

### 1.1 通用

- 基址：`https://byxt.buaa.edu.cn/jwapp/sys/homeapp/`
- 认证：浏览器中复制的 Cookie，由本地中继原样转发。
- 常用请求头：
  - `Accept: application/json, text/javascript, */*; q=0.01`
  - `X-Requested-With: XMLHttpRequest`
  - `Referer: https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html`
  - `fetch-api: true`（参考 A 使用，建议保留）
- 成功响应：`{ "code": "0", "msg": null, "datas": ... }`
- 会话失效：返回 SSO 登录页 HTML、非 JSON 或非 200；中继统一映射为认证失效。

### 1.2 接口

#### 当前用户与学期

`GET api/home/currentUser.do`

返回 `datas`：

- `userId`
- `userName`
- `welcomeInfo.xnxqdm`：当前学期代码
- `welcomeInfo.xnxqmc`：当前学期名称
- `welcomeInfo.classWeek`：当前教学周，可能缺失

用途：取学期代码、显示用户、在周次表缺失时兜底当前周。

#### 学期周次表

`GET api/home/getTermWeeks.do?termCode=<termCode>`

返回 `datas`：数组，每项包含：

- `serialNumber`：周次序号，从 1 开始
- `name`：如“第1周”
- `startDate`、`endDate`：如 `2026-09-07 00:00:00`
- `curWeek`：是否为当前周

用途：计算当前教学周、首周/末周边界、前后周切换。

#### 周课表

`POST api/home/student/getMyScheduleDetail.do`

表单：

- `termCode`
- `type=week`
- `week`：周次序号

返回 `datas`：

- `arrangedList`：课程数组
  - `courseCode`、`courseName`
  - `beginSection`、`endSection`：节次
  - `beginTime`、`endTime`：如 `08:00`
  - `placeName`：地点
  - `weeksAndTeachers`：周次与教师描述，教师有则显示；这是合并描述，不是独立教师字段
  - `dayOfWeek`：1-7
  - `credit`、`courseSerialNo`、`teachingTarget`、`color`：可不用
- `sectionTimes`：作息表，数组项为 `{ section, start, end }`
- `code`、`name`：课表自身标识，可不用

用途：主页今日/明日课程、`/schedule` 周视图、下一节课摘要。一次请求覆盖整周。

`sectionTimes` 缺失时按固定作息表兜底：

| 节次 | 时间 | 节次 | 时间 |
| --- | --- | --- | --- |
| 1 | 08:00-08:45 | 8 | 15:50-16:35 |
| 2 | 08:50-09:35 | 9 | 16:40-17:25 |
| 3 | 09:50-10:35 | 10 | 17:30-18:15 |
| 4 | 10:40-11:25 | 11 | 19:00-19:45 |
| 5 | 11:30-12:15 | 12 | 19:50-20:35 |
| 6 | 14:00-14:45 | 13 | 20:40-21:25 |
| 7 | 14:50-15:35 | 14 | 21:30-22:15 |

#### 考试

`GET api/home/student/exams.do?termCode=<termCode>`

返回 `datas`：数组，每项包含：

- `courseName`、`courseNo`
- `examDate`：考试日期
- `startTime`、`endTime`：起止时间
- `examTimeDescription`：时间描述，起止时间缺失时兜底
- `examPlace`：地点
- `examSeatNo`：座位号
- `week`：周次
- `examStatus`、`examType`、`taskId`：可不用

用途：`/exams` 列表、倒计时、主页最近三场、`/schedule` 网格事件标记。

本期状态：前端暂不接入考试接口，`/exams` 与主页考试信息行保持占位；以下字段保留为后续接入口径。

“已排定”按 `examDate` 与 `startTime` 是否存在判断；缺失的条目不在本期展示。日期/时间的实际字符串格式参考 B 未固定，解析时同时兼容 `YYYY-MM-DD`、ISO 8601 与 `YYYY-MM-DD HH:mm`。

### 1.3 本期不使用的接口

- `api/home/scheduleTip.do`：可用本地周次表替代。
- `api/home/teachingSchedule/detail.do`：按日课表，无节次与教师。
- `api/home/student/schoolCalendars.do`：本期不做学期切换。
- `api/home/student/getSections.do`：周课表已带作息表。
- `api/home/teachingSchedule/list.do`、`classWeek.do`、`display_range.do`：参考 A 白名单中出现但未使用。

## 2. SPOC

### 2.1 认证

HAR 中所有 SPOC 业务请求都带以下两个请求头，且 **没有 Cookie 请求头**（HAR 的 `cookies` 为空）：

- `Token: Inco-<token>`
- `RoleCode: <jsdm>`，HAR 中为 `01`
- `X-Requested-With: XMLHttpRequest`

因此 SPOC 的凭据不是 Cookie，而是 **Token + RoleCode**。浏览器中的 SPOC 前端通过参考 B 的 CAS 流程取得这两个值：

1. `GET https://spoc.buaa.edu.cn/spocnewht/cas`，跟随跳转，从 `/spocnew/cas?token=...&refreshToken=...` 中取 `token`。
2. `POST https://spoc.buaa.edu.cn/spocnewht/sys/casLogin`，请求头 `Token: Inco-<token>`，请求体 `{ "token": "<token>" }`，返回 `content.jsdm` 作为 `RoleCode`。

本项目不实现 CAS 登录，也不需要中继保存 SSO Cookie；由用户在设置页直接提供 `Token` 与 `RoleCode`，中继原样转发。这样与 byxt 的 Cookie 输入方式一致，也避免跨域 Cookie 罐。

响应信封：`{ "code": 200, "msg": null, "msg_en": null, "content": ... }`；`content` 可能为 `null`。

### 2.2 接口

#### 当前学期

`POST /spocnewht/inco/ht/queryOne`

请求体：

```json
{ "param": "YHrxtTavu6raCwC0/qdgYffB9evWHBkTng/XS4W6j3f/TPo02iEPSoegscDTRNzIPRG49o3RHl4JiFCXAiBkkA==" }
```

返回 `content`：

- `dqxq`：当前学期名称
- `mrxq`：当前学期代码

用途：SPOC 学期代码与名称。

注意：上述 `param` 常量来自参考 B；提供的 HAR 捕获了同一接口的另一次请求（返回用户配置 `pzxx`），没有捕获该常量对应的响应。实现时若 `dqxq`/`mrxq` 缺失，按下面的 `queryList` 回退；仍失败再按 `UPSTREAM_ERROR` 处理，不猜测学期。

#### 学期列表（回退）

`POST /spocnewht/inco/ht/queryList`

请求体（HAR 中捕获的实际参数）：

```json
{ "param": "i7EJ5uwkaEi8s6f4BMZ1s6AGydpvLhbTAgbcrwrBm3mHUdM6nVRsLdleJwUr0EA+yaitJdz0UzXBlTucOn7myg==" }
```

返回 `content`：数组，每项包含 `sfdqxq`（`1` 表示当前学期）、`xnxq`（学期代码）、`xnxqmc`（学期名称）。

用途：当 `queryOne` 没有返回 `dqxq`/`mrxq` 时，取 `sfdqxq === "1"` 的条目作为当前学期。HAR 中该响应为 `2026-20271 / 2026秋季`。

#### 课程列表

`GET /spocnewht/jxkj/queryKclb?kcmc=&xnxq=<termCode>`

返回 `content`：数组，每项包含：

- `kcid`：课程 id
- `kcmc`：课程名
- `skjs`：授课教师

用途：按 `sskcid` 关联作业的课程名与教师名。

#### 作业分页

`POST /spocnewht/inco/ht/queryListByPage`

请求体：

```json
{ "param": "<AES 加密后的 JSON>" }
```

加密前的 JSON：

```json
{
  "pageSize": 15,
  "pageNum": 1,
  "sqlid": "1713252980496efac7d5d9985e81693116d3e8a52ebf2b",
  "xnxq": "<termCode>",
  "kcid": "",
  "yzwz": ""
}
```

加密参数（参考 B 的固定协议常量，不是部署密钥）：

- 算法：AES/CBC/NoPadding
- key：`inco12345678ocni`
- IV：`ocni12345678inco`
- 明文按 16 字节零填充
- 输出 Base64

返回 `content`：

- `total`、`pageNum`、`pageSize`、`pages`、`hasNextPage`
- `list`：数组，每项包含：
  - `zyid`：作业 id
  - `zymc`：标题
  - `zykssj`、`zyjzsj`：开始、截止时间
  - `sskcid`：课程 id
  - `kcmc`：课程名
  - `tjzt`：提交状态原始值
  - `mf`：满分描述，如 `满分:5`；不是得分

翻页：从 `pageNum=1` 开始，直到 `hasNextPage=false` 或已到 `pages`。

#### 作业详情

`GET /spocnewht/kczy/queryKczyInfoByid?id=<assignmentId>`

返回 `content`：

- `id`、`zymc`
- `zynr`：作业说明，HTML
- `zykssj`、`zyjzsj`：普通格式 `YYYY-MM-DD HH:mm:ss`
- `zyfs`：作业总分，如 `5`
- `pf`：作业得分；未评分时为 `null`
- `zyfjid`：作业附件 id；无附件时为 `null`
- `zyfjInfo.wjysmc`：作业附件原始文件名；有附件时用于显示附件名
- `sskcid`：课程 id

附件只显示名称，不提供下载或提交入口。参考 B 的 DTO 没有保留 `zyfjInfo`，HAR 的响应字段与 SPOC 前端代码确认了 `zyfjid` / `zyfjInfo.wjysmc` 的存在。

#### 提交信息

`GET /spocnewht/kczy/queryXsSubmitKczyInfo?kczyid=<assignmentId>`

返回 `content`（可能为 `null`）：

- `tjzt`：提交状态原始值
- `tjsj`：提交时间

用途：详情页的提交状态与提交时间；列表状态以作业分页的 `tjzt` 为准。

### 2.3 字段映射

| 上游 | 本项目 |
| --- | --- |
| `zyid` | 作业 id / 路由 `assignmentId` |
| `zymc` | 标题 |
| `zykssj` | 开始时间 |
| `zyjzsj` | 截止时间 |
| `sskcid` + 课程列表 | 课程名、教师名；教师取 `skjs` |
| `tjzt` | 提交状态：`1`/`已做`/`已提交` → 已提交；`0`/`未做`/`未提交` → 未提交；其余为未知 |
| `pf` | 详情页成绩；为 `null` 时显示“暂无成绩” |
| `zyfjInfo.wjysmc` | 详情页附件名称；`zyfjid` 存在但名称为空时显示“附件（名称未返回）” |
| `zynr` | 作业说明；转纯文本展示，避免直接渲染不可信 HTML |
| `tjsj` | 提交时间 |

时间统一转换为 `Asia/Shanghai` 的 `YYYY-MM-DD HH:mm:ss`；上游可能是带时区偏移的 ISO 8601。

## 3. 本项目实际调用

| 页面/功能 | 中继接口 | 上游调用 |
| --- | --- | --- |
| 课表（主页、`/schedule`） | `GET /api/byxt/schedule?week=` | `currentUser` → `getTermWeeks` → `getMyScheduleDetail` |
| 考试（主页、`/exams`） | `GET /api/byxt/exams` | `currentUser` → `exams.do` |
| SPOC 列表（主页、`/spoc`） | `GET /api/spoc/assignments` | `queryOne`（失败回退 `queryList`）→ `queryKclb` → `queryListByPage`（翻页） |
| SPOC 详情（`/spoc/:id`） | `GET /api/spoc/assignments/:id` | 作业列表 + `queryKczyInfoByid` + `queryXsSubmitKczyInfo` |
| 认证状态（`/settings`） | `GET /api/byxt/status`、`GET /api/spoc/status` | `currentUser`、`queryOne`（失败回退 `queryList`） |

SPOC 请求头固定带用户提供的 `Token` 与 `RoleCode`，不发送 Cookie。

## 4. 未确定与不在本期范围

- 考试接口日期/时间的实际字符串格式（参考 B 未固定，代码按多格式兼容）。
- 研究生 GSMIS 课表不在本期范围。
