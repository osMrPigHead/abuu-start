# 北航接口说明

## 0. 来源与状态

- 本研教育管理系统：参考 A 的 `js/schedule-data.js`、`api/buaa.asp`，参考 B 的 `ScheduleService.kt`、`ExamService.kt`。
- SPOC：参考 B 的 `SpocClient.kt`、`SpocSupport.kt`，以及 `private/har/spoc_query1`、`private/har/spoc_query2`。
- 博雅：参考 B 的 `BykcClient.kt`、`BykcCrypto.kt`、`BykcService.kt`、`BykcModels.kt`，以及 `private/har/sscv`。
- 阳光：参考 B 的 `YgdkClient.kt`、`LocalYgdkApi.kt`、`YgdkService.kt`。
- `private/har/sscv` 捕获了博雅 `getUserProfile`、`getAllConfig`、`queryChosenCourse`、`queryStudentSemesterCourseByPage` 等请求；HAR 未导出 Cookie，因此博雅“仅 `auth_token` 是否足够”仍需真实联调确认。
- 阳光没有 HAR；路径、表单字段与响应结构来自参考 B 源码，真实联调需验证。
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

用途：`/exams` 列表、倒计时、主页最近三场；`/schedule` 不叠加考试标记。

本期状态：考试接口已接入；`/schedule` 不渲染考试标记，考试只在主页与 `/exams` 使用。以下字段保留为展示与排序口径。

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

## 3. 博雅课程（bykc）

### 3.1 认证与加密

- 基址：`https://bykc.buaa.edu.cn/sscv/`。
- 浏览器完成 CAS 后最终跳到 `https://bykc.buaa.edu.cn/cas-login?token=<auth_token>`；`token` 即业务请求使用的 `auth_token`。本项目不实现 CAS，由用户在设置页提供。
- 业务请求使用 `POST`，请求头：
  - `Accept: application/json`
  - `Content-Type: application/json;charset=UTF-8`
  - `Origin: https://bykc.buaa.edu.cn`
  - `Referer: https://bykc.buaa.edu.cn/system/course-select`
  - `auth_token: <token>`
  - `authtoken: <token>`（与 `auth_token` 同值）
  - `ak`、`sk`、`ts`
- 参考 B 固定使用 `/system/course-select` 作为 `Referer`；HAR 中不同页面分别为 `/system/home`、`/system/course-mine`，说明该值不严格。
- 本项目按二阶段决策只发送 `auth_token`，不发送 Cookie。HAR 的 `cookies` 为空且没有 `cookie` 请求头，但 HAR 未导出 Cookie，因此“无 Cookie 也可用”仍需真实联调确认。

请求加密：

- 每次请求生成 16 字节 AES key，字符集：
  `ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678`
- `ak`：AES key 用固定 RSA 公钥做 `RSA/ECB/PKCS1Padding`，输出 Base64。
- `sk`：请求 JSON 的 UTF-8 字节做 SHA-1，转小写十六进制字符串，再对字符串的 UTF-8 字节做 RSA 加密，输出 Base64。
- 请求体：请求 JSON 用 `AES-128-ECB/PKCS5Padding` 加密，输出 Base64。
- `ts`：`Date.now()` 毫秒字符串。
- RSA 公钥（Base64 DER，来自参考 B `BykcCrypto.kt`）：

```text
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDlHMQ3B5GsWnCe7Nlo1YiG/YmHdlOiKOST5aRm4iaqYSvhvWmwcigoyWTM+8bv2+sf6nQBRDWTY4KmNV7DBk1eDnTIQo6ENA31k5/tYCLEXgjPbEjCK9spiyB62fCT6cqOhbamJB0lcDJRO6Vo1m3dy+fD0jbxfDVBBNtyltIsDQIDAQAB
```

响应：

- 响应体可能是 JSON 字符串包裹的 Base64（以 `"` 开头），也可能是裸 Base64。
- 用本次请求的 AES key 做 `AES-128-ECB/PKCS5Padding` 解密。
- 解密失败时回退为原始响应文本，按普通 JSON 解析。
- 解析后 `status === "0"` 为成功，`data` 为业务数据；`status !== "0"` 时 `errmsg` 为错误信息。
- 认证失效：HTTP 3xx/非 200、响应含 `会话已失效` 或 `未登录`、或 `status !== "0"` 且 `errmsg` 含登录/会话/未登录/认证。
- 解密后不是 JSON 或无法解析：按响应异常处理。

### 3.2 接口

#### 用户资料

`POST /sscv/getUserProfile`

请求体：`{}`

返回 `data`：

- `id`、`employeeId`、`realName`
- `studentNo`、`studentType`、`classCode`
- `college.collegeName`
- `term.termName`

用途：校验 `auth_token`、设置页显示已配置状态。

