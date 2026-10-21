import { cookies } from "next/headers";
import { ADMIN_COOKIE, decodeSession } from "@/lib/auth/session";

export async function requireAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const session = decodeSession(token);
  if (!session) {
    const err = new Error("UNAUTHENTICATED");
    throw err;
  }
  return session.u;
}
