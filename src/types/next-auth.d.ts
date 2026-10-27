import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      username?: string;
      authVersion?: number;
      isAdmin: boolean;
      isBlocked: boolean;
      isPrimaryDeviceAccount?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string;
    authVersion?: number;
    isAdmin?: boolean;
    isBlocked?: boolean;
    isPrimaryDeviceAccount?: boolean;
    createdAt?: Date;
    createdByEmailCode?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    username?: string;
    authVersion?: number;
    isAdmin?: boolean;
    isBlocked?: boolean;
  }
}