#### 系统配置与学期

`POST /sscv/getAllConfig`

请求体：`{}`

返回 `data`：

- `semester`：数组，每项含 `id`、`semesterName`、`semesterStartDate`、`semesterEndDate`
- `term`：学期数组，可不用
- `college`、`role`、`campus`：可不用

用途：按当前时间匹配 `semesterStartDate` / `semesterEndDate`，得到当前学期起止日期，供已选课程查询使用。无匹配时取结束日期最晚的一项。

#### 已选课程

`POST /sscv/queryChosenCourse`

请求体：

```json
{
  "startDate": "2026-09-01 00:00:00",
  "endDate": "2027-01-31 23:59:59"
}
```

返回 `data.courseList`：数组，每项包含：

- `id`：选课记录 id
- `courseInfo`：课程对象，字段同“课程对象”
- `selectDate`：选课时间
- `checkin`、`score`、`pass`：考勤/成绩，可不用
- `homework`、`homeworkAttachmentName`、`signInfo`：可不用

用途：主页今日/明日博雅课程、`/schedule` 周视图。`courseInfo` 为空的记录跳过。

#### 课程分页

`POST /sscv/queryStudentSemesterCourseByPage`

请求体：

```json
{
  "pageNumber": 1,
  "pageSize": 12
}
```

返回 `data`：

- `content`：课程数组
- `totalElements`、`totalPages`、`size`、`number`

用途：`/bykc` 课程广场分页；`pageNumber` 从 1 开始。

#### 课程详情

`POST /sscv/queryCourseById`

请求体：

```json
{ "id": 101 }
```

返回 `data`：课程对象。

用途：`/bykc` 详情 modal。

#### 课程对象

博雅课程对象的主要字段：

- `id`：课程 id
- `courseName`：课程名
- `coursePosition`：地点
- `courseTeacher`：教师
- `courseStartDate`、`courseEndDate`：上课起止时间，格式 `YYYY-MM-DD HH:mm:ss`
- `courseSelectStartDate`、`courseSelectEndDate`：选课起止时间
- `courseCancelEndDate`：退选截止时间，可不用
- `courseMaxCount`：人数上限
- `courseCurrentCount`：当前人数，可能为 `null`
- `selected`：当前用户是否已选，可能为 `true` / `false` / `null`
- `courseDesc`：课程简介，可能是 HTML
- `courseNewKind1.kindName`、`courseNewKind2.kindName`：课程分类，可不用
- `courseSignType`、`courseSignConfig`：签到配置，二阶段不使用

### 3.3 状态与字段映射

课程状态由本项目计算，不是上游字段。按以下顺序判定（时间按 `Asia/Shanghai`）：

1. `courseStartDate` 已过 → `已过期`
2. `selected === true` → `已选`
3. `courseSelectEndDate` 已过 → `选课结束`
4. `courseCurrentCount != null && courseMaxCount > 0 && courseCurrentCount >= courseMaxCount` → `人数已满`
5. `courseSelectStartDate` 未到 → `预告`
6. 否则 → `可选`

| 上游 | 本项目 |
| --- | --- |
| `courseName` | 课程名 |
| `courseStartDate` / `courseEndDate` | 时间 |
| `coursePosition` | 地点 |
| `courseTeacher` | 教师；空值不显示 |
| `courseCurrentCount` / `courseMaxCount` | 人数信息，可用于满员判断 |
| `selected` | 是否已选 |
| `courseDesc` | 详情简介；转纯文本，不渲染 HTML |
| `courseSelectStartDate` / `courseSelectEndDate` | 状态判定与选课时间展示 |

- `courseMaxCount` 缺失按 0；`courseCurrentCount` 缺失不判定满员。
- 广场展示全部状态，不按状态过滤；已过期、选课结束也要展示。
- 已选课程只用于日程合并，不显示状态标签。

## 4. 阳光打卡（ygdk）

### 4.1 认证

- 基址：`https://ygdk.buaa.edu.cn/api`。
- 业务请求全部为 `POST application/x-www-form-urlencoded; charset=UTF-8`。
- 表单固定追加 `uid`、`token`；`uid` 为十进制整数。
- 请求头：`X-Requested-With: XMLHttpRequest`。
- `uid` / `token` 只放表单，不放 URL。
- 参考 B 通过 `campusAppLogin` 换取 `uid` 与 `token`；本项目不实现该登录，由用户提供。
- 响应：`{ "code": 1, "result": ... }`；`code === -98` 表示认证失效；其他 `code` 为业务错误。

### 4.2 接口

#### 分类列表

`POST /Front/Clockin/Classify/getList`

返回 `result.list`：数组，每项包含：

- `classify_id`：分类 id
- `name`：分类名
- `term_num`：学期目标
- `month_num`、`week_num`：月/周限制

