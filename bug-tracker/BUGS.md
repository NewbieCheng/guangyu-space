# Bug 台账

## 项目管理

- 历史保留 Bug 编号：无
- 历史保留批次编号：无
- 下一个可用 Bug 编号：BUG-009
- 下一个可用批次编号：BATCH-001

## BUG-001｜新增客户及项目关联时被强制要求选择关联项

- 模块：客户、项目及项目关联
- 优先级：待补充
- 状态：待复测
- 发现日期：2026-10-15
- 问题描述：用户报告称，在新增客户和新增合作项目时，只要项目列表中已有项目，就会被强制选择关联。用户要求项目关联交互和规则参考 demo。
- 复现步骤：
  1. 打开新增客户或新增合作方表单，检查是否要求从现有项目中选择关联项。
  2. 新建或编辑项目，在项目表单中检查「关联客户」「关联合作方」是否可以留空、搜索、选择和清空。
  3. 查看客户及合作方列表，确认「关联项目」显示由项目关系汇总的关联数量。
- 预期结果：客户、合作方新增和编辑表单不出现项目选择字段或次级信息区。项目表单负责维护关联客户与关联合作方，两个关联项均为可搜索、可清空的选填多选。客户及合作方列表从项目侧关系读取关联项目 ID 并显示数量。Demo 的产品设计快照 `产品设计快照.md` §5.1–5.2 将项目列为关联与自动展示、未列入客户和合作方录入字段；§6.1 说明项目可以关联客户、合作方和订单。对应实际代码为 `src/renderer/App.tsx` 的 `FieldSet`、`columnsFor`，以及 `src/main/business-service.ts` 的校验、记录映射与 `setRelations`；API 字段表见 `docs/AGENT_API.md`。
- 实际结果：当前网页在客户、合作方表单中提供可编辑的 `projectIds` 并将其放在「次级信息」区；服务端创建和更新校验也接受从客户、合作方反向写入项目关系。项目侧已有可选关联字段，列表读模型也能从关系表推导项目 ID。上一轮只改善了多选控件，没有移除客户／合作方表单中的项目关联入口和反向写入入口，因此未符合当前明确的关系维护方向。
- 报错及证据：目前仅有文字反馈，无截图或日志；未保存附件。
- 关联 Bug：无
- 修复批次：无
- 根因分析：客户／合作方与项目之间的关系本应由项目侧维护，客户和合作方的项目数应是从项目关系派生的只读信息。网页为客户、合作方表单暴露了反向的 `projectIds` 维护入口，且 API schema 接受对应写入，造成关系所有权和 demo 不一致。上一轮只改善了通用多选的搜索、清空交互，未修正关系维护方向。
- 修复记录：移除客户和合作方新增、编辑表单中的项目关联字段与「次级信息」区。服务端严格 schema 不再接受客户或合作方传入 `projectIds`，关系写入映射与 join row 生成只允许从项目记录写入关联客户和合作方；列表及详情继续从项目关系派生客户、合作方的 `projectIds`。抽离纯关系映射和 schema 后新增定向回归测试。同步更正项目需求清单中 R08、R10 的旧描述。涉及：`docs/总需求维护清单.md`、`src/modules/guangyu-space/components/workspace.tsx`、`src/modules/guangyu-space/server/records.ts`、`src/modules/guangyu-space/server/record-relations.ts`、`src/modules/guangyu-space/server/record-schemas.ts`、相应测试文件及 `src/styles/guangyu-space.css`。
- 自动化测试结果：`node --import tsx --test src/modules/guangyu-space/multi-select.test.ts src/modules/guangyu-space/server/record-relations.test.ts src/modules/guangyu-space/server/record-schemas.test.ts` 通过（8 项）；`./node_modules/.bin/tsc --noEmit` 通过；`./node_modules/.bin/eslint` 涉及文件通过；`./node_modules/.bin/eslint .` 通过；`NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/next build` 通过；`git diff --check` 通过。首次调用 `pnpm` 因 Corepack 写入 `/Users/yehn/.cache/node/corepack` 被受限权限拒绝，随后使用仓库本地二进制完成等价检查。；新增 helper、schema 与测试文件的本地 Prettier 检查通过。
- 人工验收结果：在 `http://localhost:3003/space?tab=customers` 打开新增客户，表单无「关联项目」和「次级信息」；合作方新增表单同样没有项目字段。客户表中现有验收数据显示「1 个」关联项目。打开 `http://localhost:3003/space?tab=projects` 的新增项目，关联客户及合作方均显示「可留空」；搜索现有验收客户、勾选后出现已选项、移除后恢复空选。仅操作表单草稿并关闭/保留未提交状态，未新增、编辑或提交实际业务数据。等待用户复测。
- 状态记录：2026-10-15：首次记录，待分析；2026-10-15：待分析 → 修复中，用户明确授权分析并修复；2026-10-15：修复中 → 待复测，初次交互调整后待人工复测；2026-10-15：待复测 → 修复中，用户澄清关系应由项目侧维护并要求按 demo PRD 与代码重新核对；2026-10-15：修复中 → 待复测，关系方向、schema 和界面修复完成，适用自动化及本机界面检查通过。

