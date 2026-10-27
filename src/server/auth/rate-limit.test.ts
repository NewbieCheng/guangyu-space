import assert from "node:assert/strict";
import { test } from "node:test";
import type { Redis } from "ioredis";
import { createRateLimitGuard, RateLimitUnavailableError } from "./rate-limit";

function makeClient(input: {
  evalResult?: number;
  evalError?: Error;
  delError?: Error;
}) {
  const calls: Array<{ command: "eval" | "del"; args: unknown[] }> = [];
  const client = {
    async eval(...args: unknown[]) {
      calls.push({ command: "eval", args });
      if (input.evalError) throw input.evalError;
      return input.evalResult ?? 1;
    },
    async del(...args: unknown[]) {
      calls.push({ command: "del", args });
      if (input.delError) throw input.delError;
      return 1;
    },
  } as unknown as Pick<Redis, "eval" | "del">;

  return { client, calls };
}

void test("rate limit allows counts within the configured limit and uses the namespaced key", async () => {
  const { client, calls } = makeClient({ evalResult: 2 });
  const guard = createRateLimitGuard(client);

  assert.equal(
    await guard.enforce({
      key: "login:user:demo",
      limit: 2,
      windowSeconds: 900,
    }),
    true,
  );
  assert.deepEqual(calls, [
    {
      command: "eval",
      args: [expectScript, 1, "guangyu:rate:login:user:demo", "900"],
    },
  ]);
});

void test("rate limit rejects counts above the configured limit", async () => {
  const guard = createRateLimitGuard(makeClient({ evalResult: 4 }).client);

  assert.equal(
    await guard.enforce({
      key: "register:ip:local",
      limit: 3,
      windowSeconds: 3600,
    }),
    false,
  );
});

void test("rate limit fails closed with a typed error when Redis is unavailable", async () => {
  const guard = createRateLimitGuard(
    makeClient({ evalError: new Error("connection refused") }).client,
  );

  await assert.rejects(
    guard.enforce({ key: "login:ip:local", limit: 30, windowSeconds: 900 }),
    RateLimitUnavailableError,
  );
});

void test("clearing a rate limit reports Redis failures with the same typed error", async () => {
  const { client, calls } = makeClient({
    delError: new Error("connection refused"),
  });
  const guard = createRateLimitGuard(client);

  await assert.rejects(
    guard.clear("login:user:demo"),
    RateLimitUnavailableError,
  );
  assert.deepEqual(calls, [
    { command: "del", args: ["guangyu:rate:login:user:demo"] },
  ]);
});

const expectScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;
