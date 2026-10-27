import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const [user, workspace] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { username: true, createdAt: true } }),
    db.ledgerWorkspace.findFirst({ where: { ownerUserId: userId, type: "PERSONAL" }, select: { id: true, name: true } }),
  ]);
  if (!user || !workspace) return NextResponse.json({ error: "账号空间不存在。" }, { status: 404 });
  return NextResponse.json({ user, workspace });
}