## BUG-002｜新增客户请求被来源校验拒绝

- 模块：客户管理 API、安全来源校验
- 优先级：待补充
- 状态：已关闭
- 发现日期：2026-10-15
- 问题描述：用户报告在新增客户表单中仅填写客户名称并保存时，页面提示「请求来源无效」，记录无法保存。
- 复现步骤：
  1. 打开客户管理并新增客户。
  2. 仅填写必填的客户名称并保存。
  3. 检查保存响应和页面错误提示。
- 预期结果：同站点来源的客户创建请求通过来源校验，并按表单字段校验结果保存或返回对应字段错误。
- 实际结果：修复前，客户创建请求被判定为来源无效，返回 403，未进入用户身份和记录字段校验。
- 报错及证据：页面提示「请求来源无效」。修复前本机对 `/api/ledger/v1/customers` 的只读来源校验探测中，向 3000 端口发送匹配来源后返回预期的 401 未登录；向 3003 端口发送匹配来源却返回 403 `INVALID_ORIGIN`。探测没有创建或修改记录。
- 关联 Bug：无
- 修复批次：无
- 根因分析：已确认。来源校验只比较浏览器 `Origin` 与 Next 请求 URL 的 origin；在 3003 本机服务路径中，请求 URL 使用的地址与浏览器公开访问地址不一致，导致合法同源请求被拒。项目已提供 `APP_URL` 作为公开地址配置，但来源校验此前没有使用它，也没有考虑请求的公开 `Host`。
- 修复记录：来源校验现在接受与请求 URL、请求 `Host` 或配置的 `APP_URL` 相符的 HTTP(S) 来源；其他、缺失或格式错误来源仍拒绝。涉及 `src/modules/guangyu-space/server/context.ts`、`src/modules/guangyu-space/server/request-origin.ts` 和对应测试。
- 自动化测试结果：`./node_modules/.bin/tsx --test src/modules/guangyu-space/server/request-origin.test.ts` 通过（5 项）；`./node_modules/.bin/tsc --noEmit`、相关文件 ESLint、全量 ESLint、Next.js build 和新增 helper/test 的 Prettier 检查均通过；`git diff --check` 通过。3003 同源只读 API 探测现在进入身份校验并返回 401 未登录；不同来源仍返回 403。未提交或修改客户记录。
- 人工验收结果：用户确认核心功能已无问题，并转入页面 UI 细节调整；客户仅填写名称即可保存的核心路径验收通过。
- 状态记录：2026-10-15：首次记录，待分析；2026-10-15：待分析 → 修复中，按用户在本对话中的 Bug 修复授权开始排查与修复；2026-10-15：修复中 → 待复测，来源校验修复及自动化验证完成，等待用户验证客户保存；2026-10-15：待复测 → 已关闭，用户确认核心功能无问题。

## BUG-003｜客户管理页侧栏 Logo 未显示

- 模块：工作台侧栏、静态资源
- 优先级：待补充
- 状态：待复测
- 发现日期：2026-10-15
- 问题描述：用户截图显示客户管理页面左上角品牌 Logo 显示为破损图片。
- 复现步骤：在本机 3003 端口打开客户管理页面并查看侧栏顶部品牌 Logo。
- 预期结果：侧栏显示项目现有光域空间品牌 Logo。
- 实际结果：本机 standalone 测试服务的 `/brand/guangyu-logo-full.png` 返回 404，浏览器显示破损图片。
- 根因分析：项目源文件 `public/brand/guangyu-logo-full.png` 存在，Dockerfile.web 也会将 `public` 复制进镜像；之前启动本机 standalone 测试服务时未把 `public` 一并复制到 standalone 输出目录。
- 修复记录：将现有 `public` 资源补入本机 standalone 验收目录，恢复 Logo 请求。未替换品牌图，也未改变页面组件。
- 自动化测试结果：修复前资源端点返回 404；将现有 `public` 复制到 standalone 验收目录后，`/brand/guangyu-logo-full.png` 返回 HTTP 200（PNG，885001 字节）。Docker 打包路径由 Dockerfile.web 的 `COPY public ./public` 覆盖。
- 人工验收结果：本机客户管理页刷新后已显示现有品牌 Logo；等待用户复测。
- 状态记录：2026-10-15：首次记录并开始修复；2026-10-15：修复完成，待复测。

