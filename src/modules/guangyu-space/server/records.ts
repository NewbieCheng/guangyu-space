import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import type { Viewer } from "./context";
import { relationFieldsFor, relationRows } from "./record-relations";
import { dateField, schemas } from "./record-schemas";
import type { RecordName } from "./record-schemas";
import { buildTaskGroupPlan, TASK_PROJECT_TYPES } from "./task-groups";
import type { TaskGroupsResponse, TaskReference, TaskListItem } from "./task-groups";
import { orderCollectionAmounts } from "../money";

type Row = Record<string, unknown>;
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  findFirst(args: object): Promise<Row | null>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
  createMany(args: object): Promise<{ count: number }>;
  count(args: object): Promise<number>;
  upsert(args: object): Promise<Row>;
};
type Client = { $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> };
type Config = { delegate: string; recordType: string; prefix: string; private: "none" | "owner" | "private-task"; include: object; search: string[]; sort: string[] };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function requestIdentity(viewer: Viewer): string { return viewer.identityKey || `web:${viewer.userId}`; }
function auditSource(viewer: Viewer): string { return viewer.source; }

const configs: Record<RecordName, Config> = {
  customers: { delegate: "ledgerCustomer", recordType: "CUSTOMER", prefix: "KH", private: "none", search: ["name", "businessNumber", "industry", "source", "needs"], sort: ["name", "status", "createdAt", "updatedAt"], include: { projectLinks: { include: { project: { select: { id: true, name: true, businessNumber: true, region: true, status: true } } } }, orders: { where: { deletedAt: null }, include: { incomes: { where: { deletedAt: null }, select: { amountCents: true } } } }, communications: { orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 }, tasks: { where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, plannedDate: { not: null } }, orderBy: [{ plannedDate: "asc" }, { id: "asc" }], take: 1 } } },
  partners: { delegate: "ledgerPartner", recordType: "PARTNER", prefix: "HZ", private: "none", search: ["name", "businessNumber", "industry", "capabilities", "description"], sort: ["name", "status", "createdAt", "updatedAt"], include: { projectLinks: { include: { project: { select: { id: true, name: true, businessNumber: true, region: true, status: true } } } }, communications: { orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 }, tasks: { where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, plannedDate: { not: null } }, orderBy: [{ plannedDate: "asc" }, { id: "asc" }], take: 1 } } },
  projects: { delegate: "ledgerProject", recordType: "PROJECT", prefix: "XM", private: "owner", search: ["name", "businessNumber", "description", "expectedOutcome", "notes"], sort: ["name", "region", "status", "startDate", "dueDate", "createdAt", "updatedAt"], include: { customers: { include: { customer: { select: { id: true, name: true, businessNumber: true } } } }, partners: { include: { partner: { select: { id: true, name: true, businessNumber: true } } } }, orders: { include: { order: { select: { id: true, name: true, businessNumber: true, status: true, amountCents: true } } } }, tasks: { where: { deletedAt: null }, orderBy: [{ priority: "asc" }, { plannedDate: "asc" }, { id: "asc" }] }, logs: { where: { deletedAt: null }, orderBy: [{ logDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] } } },
  tasks: { delegate: "ledgerTask", recordType: "TASK", prefix: "BL", private: "private-task", search: ["name", "businessNumber", "description", "notes"], sort: ["name", "status", "priority", "plannedDate", "dueDate", "completedAt", "createdAt", "updatedAt"], include: { project: { select: { id: true, name: true, businessNumber: true, region: true, status: true } }, customer: { select: { id: true, name: true, businessNumber: true } }, partner: { select: { id: true, name: true, businessNumber: true } } } },
  orders: { delegate: "ledgerOrder", recordType: "ORDER", prefix: "OD", private: "none", search: ["name", "businessNumber", "content", "notes"], sort: ["name", "status", "orderDate", "dueDate", "amountCents", "createdAt", "updatedAt"], include: { customer: { select: { id: true, name: true, businessNumber: true } }, projects: { include: { project: { select: { id: true, name: true, businessNumber: true, region: true } } } }, incomes: { where: { deletedAt: null }, orderBy: [{ receivedOn: "desc" }, { id: "desc" }] } } },
  incomes: { delegate: "ledgerIncome", recordType: "INCOME", prefix: "SR", private: "none", search: ["name", "businessNumber", "notes"], sort: ["name", "receivedOn", "amountCents", "method", "createdAt", "updatedAt"], include: { order: { select: { id: true, name: true, businessNumber: true, customer: { select: { id: true, name: true } } } } } },
  resources: { delegate: "ledgerResource", recordType: "RESOURCE", prefix: "ZL", private: "owner", search: ["name", "businessNumber", "category", "purpose", "notes"], sort: ["name", "category", "purpose", "projectIds", "updatedAt"], include: { projects: { include: { project: { select: { id: true, name: true, businessNumber: true, region: true } } } } } },
  experiences: { delegate: "ledgerExperience", recordType: "EXPERIENCE", prefix: "JYBX", private: "owner", search: ["title", "businessNumber", "content"], sort: ["recordedOn", "title", "createdAt", "updatedAt"], include: {} },
  products: { delegate: "ledgerProduct", recordType: "PRODUCT", prefix: "CPBX", private: "none", search: ["name", "businessNumber", "productType", "description", "productVersion", "notes"], sort: ["name", "productType", "productVersion", "priceCents", "status", "updatedAt"], include: {} },
  reviews: { delegate: "ledgerReview", recordType: "REVIEW", prefix: "", private: "owner", search: ["businessNumber", "content"], sort: ["reviewedOn", "reviewType", "updatedAt"], include: {} },
};

const validNames = Object.keys(configs) as RecordName[];
export function isRecordName(value: string): value is RecordName { return (validNames as string[]).includes(value); }

function model(client: Client, name: string): Delegate {
  const value = (client as unknown as Record<string, unknown>)[name];
  if (!value) throw new Error(`Unknown database model ${name}`);
  return value as Delegate;
}

