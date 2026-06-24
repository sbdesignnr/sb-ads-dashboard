import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration shared between the middleware (Edge runtime)
 * and the full auth instance (Node runtime). It MUST NOT import anything that
 * relies on Node-only APIs (Prisma, bcrypt, fs, ...). Those live in `auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");

      // The login page is the only public route under the matcher.
      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Everything else requires an authenticated session.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "admin";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "admin";
      }
      return session;
    },
  },
  providers: [], // populated in auth.ts (Node runtime)
} satisfies NextAuthConfig;