## BUG-004｜客户列表首字段过于贴近卡片左边框

- 模块：客户管理列表表格
- 优先级：待补充
- 状态：已关闭
- 发现日期：2026-10-15
- 问题描述：客户管理表格首字段内容与卡片左边框距离过近。
- 预期结果：表格首字段与卡片左边框保持协调留白，不改变业务列表卡片整体位置。
- 修复记录：之前误将问题理解为整页留白不足，现已撤回整页偏移；首列单元格左侧内边距调整为 28px。涉及 `src/modules/guangyu-space/components/workspace.tsx`、`src/styles/guangyu-space.css`。
- 自动化测试结果：本轮 ESLint、TypeScript 检查、Next.js production build、`git diff --check` 和 Prettier 检查通过；未新增布局测试。
- 人工验收结果：用户确认当前批次验收通过。
- 状态记录：2026-10-15：记录并修复；2026-10-15：用户澄清需求后改为只调整表格字段与卡片边框的距离；第三轮修复完成并通过用户验收，已关闭。

## BUG-005｜客户列表末字段与卡片右边框距离过宽

- 模块：客户管理列表表格
- 优先级：待补充
- 状态：已关闭
- 发现日期：2026-10-15
- 问题描述：客户管理表格末字段内容距离卡片右边框过远。
- 预期结果：末字段与卡片右边框保持与首字段近似的内边距，不改变业务列表卡片整体位置。
- 修复记录：之前误将问题理解为整页留白过宽，现已撤回整页偏移；末字段右对齐并设置 28px 右侧内边距。涉及 `src/modules/guangyu-space/components/workspace.tsx`、`src/styles/guangyu-space.css`。
- 自动化测试结果：本轮 ESLint、TypeScript 检查、Next.js production build、`git diff --check` 和 Prettier 检查通过；未新增布局测试。
- 人工验收结果：用户确认当前批次验收通过。
- 状态记录：2026-10-15：记录并修复；2026-10-15：用户澄清需求后改为只调整表格字段与卡片边框的距离；第三轮修复完成并通过用户验收，已关闭。

## BUG-006｜工作台全局样式未加载导致页面排版异常

- 模块：工作台、全局样式与本机开发服务
- 优先级：待补充
- 状态：待复测
- 发现日期：2026-10-15
- 问题描述：用户截图显示工作台回退到浏览器默认排版，导航纵向展开，顶部品牌图按原尺寸占据页面。
- 复现步骤：在已登录的 Chrome 中打开 `http://127.0.0.1:3100/space?tab=projects`，查看工作台布局。
- 预期结果：页面加载全局样式，导航、横幅和工作区按现有工作台布局显示。
- 实际结果：原 3100 开发服务引用的 CSS 返回 HTTP 404，导致页面回退到浏览器默认排版。重新构建并切换到本机 production preview 后，登录页已加载两份 CSS，页面样式恢复；任务工作台路由需要用户重新登录后人工复测。
- 报错及证据：用户在本对话提供的截图；对 Chrome 当前页面及本机 3100 端口只读检查确认样式表 404。截图未复制进项目，以避免保存浏览器其他标签信息。
- 关联 Bug：无。BUG-003 仅涉及 standalone 服务遗漏品牌图片，与本问题的全局 CSS 404 不同。
- 修复批次：无
- 根因分析：已确认原 3100 Turbopack 开发服务引用了不存在的 CSS 资源；具体原因尚未证实。Turbopack 开发模式另出现 Watchpack `EMFILE: too many open files, watch`；改用 webpack 开发模式并启用 Watchpack polling 后，服务正常启动且 CSS 返回 HTTP 200。
- 修复记录：停止并行的旧 Next.js 服务，将原本被忽略的 `.next` 构建目录完整保存在 `/private/tmp/farmledger-next-backup-20261015-1205`，先通过干净构建恢复 production preview，再切换至 `AUTH_URL=http://127.0.0.1:3100 WATCHPACK_POLLING=true next dev -p 3100` 供本机验收。未改动业务源代码，也未删除原构建目录备份。
- 自动化测试结果：`NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/next build` 通过；production preview 的 CSS 与品牌图片均返回 HTTP 200。当前开发服务登录页 CSS 返回 HTTP 200；`/api/auth/providers` 指向 `localhost:3100`，PostgreSQL `SELECT 1` 成功。Turbopack 文件监听问题仍待单独定位，任务页已登录状态待用户人工复测。
- 人工验收结果：待补充
- 状态记录：2026-10-15：首次记录并开始修复；2026-10-15：干净构建恢复 CSS；随后使用 webpack 加 polling 启动开发服务，等待用户登录后复测工作台排版。

