import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import NextAuth, { DefaultSession } from "next-auth";
import type { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "./db";

const JWT_SECRET =
  process.env.NEXTAUTH_SECRET || "fallback-secret-change-in-production";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      username: string;
      needsPassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
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

export function generateToken(payload: any): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma) as any,
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
            "Akun ini terdaftar melalui OAuth. Silakan login dengan Google."
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
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          image: profile.picture,
          username: (profile.email || "").split("@")[0],
        } as any;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Jika OAuth login/register
      if (account?.provider === 'google') {
        const oauthEmail = user.email;
        
        // Cek apakah ada user dengan email ini
        const existingUser = await prisma.user.findUnique({
          where: { email: oauthEmail! },
        });
        
        // Cek apakah akun OAuth ini sudah terhubung ke user lain
        const existingAccount = await prisma.account.findFirst({
          where: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        });
        
        if (existingAccount) {
          // Akun OAuth sudah terhubung, izinkan login
          return true;
        }
        
        if (existingUser) {
          // User dengan email ini sudah ada, link akun OAuth ke user tersebut
          await prisma.account.create({
            data: {
              userId: existingUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              expires_at: account.expires_at,
            },
          });
          return true;
        }
        
        // User baru, biarkan PrismaAdapter handle pembuatan user
        return true;
      }
      
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        // Untuk OAuth, cari user dari database berdasarkan email karena user.id dari OAuth bukan ID database
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          select: { id: true, username: true, password: true }
        });
        
        if (dbUser) {
          token.id = dbUser.id.toString();
          token.username = dbUser.username;
          token.needsPassword = !dbUser.password;
        } else {
          // Fallback untuk credentials login
          token.id = (user as any).id;
          token.username = (user as any).username;
          token.needsPassword = false;
        }
        
        token.iat = Math.floor(Date.now() / 1000);
        token.exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      }

      if (token.exp && Date.now() >= (token.exp as number) * 1000) {
        return {};
      }

      const timeUntilExpiry =
        (token.exp as number) - Math.floor(Date.now() / 1000);
      const shouldRefresh = timeUntilExpiry < 6 * 60 * 60;

      if (shouldRefresh) {
        token.iat = Math.floor(Date.now() / 1000);
        token.exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token || !token.id) {
        return null as any;
      }

      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).username = token.username as string;
        (session.user as any).needsPassword = token.needsPassword as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
    updateAge: 6 * 60 * 60,
  },
  jwt: {
    maxAge: 24 * 60 * 60,
  },
  secret: JWT_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
