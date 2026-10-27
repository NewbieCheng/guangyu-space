# 光域空间

光域空间是一款面向 OPC 和一人公司的个人经营管理工具。客户、合作方、项目、任务、订单、收入、资料、经验、产品和复盘都归属于独立账号；经用户授权的 Agent 可通过受限 API 读写同一份经营簿。

当前版本：v0.1.0，本地验收版。应用只运行 Web 服务，不启用框架中的收费、营销、邮件、AI、分析或云存储模块。业务数据使用 PostgreSQL 16，登录限流和 Agent 凭据使用 Redis 7。

## 本地启动

需要 Node.js 22、Corepack、Docker Desktop 和 Docker Compose。Mac 与 Windows 使用同一套 Node.js、PostgreSQL、Redis、数据库迁移和 Web/API 契约。

1. 在仓库根目录复制 `.env.example` 为 `.env`。
2. 将 `AUTH_SECRET` 替换为至少 32 字节的随机密钥。Mac/Linux 可运行 `openssl rand -base64 48`；Windows PowerShell 可运行 `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`。
3. 在仓库根目录启动数据库和 Redis：

   ```sh
   docker compose -f docker-compose.yml -f compose.local.yml up -d postgres redis
   ```

4. 安装依赖、部署迁移并启动 Web：

   ```sh
   corepack pnpm install --frozen-lockfile
   corepack pnpm db:migrate
   corepack pnpm dev
   ```

5. 打开 [http://localhost:3000](http://localhost:3000)，注册一个用户名和密码即可进入自己的空白经营簿。第一版没有预置用户或演示数据。

Windows 可先编辑 `.env`，再运行 [`scripts/start-local-windows.bat`](./scripts/start-local-windows.bat)。它会启动本机 PostgreSQL/Redis、安装锁定依赖、部署迁移并运行 Web 开发服务器。按 `Ctrl+C` 停止 Web；数据库与 Redis 容器继续运行。停止容器但保留数据：

```sh
docker compose -f docker-compose.yml -f compose.local.yml down
```

不要添加 `--volumes`，除非明确要永久删除本地数据库。

## 当前功能

- 用户名和密码注册、登录、修改密码及会话/Agent 授权撤销。
- 客户、合作方、项目、任务、订单、收入、资料、经验、产品、复盘及相关沟通和日志。
- 按账号隔离的数据读写、软删除与恢复、版本冲突检测、幂等写入、审计和业务编号。
- Agent API 凭据可设范围、到期时间并随时撤销；密钥只在签发时显示一次。
- 个人备份下载、恢复前保护快照和二次确认恢复。
- 网页链接、Obsidian 链接和本机文件/文件夹资料指针。

Agent API、备份格式、运维路径及本机工具安装步骤见 [`docs/本地部署与安全运维.md`](./docs/本地部署与安全运维.md) 和 [`docs/Agent-API.md`](./docs/Agent-API.md)。产品字段以 [`docs/第一版功能需求整合.md`](./docs/第一版功能需求整合.md)、[`docs/模块与字段命名清单.md`](./docs/模块与字段命名清单.md) 和 [`docs/产品设计文档.md`](./docs/产品设计文档.md) 为准。

## 安全与部署边界

本地开发配置只监听回环地址。对外部署前必须设置独立的强密钥、数据库/Redis 凭据、HTTPS、反向代理与持久化卷，并按运维文档配置数据库日备份和恢复演练。不要把 `.env`、备份文件或真实业务数据提交到仓库。本工作区提供部署说明和 Windows 源码，不表示已经在 Windows 或生产环境验收。
