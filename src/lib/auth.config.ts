import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      if (pathname.startsWith("/login")) {
        if (isLoggedIn) {
          const role = auth.user?.role;
          return Response.redirect(
            new URL(role === "ADMIN" ? "/admin" : "/staff", nextUrl)
          );
        }
        return true;
      }

      if (!isLoggedIn) return false;

      if (pathname.startsWith("/admin") && auth.user?.role !== "ADMIN") {
        return Response.redirect(new URL("/staff", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "STAFF" | "ADMIN";
      return session;
    },
  },
} satisfies NextAuthConfig;
