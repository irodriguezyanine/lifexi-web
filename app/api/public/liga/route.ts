import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getPublicLiga } from "@/lib/public/liga";

export async function GET() {
  await connection();
  try {
    const data = await getPublicLiga();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar" },
      { status: 500 },
    );
  }
}
