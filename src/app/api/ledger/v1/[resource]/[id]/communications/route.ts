import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, hasSameOrigin, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { ApiError, apiErrorResponse, appendCommunication, listCommunications } from "@/modules/guangyu-space/server/records";

type RouteContext = { params: Promise<{ resource: string; id: string }> };

function personType(value: string): "CUSTOMER" | "PARTNER" {
  if (value === "customers") return "CUSTOMER";
  if (value === "partners") return "PARTNER";
  throw new ApiError(404, "NOT_FOUND", "接口不存在。");
}

export async function GET(request: NextRequest, context: RouteContext) {
  const access = await resolveApiViewer(request, "read:records");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource, id } = await context.params;
  try { return NextResponse.json(await listCommunications(viewer, personType(resource), id, request.nextUrl.searchParams)); }
  catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: { code: "INVALID_ORIGIN", message: "请求来源无效。" } }, { status: 403 });
  const access = await resolveApiViewer(request, "append:communications");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  const { resource, id } = await context.params;
  try { const body: unknown = await request.json(); return NextResponse.json({ item: await appendCommunication(viewer, personType(resource), id, body, request.headers.get("idempotency-key")) }, { status: 201 }); }
  catch (error) { return apiErrorResponse(error); }
}
