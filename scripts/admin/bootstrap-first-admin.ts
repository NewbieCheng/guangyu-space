import "dotenv/config";
import { StringDecoder } from "node:string_decoder";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "@/server/auth/username";
import { verifyPassword } from "@/server/auth/password";

const db = new PrismaClient();

async function ask(question: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return (await prompt.question(question)).trim(); }
  finally { prompt.close(); }
}

function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") throw new Error("密码只能在交互式终端输入。");
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
        if (character === "\u007f" || character === "\b") value = [...value].slice(0, -1).join("");
        else if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("此操作仅允许在交互式终端运行。");
  const username = await ask("首次管理员账号用户名：");
  const user = await db.user.findUnique({ where: { usernameNormalized: normalizeUsername(username) }, select: { id: true, username: true, passwordHash: true, isBlocked: true } });
  if (!user || user.isBlocked || !user.passwordHash || !(await verifyPassword(await askHidden("账号当前密码："), user.passwordHash))) throw new Error("账号身份验证失败。");
  const reason = await ask("身份核验方式和首次管理员设置原因：");
  if (reason.length < 8 || reason.length > 500) throw new Error("复核记录需为 8–500 个字符。");
  if (await ask('确认这是首个管理员账号？输入 "SET FIRST ADMIN" 继续：') !== "SET FIRST ADMIN") throw new Error("已取消。");

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('guangyu-first-admin-bootstrap', 0))`;
    if (await tx.user.count({ where: { isAdmin: true } }) > 0) throw new Error("管理员已存在；此一次性引导已关闭。");
    const current = await tx.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, isBlocked: true } });
    if (!current || current.isBlocked || current.passwordHash !== user.passwordHash) throw new Error("账号状态已变化，请重新验证身份。");
    const workspace = await tx.ledgerWorkspace.findFirst({ where: { ownerUserId: user.id, type: "PERSONAL", status: "ACTIVE" }, select: { id: true } });
    if (!workspace) throw new Error("账号没有可用的个人经营簿。");
    await tx.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    await tx.ledgerAuditLog.create({ data: {
      workspaceId: workspace.id,
      actorUserId: user.id,
      source: "OPERATOR",
      action: "admin.first_account_promoted",
      recordType: "USER",
      recordId: user.id,
      metadata: { reason },
    } });
  }, { timeout: 30_000, maxWait: 10_000 });
  stdout.write(`已将 ${user.username ?? user.id} 设为首个管理员。\n`);
}

try {
  await main();
} catch (error) {
  stdout.write(`${error instanceof Error ? error.message : "管理员初始化失败。"}\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