async function lockWorkspace(client: Client, viewer: Viewer): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.workspaceId}, 0))`;
  const workspace = await model(client, "ledgerWorkspace").findFirst({ where: { id: viewer.workspaceId, dataEpoch: viewer.dataEpoch, status: "ACTIVE" }, select: { id: true } });
  if (!workspace) throw new ApiError(409, "DATA_EPOCH_CHANGED", "经营簿数据已经恢复或状态已变化，请重新登录并刷新页面。");
}

function includeFor(config: Config): object {
  return config.include;
}

async function withLinks(client: Client, config: Config, viewer: Viewer, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return rows;
  const ids = rows.map((row) => String(row.id));
  const links = await model(client, "ledgerMaterialLink").findMany({
    where: { workspaceId: viewer.workspaceId, ownerType: config.recordType, ownerId: { in: ids }, deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const byOwner = new Map<string, Row[]>();
  for (const link of links) {
    const ownerId = String(link.ownerId);
    byOwner.set(ownerId, [...(byOwner.get(ownerId) ?? []), link]);
  }
  return rows.map((row) => ({ ...row, materialLinks: byOwner.get(String(row.id)) ?? [] }));
}

function beijingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateValue(value: unknown): unknown {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(400, "INVALID_DATE", "日期无效。");
  return date;
}

function safeLinkUrl(raw: string): string {
  const value = raw.trim();
  if (/^(https?):\/\//i.test(value)) {
    try { const url = new URL(value); if (!url.hostname || url.username || url.password) throw new Error(); return url.toString(); } catch { throw new ApiError(400, "INVALID_LINK", "网页链接无效。"); }
  }
  if (/^obsidian:\/\//i.test(value) || /^file:\/\//i.test(value) || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]/.test(value)) return value;
  throw new ApiError(400, "INVALID_LINK", "资料地址仅支持网页、Obsidian 或本地文件指针。");
}

function baseWhere(config: Config, viewer: Viewer, includeDeleted = false): Row {
  const where: Row = { workspaceId: viewer.workspaceId };
  if (!includeDeleted) where.deletedAt = null;
  if (config.recordType === "PROJECT") where.OR = [{ accessScope: "WORKSPACE" }, { accessScope: "PRIVATE_USER", ownerUserId: viewer.userId }];
  else if (config.private === "owner") where.ownerUserId = viewer.userId;
  else if (config.private === "private-task") where.OR = [{ ownerUserId: viewer.userId }, { ownerUserId: null, project: { workspaceId: viewer.workspaceId, deletedAt: null } }];
  return where;
}

function sanitizeQuery(config: Config, search: string, filters: URLSearchParams): Row {
  const where: Row = {};
  const q = search.trim().slice(0, 160);
  if (q) {
    const searchConditions: Row[] = config.search.map((field) => ({ [field]: { contains: q, mode: "insensitive" } }));
    if (config.recordType === "RESOURCE") searchConditions.push({ projects: { some: { project: { name: { contains: q, mode: "insensitive" } } } } });
    where.OR = searchConditions;
  }
  for (const field of ["status", "region", "reviewType", "priority"] as const) {
    const value = filters.get(field);
    if (value && /^[A-Z_]{1,32}$/.test(value)) where[field] = value;
  }
  for (const field of ["projectId", "customerId", "partnerId", "orderId"] as const) {
    const value = filters.get(field);
    if (value && value.length <= 64) where[field] = value;
  }
  if (filters.get("status") === "OPEN") delete where.status;
  if (filters.get("status") === "OPEN") where.status = { notIn: ["COMPLETED", "ABANDONED"] };
  const date = filters.get("date");
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    where.plannedDate = dateValue(date);
  }
  if (filters.get("completed") === "true") where.status = "COMPLETED";
  if (filters.get("completed") === "false") where.status = { not: "COMPLETED" };
  if (filters.get("onlyUnpaid") === "true") where.status = { in: ["TO_CONFIRM", "IN_PROGRESS", "DELIVERED"] };
  return where;
}

function orderBy(config: Config, params: URLSearchParams): Row[] {
  const requested = params.get("sort") ?? "createdAt";
  const sort = config.sort.includes(requested) ? requested : config.sort[0] ?? "createdAt";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  return [{ [sort]: direction }, { id: "asc" }];
}

function recordOrderBy(name: RecordName, config: Config, params: URLSearchParams): Row[] {
  const requested = params.get("sort");
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  if (name === "orders" && requested === "customer") return [{ customer: { name: direction } }, { id: "asc" }];
  if (name === "incomes" && requested === "order") return [{ order: { name: direction } }, { id: "asc" }];
  return orderBy(config, params);
}

function asOutput(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(asOutput);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asOutput(item)]));
  return value;
}

function enrich(config: Config, row: Row): Row {
  const result: Row = { ...row };
  result.links = Array.isArray(row.materialLinks)
    ? (row.materialLinks as Row[]).map(({ id, label, url, version, createdAt, updatedAt }) => ({ id, label, url, version, createdAt, updatedAt }))
    : [];
  if (config.recordType === "CUSTOMER") {
    const orders = Array.isArray(row.orders) ? row.orders as Row[] : [];
    const received = orders.reduce((sum, order) => sum + incomeTotal(order.incomes), 0n);
    const receivable = orders.filter((order) => order.status !== "CANCELED").reduce((sum, order) => sum + (typeof order.amountCents === "bigint" ? order.amountCents : 0n) - incomeTotalBigInt(order.incomes), 0n);
    result.totalReceivedCents = asOutput(received);
    result.receivableCents = asOutput(receivable);
    result.lastCommunication = Array.isArray(row.communications) ? row.communications[0] ?? null : null;
    result.nextFollowup = Array.isArray(row.tasks) ? row.tasks[0] ?? null : null;
    result.projectIds = Array.isArray(row.projectLinks) ? (row.projectLinks as Row[]).map((link) => link.projectId) : [];
    result.orderIds = orders.map((order) => order.id);
  } else if (config.recordType === "PARTNER") {
    result.lastCommunication = Array.isArray(row.communications) ? row.communications[0] ?? null : null;
    result.nextFollowup = Array.isArray(row.tasks) ? row.tasks[0] ?? null : null;
    result.projectIds = Array.isArray(row.projectLinks) ? (row.projectLinks as Row[]).map((link) => link.projectId) : [];
  } else if (config.recordType === "PROJECT") {
    result.customerIds = Array.isArray(row.customers) ? (row.customers as Row[]).map((link) => link.customerId) : [];
    result.partnerIds = Array.isArray(row.partners) ? (row.partners as Row[]).map((link) => link.partnerId) : [];
    result.orderIds = Array.isArray(row.orders) ? (row.orders as Row[]).map((link) => link.orderId) : [];
  } else if (config.recordType === "ORDER") {
    result.projectIds = Array.isArray(row.projects) ? (row.projects as Row[]).map((link) => link.projectId) : [];
    const received = incomeTotalBigInt(row.incomes);
    const amount = typeof row.amountCents === "bigint" ? row.amountCents : null;
    const collection = orderCollectionAmounts(amount, received);
    result.receivedCents = collection.receivedCents;
    result.receivableCents = collection.receivableCents;
    result.collectionStatus = collection.collectionStatus;
  } else if (config.recordType === "RESOURCE") {
    result.projectIds = Array.isArray(row.projects) ? (row.projects as Row[]).map((link) => link.projectId) : [];
  }
  return result;
}

function incomeTotalBigInt(incomes: unknown): bigint {
  if (!Array.isArray(incomes)) return 0n;
  const rows: unknown[] = incomes;
  return rows.reduce<bigint>((sum, value) => {
    if (!value || typeof value !== "object" || !("amountCents" in value)) return sum;
    const amount = (value as { amountCents?: unknown }).amountCents;
    return sum + (typeof amount === "bigint" ? amount : 0n);
  }, 0n);
}
function incomeTotal(incomes: unknown): bigint { return incomeTotalBigInt(incomes); }

async function checkIds(client: Client, modelName: string, viewer: Viewer, ids: string[], allowLearningProject = false) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return;
  const where: Row = { id: { in: uniqueIds }, workspaceId: viewer.workspaceId, deletedAt: null };
  if (modelName === "ledgerProject") {
    where.OR = allowLearningProject
      ? [{ accessScope: "WORKSPACE" }, { accessScope: "PRIVATE_USER", ownerUserId: viewer.userId }]
      : [{ accessScope: "WORKSPACE" }];
  }
  const count = await model(client, modelName).count({ where });
  if (count !== uniqueIds.length) throw new ApiError(400, "INVALID_RELATION", "关联记录不存在、已删除或不属于当前经营簿。");
}

async function validateTaskRelations(client: Client, viewer: Viewer, data: Row) {
  if (!data.projectId) return;
  const project = await model(client, "ledgerProject").findFirst({
    where: { id: data.projectId, workspaceId: viewer.workspaceId, deletedAt: null, OR: [{ accessScope: "WORKSPACE" }, { accessScope: "PRIVATE_USER", ownerUserId: viewer.userId }] },
    select: { region: true, accessScope: true, ownerUserId: true },
  });
  if (!project) throw new ApiError(400, "INVALID_RELATION", "关联项目不存在、已删除或不属于当前账号。");
  if (project.region === "LEARNING" && (data.customerId || data.partnerId)) {
    throw new ApiError(400, "PRIVATE_PROJECT_RELATION", "学习排期不能关联经营簿客户或合作方。");
  }
  data.ownerUserId = project.region === "LEARNING" ? viewer.userId : null;
}

async function nextBusinessNumber(client: Client, config: Config, viewer: Viewer, data: Row): Promise<string> {
  const name = config.recordType;
  if (config.recordType === "REVIEW") {
    const prefix = data.reviewType === "WEEK" ? "WeekR" : data.reviewType === "MONTH" ? "MonthR" : "QuarterR";
    const reviewedOn = data.reviewedOn instanceof Date ? data.reviewedOn.toISOString().slice(0, 10) : String(data.reviewedOn).slice(0, 10);
    return `${prefix}${reviewedOn.replaceAll("-", "")}`;
  }
  if (config.recordType === "PROJECT") {
    const region = data.region;
    const tags: Record<string, string> = { SERVICE: "NT", PRODUCT: "JGJ", BUSINESS: "MC", EXPLORATION: "KD", NON_BUSINESS: "SLHT", LEARNING: "TJP" };
    const sequenceKey = String(region);
    const sequence = await model(client, "ledgerIdSequence").upsert({
      where: { workspaceId_name_sequenceKey: { workspaceId: viewer.workspaceId, name, sequenceKey } },
      create: { workspaceId: viewer.workspaceId, name, sequenceKey, value: 1 },
      update: { value: { increment: 1 } },
    });
    const value = Number(sequence.value);
    if (!Number.isSafeInteger(value) || value > 99_999) throw new ApiError(409, "NUMBER_EXHAUSTED", "项目编号已达到上限，请联系维护者。");
    return `XM${String(value).padStart(5, "0")}${tags[sequenceKey] ?? "NT"}`;
  }
  const ymd = beijingDate().replaceAll("-", "");
  const sequenceKey = ymd;
  const sequence = await model(client, "ledgerIdSequence").upsert({
    where: { workspaceId_name_sequenceKey: { workspaceId: viewer.workspaceId, name, sequenceKey } },
    create: { workspaceId: viewer.workspaceId, name, sequenceKey, value: 1 },
    update: { value: { increment: 1 } },
  });
  const value = Number(sequence.value);
  if (!Number.isSafeInteger(value) || value > 999) throw new ApiError(409, "NUMBER_EXHAUSTED", "当日业务编号已达到上限，请明天再试。");
  return `${config.prefix}${ymd}${String(value).padStart(3, "0")}`;
}

function relationsData(name: RecordName, data: Row): { scalar: Row; relations: Record<string, string[]> } {
  const scalar = { ...data };
  const relations: Record<string, string[]> = {};
  for (const [field, joinModel] of Object.entries(relationFieldsFor(name))) {
    if (Array.isArray(scalar[field])) relations[joinModel] = [...new Set(scalar[field] as string[])];
    delete scalar[field];
  }
  delete scalar.links;
  delete scalar.expectedVersion;
  for (const key of ["amountCents", "priceCents"]) {
    const value = scalar[key];
    if (typeof value === "number") scalar[key] = BigInt(value);
  }
  for (const key of ["recordedOn", "reviewedOn", "receivedOn", "plannedDate", "dueDate", "orderDate", "startDate"]) if (key in scalar) scalar[key] = dateValue(scalar[key]);
  return { scalar, relations };
}

async function writeLinks(client: Client, viewer: Viewer, ownerType: string, ownerId: string, links: unknown, actorId: string, replace: boolean) {
  if (!Array.isArray(links)) return;
  const delegate = model(client, "ledgerMaterialLink");
  if (replace) await delegate.updateMany({ where: { workspaceId: viewer.workspaceId, ownerType, ownerId, deletedAt: null }, data: { deletedAt: new Date(), version: { increment: 1 }, updatedById: actorId } });
  const rows = links.map((value) => {
    const link = value as { label: string; url: string };
    return { workspaceId: viewer.workspaceId, ownerType, ownerId, label: link.label.trim(), url: safeLinkUrl(link.url), createdById: actorId, updatedById: actorId };
  });
  if (rows.length) await delegate.createMany({ data: rows });
}

async function createRecordIn(client: Client, name: RecordName, viewer: Viewer, raw: Row, identityKey: string, idempotencyKey: string): Promise<Row> {
  await lockWorkspace(client, viewer);
  const config = configs[name];
  const hash = createHash("sha256").update(stableJson(raw)).digest("hex");
  const dedup = model(client, "ledgerRequestDedup");
  const dedupWhere = { workspaceId_identityKey_operation_idempotencyKey: { workspaceId: viewer.workspaceId, identityKey, operation: `create:${config.recordType}`, idempotencyKey } };
  const existing = await dedup.findUnique({ where: dedupWhere });
  if (existing) {
    if (existing.requestHash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "相同幂等键不能用于不同请求内容。");
    if (typeof existing.resultId === "string") {
      const record = await model(client, config.delegate).findFirst({ where: { id: existing.resultId, ...baseWhere(config, viewer, true) }, include: includeFor(config) });
      if (record) return enrich(config, (await withLinks(client, config, viewer, [record]))[0] ?? record);
    }
  }

  const input = { ...raw };
  if (name === "incomes" && (input.method == null || input.method === "")) input.method = "";
  const links = input.links;
  const { scalar, relations } = relationsData(name, input);
  const privateProject = name === "projects" && scalar.region === "LEARNING";
  const data: Row = {
    ...scalar,
    workspaceId: viewer.workspaceId,
    businessNumber: await nextBusinessNumber(client, config, viewer, scalar),
    createdById: viewer.userId,
    updatedById: viewer.userId,
  };
  if (["experiences", "reviews"].includes(name)) data.ownerUserId = viewer.userId;
  if (name === "tasks" || name === "resources") data.ownerUserId = viewer.userId;
  if (name === "projects") {
    data.accessScope = privateProject ? "PRIVATE_USER" : "WORKSPACE";
    if (privateProject) data.ownerUserId = viewer.userId;
    if (!privateProject) data.ownerUserId = null;
    if (privateProject) {
      if ((relations.ledgerProjectCustomer?.length ?? 0) || (relations.ledgerProjectPartner?.length ?? 0) || (relations.ledgerOrderProject?.length ?? 0)) throw new ApiError(400, "PRIVATE_PROJECT_RELATION", "个人学习项目不能关联经营簿客户、合作方或订单。");
    }
  }
  if (name === "tasks") {
    if (scalar.projectId) data.ownerUserId = null;
    if (scalar.status === "COMPLETED") {
      data.statusBeforeComplete = "TODO";
      data.completedAt = new Date();
    }
  }
  if (relations.ledgerProjectCustomer) await checkIds(client, name === "customers" ? "ledgerProject" : "ledgerCustomer", viewer, relations.ledgerProjectCustomer);
  if (relations.ledgerProjectPartner) await checkIds(client, name === "partners" ? "ledgerProject" : "ledgerPartner", viewer, relations.ledgerProjectPartner);
  if (relations.ledgerOrderProject) await checkIds(client, name === "orders" ? "ledgerProject" : "ledgerOrder", viewer, relations.ledgerOrderProject);
  if (relations.ledgerResourceProject) await checkIds(client, "ledgerProject", viewer, relations.ledgerResourceProject, name === "resources");
  if (name === "tasks") {
    if (typeof data.projectId === "string" && data.projectId) await checkIds(client, "ledgerProject", viewer, [data.projectId], true);
    if (typeof data.customerId === "string" && data.customerId) await checkIds(client, "ledgerCustomer", viewer, [data.customerId]);
    if (typeof data.partnerId === "string" && data.partnerId) await checkIds(client, "ledgerPartner", viewer, [data.partnerId]);
    await validateTaskRelations(client, viewer, data);
  }
  if (name === "orders" && typeof data.customerId === "string") await checkIds(client, "ledgerCustomer", viewer, [data.customerId]);
  if (name === "incomes" && typeof data.orderId === "string" && data.orderId) await checkIds(client, "ledgerOrder", viewer, [data.orderId]);

  const row = await model(client, config.delegate).create({ data });
  for (const [joinName, ids] of Object.entries(relations)) {
    if (!ids.length) continue;
    const targetModel = joinName === "ledgerProjectCustomer"
      ? "ledgerCustomer"
      : joinName === "ledgerProjectPartner"
        ? "ledgerPartner"
        : joinName === "ledgerOrderProject"
          ? (name === "orders" ? "ledgerProject" : "ledgerOrder")
          : "ledgerProject";
    await checkIds(client, targetModel, viewer, ids, name === "resources" && targetModel === "ledgerProject");
    await model(client, joinName).createMany({ data: relationRows(name, joinName, viewer.workspaceId, String(row.id), ids) });
  }
  await writeLinks(client, viewer, config.recordType, String(row.id), links, viewer.userId, false);
  await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: `${config.recordType.toLowerCase()}.created`, recordType: config.recordType, recordId: String(row.id) } });
  await dedup.create({ data: { workspaceId: viewer.workspaceId, userId: viewer.userId, agentCredentialId: viewer.credentialId, identityKey, operation: `create:${config.recordType}`, idempotencyKey, requestHash: hash, resultType: config.recordType, resultId: String(row.id), expiresAt: new Date(Date.now() + 86_400_000) } });
  const created = await model(client, config.delegate).findFirst({ where: { id: row.id, ...baseWhere(config, viewer, true) }, include: includeFor(config) });
  return created ? enrich(config, (await withLinks(client, config, viewer, [created]))[0] ?? created) : row;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function listRecords(name: RecordName, viewer: Viewer, params: URLSearchParams) {
  const config = configs[name];
  const page = Math.max(1, Math.min(100_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const limit = Math.max(1, Math.min(200, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const onlyDeleted = params.get("onlyDeleted") === "true";
  const where = { ...baseWhere(config, viewer, params.get("includeDeleted") === "true" || onlyDeleted), ...sanitizeQuery(config, params.get("q") ?? "", params) };
  if (onlyDeleted) where.deletedAt = { not: null };
  const defaultTaskOrder = [
    { project: { region: "asc" } },
    { project: { businessNumber: "asc" } },
    { priority: "asc" },
    { plannedDate: { sort: "asc", nulls: "last" } },
    { id: "asc" },
  ];
  const requestedSort = params.get("sort");
  if (name === "orders" && (requestedSort === "receivedCents" || requestedSort === "receivableCents")) {
    const [orderRows, total] = await Promise.all([
      model(db, config.delegate).findMany({
        where,
        select: { id: true, amountCents: true, incomes: { where: { deletedAt: null }, select: { amountCents: true } } },
      }),
      model(db, config.delegate).count({ where }),
    ]);
    const direction = params.get("direction") === "asc" ? 1 : -1;
    const sortedIds = orderRows.map((row) => {
      const collection = orderCollectionAmounts(row.amountCents, incomeTotalBigInt(row.incomes));
      return { id: String(row.id), value: requestedSort === "receivedCents" ? collection.receivedCents : collection.receivableCents };
    }).sort((left, right) => {
      if (left.value === null) return right.value === null ? left.id.localeCompare(right.id) : 1;
      if (right.value === null) return -1;
      if (left.value === right.value) return left.id.localeCompare(right.id);
      return (left.value < right.value ? -1 : 1) * direction;
    }).map((item) => item.id);
    const pageIds = sortedIds.slice((page - 1) * limit, page * limit);
    const pageRows = pageIds.length ? await model(db, config.delegate).findMany({ where: { ...where, id: { in: pageIds } }, include: includeFor(config) }) : [];
    const orderIndex = new Map(pageIds.map((id, index) => [id, index]));
    pageRows.sort((left, right) => (orderIndex.get(String(left.id)) ?? 0) - (orderIndex.get(String(right.id)) ?? 0));
    const enriched = (await withLinks(db as unknown as Client, config, viewer, pageRows)).map((row) => enrich(config, row));
    return { items: asOutput(enriched), page, limit, total, totalPages: Math.ceil(total / limit) };
  }
  if (name === "projects" && requestedSort === "customerIds") {
    const [projectRows, total] = await Promise.all([
      model(db, config.delegate).findMany({
        where,
        select: { id: true, customers: { select: { customer: { select: { name: true } } } } },
      }),
      model(db, config.delegate).count({ where }),
    ]);
    const direction = params.get("direction") === "asc" ? 1 : -1;
    const sortedIds = projectRows.map((project) => {
      const customers = Array.isArray(project.customers) ? project.customers as Row[] : [];
      const customerNames = customers
        .map((link) => {
          const customer = link.customer && typeof link.customer === "object" ? link.customer as Row : null;
          return customer && typeof customer.name === "string" ? customer.name : "";
        })
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }));
      return { id: String(project.id), value: customerNames.join("、") };
    }).sort((left, right) => {
      const comparison = left.value.localeCompare(right.value, "zh-CN", { numeric: true, sensitivity: "base" });
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison * direction;
    }).map((project) => project.id);
    const pageIds = sortedIds.slice((page - 1) * limit, page * limit);
    const pageRows = pageIds.length ? await model(db, config.delegate).findMany({ where: { ...where, id: { in: pageIds } }, include: includeFor(config) }) : [];
    const orderIndex = new Map(pageIds.map((id, index) => [id, index]));
    pageRows.sort((left, right) => (orderIndex.get(String(left.id)) ?? 0) - (orderIndex.get(String(right.id)) ?? 0));
    const enriched = (await withLinks(db as unknown as Client, config, viewer, pageRows)).map((row) => enrich(config, row));
    return { items: asOutput(enriched), page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  if (name === "resources" && requestedSort === "projectIds") {
    const [resourceRows, total] = await Promise.all([
      model(db, config.delegate).findMany({
        where,
        select: { id: true, projects: { select: { project: { select: { name: true } } } } },
      }),
      model(db, config.delegate).count({ where }),
    ]);
    const direction = params.get("direction") === "asc" ? 1 : -1;
    const sortedIds = resourceRows.map((resource) => {
      const projects = Array.isArray(resource.projects) ? resource.projects as Row[] : [];
      const projectNames = projects
        .map((link) => {
          const project = link.project && typeof link.project === "object" ? link.project as Row : null;
          return project && typeof project.name === "string" ? project.name : "";
        })
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" }));
      return { id: String(resource.id), value: projectNames.join("、") };
    }).sort((left, right) => {
      const comparison = left.value.localeCompare(right.value, "zh-CN", { numeric: true, sensitivity: "base" });
      return comparison === 0 ? left.id.localeCompare(right.id) : comparison * direction;
    }).map((resource) => resource.id);
    const pageIds = sortedIds.slice((page - 1) * limit, page * limit);
    const pageRows = pageIds.length ? await model(db, config.delegate).findMany({ where: { ...where, id: { in: pageIds } }, include: includeFor(config) }) : [];
    const orderIndex = new Map(pageIds.map((id, index) => [id, index]));
    pageRows.sort((left, right) => (orderIndex.get(String(left.id)) ?? 0) - (orderIndex.get(String(right.id)) ?? 0));
    const enriched = (await withLinks(db as unknown as Client, config, viewer, pageRows)).map((row) => enrich(config, row));
    return { items: asOutput(enriched), page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  const order = name === "tasks" && !params.has("sort") ? defaultTaskOrder : recordOrderBy(name, config, params);
  const [items, total] = await Promise.all([
    model(db, config.delegate).findMany({ where, include: includeFor(config), orderBy: order, skip: (page - 1) * limit, take: limit }),
    model(db, config.delegate).count({ where }),
  ]);
  const enriched = (await withLinks(db as unknown as Client, config, viewer, items)).map((row) => enrich(config, row));
  return { items: asOutput(enriched), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getRecord(name: RecordName, viewer: Viewer, id: string, includeDeleted = false) {
  const config = configs[name];
  const row = await model(db, config.delegate).findFirst({ where: { id, ...baseWhere(config, viewer, includeDeleted) }, include: includeFor(config) });
  if (!row) throw new ApiError(404, "NOT_FOUND", "记录不存在。");
  const linked = await withLinks(db as unknown as Client, config, viewer, [row]);
  return asOutput(enrich(config, linked[0] ?? row));
}

export async function createRecord(name: RecordName, viewer: Viewer, input: unknown, idempotencyKey: string | null) {
  const parsed = schemas[name].create.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "输入内容无效。");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "创建请求需要 8–128 位 Idempotency-Key。");
  try {
    const result = await db.$transaction((tx) => createRecordIn(tx as unknown as Client, name, viewer, parsed.data as Row, requestIdentity(viewer), idempotencyKey));
    return asOutput(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isUniqueError(error)) {
      const existing = await model(db, "ledgerRequestDedup").findUnique({ where: { workspaceId_identityKey_operation_idempotencyKey: { workspaceId: viewer.workspaceId, identityKey: requestIdentity(viewer), operation: `create:${configs[name].recordType}`, idempotencyKey } } });
      if (existing && typeof existing.resultId === "string") return getRecord(name, viewer, existing.resultId, true);
      if (name === "reviews") throw new ApiError(409, "REVIEW_EXISTS", "该类型和日期已被占用，可能包含已删除记录。请查看已删除记录并恢复原记录，或调整日期。");
      throw new ApiError(409, "DUPLICATE", "该记录已存在或提交重复，请刷新后确认。");
    }
    throw error;
  }
}

function isUniqueError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export async function updateRecord(name: RecordName, viewer: Viewer, id: string, input: unknown) {
  const parsed = schemas[name].patch.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "输入内容无效。");
  const { expectedVersion, ...values } = parsed.data as Row;
  if (typeof expectedVersion !== "number") throw new ApiError(428, "VERSION_REQUIRED", "更新请求必须携带 expectedVersion。");
  const config = configs[name];
  const { scalar, relations } = relationsData(name, values);
  if (name === "incomes" && scalar.method === null) scalar.method = "";
  const now = new Date();
  const links = values.links;
  const updateData: Row = { ...scalar, updatedById: viewer.userId, version: { increment: 1 } };
  const changed = await db.$transaction(async (tx) => {
    const client = tx as unknown as Client;
    await lockWorkspace(client, viewer);
    const previous = await model(client, config.delegate).findFirst({ where: { id, ...baseWhere(config, viewer), version: expectedVersion } });
    if (!previous) return false;
    if (name === "reviews" && ("reviewType" in values || "reviewedOn" in values)) throw new ApiError(400, "IMMUTABLE_REVIEW_IDENTITY", "复盘类型和日期保存后不能修改。");
    if (name === "projects" && (scalar.region ?? previous.region) === "LEARNING" && Object.values(relations).some((ids) => ids.length > 0)) {
      throw new ApiError(400, "PRIVATE_PROJECT_RELATION", "个人学习项目不能关联经营簿客户、合作方或订单。");
    }
    if (name === "orders" && typeof scalar.customerId === "string" && scalar.customerId) await checkIds(client, "ledgerCustomer", viewer, [scalar.customerId]);
    if (name === "incomes" && typeof scalar.orderId === "string" && scalar.orderId) await checkIds(client, "ledgerOrder", viewer, [scalar.orderId]);
    for (const [joinModel, ids] of Object.entries(relations)) {
      let modelName = "ledgerProject";
      if (joinModel === "ledgerProjectCustomer") modelName = name === "customers" ? "ledgerProject" : "ledgerCustomer";
      if (joinModel === "ledgerProjectPartner") modelName = name === "partners" ? "ledgerProject" : "ledgerPartner";
      if (joinModel === "ledgerOrderProject") modelName = name === "orders" ? "ledgerProject" : "ledgerOrder";
      await checkIds(client, modelName, viewer, ids, name === "resources" && modelName === "ledgerProject");
    }
    if (name === "tasks") {
      const merged: Row = { projectId: scalar.projectId !== undefined ? scalar.projectId : previous.projectId, customerId: scalar.customerId !== undefined ? scalar.customerId : previous.customerId, partnerId: scalar.partnerId !== undefined ? scalar.partnerId : previous.partnerId, ownerUserId: previous.ownerUserId };
      await validateTaskRelations(client, viewer, merged);
      updateData.ownerUserId = merged.ownerUserId;
    }
    if (name === "tasks" && scalar.status === "COMPLETED" && previous.status !== "COMPLETED") {
      updateData.statusBeforeComplete = previous.status;
      updateData.completedAt = now;
    } else if (name === "tasks" && scalar.status && scalar.status !== "COMPLETED") {
      if (previous.status === "COMPLETED") throw new ApiError(409, "USE_UNCOMPLETE_ACTION", "已完成任务请使用取消完成操作，以恢复完成前状态。");
      updateData.statusBeforeComplete = null;
      updateData.completedAt = null;
    }
    if (name === "projects" && scalar.region) {
      const learning = scalar.region === "LEARNING";
      updateData.accessScope = learning ? "PRIVATE_USER" : "WORKSPACE";
      updateData.ownerUserId = learning ? viewer.userId : null;
      if (learning && previous.accessScope !== "PRIVATE_USER") {
        const relationCount = await model(client, "ledgerProjectCustomer").count({ where: { workspaceId: viewer.workspaceId, projectId: id } })
          + await model(client, "ledgerProjectPartner").count({ where: { workspaceId: viewer.workspaceId, projectId: id } })
          + await model(client, "ledgerOrderProject").count({ where: { workspaceId: viewer.workspaceId, projectId: id } });
        if (relationCount > 0) throw new ApiError(409, "PROJECT_HAS_RELATIONS", "请先移除经营项目中的客户、合作方和订单关联，再改为学习排期。");
      }
    }
    const result = await model(client, config.delegate).updateMany({ where: { id, ...baseWhere(config, viewer), version: expectedVersion }, data: updateData });
    if (result.count !== 1) return false;
    const record = await model(client, config.delegate).findFirst({ where: { id, workspaceId: viewer.workspaceId }, select: { id: true } });
    if (!record) return false;
    for (const [joinModel, ids] of Object.entries(relations)) {
      const relationKey = name === "customers" ? "customerId" : name === "partners" ? "partnerId" : name === "projects" ? "projectId" : name === "orders" ? "orderId" : "resourceId";
      await model(client, joinModel).deleteMany({ where: { workspaceId: viewer.workspaceId, [relationKey]: id } });
      if (ids.length) await model(client, joinModel).createMany({ data: relationRows(name, joinModel, viewer.workspaceId, id, ids) });
    }
    if (Array.isArray(links)) await writeLinks(client, viewer, config.recordType, id, links, viewer.userId, true);
    await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: `${config.recordType.toLowerCase()}.updated`, recordType: config.recordType, recordId: id } });
    return true;
  });
  if (!changed) {
    const current = await model(db, config.delegate).findFirst({ where: { id, ...baseWhere(config, viewer, true) } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "记录不存在。");
    if (current.deletedAt) throw new ApiError(409, "DELETED", "记录已删除，先恢复后再编辑。");
    throw new ApiError(409, "VERSION_CONFLICT", "记录已被其他请求更新。请载入最新版本并保留你的修改后重试。");
  }
  return getRecord(name, viewer, id, true);
}

export async function setDeleted(name: RecordName, viewer: Viewer, id: string, expectedVersion: number, restore: boolean) {
  const config = configs[name];
  const data: Row = { deletedAt: restore ? null : new Date(), version: { increment: 1 }, updatedById: viewer.userId };
  const result = await db.$transaction(async (tx) => {
    const client = tx as unknown as Client;
    await lockWorkspace(client, viewer);
    const changed = await model(client, config.delegate).updateMany({ where: { id, ...baseWhere(config, viewer, true), version: expectedVersion, deletedAt: restore ? { not: null } : null }, data });
    if (changed.count !== 1) return false;
    await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: `${config.recordType.toLowerCase()}.${restore ? "restored" : "deleted"}`, recordType: config.recordType, recordId: id } });
    return true;
  });
  if (!result) {
    const current = await model(db, config.delegate).findFirst({ where: { id, ...baseWhere(config, viewer, true) } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "记录不存在。");
    if (restore && !current.deletedAt) throw new ApiError(409, "NOT_DELETED", "记录当前未删除。");
    if (!restore && current.deletedAt) throw new ApiError(409, "ALREADY_DELETED", "记录已经删除。");
    throw new ApiError(409, "VERSION_CONFLICT", "记录已被其他请求更新，请刷新后重试。");
  }
  return getRecord(name, viewer, id, true);
}

function idempotencyKey(value: string | null): string {
  if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "追加请求需要 8–128 位 Idempotency-Key。");
  return value;
}

async function findDedup(client: Client, viewer: Viewer, operation: string, key: string, input: unknown) {
  const existing = await model(client, "ledgerRequestDedup").findUnique({
    where: { workspaceId_identityKey_operation_idempotencyKey: { workspaceId: viewer.workspaceId, identityKey: requestIdentity(viewer), operation, idempotencyKey: key } },
  });
  if (!existing) return null;
  const requestHash = createHash("sha256").update(stableJson(input)).digest("hex");
  if (existing.requestHash !== requestHash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "相同幂等键不能用于不同请求内容。");
  return existing;
}

async function saveDedup(client: Client, viewer: Viewer, operation: string, key: string, input: unknown, resultType: string, resultId: string) {
  await model(client, "ledgerRequestDedup").create({
    data: {
      workspaceId: viewer.workspaceId,
      userId: viewer.userId,
      agentCredentialId: viewer.credentialId,
      identityKey: requestIdentity(viewer),
      operation,
      idempotencyKey: key,
      requestHash: createHash("sha256").update(stableJson(input)).digest("hex"),
      resultType,
      resultId,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

export async function appendCommunication(viewer: Viewer, personType: "CUSTOMER" | "PARTNER", personId: string, input: unknown, rawKey: string | null) {
  const parsed = z.object({ occurredOn: dateField.optional(), content: z.string().trim().min(1).max(20_000) }).strict().safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "沟通内容无效。");
  const key = idempotencyKey(rawKey);
  const operation = `communication:${personType}:${personId}`;
  const body = { ...parsed.data, occurredOn: parsed.data.occurredOn ?? beijingDate() };
  try {
    const result = await db.$transaction(async (tx) => {
      const client = tx as unknown as Client;
      await lockWorkspace(client, viewer);
      const existing = await findDedup(client, viewer, operation, key, body);
      if (existing && typeof existing.resultId === "string") {
        const item = await model(client, "ledgerCommunication").findFirst({ where: { id: existing.resultId, workspaceId: viewer.workspaceId } });
        if (item) return item;
      }
      const table = personType === "CUSTOMER" ? "ledgerCustomer" : "ledgerPartner";
      const person = await model(client, table).findFirst({ where: { id: personId, workspaceId: viewer.workspaceId, deletedAt: null }, select: { id: true } });
      if (!person) throw new ApiError(404, "NOT_FOUND", "关联对象不存在。");
      const item = await model(client, "ledgerCommunication").create({ data: {
        workspaceId: viewer.workspaceId,
        personType,
        customerId: personType === "CUSTOMER" ? personId : null,
        partnerId: personType === "PARTNER" ? personId : null,
        occurredOn: dateValue(body.occurredOn),
        content: body.content,
        createdById: viewer.userId,
      } });
      await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: "communication.appended", recordType: personType, recordId: personId } });
      await saveDedup(client, viewer, operation, key, body, "COMMUNICATION", String(item.id));
      return item;
    });
    return asOutput(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isUniqueError(error)) {
      const replay = await findDedup(db as unknown as Client, viewer, operation, key, body);
      if (replay && typeof replay.resultId === "string") {
        const item = await model(db as unknown as Client, "ledgerCommunication").findFirst({ where: { id: replay.resultId, workspaceId: viewer.workspaceId } });
        if (item) return asOutput(item);
      }
    }
    throw error;
  }
}

export async function listCommunications(viewer: Viewer, personType: "CUSTOMER" | "PARTNER", personId: string, params: URLSearchParams) {
  const table = personType === "CUSTOMER" ? "ledgerCustomer" : "ledgerPartner";
  const person = await model(db as unknown as Client, table).findFirst({ where: { id: personId, workspaceId: viewer.workspaceId, deletedAt: null }, select: { id: true } });
  if (!person) throw new ApiError(404, "NOT_FOUND", "关联对象不存在。");
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(200, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const ownerField = personType === "CUSTOMER" ? "customerId" : "partnerId";
  const where = { workspaceId: viewer.workspaceId, [ownerField]: personId };
  const [items, total] = await Promise.all([
    model(db as unknown as Client, "ledgerCommunication").findMany({ where, orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    model(db as unknown as Client, "ledgerCommunication").count({ where }),
  ]);
  return { items: asOutput(items), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function appendProjectLog(viewer: Viewer, projectId: string, input: unknown, rawKey: string | null) {
  const parsed = z.object({ logDate: dateField.optional(), content: z.string().trim().min(1).max(30_000) }).strict().safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "项目日志无效。");
  const key = idempotencyKey(rawKey);
  const operation = `project-log:${projectId}`;
  const body = { ...parsed.data, logDate: parsed.data.logDate ?? beijingDate() };
  try {
    const result = await db.$transaction(async (tx) => {
      const client = tx as unknown as Client;
      await lockWorkspace(client, viewer);
      const existing = await findDedup(client, viewer, operation, key, body);
      if (existing && typeof existing.resultId === "string") {
        const log = await model(client, "ledgerProjectLog").findFirst({ where: { id: existing.resultId, workspaceId: viewer.workspaceId } });
        if (log) return log;
      }
      const project = await model(client, "ledgerProject").findFirst({ where: { id: projectId, ...baseWhere(configs.projects, viewer) }, select: { id: true } });
      if (!project) throw new ApiError(404, "NOT_FOUND", "项目不存在或已删除。");
      const log = await model(client, "ledgerProjectLog").create({ data: { workspaceId: viewer.workspaceId, projectId, logDate: dateValue(body.logDate), content: body.content, createdById: viewer.userId } });
      await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: "project-log.appended", recordType: "PROJECT", recordId: projectId } });
      await saveDedup(client, viewer, operation, key, body, "PROJECT_LOG", String(log.id));
      return log;
    });
    return asOutput(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isUniqueError(error)) {
      const replay = await findDedup(db as unknown as Client, viewer, operation, key, body);
      if (replay && typeof replay.resultId === "string") {
        const log = await model(db as unknown as Client, "ledgerProjectLog").findFirst({ where: { id: replay.resultId, workspaceId: viewer.workspaceId } });
        if (log) return asOutput(log);
      }
    }
    throw error;
  }
}

export async function listProjectLogs(viewer: Viewer, projectId: string) {
  const project = await model(db as unknown as Client, configs.projects.delegate).findFirst({ where: { id: projectId, ...baseWhere(configs.projects, viewer) }, select: { id: true } });
  if (!project) throw new ApiError(404, "NOT_FOUND", "项目不存在或已删除。");
  const items = await model(db as unknown as Client, "ledgerProjectLog").findMany({
    where: { workspaceId: viewer.workspaceId, projectId, deletedAt: null },
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  return { items: asOutput(items) };
}

export async function setTaskCompletion(viewer: Viewer, id: string, expectedVersion: number, completed: boolean, rawKey: string | null) {
  const key = idempotencyKey(rawKey);
  const operation = `${completed ? "complete" : "uncomplete"}:task:${id}`;
  const body = { expectedVersion, completed };
  const now = new Date();
  try {
    const result = await db.$transaction(async (tx) => {
      const client = tx as unknown as Client;
      await lockWorkspace(client, viewer);
      const existing = await findDedup(client, viewer, operation, key, body);
      if (existing) {
        const current = await model(client, configs.tasks.delegate).findFirst({ where: { id, ...baseWhere(configs.tasks, viewer, true) }, include: configs.tasks.include });
        if (current) return (await withLinks(client, configs.tasks, viewer, [current]))[0] ?? current;
      }
      const task = await model(client, configs.tasks.delegate).findFirst({ where: { id, ...baseWhere(configs.tasks, viewer), version: expectedVersion } });
      if (!task) throw new ApiError(409, "VERSION_CONFLICT", "任务已更新或已删除，请刷新后重试。");
      let data: Row;
      if (completed) {
        if (task.status === "COMPLETED") throw new ApiError(409, "ALREADY_COMPLETED", "任务已经完成。");
        data = { statusBeforeComplete: task.status, status: "COMPLETED", completedAt: now };
      } else {
        if (task.status !== "COMPLETED") throw new ApiError(409, "NOT_COMPLETED", "任务当前未完成。");
        data = { status: task.statusBeforeComplete ?? "TODO", statusBeforeComplete: null, completedAt: null };
      }
      const updated = await model(client, configs.tasks.delegate).updateMany({ where: { id, workspaceId: viewer.workspaceId, version: expectedVersion, deletedAt: null }, data: { ...data, updatedById: viewer.userId, version: { increment: 1 } } });
      if (updated.count !== 1) throw new ApiError(409, "VERSION_CONFLICT", "任务已更新，请刷新后重试。");
      await model(client, "ledgerAuditLog").create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: auditSource(viewer), action: completed ? "task.completed" : "task.reopened", recordType: "TASK", recordId: id } });
      await saveDedup(client, viewer, operation, key, body, "TASK", id);
      const current = await model(client, configs.tasks.delegate).findFirst({ where: { id, workspaceId: viewer.workspaceId }, include: configs.tasks.include });
      return current ? (await withLinks(client, configs.tasks, viewer, [current]))[0] ?? current : task;
    });
    return asOutput(enrich(configs.tasks, result));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (isUniqueError(error)) {
      const replay = await findDedup(db as unknown as Client, viewer, operation, key, body);
      if (replay) return getRecord("tasks", viewer, id, true);
    }
    throw error;
  }
}

export async function listCompletedTasks(viewer: Viewer, params: URLSearchParams) {
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(200, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
  const date = params.get("date");
  const filters: Row = { status: "COMPLETED", completedAt: { not: null } };
  if (date && date !== "all") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "INVALID_DATE", "历史日期格式应为 YYYY-MM-DD。");
    const start = new Date(`${date}T00:00:00+08:00`);
    if (Number.isNaN(start.valueOf()) || beijingDate(start) !== date) throw new ApiError(400, "INVALID_DATE", "历史日期无效。");
    const end = new Date(start.valueOf() + 86_400_000);
    filters.completedAt = { gte: start, lt: end };
  }
  const q = (params.get("q") ?? "").trim().slice(0, 160);
  if (q) filters.OR = configs.tasks.search.map((field) => ({ [field]: { contains: q, mode: "insensitive" } }));
  const where: Row = { AND: [baseWhere(configs.tasks, viewer), filters] };
  const [items, total] = await Promise.all([
    model(db as unknown as Client, configs.tasks.delegate).findMany({ where, include: configs.tasks.include, orderBy: [{ completedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    model(db as unknown as Client, configs.tasks.delegate).count({ where }),
  ]);
  const linked = await withLinks(db as unknown as Client, configs.tasks, viewer, items);
  return { items: asOutput(linked.map((row) => enrich(configs.tasks, row))), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function listGroupedTasks(viewer: Viewer, params: URLSearchParams): Promise<TaskGroupsResponse> {
  const page = Math.max(1, Math.min(100_000, Number.parseInt(params.get("page") ?? "1", 10) || 1));
  const requestedPageSize = Number.parseInt(params.get("limit") ?? "50", 10) || 50;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50;
  const onlyDeleted = params.get("onlyDeleted") === "true";
  const filters: Row = {};

  if (onlyDeleted) filters.deletedAt = { not: null };
  const status = params.get("status");
  if (status === "OPEN") filters.status = { notIn: ["COMPLETED", "ABANDONED"] };
  else if (status) {
    if (!["TODO", "IN_PROGRESS", "WAITING", "COMPLETED", "ABANDONED"].includes(status)) {
      throw new ApiError(400, "INVALID_STATUS", "任务状态筛选值无效。");
    }
    filters.status = status;
  } else if (!onlyDeleted) filters.status = { notIn: ["COMPLETED", "ABANDONED"] };

  const priority = params.get("priority");
  if (priority) {
    if (!["P0", "P1", "P2"].includes(priority)) throw new ApiError(400, "INVALID_PRIORITY", "任务优先级筛选值无效。");
    filters.priority = priority;
  }

  const projectId = params.get("projectId");
  if (projectId) {
    if (projectId.length > 64) throw new ApiError(400, "INVALID_PROJECT", "项目筛选值无效。");
    filters.projectId = projectId;
  }

  const region = params.get("region");
  if (region) {
    if (!TASK_PROJECT_TYPES.some((item) => item.value === region)) throw new ApiError(400, "INVALID_REGION", "区域筛选值无效。");
    filters.project = { region };
  }

  const q = (params.get("q") ?? "").trim().slice(0, 160);
  if (q) filters.OR = configs.tasks.search.map((field) => ({ [field]: { contains: q, mode: "insensitive" } }));
  const where: Row = { AND: [baseWhere(configs.tasks, viewer, onlyDeleted), filters] };
  const references = await model(db as unknown as Client, configs.tasks.delegate).findMany({
    where,
    select: {
      id: true,
      projectId: true,
      priority: true,
      plannedDate: true,
      project: { select: { id: true, businessNumber: true, name: true, region: true } },
    },
  });
  const plan = buildTaskGroupPlan(references as unknown as TaskReference[], page, pageSize);
  const taskIds = [
    ...plan.regions.flatMap((group) => group.projects.flatMap((project) => project.taskIds)),
    ...plan.unassigned.taskIds,
  ];
  const rows = taskIds.length
    ? await model(db as unknown as Client, configs.tasks.delegate).findMany({
      where: { ...where, id: { in: taskIds } },
      include: includeFor(configs.tasks),
    })
    : [];
  const linked = await withLinks(db as unknown as Client, configs.tasks, viewer, rows);
  const items = linked.map((row) => asOutput(enrich(configs.tasks, row)) as TaskListItem);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return {
    ...plan,
    regions: plan.regions.map((group) => ({
      ...group,
      projects: group.projects.map((project) => ({
        projectId: project.projectId,
        businessNumber: project.businessNumber,
        name: project.name,
        total: project.total,
        tasks: project.taskIds.flatMap((id) => {
          const item = itemsById.get(id);
          return item ? [item] : [];
        }),
      })),
    })),
    unassigned: {
      total: plan.unassigned.total,
      tasks: plan.unassigned.taskIds.flatMap((id) => {
        const item = itemsById.get(id);
        return item ? [item] : [];
      }),
    },
  };
}

export function parseExpectedVersion(request: Request, input?: unknown): number {
  const bodyValue = input && typeof input === "object" && "expectedVersion" in input ? Number(input.expectedVersion) : NaN;
  const headerValue = Number(request.headers.get("if-match")?.replaceAll('"', ""));
  const value = Number.isInteger(bodyValue) && bodyValue > 0 ? bodyValue : headerValue;
  if (!Number.isInteger(value) || value <= 0) throw new ApiError(428, "VERSION_REQUIRED", "请求必须携带记录版本（expectedVersion 或 If-Match）。");
  return value;
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "请求未能完成，请稍后重试。" } }, { status: 500 });
}
