import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;

        // Rate limit: max 5 attempts / 15 min per email.
        const rl = checkRateLimit(email);
        if (!rl.allowed) {
          throw new Error(
            "Príliš veľa pokusov o prihlásenie. Skúste znova o pár minút.",
          );
        }

        let user: AuthUser | null = null;

        // Database lookup only — no demo/fallback credentials.
        try {
          const dbUser = await prisma.user.findUnique({ where: { email } });
          if (dbUser && (await bcrypt.compare(password, dbUser.passwordHash))) {
            user = {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
            };
          }
        } catch {
          // Database unreachable — deny login rather than falling back.
          return null;
        }

        if (!user) return null;

        resetRateLimit(email);
        return user;
      },
    }),
  ],
});
