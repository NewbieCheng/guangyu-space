import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, hasSameOrigin, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { apiErrorResponse, createRecord, isRecordName, listRecords } from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ resource: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const access = await resolveApiViewer(request, "read:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource } = await context.params;
  if (!isRecordName(resource)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 });
  try { return NextResponse.json(await listRecords(resource, viewer, request.nextUrl.searchParams)); }
  catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const access = await resolveApiViewer(request, "write:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource } = await context.params;
  if (!isRecordName(resource)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "接口不存在。" } }, { status: 404 });
  try {
    const item = await createRecord(resource, viewer, await request.json(), request.headers.get("idempotency-key"));
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
