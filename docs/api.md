# 北航接口说明

## 0. 来源与状态

- 统一认证：参考 B 的 `LocalConnectionAuth.kt`、`LocalCasParser`、`LocalSpocApi.kt`、`LocalBykcApi.kt`、`LocalYgdkApi.kt`，以及 `docs/_audit/2026-10-21-login-har.md` 对 `uc.buaa.edu.cn.har`、`byxt.buaa.edu.cn.har` 的审计。
- 本研教育管理系统：参考 A 的 `js/schedule-data.js`、`api/buaa.asp`，参考 B 的 `ScheduleService.kt`、`ExamService.kt`。
- SPOC：参考 B 的 `SpocClient.kt`、`SpocSupport.kt`，以及 `private/har/spoc_query1`、`private/har/spoc_query2`。
- 博雅：参考 B 的 `BykcClient.kt`、`BykcCrypto.kt`、`BykcService.kt`、`BykcModels.kt`，以及 `private/har/sscv`。
- 阳光：参考 B 的 `YgdkClient.kt`、`LocalYgdkApi.kt`、`YgdkService.kt`。
- `private/har/sscv` 捕获了博雅 `getUserProfile`、`getAllConfig`、`queryChosenCourse`、`queryStudentSemesterCourseByPage` 等请求；HAR 未导出 Cookie，因此博雅“仅 `auth_token` 是否足够”仍需真实联调确认。
- 阳光没有 HAR；路径、表单字段与响应结构来自参考 B 源码，真实联调需验证。
- 登录流程没有原始 HAR；页面结构、表单字段与错误判定来自参考 B 与登录审计文档，见第 2 节。
- HAR 已确认的结论直接写入本文；仍无法确定的内容会在条目中注明。
- 本项目只做只读查询，不调用任何提交、打卡、选退课、签到接口；三阶段的登录、登出、验证码、会话状态是唯一写方法例外。


## 1. 本研教育管理系统（byxt）

### 1.1 通用

- 基址：`https://byxt.buaa.edu.cn/jwapp/sys/homeapp/`
- 认证：三阶段由中继统一登录派生 CAS 会话 Cookie，按 byxt 域注入，见 2.3.1；前端不再接触 Cookie。
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

## 2. 统一认证（SSO / UC）

### 2.1 范围与来源

三阶段新增：用户在设置页输入一次学号与密码，由本地中继完成学校统一身份认证，并派生 byxt、SPOC、博雅、阳光四类凭据。

来源：

- 参考 B 的 `LocalConnectionAuth.kt`、`LocalCasParser`、`LocalSpocApi.kt`、`LocalBykcApi.kt`、`LocalYgdkApi.kt`。
- 参考 B 的登录链审计文档 `docs/_audit/2026-10-21-login-har.md`，基于用户的 `uc.buaa.edu.cn.har`（131 个请求）与 `byxt.buaa.edu.cn.har`（90 个请求）。
- 本项目尚未收到登录流程的原始 HAR；以下页面结构、表单字段与错误判定来自上述源码与审计文档。若学校更新登录页，需重新提供 HAR。
- 仅支持直连（校内网络或用户自行连接的 VPN）；不支持 WebVPN。所有请求共用一个按域隔离的 Cookie 罐。

### 2.2 登录流程

#### 1. 预加载登录页

`GET https://sso.buaa.edu.cn/login`

- `200`：解析登录页。
  - `execution`：`<input name="execution" value="...">`，提交时必须原样带回。
  - 验证码配置：页面脚本中的 `config.captcha = { type: '...', id: '...' }`。
- `302`：SSO 已有会话。跳过密码提交，直接进入第 4 步的 UC 激活。
- 其他状态码：按上游失败处理。

`execution` 与登录页的 SSO Cookie 绑定；中继必须把预加载与后续提交放在同一个 Cookie 会话中，不能只把 `execution` 返回前端后另起会话提交。

#### 2. 验证码

页面出现 `config.captcha` 时：

`GET https://sso.buaa.edu.cn/captcha?captchaId=<id>`

- 返回 JPEG 图片字节。
- 前端展示为图片；中继可返回 `data:image/jpeg;base64,...`。
- 验证码类型目前只处理图片；`type` 不是图片时提示用户在当前浏览器完成登录或稍后重试，不做识别。
- 刷新验证码：重新预加载登录页，取得新的 `captchaId` 与 `execution`；旧验证码立即失效。

