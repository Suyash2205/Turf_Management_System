import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { logAudit } from "@/lib/audit-log";
import type { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const email = (credentials.email as string).trim().toLowerCase();
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user) {
            await logAudit({
              action: "LOGIN_FAILED",
              userEmail: email,
              summary: `Failed login attempt for ${email}`,
            });
            return null;
          }

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );
          if (!valid) {
            await logAudit({
              action: "LOGIN_FAILED",
              userEmail: email,
              summary: `Failed login attempt for ${email}`,
            });
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          console.error("Auth authorize error:", error);
          return null;
        }
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user.id || !user.email) return;
      await logAudit({
        action: "LOGIN",
        actor: {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
          role: user.role as UserRole,
        },
        summary: `${user.email} logged in`,
      });
    },
  },
});
