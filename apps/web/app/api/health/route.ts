import { NextResponse } from "next/server";
import { checkAllHealth } from "../../../lib/backends";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const statuses = await checkAllHealth();
  return NextResponse.json({ statuses });
}
