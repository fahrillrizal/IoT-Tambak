import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "./db";

// Type augmentation untuk NextAuth v5
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      needsPassword?: boolean;
      email: string;
      name: string;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    username?: string | null;
    needsPassword?: boolean;
  }
}

// Type augmentation untuk JWT di NextAuth v5
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    needsPassword?: boolean;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email dan password harus diisi");
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new Error("Email atau password salah");
        }

        if (!user.password) {
          throw new Error(
            "Akun ini terdaftar melalui Google. Silakan login dengan Google."
          );
        }

        const isValidPassword = await verifyPassword(password, user.password);

        if (!isValidPassword) {
          throw new Error("Email atau password salah");
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
          username: user.username,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username || "";
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = (token.username as string) || "";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);