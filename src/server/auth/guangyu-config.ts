import { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/server/db";
import { verifyPassword } from "./password";
import {
  clearRateLimit,
  enforceRateLimit,
  RateLimitUnavailableError,
  requestIpKey,
} from "./rate-limit";
import { normalizeUsername } from "./username";

const INVALID_CREDENTIALS = "用户名或密码错误。";
const DUMMY_HASH =
  "$2b$12$mzq4zQ1MzF0bDU7ytBisteBt7YDnfG3/BaXI7hVQj.4XAZvaGPrbW";

class RateLimitUnavailableSigninError extends CredentialsSignin {
  code = "rate-limit-unavailable";
}

export const guangyuAuthConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "用户名和密码",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials, request) {
        const username =
          typeof credentials?.username === "string" ? credentials.username : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        const normalized = normalizeUsername(username);
        const ip = requestIpKey(request.headers);
        let ipAllowed: boolean;
        let usernameAllowed: boolean;
        try {
          ipAllowed = await enforceRateLimit({
            key: `login:ip:${ip}`,
            limit: 30,
            windowSeconds: 900,
          });
          usernameAllowed = await enforceRateLimit({
            key: `login:user:${normalized}`,
            limit: 15,
            windowSeconds: 900,
          });
        } catch (error) {
          if (error instanceof RateLimitUnavailableError)
            throw new RateLimitUnavailableSigninError();
          throw error;
        }
        if (!ipAllowed || !usernameAllowed)
          throw new Error("登录尝试过于频繁，请稍后再试。");

        const user = normalized
          ? await db.user.findUnique({
              where: { usernameNormalized: normalized },
              select: {
                id: true,
                username: true,
                name: true,
                passwordHash: true,
                authVersion: true,
                isAdmin: true,
                isBlocked: true,
              },
            })
          : null;
        const passwordHash = user?.passwordHash ?? DUMMY_HASH;
        const valid = await verifyPassword(password, passwordHash);
        const passwordBytes = new TextEncoder().encode(password).byteLength;
        if (
          !user ||
          user.isBlocked ||
          !user.passwordHash ||
          !valid ||
          passwordBytes > 72
        ) {
          throw new Error(INVALID_CREDENTIALS);
        }

        try {
          await clearRateLimit(`login:user:${normalized}`);
        } catch (error) {
          if (error instanceof RateLimitUnavailableError)
            throw new RateLimitUnavailableSigninError();
          throw error;
        }
        return {
          id: user.id,
          name: user.name ?? user.username,
          username: user.username ?? normalized,
          authVersion: user.authVersion,
          isAdmin: user.isAdmin,
          isBlocked: user.isBlocked,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authenticatedUser = user as typeof user & {
          username: string;
          authVersion: number;
          isAdmin: boolean;
          isBlocked: boolean;
        };
        token.sub = authenticatedUser.id;
        token.username = authenticatedUser.username;
        token.authVersion = authenticatedUser.authVersion;
        token.isAdmin = authenticatedUser.isAdmin;
        token.isBlocked = authenticatedUser.isBlocked;
      }

      if (!token.sub || typeof token.authVersion !== "number") return {};
      const current = await db.user.findUnique({
        where: { id: token.sub },
        select: {
          username: true,
          authVersion: true,
          isAdmin: true,
          isBlocked: true,
        },
      });
      if (
        !current ||
        current.isBlocked ||
        current.authVersion !== token.authVersion
      )
        return {};
      token.username = current.username;
      token.isAdmin = current.isAdmin;
      token.isBlocked = current.isBlocked;
      return token;
    },
    session({ session, token }) {
      const id = typeof token.sub === "string" ? token.sub : "";
      const username = typeof token.username === "string" ? token.username : "";
      const authVersion =
        typeof token.authVersion === "number" ? token.authVersion : undefined;
      return {
        ...session,
        user: {
          ...session.user,
          id: authVersion === undefined ? "" : id,
          username,
          authVersion,
          isAdmin: token.isAdmin === true,
          isBlocked: token.isBlocked === true,
          name: username || null,
          email: undefined,
        },
      };
    },
  },
};
