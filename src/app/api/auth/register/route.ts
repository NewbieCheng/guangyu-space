import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import {
  enforceRateLimit,
  RateLimitUnavailableError,
  requestIpKey,
} from "@/server/auth/rate-limit";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/server/auth/username";
import { hasSameOrigin } from "@/modules/guangyu-space/server/context";

const bodySchema = z
  .object({
    username: z.string().trim().min(1).max(80),
    password: z.string().min(1).max(256),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  const ip = requestIpKey(request.headers);
  try {
    if (
      !(await enforceRateLimit({
        key: `register:ip:${ip}`,
        limit: 5,
        windowSeconds: 3600,
      }))
    ) {
      return NextResponse.json(
        { error: "注册尝试过于频繁，请一小时后再试。" },
        { status: 429 },
      );
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      return NextResponse.json(
        { error: "注册服务暂时不可用，请稍后重试。" },
        { status: 503 },
      );
    }
    throw error;
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "请填写有效的用户名和密码。" },
      { status: 400 },
    );
  }

  const usernameError = validateUsername(parsed.username);
  const passwordError = validatePassword(parsed.password);
  if (usernameError || passwordError) {
    return NextResponse.json(
      { error: usernameError ?? passwordError },
      { status: 400 },
    );
  }

  const normalized = normalizeUsername(parsed.username);
  const passwordHash = await hashPassword(parsed.password);
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: parsed.username.normalize("NFKC").trim(),
          usernameNormalized: normalized,
          name: parsed.username.normalize("NFKC").trim(),
          passwordHash,
          timezone: "Asia/Shanghai",
        },
        select: { id: true, username: true },
      });
      const workspace = await tx.ledgerWorkspace.create({
        data: {
          ownerUserId: created.id,
          type: "PERSONAL",
          name: `${created.username}的经营簿`,
        },
      });
      await tx.ledgerWorkspaceMember.create({
        data: { workspaceId: workspace.id, userId: created.id, isOwner: true },
      });
      await tx.ledgerAuditLog.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: created.id,
          source: "SYSTEM",
          action: "account.registered",
          recordType: "USER",
          recordId: created.id,
        },
      });
      return created;
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "这个用户名已被使用。" },
        { status: 409 },
      );
    }
    throw error;
  }
}
