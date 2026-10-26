## 项目目标与边界

- 项目名：航启
- 周期为一周的课设，未来可能成为自用软件
- **单用户**浏览器主页，有**只读**聚合北京航空航天大学教务信息、快捷入口、待办、番茄钟功能
- 前端 SPA，无 SSR，通过本地后端作为中继访问北京航空航天大学教务系统
- 教务聚合功能是**只读聚合**，仅作查询展示，不进行包括写入、提交、打卡在内的各类自动化操作
- 适当对桌面端进行响应式设计，不做移动端适配

## 技术栈

- 框架：Vue 3（Composition API + `<script setup lang="ts">`），禁止引入 React
- 构建：Vite（npm create vite@latest . -- --template vue-ts）
- 语言：TypeScript strict
- 样式：Tailwind CSS
- 路由：Vue Router 4
- 状态：课设阶段使用简单的 reactive composable，不引入 Pinia
- HTTP：fetch，统一封装在 src/api/client.ts
- 包管理器：npm

## 原则

- 禁止执行任何 Git 命令（包括只读命令）
- 除非用户明确要求，禁止修改 `docs/` 文件夹内容
	- 生成文档或规范时，禁止引入复杂的结构、编码或规范体系，按最简方式列出功能列表、数据结构、代码规范等即可
- 涉及新增功能，先查阅 PRD / TRD 中相应条目
	- 不存在或与用户请求冲突时，停止生成并要求用户确认需求
	- 存在时，依据 PRD / TRD 编写，不确定处向用户提问，而非自行生成
- 涉及 UI 布局，以 `docs/ui-lowfi.md` 作为唯一事实标准
	- `docs/ui-lowfi.md` 中不存在所需 UI 说明时，立即向用户提问确认，而非自行生成
- 北京航空航天大学网络认证和 API 逻辑来源
	- 首选分析参考源码
	- 不能从参考源码确定的，停止生成并要求用户提供相关的访问 HAR

## 目录结构

- `docs/ui-lowfi.md`：UI 低保真文字方案，作为本项目唯一的 UI 布局参考标准
- `docs/prd.md`：按最简方式列出的需求清单及简要验收标准
- `docs/trd.md`：按最简方式列出的技术设计方式
- `docs/api.md`：北京航空航天大学网络系统 API，来源可以是参考源码或用户提供的 HAR
- `private/har`：存放用户提供的 HAR
- `src/`：源码目录，细则见下表

|目录|只放什么|不放什么|
|---|---|---|
|`views/`|路由页面、页面级组合|通用组件、纯工具函数、直接 `fetch`|
|`components/`|可复用展示组件，props 输入、emits 输出|页面级路由逻辑、`fetch`、localStorage|
|`composables/`|模块级单例状态、业务逻辑、缓存流程|UI 模板、直接 `fetch`、全局单例外的状态|
|`api/`|中继接口映射、请求头、错误转换|UI 状态、缓存读写、业务排序|
|`utils/`|无 Vue 依赖的纯函数与浏览器适配|组件、路由、网络请求|
|`server/`|上游调用、归一化、白名单路由|前端代码、任意 URL 转发、写操作|
|`assets/`|仓库内置静态资源|外链背景、远程字体|

## 参考源码

- 参考 A
	- 路径
		- `E:\Public\14122`
		- `http://localhost:14122/start.html`
	- 技术栈：ASP + 原生 JavaScript，由 IIS 部署在本机
	- 功能：用户手动提供 Cookie，本地化未来 5 日课表并展示近 2 日
	- 已知问题：单次提供的 Cookie 生命周期短，需要频繁提供 Cookie 以更新课表
	- 约束：不允许写入，允许将代码引入本项目仓库，但涉及引入必须转写成 TypeScript 形式
- 参考 B
	- 路径
		- `E:\repositories\BUAASubnet\UBAA`
	- 技术栈：Kotlin Android Compose
	- 功能：用户提供用户名及密码，选择连接方式，App 自动获取、聚合多种信息
	- 约束：不允许写入或以任何形式将代码引入本项目仓库