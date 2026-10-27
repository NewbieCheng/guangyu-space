import { NextResponse } from "next/server";
import { requireViewer } from "@/modules/guangyu-space/server/context";
import { exportPersonalBackup } from "@/modules/guangyu-space/server/backup";

export async function GET() {
  const viewer = await requireViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "请先登录。" } }, { status: 401 });
  try {
    const backup = await exportPersonalBackup(viewer);
    return new Response(backup.body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${backup.fileName}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: { code: "BACKUP_FAILED", message: "备份暂时不可用。" } }, { status: 500 });
  }
}
