import { NextRequest, NextResponse } from "next/server";

const CM_URL = process.env.CONTENT_MACHINE_URL || "http://127.0.0.1:8000";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const upstream = `${CM_URL}/${path.join("/")}${req.nextUrl.search}`;
  try {
    const res = await fetch(upstream, { headers: { Accept: "application/json" } });
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
      return new NextResponse(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "ContentMachine backend unavailable. Run: uvicorn app:app --reload" }, { status: 503 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const upstream = `${CM_URL}/${path.join("/")}`;
  try {
    const contentType = req.headers.get("content-type") || "";
    let res: Response;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      res = await fetch(upstream, { method: "POST", body: formData });
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      res = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      const formData = await req.formData();
      res = await fetch(upstream, { method: "POST", body: formData });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "ContentMachine backend unavailable" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const upstream = `${CM_URL}/${path.join("/")}`;
  try {
    const body = await req.json();
    const res = await fetch(upstream, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "ContentMachine backend unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const upstream = `${CM_URL}/${path.join("/")}`;
  try {
    const res = await fetch(upstream, { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "ContentMachine backend unavailable" }, { status: 503 });
  }
}
