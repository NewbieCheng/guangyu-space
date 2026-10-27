import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError } from "./records";
import type { Viewer } from "./context";

export const AGENT_SCOPES = [
  "read:summary",
  "read:records",
  "write:records",
  "append:communications",
  "append:project-logs",
  "tasks:complete",
  "tasks:history",
] as const;

const scopeSet = new Set<string>(AGENT_SCOPES);
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(AGENT_SCOPES)).min(1).max(AGENT_SCOPES.length),
  expiresInDays: z.number().int().min(1).max(365),
}).strict();

export async function listAgentCredentials(viewer: Viewer) {
  const items = await db.ledgerAgentCredential.findMany({
    where: { workspaceId: viewer.workspaceId, userId: viewer.userId },
    select: { id: true, name: true, tokenPrefix: true, scopes: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return items;
}

export async function createAgentCredential(viewer: Viewer, input: unknown) {
  if (viewer.source !== "WEB") throw new ApiError(403, "WEB_SESSION_REQUIRED", "只有网页登录后可以创建 Agent 授权。");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "授权设置无效。");
  const scopes = [...new Set(parsed.data.scopes)];
  if (scopes.some((scope) => !scopeSet.has(scope))) throw new ApiError(400, "INVALID_SCOPE", "授权范围无效。");

  const token = `gya_${randomBytes(32).toString("base64url")}`;
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  const tokenPrefix = token.slice(0, 12);
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000);
  const credential = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.workspaceId}, 0))`;
    const workspace = await tx.ledgerWorkspace.findFirst({ where: { id: viewer.workspaceId, dataEpoch: viewer.dataEpoch, status: "ACTIVE" }, select: { id: true } });
    if (!workspace) throw new ApiError(409, "DATA_EPOCH_CHANGED", "经营簿已恢复，请重新登录后再创建授权。");
    const activeCount = await tx.ledgerAgentCredential.count({ where: { workspaceId: viewer.workspaceId, userId: viewer.userId, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (activeCount >= 20) throw new ApiError(409, "CREDENTIAL_LIMIT", "一个账号最多保留 20 个有效 Agent 授权。");
    const created = await tx.ledgerAgentCredential.create({ data: {
      userId: viewer.userId,
      workspaceId: viewer.workspaceId,
      name: parsed.data.name,
      tokenPrefix,
      tokenDigest,
      scopes,
      authVersion: viewer.authVersion,
      expiresAt,
    }, select: { id: true, name: true, tokenPrefix: true, scopes: true, expiresAt: true, createdAt: true } });
    await tx.ledgerAuditLog.create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: "WEB", action: "agent-credential.created", recordType: "AGENT_CREDENTIAL", recordId: created.id } });
    return created;
  });
  return { credential, token };
}

export async function revokeAgentCredential(viewer: Viewer, id: string) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${viewer.workspaceId}, 0))`;
    const workspace = await tx.ledgerWorkspace.findFirst({ where: { id: viewer.workspaceId, dataEpoch: viewer.dataEpoch }, select: { id: true } });
    if (!workspace) throw new ApiError(409, "DATA_EPOCH_CHANGED", "经营簿已恢复，请重新登录后再操作。");
    const result = await tx.ledgerAgentCredential.updateMany({ where: { id, userId: viewer.userId, workspaceId: viewer.workspaceId, revokedAt: null }, data: { revokedAt: now } });
    if (result.count) {
      await tx.ledgerAuditLog.create({ data: { workspaceId: viewer.workspaceId, actorUserId: viewer.userId, source: "WEB", action: "agent-credential.revoked", recordType: "AGENT_CREDENTIAL", recordId: id } });
    }
  });
  return { ok: true };
}
