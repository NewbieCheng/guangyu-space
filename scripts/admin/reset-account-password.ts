import "dotenv/config";
import { StringDecoder } from "node:string_decoder";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { normalizeUsername, validatePassword } from "@/server/auth/username";

const db = new PrismaClient();

async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return (await prompt.question(question)).trim(); }
  finally { prompt.close(); }
}

function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("密码只能在交互式终端输入，不能通过命令参数、管道或文件传入。");
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  const decoder = new StringDecoder("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003") return finish(new Error("已取消。"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("此操作仅允许在交互式终端运行。");
  const operatorUsername = await ask("管理员用户名：");
  const operator = await db.user.findUnique({ where: { usernameNormalized: normalizeUsername(operatorUsername) }, select: { id: true, isAdmin: true, isBlocked: true, passwordHash: true } });
  if (!operator?.isAdmin || operator.isBlocked || !operator.passwordHash) throw new Error("管理员身份验证失败。");
  const operatorPassword = await askHidden("管理员当前密码：");
  if (!(await verifyPassword(operatorPassword, operator.passwordHash))) throw new Error("管理员身份验证失败。");

  const targetUsername = await ask("要重置的账号用户名：");
  const target = await db.user.findUnique({ where: { usernameNormalized: normalizeUsername(targetUsername) }, select: { id: true, username: true, authVersion: true, isBlocked: true } });
  if (!target || target.isBlocked) throw new Error("目标账号不存在或已停用。");
  const reason = await ask("身份复核方式和重置原因（必填）：");
  if (reason.length < 8 || reason.length > 500) throw new Error("复核记录需为 8–500 个字符。");

  const temporaryPassword = await askHidden("新的临时密码：");
  const passwordError = validatePassword(temporaryPassword);
  if (passwordError) throw new Error(passwordError);
  const confirmation = await askHidden("再次输入临时密码：");
  if (confirmation !== temporaryPassword) throw new Error("两次输入的临时密码不一致。");
  const newHash = await hashPassword(temporaryPassword);

  const now = new Date();
  await db.$transaction(async (tx) => {
    const currentOperator = await tx.user.findUnique({ where: { id: operator.id }, select: { isAdmin: true, isBlocked: true, passwordHash: true } });
    if (!currentOperator?.isAdmin || currentOperator.isBlocked || currentOperator.passwordHash !== operator.passwordHash) throw new Error("管理员状态已变化，请重新核验身份。");
    const workspace = await tx.ledgerWorkspace.findFirst({ where: { ownerUserId: target.id, type: "PERSONAL", status: "ACTIVE" }, select: { id: true } });
    if (!workspace) throw new Error("目标账号没有可用的个人经营簿。");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspace.id}, 0))`;
    const changed = await tx.user.updateMany({ where: { id: target.id, authVersion: target.authVersion, isBlocked: false }, data: { passwordHash: newHash, authVersion: { increment: 1 } } });
    if (changed.count !== 1) throw new Error("目标账号已变化，请重新开始操作。");
    await tx.ledgerAgentCredential.updateMany({ where: { userId: target.id, workspaceId: workspace.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.ledgerAuditLog.create({ data: {
      workspaceId: workspace.id,
      actorUserId: operator.id,
      source: "OPERATOR",
      action: "account.admin_password_reset",
      recordType: "USER",
      recordId: target.id,
      metadata: { reason },
    } });
  }, { timeout: 30_000, maxWait: 10_000 });

  stdout.write(`已重置 ${target.username ?? target.id} 的密码，并撤销其网页登录会话与 Agent 授权。临时密码只在终端内输入，没有写入命令历史或审计记录。\n`);
}

try {
  await main();
} catch (error) {
  stdout.write(`${error instanceof Error ? error.message : "密码重置失败。"}\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
