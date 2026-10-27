# 光域空间 Agent API v1

Agent API 与网页登录共用同一份个人经营簿。访问必须使用用户在“账号设置 → Agent 授权”中签发的 Bearer 凭据；每个凭据具有独立范围、到期时间和撤销状态。

## 凭据

- 新建凭据时设置名称、1–365 天有效期和至少一个授权范围；一个账号最多保留 20 个未撤销且未到期的凭据。
- 凭据形如 `gya_…`，仅签发时返回完整密钥。服务端只保存 SHA-256 摘要，列表只返回短前缀。
- 撤销后立即拒绝后续请求。修改密码、管理员重置密码或恢复备份也会撤销现有 Agent 凭据。
- 只通过 HTTPS 请求头传递密钥，不放入 URL、浏览器地址、源码、日志或第三方 Agent 的公开配置中。

请求头示例：

```http
Authorization: Bearer gya_签发时显示的完整密钥
Content-Type: application/json
Idempotency-Key: 一次业务操作使用的随机唯一值
```

## 授权范围

| 范围 | 能力 |
|---|---|
| `read:summary` | 读取经营汇总 |
| `read:records` | 读取记录、详情、沟通记录、项目日志和资料链接 |
| `write:records` | 创建、更新、软删除和恢复业务记录 |
| `append:communications` | 为客户或合作方追加沟通记录 |
| `append:project-logs` | 为项目追加日志 |
| `tasks:complete` | 完成或撤销任务完成状态 |
| `tasks:history` | 查询已完成任务历史 |

服务端逐请求核对凭据摘要、有效期、撤销状态、账号状态、账号授权版本、经营簿状态、成员关系和所需范围。缺少范围时返回 403；失效或撤销返回 401。

## 路径

根路径为 `/api/agent/v1`。以下路径都需要 `Authorization: Bearer …`，除公开健康检查外。

| 方法 | 路径 | 所需范围 | 说明 |
|---|---|---|---|
| GET | `/health` | 无 | 仅返回服务状态、API 版本和时间，不暴露环境信息 |
| GET | `/summary` | `read:summary` | 经营总览 |
| GET | `/{resource}` | `read:records` | 记录列表；支持 `q`、白名单筛选、`sort`、`order`、`page`、`pageSize` |
| GET | `/{resource}/{id}` | `read:records` | 读取详情；`includeDeleted=true` 可查找本人已删除记录 |
| POST | `/{resource}` | `write:records` | 创建记录；必须带 `Idempotency-Key` |
| PATCH | `/{resource}/{id}` | `write:records` | 局部更新；提交 `expectedVersion` 做并发冲突保护 |
| DELETE | `/{resource}/{id}` | `write:records` | 软删除；需提交 `If-Match: <version>` 或 JSON `expectedVersion` |
| POST | `/{resource}/{id}/restore` | `write:records` | 恢复软删除记录；需提交预期版本 |
| GET | `/tasks/history` | `tasks:history` | 已完成任务记录 |
| POST | `/tasks/{id}/complete` | `tasks:complete` | 完成任务；必须带幂等键和预期版本 |
| POST | `/tasks/{id}/uncomplete` | `tasks:complete` | 撤销完成状态；必须带幂等键和预期版本 |
| GET | `/customers/{id}/communications` | `read:records` | 查询客户沟通记录 |
| POST | `/customers/{id}/communications` | `append:communications` | 追加客户沟通；必须带幂等键 |
| GET | `/partners/{id}/communications` | `read:records` | 查询合作方沟通记录 |
| POST | `/partners/{id}/communications` | `append:communications` | 追加合作方沟通；必须带幂等键 |
| GET | `/projects/{id}/logs` | `read:records` | 查询项目日志 |
| POST | `/projects/{id}/logs` | `append:project-logs` | 追加项目日志；必须带幂等键 |

`resource` 仅支持 `customers`、`partners`、`projects`、`tasks`、`orders`、`incomes`、`resources`、`experiences`、`products`、`reviews`。列表默认每页 50 条，最大 200 条；排序字段由服务端白名单控制。金额按整数分存储，API 以十进制字符串返回 `amountCents`、`priceCents`、`receivedCents` 等金额字段，避免大额累计时经过浮点数丢失精度；写入请求使用安全整数分。日期字段使用 `YYYY-MM-DD`，按北京时间语义处理。

## 创建示例

```sh
curl --fail-with-body 'https://your-host.example/api/agent/v1/customers' \
  -H 'Authorization: Bearer gya_签发时显示的完整密钥' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: agent-job-20261015-customer-001' \
  --data '{"name":"示例客户","status":"POTENTIAL","notes":"首次沟通前准备"}'
```

成功创建返回 HTTP 201 和 `{ "item": … }`。请求可安全重试时复用同一个幂等键；新的业务操作使用新的键。更新和删除需读取当前记录的 `version`，把该值作为 `expectedVersion` 提交；版本过期时服务端返回冲突，不覆盖较新的修改。

## 响应与错误

列表返回 `{ "items": […], "page": 1, "pageSize": 50, "total": 0 }`。详情、创建、更新和状态变更返回 `{ "item": … }`。错误统一为 `{ "error": { "code": "…", "message": "…" } }`，常见状态码为 400（输入无效）、401（未授权）、403（范围不足）、404（记录不存在）、409（版本或幂等冲突）、429（限流）和 500（内部错误）。

## 权限边界

Agent API 不提供登录密码修改/重置、凭据签发、备份下载或备份恢复能力。私有经验与复盘只属于账号本人；Agent 只能访问它获准的个人经营簿。不要把本机文件正文上传到 API；资料记录仅存储用户提供的资料指针。
