import { NextResponse, type NextRequest } from "next/server";
import { apiAccessFailure, resolveApiViewer } from "@/modules/guangyu-space/server/context";
import { apiErrorResponse, listCompletedTasks } from "@/modules/guangyu-space/server/records";

export async function GET(request: NextRequest) {
  const access = await resolveApiViewer(request, "tasks:history");
  if (access.failure) return apiAccessFailure(access.failure);
  const { viewer } = access;
  try { return NextResponse.json(await listCompletedTasks(viewer, request.nextUrl.searchParams)); }
  catch (error) { return apiErrorResponse(error); }
}
