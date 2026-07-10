import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe middleware: uses only `authConfig` (no Prisma/bcrypt).
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect everything except Next.js internals, the auth API, the public
  // (read-only) API consumed by sbdesign.sk, every Vercel cron route (each does its
  // own session/CRON_SECRET check — listing them one by one meant a new cron
  // silently 307'd to /login), the recipient-triggered tracking
  // beacons (api/track — called by unauthenticated email clients), and static files.
  matcher: ["/((?!api/auth|api/public|api/videos/sync|api/leads/scan|api/notifications/run|api/cron|api/booking/slots|api/booking/create|api/booking/config|api/webhooks/brevo|api/track|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
