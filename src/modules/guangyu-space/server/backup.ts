import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/server/db";
import { env } from "@/env";
import { redis } from "@/server/redis";
import type { Viewer } from "./context";
import { ApiError } from "./records";

const rowSchema = z.record(z.string(), z.unknown());
const rowList = z.array(rowSchema).max(100_000);
const backupSchema = z.object({
  format: z.literal("guangyu-space-personal-backup"),
  formatVersion: z.literal(1),
  createdAt: z.string().datetime(),
  ownerUserId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  tables: z.object({
    customers: rowList,
    partners: rowList,
    projects: rowList,
    tasks: rowList,
    orders: rowList,
    incomes: rowList,
    resources: rowList,
    experiences: rowList,
    products: rowList,
    reviews: rowList,
    projectCustomers: rowList,
    projectPartners: rowList,
    orderProjects: rowList,
    resourceProjects: rowList,
    communications: rowList,
    projectLogs: rowList,
    materialLinks: rowList,
    idSequences: rowList,
  }).strict(),
}).strict();

type BackupBundle = z.infer<typeof backupSchema>;
type DataRow = Record<string, unknown>;
type DataClient = Record<string, unknown> & { $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> };
type DataDelegate = {
  findMany(args: object): Promise<DataRow[]>;
  findFirst(args: object): Promise<DataRow | null>;
  findUnique(args: object): Promise<DataRow | null>;
  updateMany(args: object): Promise<{ count: number }>;
  upsert(args: object): Promise<DataRow>;
  createMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
};

const TABLE_DELEGATES: Record<keyof BackupBundle["tables"], string> = {
  customers: "ledgerCustomer",
  partners: "ledgerPartner",
  projects: "ledgerProject",
  tasks: "ledgerTask",
  orders: "ledgerOrder",
  incomes: "ledgerIncome",
  resources: "ledgerResource",
  experiences: "ledgerExperience",
  products: "ledgerProduct",
  reviews: "ledgerReview",
  projectCustomers: "ledgerProjectCustomer",
  projectPartners: "ledgerProjectPartner",
  orderProjects: "ledgerOrderProject",
  resourceProjects: "ledgerResourceProject",
  communications: "ledgerCommunication",
  projectLogs: "ledgerProjectLog",
  materialLinks: "ledgerMaterialLink",
  idSequences: "ledgerIdSequence",
};

