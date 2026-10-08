import { NextRequest, NextResponse } from "next/server";
import { failOpenPrepRound3, handlePrepRound3, publicErrorMessage, unparsedBodyOutput, coerceRound3Input } from "@/lib/round3/run";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(unparsedBodyOutput(), { status: 200 });
  }
  try {
    const result = await handlePrepRound3(body);
    return NextResponse.json(result.output, { status: result.httpStatus });
  } catch (err) {
    return NextResponse.json(failOpenPrepRound3(coerceRound3Input(body), publicErrorMessage(err)), { status: 200 });
  }
}
