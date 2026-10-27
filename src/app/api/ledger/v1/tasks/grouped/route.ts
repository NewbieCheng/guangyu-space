import { NextResponse, type NextRequest } from "next/server";
import {
  apiAccessFailure,
  resolveApiViewer,
} from "@/modules/guangyu-space/server/context";
import {
  apiErrorResponse,
  listGroupedTasks,
} from "@/modules/guangyu-space/server/records";

export async function GET(request: NextRequest) {
  const access = await resolveApiViewer(request, "read:records");
  if (access.failure) return apiAccessFailure(access.failure);
  try {
    return NextResponse.json(
      await listGroupedTasks(access.viewer, request.nextUrl.searchParams),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
