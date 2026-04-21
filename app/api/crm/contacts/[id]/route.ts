import { NextResponse } from "next/server";
import { fetchContactDetail } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rowKey = decodeURIComponent(params.id ?? "");
  if (!rowKey || (!rowKey.startsWith("c:") && !rowKey.startsWith("u:"))) {
    return NextResponse.json({ error: "invalid rowKey" }, { status: 400 });
  }
  try {
    const detail = await fetchContactDetail(rowKey);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
