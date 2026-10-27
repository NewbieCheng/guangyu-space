import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { validatePassword } from "@/server/auth/username";

const schema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) }).strict();

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || typeof session.user.authVersion !== "number") {
    return NextResponse.json({ error: "登录状态已失效，请重新登录。" }, { status: 401 });
  }

  let input: z.infer<typeof schema>;
  try { input = schema.parse(await request.json()); } catch { return NextResponse.json({ error: "请检查密码输入。" }, { status: 400 }); }
  const passwordError = validatePassword(input.newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "当前密码不正确。" }, { status: 400 });
  }
  const newHash = await hashPassword(input.newPassword);
  const now = new Date();
  const changed = await db.$transaction(async (tx) => {
    const workspace = await tx.ledgerWorkspace.findFirst({ where: { ownerUserId: userId, type: "PERSONAL", status: "ACTIVE" }, select: { id: true } });
    if (!workspace) return false;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspace.id}, 0))`;
    const result = await tx.user.updateMany({
      where: { id: userId, authVersion: session.user.authVersion },
      data: { passwordHash: newHash, authVersion: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    await tx.ledgerAgentCredential.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.ledgerAuditLog.create({
      data: { workspaceId: workspace?.id, actorUserId: userId, source: "WEB", action: "account.password_changed", recordType: "USER", recordId: userId },
    });
    return true;
  });
  if (!changed) return NextResponse.json({ error: "登录状态已过期，请重新登录后再修改。" }, { status: 409 });
  return NextResponse.json({ ok: true, message: "密码已更新。请使用新密码重新登录。" });
}