## BUG-007｜本机 production preview 登录因 Redis 未启动而失败

- 模块：本机开发服务、登录限流
- 优先级：待补充
- 状态：待复测
- 发现日期：2026-10-15
- 问题描述：用户在 3100 端口登录时收到“登录服务暂时不可用”提示。
- 复现步骤：使用 production preview 打开登录页并提交有效登录信息。
- 预期结果：本机测试账号通过认证后进入工作台。
- 实际结果：production 模式的认证限流器连接 `.env` 指定的 Redis `127.0.0.1:56380` 失败，返回 `ECONNREFUSED`，登录被限流依赖错误拦截。
- 根因分析：项目生产模式登录限流必须使用 Redis；本机 Redis 未启动，当前环境也没有 Docker CLI 或已安装的 Redis 服务。PostgreSQL 可连接。
- 修复记录：停止依赖 Redis 的 production preview，改用项目既有开发模式的内存限流，并启用 Watchpack polling；同时把认证服务地址绑定在 3100 端口。没有绕过账号密码校验，也没有修改认证代码或业务数据。
- 自动化测试结果：Redis 探测确认 `ECONNREFUSED`；PostgreSQL `SELECT 1` 成功；开发模式已 Ready，登录页 HTTP 200、CSS HTTP 200，认证 provider URL 指向 `localhost:3100`。未代用户提交账号密码。
- 人工验收结果：待用户在 `http://localhost:3100/login` 重新登录验证。
- 状态记录：2026-10-15：发现并定位；2026-10-15：切换本机开发模式恢复可登录条件，待用户复测；2026-10-16：用户确认在 3106 注册页填写用户名和密码后收到注册服务不可用提示；同源空请求复现 HTTP 503，`127.0.0.1:56380` TCP 探测为 `ECONNREFUSED`，确认注册和登录受同一 Redis 限流依赖故障影响。为继续本机验收，使用隔离的临时构建目录启动 3107 开发预览；注册页 HTTP 200，认证 providers HTTP 200，空请求进入字段校验并返回 HTTP 400。未提交用户账号或密码，生产预览 3106 保持运行。

## BUG-008｜登录成功后按钮提前恢复为“登录”

- 模块：光域空间登录与注册
- 优先级：待补充
- 状态：待复测
- 发现日期：2026-10-16
- 问题描述：用户使用有效账号密码登录时，按钮先显示“正在处理…”，随后提前恢复为“登录”；再等待约 1–2 秒才进入工作台。
- 复现步骤：在 `/login` 填写有效用户名和密码并提交，观察凭证验证成功后到 `/space` 页面切换前的按钮状态。
- 预期结果：成功登录后的按钮继续显示处理中并保持禁用，直到离开认证页面进入工作台。
- 实际结果：`router.replace("/space")` 发起客户端导航后，`finally` 立即清除了 busy 状态；路由内容仍在加载时按钮恢复可点击。
- 根因分析：登录请求 Promise 已完成，但 App Router 导航是异步的；组件原先在请求完成时无条件执行 `setBusy(false)`。
- 修复记录：认证失败或注册错误时仍清除 busy；成功后保持 busy，让页面导航完成并卸载认证组件。登录请求、校验、会话处理和目标路由均未更改。
- 自动化测试结果：待复测；未新增测试。
- 人工验收结果：待用户复测。
- 状态记录：2026-10-16：用户反馈并定位；调整成功导航期间的 busy 状态，待用户复测。