const ALLOWED: Partial<Record<keyof BackupBundle["tables"], string[]>> = {
  customers: ["id", "businessNumber", "name", "industry", "status", "source", "needs", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  partners: ["id", "businessNumber", "name", "industry", "status", "directions", "capabilities", "description", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  projects: ["id", "ownerUserId", "accessScope", "businessNumber", "region", "status", "upgradeType", "name", "description", "expectedOutcome", "startDate", "dueDate", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  tasks: ["id", "ownerUserId", "businessNumber", "projectId", "customerId", "partnerId", "name", "status", "statusBeforeComplete", "priority", "plannedDate", "dueDate", "description", "notes", "completedAt", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  orders: ["id", "businessNumber", "customerId", "name", "content", "status", "amountCents", "orderDate", "dueDate", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  incomes: ["id", "businessNumber", "orderId", "name", "receivedOn", "amountCents", "method", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  resources: ["id", "ownerUserId", "businessNumber", "name", "category", "purpose", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  experiences: ["id", "ownerUserId", "businessNumber", "recordedOn", "title", "content", "tags", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  products: ["id", "businessNumber", "name", "productType", "productVersion", "priceCents", "status", "description", "notes", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  reviews: ["id", "ownerUserId", "businessNumber", "reviewType", "reviewedOn", "content", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  projectCustomers: ["workspaceId", "projectId", "customerId"],
  projectPartners: ["workspaceId", "projectId", "partnerId"],
  orderProjects: ["workspaceId", "orderId", "projectId"],
  resourceProjects: ["workspaceId", "resourceId", "projectId"],
  communications: ["id", "personType", "customerId", "partnerId", "occurredOn", "content", "createdById", "createdAt"],
  projectLogs: ["id", "projectId", "logDate", "content", "version", "createdById", "createdAt", "updatedAt", "deletedAt"],
  materialLinks: ["id", "ownerType", "ownerId", "label", "url", "version", "createdById", "updatedById", "createdAt", "updatedAt", "deletedAt"],
  idSequences: ["id", "name", "sequenceKey", "value", "updatedAt"],
};

const DATE_FIELDS = new Set(["createdAt", "updatedAt", "deletedAt", "startDate", "dueDate", "plannedDate", "orderDate", "receivedOn", "recordedOn", "reviewedOn", "completedAt", "occurredOn", "logDate"]);
const BIGINT_FIELDS = new Set(["amountCents", "priceCents"]);
const OWNER_TABLES = new Set(["experiences", "reviews"]);
const OPTIONAL_OWNER_TABLES = new Set(["projects", "tasks", "resources"]);
const MAIN_TABLES = ["customers", "partners", "projects", "tasks", "orders", "incomes", "resources", "experiences", "products", "reviews"] as const;

function delegate(client: DataClient, name: string): DataDelegate {
  const value = client[name];
  if (!value) throw new Error(`Unknown backup model ${name}`);
  return value as DataDelegate;
}

function backupDirectory(): string {
  const configured = env.GUANGYU_BACKUP_DIR;
  return path.resolve(configured || path.join(process.cwd(), "data", "backups"));
}

function replacer(_key: string, value: unknown): unknown { return typeof value === "bigint" ? value.toString() : value; }
function serialize(bundle: BackupBundle): string { return `${JSON.stringify(bundle, replacer, 2)}\n`; }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }

async function lockWorkspace(client: DataClient, viewer: Viewer) {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.workspaceId}, 0))`;
  const workspace = await (client as unknown as { ledgerWorkspace: { findFirst(args: object): Promise<unknown> } }).ledgerWorkspace.findFirst({ where: { id: viewer.workspaceId, dataEpoch: viewer.dataEpoch, status: "ACTIVE" }, select: { id: true } });
  if (!workspace) throw new ApiError(409, "DATA_EPOCH_CHANGED", "经营簿数据已经恢复或状态已变化，请重新登录后再试。");
}

async function readBundle(client: DataClient, viewer: Viewer): Promise<BackupBundle> {
  const workspaceWhere = { workspaceId: viewer.workspaceId };
  const [customers, partners, projects, tasks, orders, incomes, resources, experiences, products, reviews, projectCustomers, projectPartners, orderProjects, resourceProjects, communications, projectLogs, materialLinks, idSequences] = await Promise.all([
    delegate(client, TABLE_DELEGATES.customers).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.partners).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.projects).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.tasks).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.orders).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.incomes).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.resources).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.experiences).findMany({ where: { ...workspaceWhere, ownerUserId: viewer.userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.products).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.reviews).findMany({ where: { ...workspaceWhere, ownerUserId: viewer.userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.projectCustomers).findMany({ where: workspaceWhere, orderBy: [{ projectId: "asc" }, { customerId: "asc" }] }),
    delegate(client, TABLE_DELEGATES.projectPartners).findMany({ where: workspaceWhere, orderBy: [{ projectId: "asc" }, { partnerId: "asc" }] }),
    delegate(client, TABLE_DELEGATES.orderProjects).findMany({ where: workspaceWhere, orderBy: [{ orderId: "asc" }, { projectId: "asc" }] }),
    delegate(client, TABLE_DELEGATES.resourceProjects).findMany({ where: workspaceWhere, orderBy: [{ resourceId: "asc" }, { projectId: "asc" }] }),
    delegate(client, TABLE_DELEGATES.communications).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.projectLogs).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.materialLinks).findMany({ where: workspaceWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    delegate(client, TABLE_DELEGATES.idSequences).findMany({ where: workspaceWhere, orderBy: [{ name: "asc" }, { sequenceKey: "asc" }] }),
  ]);
  return {
    format: "guangyu-space-personal-backup",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    ownerUserId: viewer.userId,
    workspaceId: viewer.workspaceId,
    tables: { customers, partners, projects, tasks, orders, incomes, resources, experiences, products, reviews, projectCustomers, projectPartners, orderProjects, resourceProjects, communications, projectLogs, materialLinks, idSequences },
  } as BackupBundle;
}

function validateBundle(raw: unknown, viewer: Viewer): BackupBundle {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "INVALID_BACKUP", parsed.error.issues[0]?.message ?? "备份文件格式无效。");
  const bundle = parsed.data;
  if (bundle.ownerUserId !== viewer.userId || bundle.workspaceId !== viewer.workspaceId) throw new ApiError(403, "BACKUP_OWNER_MISMATCH", "这份备份不属于当前账号和经营簿。");
  const rows = Object.values(bundle.tables);
  const total = rows.reduce((sum, table) => sum + table.length, 0);
  if (total > 200_000) throw new ApiError(413, "BACKUP_TOO_LARGE", "备份记录数量超过本机恢复上限。");
  return bundle;
}

function convertRow(table: keyof BackupBundle["tables"], raw: DataRow, viewer: Viewer): DataRow {
  const allowed = ALLOWED[table] ?? [];
  if (raw.workspaceId !== viewer.workspaceId) throw new ApiError(400, "BACKUP_SCOPE_MISMATCH", "备份记录缺少当前经营簿归属，或包含其他经营簿的数据。");
  if ("ownerUserId" in raw && raw.ownerUserId != null && raw.ownerUserId !== viewer.userId) throw new ApiError(400, "BACKUP_OWNER_MISMATCH", "备份中包含其他账号的私有记录。");
  for (const actorField of ["createdById", "updatedById"]) {
    if (actorField in raw && raw[actorField] !== viewer.userId) throw new ApiError(400, "BACKUP_ACTOR_MISMATCH", "备份记录中的操作人不属于当前账号。");
  }
  const row: DataRow = {};
  for (const key of allowed) {
    if (!(key in raw)) continue;
    let value = raw[key];
    if (key === "workspaceId") value = viewer.workspaceId;
    if (key === "ownerUserId" && OPTIONAL_OWNER_TABLES.has(table) && value == null) value = null;
    if (DATE_FIELDS.has(key) && value != null) {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new ApiError(400, "INVALID_BACKUP_DATE", "备份文件中包含无效日期。");
      value = new Date(value);
    }
    if (BIGINT_FIELDS.has(key) && value != null) {
      if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/.test(String(value))) throw new ApiError(400, "INVALID_BACKUP_AMOUNT", "备份文件中包含无效金额。");
      value = BigInt(String(value));
    }
    row[key] = value;
  }
  row.workspaceId = viewer.workspaceId;
  if (OWNER_TABLES.has(table) && row.ownerUserId !== viewer.userId) throw new ApiError(400, "BACKUP_OWNER_MISMATCH", "备份中缺少正确的个人归属信息。");
  if (MAIN_TABLES.includes(table as (typeof MAIN_TABLES)[number]) || ["communications", "projectLogs", "materialLinks"].includes(table)) {
    if (typeof row.id !== "string" || !row.id || row.id.length > 128) throw new ApiError(400, "INVALID_BACKUP_ID", "备份中存在无效的记录 ID。");
  }
  return row;
}

function identityFor(table: keyof BackupBundle["tables"], row: DataRow): string {
  if (table === "projectCustomers") return `${identityPart(row, "projectId")}:${identityPart(row, "customerId")}`;
  if (table === "projectPartners") return `${identityPart(row, "projectId")}:${identityPart(row, "partnerId")}`;
  if (table === "orderProjects") return `${identityPart(row, "orderId")}:${identityPart(row, "projectId")}`;
  if (table === "resourceProjects") return `${identityPart(row, "resourceId")}:${identityPart(row, "projectId")}`;
  if (table === "idSequences") return `${identityPart(row, "name")}:${identityPart(row, "sequenceKey")}`;
  return String(row.id);
}

function identityPart(row: DataRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || !value) throw new ApiError(400, "INVALID_BACKUP_REFERENCE", "备份中存在无效的关联记录。");
  return value;
}

function convertTables(bundle: BackupBundle, viewer: Viewer): Record<keyof BackupBundle["tables"], DataRow[]> {
  const result = {} as Record<keyof BackupBundle["tables"], DataRow[]>;
  for (const table of Object.keys(bundle.tables) as Array<keyof BackupBundle["tables"]>) {
    const rows = bundle.tables[table] as DataRow[];
    const converted = rows.map((row) => convertRow(table, row, viewer));
    const identities = new Set<string>();
    for (const row of converted) {
      const identity = identityFor(table, row);
      if (identities.has(identity)) throw new ApiError(400, "DUPLICATE_BACKUP_RECORD", `备份中有重复记录：${table}。`);
      identities.add(identity);
    }
    result[table] = converted;
  }
  return result;
}

function snapshotFileName(userId: string, flavor: string): string {
  const safeUserId = userId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `personal-${safeUserId}-${flavor}-${timestamp}.json`;
}

async function writeSnapshot(bundle: BackupBundle, fileName: string): Promise<string> {
  const dir = backupDirectory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, serialize(bundle), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return filePath;
}

function countRows(bundle: BackupBundle) {
  return Object.fromEntries(Object.entries(bundle.tables).map(([name, rows]) => [name, rows.length]));
}

export async function exportPersonalBackup(viewer: Viewer): Promise<{ fileName: string; body: string }> {
  const bundle = await db.$transaction(async (tx) => {
    const client = tx as unknown as DataClient;
    await lockWorkspace(client, viewer);
    return readBundle(client, viewer);
  }, { isolationLevel: "RepeatableRead" });
  return { fileName: `guangyu-space-backup-${bundle.createdAt.slice(0, 10)}.json`, body: serialize(bundle) };
}

export async function preparePersonalRestore(viewer: Viewer, raw: unknown) {
  const bundle = validateBundle(raw, viewer);
  convertTables(bundle, viewer);
  const snapshot = await db.$transaction(async (tx) => {
    const client = tx as unknown as DataClient;
    await lockWorkspace(client, viewer);
    const current = await readBundle(client, viewer);
    const fileName = snapshotFileName(viewer.userId, "before-restore");
    const filePath = await writeSnapshot(current, fileName);
    return { fileName, filePath, createdAt: current.createdAt };
  }, { isolationLevel: "RepeatableRead" });
  const restoreId = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await redis.set(`guangyu:restore:${viewer.userId}:${restoreId}`, JSON.stringify({ backupHash: digest(bundle), snapshotPath: snapshot.filePath, preparedAt: new Date().toISOString() }), "EX", 30 * 60);
  return { restoreId, backupCreatedAt: bundle.createdAt, preparedAt: snapshot.createdAt, protectiveSnapshot: snapshot.fileName, expiresAt: expiresAt.toISOString(), counts: countRows(bundle) };
}

async function markAbsentRows(client: DataClient, table: keyof BackupBundle["tables"], rows: DataRow[], viewer: Viewer, now: Date) {
  if (!MAIN_TABLES.includes(table as (typeof MAIN_TABLES)[number]) && table !== "projectLogs" && table !== "materialLinks") return;
  const where: DataRow = { workspaceId: viewer.workspaceId, deletedAt: null };
  if (table === "experiences" || table === "reviews") where.ownerUserId = viewer.userId;
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (ids.length) where.id = { notIn: ids };
  const update: DataRow = { deletedAt: now };
  update.version = { increment: 1 };
  if (["customers", "partners", "projects", "tasks", "orders", "incomes", "resources", "products", "reviews", "materialLinks"].includes(table)) update.updatedById = viewer.userId;
  await delegate(client, TABLE_DELEGATES[table]).updateMany({ where, data: update });
}

async function restoreRows(client: DataClient, table: keyof BackupBundle["tables"], rows: DataRow[], viewer: Viewer) {
  const model = delegate(client, TABLE_DELEGATES[table]);
  if (["projectCustomers", "projectPartners", "orderProjects", "resourceProjects"].includes(table)) {
    await model.deleteMany({ where: { workspaceId: viewer.workspaceId } });
    if (rows.length) await model.createMany({ data: rows });
    return;
  }
  if (table === "communications") {
    const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    await model.deleteMany({ where: { workspaceId: viewer.workspaceId, ...(ids.length ? { id: { notIn: ids } } : {}) } });
  }
  for (const row of rows) {
    if (table === "idSequences") {
      const sequence = await model.findUnique({ where: { workspaceId_name_sequenceKey: { workspaceId: viewer.workspaceId, name: row.name, sequenceKey: row.sequenceKey } } });
      const restoredValue = Number(row.value);
      if (!Number.isSafeInteger(restoredValue) || restoredValue < 0) throw new ApiError(400, "INVALID_BACKUP_SEQUENCE", "备份中包含无效编号序列。");
      const value = Math.max(restoredValue, Number(sequence?.value ?? 0));
      await model.upsert({
        where: { workspaceId_name_sequenceKey: { workspaceId: viewer.workspaceId, name: row.name, sequenceKey: row.sequenceKey } },
        create: { ...row, workspaceId: viewer.workspaceId, value },
        update: { value, updatedAt: row.updatedAt },
      });
      continue;
    }
    if ("id" in row) {
      const { id, ...update } = row;
      await model.upsert({ where: { id }, create: { ...row, ...("workspaceId" in row ? { workspaceId: viewer.workspaceId } : {}) }, update });
    }
  }
}

export async function executePersonalRestore(viewer: Viewer, restoreId: string, raw: unknown) {
  const bundle = validateBundle(raw, viewer);
  const tables = convertTables(bundle, viewer);
  if (!/^[A-Za-z0-9_-]{32}$/.test(restoreId)) throw new ApiError(400, "INVALID_RESTORE_ID", "恢复确认已失效，请重新选择备份。");
  const pendingKey = `guangyu:restore:${viewer.userId}:${restoreId}`;
  const pendingText = await redis.get(pendingKey);
  if (!pendingText) throw new ApiError(409, "RESTORE_PREPARATION_EXPIRED", "恢复准备已过期，请重新选择备份。");
  let pending: { backupHash?: string; snapshotPath?: string };
  try { pending = JSON.parse(pendingText) as { backupHash?: string; snapshotPath?: string }; } catch { throw new ApiError(409, "RESTORE_PREPARATION_EXPIRED", "恢复准备信息无效，请重新选择备份。"); }
  if (pending.backupHash !== digest(bundle) || !pending.snapshotPath) throw new ApiError(409, "RESTORE_FILE_CHANGED", "备份文件与确认时不一致，请重新开始恢复流程。");
  const snapshotPath = path.resolve(pending.snapshotPath);
  const snapshotRelativePath = path.relative(backupDirectory(), snapshotPath);
  if (!snapshotRelativePath || snapshotRelativePath === ".." || snapshotRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(snapshotRelativePath)) {
    throw new ApiError(500, "SNAPSHOT_PATH_INVALID", "保护快照位置无效，当前数据未修改。");
  }
  try { await readFile(snapshotPath); } catch { throw new ApiError(500, "SNAPSHOT_MISSING", "保护快照暂时不可读取，当前数据未修改。"); }

  const restoreNow = new Date();
  const counts = countRows(bundle);
  await db.$transaction(async (tx) => {
    const client = tx as unknown as DataClient;
    await lockWorkspace(client, viewer);
    // A second snapshot captures any changes made while the user reviewed the confirmation.
    const latest = await readBundle(client, viewer);
    await writeSnapshot(latest, snapshotFileName(viewer.userId, "before-restore-apply"));

    for (const table of MAIN_TABLES) await markAbsentRows(client, table, tables[table], viewer, restoreNow);
    await markAbsentRows(client, "projectLogs", tables.projectLogs, viewer, restoreNow);
    await markAbsentRows(client, "materialLinks", tables.materialLinks, viewer, restoreNow);

    for (const table of ["customers", "partners", "projects", "tasks", "orders", "incomes", "resources", "experiences", "products", "reviews"] as const) {
      await restoreRows(client, table, tables[table], viewer);
    }
    for (const table of ["projectCustomers", "projectPartners", "orderProjects", "resourceProjects"] as const) await restoreRows(client, table, tables[table], viewer);
    await restoreRows(client, "communications", tables.communications, viewer);
    await restoreRows(client, "projectLogs", tables.projectLogs, viewer);
    await restoreRows(client, "materialLinks", tables.materialLinks, viewer);
    await restoreRows(client, "idSequences", tables.idSequences, viewer);

    await tx.ledgerRequestDedup.deleteMany({ where: { workspaceId: viewer.workspaceId } });
    await tx.ledgerAgentCredential.updateMany({ where: { workspaceId: viewer.workspaceId, userId: viewer.userId, revokedAt: null }, data: { revokedAt: restoreNow } });
    const user = await tx.user.updateMany({ where: { id: viewer.userId, authVersion: viewer.authVersion }, data: { authVersion: { increment: 1 } } });
    if (user.count !== 1) throw new ApiError(409, "AUTH_VERSION_CHANGED", "账号状态已变化，未执行恢复。请重新登录后再试。");
    const epoch = await tx.ledgerWorkspace.updateMany({ where: { id: viewer.workspaceId, dataEpoch: viewer.dataEpoch }, data: { dataEpoch: { increment: 1 } } });
    if (epoch.count !== 1) throw new ApiError(409, "DATA_EPOCH_CHANGED", "经营簿数据已变化，未执行恢复。请刷新后再试。");
    await tx.ledgerAuditLog.create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: "WEB", action: "backup.restored", recordType: "BACKUP", recordId: restoreId, metadata: { backupCreatedAt: bundle.createdAt, counts } } });
  }, { timeout: 120_000, maxWait: 15_000 });
  await redis.del(pendingKey);
  return { ok: true, message: "经营簿已恢复。网页登录和 Agent 授权已失效，请使用当前密码重新登录。", restoredAt: restoreNow.toISOString(), counts };
}

export function parseBackupJson(rawText: string): unknown {
  if (new TextEncoder().encode(rawText).byteLength > 50 * 1024 * 1024) throw new ApiError(413, "BACKUP_TOO_LARGE", "备份文件不能超过 50 MB。");
  try { return JSON.parse(rawText) as unknown; } catch { throw new ApiError(400, "INVALID_BACKUP_JSON", "备份文件不是有效的 JSON。"); }
}
