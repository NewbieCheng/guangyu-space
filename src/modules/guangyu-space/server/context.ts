import { createHash } from "node:crypto";
import { env } from "@/env";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { isSameOriginRequest } from "./request-origin";

export type Viewer = {
  userId: string;
  username: string;
  workspaceId: string;
  authVersion: number;
  dataEpoch: number;
  source: "WEB" | "AGENT";
  identityKey: string;
  credentialId?: string;
};

export type ApiAccess =
  | { viewer: Viewer; failure?: never }
  | { viewer?: never; failure: { status: number; code: string; message: string } };

export function apiAccessFailure(failure: NonNullable<ApiAccess["failure"]>): Response {
  return Response.json({ error: failure }, { status: failure.status });
}

export async function requireViewer(): Promise<Viewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || typeof session.user.authVersion !== "number") return null;

  const [user, workspace, membership] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { username: true, authVersion: true, isBlocked: true } }),
    db.ledgerWorkspace.findFirst({ where: { ownerUserId: userId, type: "PERSONAL", status: "ACTIVE" }, select: { id: true, dataEpoch: true } }),
    db.ledgerWorkspaceMember.findFirst({ where: { userId, status: "ACTIVE", isOwner: true, workspace: { type: "PERSONAL", status: "ACTIVE" } }, select: { workspaceId: true } }),
  ]);
  if (!user || user.isBlocked || user.authVersion !== session.user.authVersion || !workspace || membership?.workspaceId !== workspace.id) return null;
  return { userId, username: user.username ?? "个人账号", workspaceId: workspace.id, authVersion: user.authVersion, dataEpoch: workspace.dataEpoch, source: "WEB", identityKey: `web:${userId}` };
}

export async function resolveApiViewer(request: Request, requiredScope: string): Promise<ApiAccess> {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    const viewer = await requireViewer();
    return viewer ? { viewer } : { failure: { status: 401, code: "UNAUTHENTICATED", message: "请先登录或提供 Agent API 授权。" } };
  }
  const match = /^Bearer\s+(gya_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return { failure: { status: 401, code: "INVALID_CREDENTIAL", message: "Agent 授权无效或已失效。" } };
  const token = match[1];
  if (!token) return { failure: { status: 401, code: "INVALID_CREDENTIAL", message: "Agent 授权无效或已失效。" } };
  const tokenDigest = createHash("sha256").update(token).digest("hex");
  const credential = await db.ledgerAgentCredential.findUnique({
    where: { tokenDigest },
    include: {
      user: { select: { id: true, username: true, authVersion: true, isBlocked: true } },
      workspace: { select: { id: true, ownerUserId: true, type: true, status: true, dataEpoch: true } },
    },
  });
  const now = new Date();
  if (!credential || credential.revokedAt || credential.expiresAt <= now || credential.user.isBlocked || credential.authVersion !== credential.user.authVersion || credential.workspace.ownerUserId !== credential.userId || credential.workspace.type !== "PERSONAL" || credential.workspace.status !== "ACTIVE") {
    return { failure: { status: 401, code: "INVALID_CREDENTIAL", message: "Agent 授权无效或已失效。" } };
  }
  const membership = await db.ledgerWorkspaceMember.findFirst({ where: { workspaceId: credential.workspaceId, userId: credential.userId, isOwner: true, status: "ACTIVE" }, select: { id: true } });
  if (!membership) return { failure: { status: 401, code: "INVALID_CREDENTIAL", message: "Agent 授权无效或已失效。" } };
  if (!credential.scopes.includes(requiredScope)) return { failure: { status: 403, code: "INSUFFICIENT_SCOPE", message: `该 Agent 授权缺少 ${requiredScope} 权限。` } };
  await db.ledgerAgentCredential.updateMany({ where: { id: credential.id, revokedAt: null }, data: { lastUsedAt: now } });
  return { viewer: {
    userId: credential.userId,
    username: credential.user.username ?? "个人账号",
    workspaceId: credential.workspaceId,
    authVersion: credential.authVersion,
    dataEpoch: credential.workspace.dataEpoch,
    source: "AGENT",
    identityKey: `agent:${credential.id}`,
    credentialId: credential.id,
  } };
}

export function hasSameOrigin(request: Request): boolean {
  return isSameOriginRequest(request, env.APP_URL);
}
