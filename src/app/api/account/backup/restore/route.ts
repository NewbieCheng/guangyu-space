import { NextResponse, type NextRequest } from "next/server";
import { hasSameOrigin, requireViewer } from "@/modules/guangyu-space/server/context";
import { executePersonalRestore, parseBackupJson } from "@/modules/guangyu-space/server/backup";
import { apiErrorResponse } from "@/modules/guangyu-space/server/records";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const viewer = await requireViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "请先登录。" } }, { status: 401 });
  const restoreId = request.headers.get("x-restore-id") ?? "";
  try { return NextResponse.json(await executePersonalRestore(viewer, restoreId, parseBackupJson(await request.text()))); }
  catch (error) { return apiErrorResponse(error); }
}
