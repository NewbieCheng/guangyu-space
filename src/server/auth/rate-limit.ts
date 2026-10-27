import type { Redis } from "ioredis";
import { env } from "@/env";
import { createLogger } from "@/lib/logger";
import { redis as sharedRedis } from "@/server/redis";

const logger = createLogger("auth-rate-limit");
const RATE_LIMIT_COMMAND_TIMEOUT_MS = 5_000;
let redisUnavailableLogged = false;

const INCREMENT_WITH_EXPIRY = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("Rate limiting is temporarily unavailable.");
    this.name = "RateLimitUnavailableError";
  }
}

type RateLimitRedisClient = Pick<Redis, "eval" | "del">;
type RateLimitInput = { key: string; limit: number; windowSeconds: number };
type RateLimitGuard = {
  enforce(input: RateLimitInput): Promise<boolean>;
  clear(key: string): Promise<void>;
};

export function createInMemoryRateLimitGuard(
  now: () => number = () => Date.now(),
): RateLimitGuard {
  const counters = new Map<string, { count: number; expiresAt: number }>();

  function pruneExpired(currentTime: number) {
    for (const [key, counter] of counters) {
      if (counter.expiresAt <= currentTime) counters.delete(key);
    }
  }

  return {
    async enforce(input) {
      const currentTime = now();
      const key = `guangyu:rate:${input.key}`;
      let counter = counters.get(key);
      if (!counter || counter.expiresAt <= currentTime) {
        counter = {
          count: 0,
          expiresAt: currentTime + input.windowSeconds * 1000,
        };
      }
      counter.count += 1;
      counters.set(key, counter);

      if (counters.size > 5_000) pruneExpired(currentTime);
      return counter.count <= input.limit;
    },
    async clear(key) {
      counters.delete(`guangyu:rate:${key}`);
    },
  };
}

export function createRateLimitGuard(client: RateLimitRedisClient) {
  async function enforce(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    try {
      const count = Number(
        await client.eval(
          INCREMENT_WITH_EXPIRY,
          1,
          `guangyu:rate:${input.key}`,
          String(input.windowSeconds),
        ),
      );
      return count <= input.limit;
    } catch {
      throw new RateLimitUnavailableError();
    }
  }

  async function clear(key: string): Promise<void> {
    try {
      await client.del(`guangyu:rate:${key}`);
    } catch {
      throw new RateLimitUnavailableError();
    }
  }

  return { enforce, clear };
}

function createRedisRateLimitGuard(): RateLimitGuard {
  // Keep the shared Redis client's unlimited retry behavior for BullMQ. Auth
  // uses a duplicate with bounded retries so a Redis outage cannot hang login.
  const rateLimitRedis = sharedRedis.duplicate({
    maxRetriesPerRequest: 1,
    commandTimeout: RATE_LIMIT_COMMAND_TIMEOUT_MS,
    connectTimeout: RATE_LIMIT_COMMAND_TIMEOUT_MS,
  });

  rateLimitRedis.on("error", (error) => {
    if (redisUnavailableLogged) return;
    redisUnavailableLogged = true;
    logger.warn(
      { code: (error as NodeJS.ErrnoException).code },
      "Authentication rate limiting Redis connection error",
    );
  });
  rateLimitRedis.on("ready", () => {
    redisUnavailableLogged = false;
  });

  return createRateLimitGuard(rateLimitRedis);
}

const rateLimitGuard =
  env.NODE_ENV === "development"
    ? createInMemoryRateLimitGuard()
    : createRedisRateLimitGuard();

export async function enforceRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<boolean> {
  return rateLimitGuard.enforce(input);
}

export async function clearRateLimit(key: string): Promise<void> {
  return rateLimitGuard.clear(key);
}

export function requestIpKey(headers: Headers): string {
  // The deployment proxy must replace these headers. Local access falls back to one shared key.
  const raw =
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",", 1)[0];
  return (raw?.trim() || "local").slice(0, 100);
}
