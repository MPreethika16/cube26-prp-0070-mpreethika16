import { NextRequest, NextResponse } from "next/server";
import {
  isSupportedDemoUnit,
  loadDemoFixtureImages,
} from "@/lib/inspection/demo-fixture-loader";
import { resolveWorkOrderForUnit } from "@/lib/inspection/work-order-resolver";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unitId = searchParams.get("unitId");

    if (!unitId || !unitId.trim()) {
      return NextResponse.json(
        { error: "Query parameter 'unitId' is required." },
        { status: 400 }
      );
    }

    const rawVariant = searchParams.get("variant");
    const variant: "default" | "closeup" | "corrected" =
      rawVariant === "closeup"
        ? "closeup"
        : rawVariant === "corrected"
        ? "corrected"
        : "default";
    const slotId = searchParams.get("slot") as "front" | "back" | "label" | null;

    if (!isSupportedDemoUnit(unitId)) {
      return NextResponse.json(
        {
          error: `Demo fixtures are available for SAMPLE-01, SAMPLE-02, SAMPLE-03, UNIT-0001, and UNIT-0002. Received: ${unitId}`,
        },
        { status: 404 }
      );
    }

    const workOrder = resolveWorkOrderForUnit(unitId);

    if (slotId) {
      const { loadDemoFixtureSlot } = await import("@/lib/inspection/demo-fixture-loader");
      const slotImage = loadDemoFixtureSlot(unitId, slotId, variant);
      return NextResponse.json({
        success: true,
        unitId,
        workOrder,
        slotImage,
      });
    }

    const fixturePayload = loadDemoFixtureImages(unitId, { variant });

    return NextResponse.json({
      success: true,
      unitId,
      workOrder,
      images: fixturePayload.images,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