#### 3. 提交学号与密码

`POST https://sso.buaa.edu.cn/login`

- `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
- 表单字段：

| 字段 | 值 |
| --- | --- |
| `username` | 学号 |
| `password` | 密码 |
| `execution` | 登录页的 `execution` |
| `_eventId` | `submit` |
| `submit` | `登录` |
| `type` | `username_password` |
| `captcha` | 验证码，仅需要验证码时 |
| `captchaResponse` | 与 `captcha` 同值，仅需要验证码时 |

- 登录页 `form#fm1` 中的其他 hidden 字段应一并复制；上面是必须保证的字段。
- 成功时返回 `302`，`Location` 指向 SSO 的票据回调或目标系统。
- 失败时通常返回 `200` 并重新渲染登录页，页面含错误提示、`execution`，可能重新出现验证码。

#### 4. 跟随跳转

- 手动跟随 `300–399`，最多 10 次；超过按登录失败处理。
- `Location` 可能是相对路径，也可能是绝对 URL，需要按当前请求 URL 解析。
- 参考 B 的实测：SSO 可能返回 `http://sso.buaa.edu.cn/...`，浏览器会自动升级为 HTTPS，原生 HTTP 客户端不会。中继只对 `sso.buaa.edu.cn` 的默认 HTTP 端口升级为 HTTPS，并保留 `service` 等查询参数的原始编码；其他业务系统的地址不擅自改写。
- 每跳都要保存 `Set-Cookie`。

#### 5. 激活 UC 会话

`GET https://uc.buaa.edu.cn/api/login?target=https%3A%2F%2Fuc.buaa.edu.cn%2F%23%2Fuser%2Flogin`

- 同样手动跟随跳转，最多 10 次，并保存 Cookie。
- 该请求完成 SSO 与 UC 之间的票据交换；SSO 返回 302 不等于 UC 已登录。
- 参考 B 的实测：该地址可能先跳到 `http://sso.buaa.edu.cn`，需要按第 4 步的规则升级为 HTTPS。

#### 6. 校验登录结果

`GET https://uc.buaa.edu.cn/api/uc/status`

请求头：

- `Accept: application/json, text/javascript, */*; q=0.01`
- `X-Requested-With: XMLHttpRequest`

成功响应：

```json
{
  "code": 0,
  "data": {
    "name": "张三",
    "schoolid": "2418xxxx",
    "username": "2418xxxx"
  }
}
```

- `code === 0` 且 `data` 非空才算登录成功；`data.name`、`data.schoolid` 用于设置页显示姓名与学号。
- 响应不是 JSON（例如 SSO 登录页 HTML）、HTTP 非 200、`code !== 0` 都视为未登录。
- `GET https://uc.buaa.edu.cn/api/uc/userinfo` 可返回更完整的用户资料（`phone`、`email`、`idCardTypeName` 等），三阶段只需要姓名与学号，可不调用。

#### 7. 退出登录

`GET https://sso.buaa.edu.cn/logout`

- 尽力调用；失败不阻塞本地清理。
- 随后清除中继保存的 Cookie、派生凭据、密码与会话状态。

### 2.3 派生凭据

统一认证成功后，四个业务系统分别用自己的入口完成 CAS/UC 票据交换。它们共用同一个 Cookie 罐；每次请求都要把匹配域的 Cookie 带上，并保存响应中的 `Set-Cookie`。

#### 2.3.1 byxt Cookie

1. `GET https://byxt.buaa.edu.cn/jwapp/sys/homeapp/api/home/currentUser.do`，跟随跳转（最多 10 次）。
   - 请求头：`Accept: application/json, text/javascript, */*; q=0.01`、`X-Requested-With: XMLHttpRequest`、`Referer: https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html`。
   - 若尚未建立 byxt 会话，该请求会 302 到 SSO，再由 SSO 带 ticket 跳回 byxt；跟随过程中 byxt 域会写入 Cookie。
2. 最终响应为 JSON 且 `code === "0"`，说明 byxt Cookie 可用；取 `datas.userId`、`datas.userName` 与 `welcomeInfo`。
3. 最终 URL 仍含 `sso.buaa.edu.cn`，或响应是含 `input name="execution"` 的 HTML，视为派生失败。
4. 参考 B 不额外访问 byxt 首页；若真实联调中 `currentUser` 不触发票据交换，可先 `GET https://byxt.buaa.edu.cn/jwapp/sys/homeapp/index.html` 一次，再重试 `currentUser`。

