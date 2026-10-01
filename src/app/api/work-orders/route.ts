import { NextRequest, NextResponse } from "next/server";
import {
  resolveWorkOrderForUnit,
  getDemoUnitsList,
} from "@/lib/inspection/work-order-resolver";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unitId");

    if (!unitId || !unitId.trim()) {
      return NextResponse.json({
        success: true,
        demoUnits: getDemoUnitsList(),
      });
    }

    const workOrder = resolveWorkOrderForUnit(unitId);
    return NextResponse.json({
      success: true,
      workOrder,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Work order not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
