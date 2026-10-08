import { NextResponse } from "next/server";
import { buildHealthReport } from "@/lib/round3/health";

export async function GET() {
  const report = await buildHealthReport();
  return NextResponse.json(report, { status: 200 });
}