Cookie 范围：保存 `byxt.buaa.edu.cn` 与其父域 `.buaa.edu.cn` 下匹配的 Cookie；不把其他业务系统的 Cookie 发给 byxt。

#### 2.3.2 SPOC Token + RoleCode

1. `GET https://spoc.buaa.edu.cn/spocnewht/cas`，手动跟随跳转，最多 8 次。
2. 在任意一跳的 URL 或 `Location` 中匹配 `/spocnew/cas`，取查询参数：
   - `token`：SPOC Token。
   - `refreshToken`：可保存，三阶段不使用。
3. `POST https://spoc.buaa.edu.cn/spocnewht/sys/casLogin`
   - `Content-Type: application/json`
   - `X-Requested-With: XMLHttpRequest`
   - `Token: Inco-<token>`
   - 请求体：`{ "token": "<token>" }`
4. 响应信封 `{ code: 200, msg, msg_en, content }`；从 `content` 取 RoleCode：
   - 优先 `content.jsdm`。
   - 其次 `content.rolecode`（可能是字符串、数字或数组）。
   - 再次 `content.jsdmList` 的第一个非空值。
5. 用 `queryOne` 或 `queryKclb` 校验；失败按派生失败处理，不影响其他数据源。

HAR 已确认 SPOC 业务请求不带 Cookie，只带 `Token` 与 `RoleCode`。

#### 2.3.3 博雅 auth_token

1. `GET https://bykc.buaa.edu.cn/sscv/cas/login`，跟随跳转，最多 10 次。
2. 最终 URL 或某一跳的 `Location` 形如：

```text
https://bykc.buaa.edu.cn/cas-login?token=<auth_token>
```

3. 取 `token` 查询参数并做一次 URL 解码，得到 `auth_token`；不要重复解码，避免破坏 `+`、`/`、`=`。
4. 用 `POST /sscv/getUserProfile` 校验；请求头同时发送 `auth_token` 与 `authtoken`，见 4.1。
5. 参考 B 在拿不到 token 时会再 `GET https://bykc.buaa.edu.cn/cas-login?token=` 一次，但忽略结果；该请求不是必需步骤，可作为最后的兜底尝试。

HAR 未导出 Cookie；若真实请求在只带 `auth_token` 时返回会话失效，需要重新评估是否补充 Cookie。

#### 2.3.4 阳光 uid + token

1. `GET https://app.buaa.edu.cn/uc/api/oauth/index?redirect=https%3A%2F%2Fygdk.buaa.edu.cn%2F%23%2Fhome&appid=200230221144501510&state=STATE&qrcode=1`
   - 手动跟随跳转，最多 10 次。
   - 在任意一跳的 URL 或 `Location` 中取 `code` 查询参数。
2. `GET https://ygdk.buaa.edu.cn/api/Front/Clockin/User/campusAppLogin?code=<code>`
   - 注意：这是 `GET`，不是表单 `POST`；与本文件 5.2 的业务接口不同。
3. 响应 `{ "code": 1, "result": ... }`，`result` 可能是 `{ "data": { "uid": 123, "token": "..." } }`，也可能直接是 `{ "uid": ..., "token": ... }`。
   - `uid`：十进制整数。
   - `token`：URL 编码字符串，取出后解码一次。
4. 用 `Classify/getList` 与 `Clockin/getCount` 校验；`code === -98` 表示认证失效。

### 2.4 错误判定

| 上游现象 | 含义 |
| --- | --- |
| 登录页含 `tip-text`、`#errorDiv`、`.errors` 文案 | 账号、密码或验证码错误；以页面文案为准 |
| 提交后仍返回含 `input name="execution"` 的登录页 | 凭据未被接受 |
| URL 含 `exception.message=` | 登录异常，取参数值作为提示 |
| HTTP 401 | 未认证或凭据错误 |
| 登录页出现 `continueForm`、`ignoreAndContinue`、`账号存在安全风险`、`密码过期` | 需要用户处理密码过期或安全风险；三阶段中止登录并提示用户，不自动提交 `ignoreAndContinue` |
| 响应为 HTML 登录页、非 JSON | 会话失效，不是业务数据为空 |
| 5xx、连接失败、超时 | 上游或网络失败，可重试 |

