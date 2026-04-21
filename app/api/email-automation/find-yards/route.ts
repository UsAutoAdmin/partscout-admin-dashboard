import { NextResponse } from "next/server";
import { findNearestYardForZip } from "@/lib/new-member/yards";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { members } = (await request.json()) as {
      members: { id: string; zipCode: string }[];
    };

    if (!members?.length) {
      return NextResponse.json({ error: "members required" }, { status: 400 });
    }

    const uniqueZips = Array.from(new Set(members.map((m) => m.zipCode.trim())));
    const yardByZip = new Map<string, Awaited<ReturnType<typeof findNearestYardForZip>>>();

    await Promise.all(
      uniqueZips.map(async (zip) => {
        const r = await findNearestYardForZip(zip);
        yardByZip.set(zip, r);
      }),
    );

    const results: Record<
      string,
      {
        yard: {
          id: string;
          name: string;
          city: string;
          state: string;
          url: string;
          chainType: string;
        } | null;
        distance: number | null;
        geoCity: string | null;
        error: string | null;
        tooFarForDrive: boolean;
      }
    > = {};

    for (const member of members) {
      const r = yardByZip.get(member.zipCode.trim());
      if (!r) {
        results[member.id] = {
          yard: null,
          distance: null,
          geoCity: null,
          error: "Unknown ZIP",
          tooFarForDrive: false,
        };
        continue;
      }
      results[member.id] = {
        yard: r.yard,
        distance: r.distanceMiles,
        geoCity: r.geoCity,
        error: r.error,
        tooFarForDrive: r.tooFarForDrive,
      };
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
