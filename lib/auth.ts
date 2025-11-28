import bcrypt from "bcryptjs";
import NextAuth, { DefaultSession } from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      needsPassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string | null;
    needsPassword?: boolean;
  }
}

declare module "next-auth/jwt" {
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
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email dan password harus diisi");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) {
          throw new Error("Email atau password salah");
        }

        if (!user.password) {
          throw new Error(
            "Akun ini terdaftar melalui Google. Silakan login dengan Google."
          );
        }

        const isValidPassword = await verifyPassword(
          credentials.password as string,
          user.password
        );

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
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
      profile(profile) {
        const emailPrefix = (profile.email || "").split("@")[0];
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name || emailPrefix,
          image: profile.picture,
          username: emailPrefix,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        return { ...token, ...session.user };
      }

      if (user) {
        token.id = user.id!;
        token.username = user.username || "";
        token.email = user.email || "";
        token.name = user.name || "";
        token.picture = user.image || "";
        token.needsPassword = false;
      }

      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.email = token.email || "";
        session.user.name = token.name || "";
        session.user.image = token.picture || "";
        session.user.username = token.username || "";
        session.user.needsPassword = token.needsPassword || false;
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