验证码错误与账号密码错误要分开提示：验证码错误时保留学号，刷新验证码后可直接重试，不要求重新输入密码。

### 2.5 三阶段不做的认证能力

- WebVPN 与校外加密接入；不提供连接模式选择。
- 注册、找回密码、修改密码。
- 验证码识别、自动填写或第三方打码。
- 多用户、账号切换、云端同步。
- 除登录、登出、验证码、会话状态外的认证类写操作。

## 3. SPOC

### 3.1 认证

HAR 中所有 SPOC 业务请求都带以下两个请求头，且 **没有 Cookie 请求头**（HAR 的 `cookies` 为空）：

- `Token: Inco-<token>`
- `RoleCode: <jsdm>`，HAR 中为 `01`
- `X-Requested-With: XMLHttpRequest`

因此 SPOC 的凭据不是 Cookie，而是 **Token + RoleCode**。三阶段由中继统一登录后派生：

1. `GET https://spoc.buaa.edu.cn/spocnewht/cas`，跟随跳转，从 `/spocnew/cas?token=...&refreshToken=...` 中取 `token`。
2. `POST https://spoc.buaa.edu.cn/spocnewht/sys/casLogin`，请求头 `Token: Inco-<token>`，请求体 `{ "token": "<token>" }`，返回 `content.jsdm` 作为 `RoleCode`。

派生细节与失败回退见 2.3.2；中继保存派生值，前端不再持有。

响应信封：`{ "code": 200, "msg": null, "msg_en": null, "content": ... }`；`content` 可能为 `null`。

### 3.2 接口

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

### 3.3 字段映射

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

## 4. 博雅课程（bykc）

### 4.1 认证与加密

- 基址：`https://bykc.buaa.edu.cn/sscv/`。
- 浏览器完成 CAS 后最终跳到 `https://bykc.buaa.edu.cn/cas-login?token=<auth_token>`；`token` 即业务请求使用的 `auth_token`。三阶段由中继统一登录后从跳转链派生，见 2.3.3。
- 业务请求使用 `POST`，请求头：
  - `Accept: application/json`
  - `Content-Type: application/json;charset=UTF-8`
  - `Origin: https://bykc.buaa.edu.cn`
  - `Referer: https://bykc.buaa.edu.cn/system/course-select`
  - `auth_token: <token>`
  - `authtoken: <token>`（与 `auth_token` 同值）
  - `ak`、`sk`、`ts`
- 参考 B 固定使用 `/system/course-select` 作为 `Referer`；HAR 中不同页面分别为 `/system/home`、`/system/course-mine`，说明该值不严格。
- 本项目只发送 `auth_token`，不发送额外 Cookie。HAR 的 `cookies` 为空且没有 `cookie` 请求头，但 HAR 未导出 Cookie，因此“仅 `auth_token` 可用”仍需真实联调确认。

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

### 4.2 接口

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

### 4.3 状态与字段映射

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

## 5. 阳光打卡（ygdk）

### 5.1 认证

- 基址：`https://ygdk.buaa.edu.cn/api`。
- 业务请求全部为 `POST application/x-www-form-urlencoded; charset=UTF-8`。
- 表单固定追加 `uid`、`token`；`uid` 为十进制整数。
- 请求头：`X-Requested-With: XMLHttpRequest`。
- `uid` / `token` 只放表单，不放 URL。
- 三阶段由中继统一登录后派生，见 2.3.4；不再由用户手动填写。
- 响应：`{ "code": 1, "result": ... }`；`code === -98` 表示认证失效；其他 `code` 为业务错误。

### 5.2 接口

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

### 5.3 字段映射

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

## 6. 本项目实际调用

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
| 统一登录预加载（`/settings`） | `POST /api/auth/preload` | `sso/login`（含验证码配置）→ `sso/captcha`（按需） |
| 统一登录提交（`/settings`） | `POST /api/auth/login` | `sso/login` 提交 → UC 激活 → UC status；四源派生在后台继续 |
| 登录状态（`/settings`） | `GET /api/auth/status` | `uc/status`（仅 `?validate=1`） |
| 退出登录（`/settings`） | `POST /api/auth/logout` | `sso/logout` → 清除本地凭据 |
| 单源重试（`/settings`、卡片） | `POST /api/auth/sources/:source/retry` | 对应源派生链 |
| 认证状态（`/settings`） | `GET /api/byxt/status`、`GET /api/spoc/status`、`GET /api/bykc/status` | `currentUser`、`queryOne`（失败回退 `queryList`）、`getUserProfile` |
| 阳光认证校验（`/settings`） | `GET /api/ygdk/overview` | `Classify/getList` → `Clockin/getCount` |

