import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, hasSameOrigin, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { apiErrorResponse, parseExpectedVersion, setTaskCompletion } from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const access = await resolveApiViewer(request, "tasks:complete");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { id } = await context.params;
  try {
    const body: unknown = await request.json();
    return NextResponse.json({ item: await setTaskCompletion(viewer, id, parseExpectedVersion(request, body), false, request.headers.get("idempotency-key")) });
  } catch (error) { return apiErrorResponse(error); }
}