用途：取名称含“体育”的分类；没有则取 `classify_id === 1`；再没有取第一项。

#### 次数概览

`POST /Front/Clockin/Clockin/getCount`

表单：

- `classify_id`
- `user_id`：等于 `uid`

返回 `result`：

- `term_count`、`term_count_show`
- `term_good_count`、`term_good_count_show`
- `week_count`、`week_num`
- `month_count`、`month_num`、`day_count`
- `term_num`

用途：主页阳光卡片的学期/周次数与系统目标。

#### 学期信息（可选）

`POST /Front/Clockin/Term/get`

返回 `result`：

- `term_id` 或 `id`
- `name`

用途：卡片显示学期名称；失败不阻塞概览。

### 4.3 字段映射

| 上游 | 本项目 |
| --- | --- |
| `term_good_count_show ?? term_good_count ?? term_count_show ?? term_count ?? 0` | 学期次数 |
| `term_num ?? classify.term_num ?? 0` | 系统学期目标；0 表示系统未给目标，前端回退用户设置 |
| `week_count ?? 0` | 当周次数 |
| `week_num ?? classify.week_num ?? 0` | 系统周限制；仅作参考，主页按 PRD 使用用户设置 |
| `name`（`Term/get`） | 学期名称 |

- 学期目标优先取系统值；系统缺失或为 0 时使用用户设置，默认 20。
- 周限制使用用户设置，默认 4；范围 1–14。
- 阳光不调用 `Item/getList`、`Clockin/getList`、`Upload/File/post`、`Clockin/clockin`。

## 5. 本项目实际调用

| 页面/功能 | 中继接口 | 上游调用 |
| --- | --- | --- |
| 课表（主页、`/schedule`） | `GET /api/byxt/schedule?week=` | `currentUser` → `getTermWeeks` → `getMyScheduleDetail` |
| 考试（主页、`/exams`） | `GET /api/byxt/exams` | `currentUser` → `exams.do` |
| SPOC 列表（主页、`/spoc`） | `GET /api/spoc/assignments` | `queryOne`（失败回退 `queryList`）→ `queryKclb` → `queryListByPage`（翻页） |
| SPOC 详情（`/spoc/:id`） | `GET /api/spoc/assignments/:id` | 作业列表 + `queryKczyInfoByid` + `queryXsSubmitKczyInfo` |
| 博雅已选（主页、`/schedule`） | `GET /api/bykc/chosen` | `getAllConfig` → `queryChosenCourse` |
| 博雅广场（`/bykc`） | `GET /api/bykc/courses?page=&pageSize=12` | `queryStudentSemesterCourseByPage` |
| 博雅详情（`/bykc` modal） | `GET /api/bykc/courses/:id` | `queryCourseById` |
| 阳光概览（主页） | `GET /api/ygdk/overview` | `Classify/getList` → `Clockin/getCount` → `Term/get`（可选） |
| 认证状态（`/settings`） | `GET /api/byxt/status`、`GET /api/spoc/status`、`GET /api/bykc/status` | `currentUser`、`queryOne`（失败回退 `queryList`）、`getUserProfile` |
| 阳光认证校验（`/settings`） | `GET /api/ygdk/overview` | `Classify/getList` → `Clockin/getCount` |

- SPOC 请求头固定带用户提供的 `Token` 与 `RoleCode`，不发送 Cookie。
- 博雅请求头固定带用户提供的 `auth_token`（中继同时发送 `auth_token` 与 `authtoken`），不发送 Cookie。
- 阳光请求头只带 `X-Requested-With`；`uid`、`token` 由中继放入表单，不放入 URL。

## 6. 未确定与不在本期范围

- 博雅“仅 `auth_token` 可用”尚未被 HAR 最终证明：`private/har/sscv` 的 `cookies` 为空且无 `cookie` 头，但 Cookie 未导出；若真实请求返回认证失效，需重新评估是否增加可选 Cookie 字段。
- 博雅响应是加密的；HAR 无法离线解密响应体，课程字段与状态判定来自参考 B 的模型、业务代码与测试，真实响应需联调验证。
- 博雅 `Referer` 在 HAR 中随页面变化（`/system/home`、`/system/course-mine`），参考 B 固定为 `/system/course-select`；实现按固定值，若上游拒绝再调整。
- 阳光没有 HAR；路径、表单字段与响应结构来自参考 B，真实联调需验证。
- 阳光 `weekTarget` 系统值仅作参考；本项目按 PRD 使用用户设置。
- 考试接口日期/时间的实际字符串格式（参考 B 未固定，代码按多格式兼容）。
- 研究生 GSMIS 课表不在本期范围。
- 博雅选课/退课/签到、阳光打卡/上传、SPOC 提交/附件下载均不在本期范围。