- 统一登录相关路由的方法与请求/响应以 `docs/trd-phase3.md` 为准；业务数据路由仍只读 `GET`。
- SPOC 请求头由中继注入 `Token` 与 `RoleCode`，不发送 Cookie。
- 博雅请求头由中继注入 `auth_token`（同时发送 `auth_token` 与 `authtoken`），不发送额外 Cookie。
- 阳光请求头只带 `X-Requested-With`；`uid`、`token` 由中继放入表单，不放入 URL。
- 前端不再发送任何凭据请求头；凭据由中继按当前登录会话注入。
- 背景目录的 `GET /api/background`、`GET /api/background/image`、`POST /api/background/directory`、`POST /api/background/rescan` 属于本机文件系统能力，不是北航上游接口；设计见 `docs/trd-phase3.md` 3.3，不列入本表上游调用。

### 6.1 本机中继扩展

以下路径由本项目本地中继提供，不是北航上游接口；请求/响应细节以 `docs/trd-phase3.md` 为准。

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/auth/preload` | `POST` | 获取登录页验证码与本次登录尝试 |
| `/api/auth/login` | `POST` | 提交学号、密码、验证码，完成 SSO 与 UC 登录 |
| `/api/auth/status` | `GET` | 读取登录状态与四源派生状态 |
| `/api/auth/sources/:source/retry` | `POST` | 重试单个数据源派生 |
| `/api/auth/logout` | `POST` | 退出登录并清除中继凭据 |
| `/api/background` | `GET` | 读取背景目录与图片清单 |
| `/api/background/image` | `GET` | 读取指定图片字节 |
| `/api/background/directory` | `POST` | 保存或清除背景目录 |
| `/api/background/rescan` | `POST` | 重新扫描背景目录 |

- 除上述 `POST` 外，业务数据接口仍只接受 `GET`；未列路径返回 `404`。
- 所有路径只监听 `127.0.0.1`，并校验 Host；前端不接触上游地址。

## 7. 未确定与不在本期范围

- 统一认证没有原始登录 HAR；SSO 登录页结构、验证码配置与错误文案来自参考 B 与登录审计文档。若学校更新页面，需重新提供登录 HAR。
- 验证码只处理图片类型；若上游改成滑块、点选或第三方验证码，三阶段不实现。
- 参考 B 会在一处密码过期/安全风险页面提交 `_eventId=ignoreAndContinue` 跳过；三阶段已确认中止并提示用户处理，不自动跳过。
- byxt Cookie 依赖跟随 `byxt → SSO → byxt` 的票据链；参考 B 不额外访问 byxt 首页，真实联调若拿不到 Cookie，需补一次首页访问。
- 博雅“仅 `auth_token` 可用”尚未被 HAR 最终证明：`private/har/sscv` 的 `cookies` 为空且无 `cookie` 头，但 Cookie 未导出；若真实请求返回认证失效，需重新评估是否增加可选 Cookie 字段。
- 博雅响应是加密的；HAR 无法离线解密响应体，课程字段与状态判定来自参考 B 的模型、业务代码与测试，真实响应需联调验证。
- 博雅 `Referer` 在 HAR 中随页面变化（`/system/home`、`/system/course-mine`），参考 B 固定为 `/system/course-select`；实现按固定值，若上游拒绝再调整。
- 阳光没有 HAR；路径、表单字段与响应结构来自参考 B，真实联调需验证。
- 阳光 `weekTarget` 系统值仅作参考；本项目按 PRD 使用用户设置。
- 考试接口日期/时间的实际字符串格式（参考 B 未固定，代码按多格式兼容）。
- 研究生 GSMIS 课表不在本期范围。
- 博雅选课/退课/签到、阳光打卡/上传、SPOC 提交/附件下载均不在本期范围。
- WebVPN、注册/找回密码/修改密码、验证码识别不在本期范围。
