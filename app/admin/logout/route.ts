import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const toPublic = request.nextUrl.searchParams.get("to") === "public";
  const res = NextResponse.redirect(new URL(toPublic ? "/" : "/login", request.url), 303);
  res.cookies.set(ADMIN_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
