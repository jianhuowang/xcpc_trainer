# XCPC Trainer Coach 隐私政策页设计

**日期：** 2026-09-01  
**状态：** 已批准，待实施

## 1. 目标

为 Custom GPT Action 提供稳定、公开、与 Trainer 同域的隐私政策地址：
`https://xcpc-trainer.whjjswhj.chatgpt.site/privacy`。

页面必须可以匿名读取，同时不能放宽 Dashboard、数据 API、导入或导出的所有者鉴权。

## 2. 实现边界

- 新增公开 `GET /privacy` Route Handler，直接返回静态 HTML。
- 不复用当前受所有者鉴权保护的 Root Layout，避免为了一个公开页面改动全局鉴权判断。
- 不读取数据库、环境变量、用户会话或训练数据。
- 不新增依赖、Cookie、分析追踪、数据表或 migration。
- 不修改确定性排程、盲做白名单、v5 导入导出或既有迁移历史。

## 3. 页面内容

隐私政策使用简体中文，保留必要的英文协议名和字段名，至少说明：

1. Coach 通过三个受限 Actions 读取安全训练上下文、切换用户明确选择的模式，以及在用户确认后提交训练证据。
2. 写入 Action 只接收 `problemId`、`evidence`、`helpLevel`、可选 `notes` 与幂等键；服务端自行计算排程。
3. Trainer 保存训练记录以提供复习和导出，不出售数据，不用于广告。
4. `AGENT_API_KEY` 只用于 Action 鉴权，不进入数据库、导出、notes 或应用日志。
5. 应用不额外添加分析追踪；托管和身份平台可能按其自身政策处理必要的技术元数据。
6. 数据由站点所有者管理，可通过 Trainer 导出；删除请求由站点所有者处理。
7. 技术问题通过 GitHub Issues 联系，且不得在公开 Issue 中粘贴密钥或敏感训练内容。

页面显示生效日期，并链接到项目 GitHub 仓库。

## 4. 响应与呈现

- `GET /privacy` 返回 `200` 和 `Content-Type: text/html; charset=utf-8`。
- 使用内联、无脚本的基础 CSS，保持窄版可读布局和移动端可访问性。
- 页面不加载第三方资源，不提供表单，也不执行客户端 JavaScript。

## 5. 验证

1. 契约测试直接调用 Route Handler，断言状态码、HTML Content-Type 和关键隐私声明。
2. `npm test`、`npm run lint` 与 `git diff --check` 全部通过。
3. 部署后匿名请求 `/privacy` 返回 `200 text/html`。
4. 现有匿名 Dashboard/API 鉴权测试保持通过，证明公开隐私页没有扩大数据访问面。

## 6. 非目标

- 不建设通用法律文档系统、CMS、联系表单或同意管理。
- 不为 Custom GPT 建立 OAuth；继续使用现有 Bearer API Key。
- 不改变训练数据保留周期或增加自动删除任务。
