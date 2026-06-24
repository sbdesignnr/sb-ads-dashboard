import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe middleware: uses only `authConfig` (no Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except Next.js internals, the auth API, and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
