import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      needsPassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username?: string | null;
    needsPassword?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    needsPassword?: boolean;
  }
}