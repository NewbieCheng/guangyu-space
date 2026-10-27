import assert from "node:assert/strict";
import test from "node:test";
import { isSameOriginRequest } from "./request-origin";

function postRequest(url: string, origin?: string, host?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (host) headers.set("host", host);
  return new Request(url, { method: "POST", headers });
}

void test("accepts a request whose Origin matches its URL", () => {
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://localhost:3000/api/ledger/v1/customers",
        "http://localhost:3000",
      ),
    ),
    true,
  );
});

void test("accepts the public Host when the server URL uses an internal host", () => {
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://internal-web:3003/api/ledger/v1/customers",
        "http://localhost:3003",
        "localhost:3003",
      ),
    ),
    true,
  );
});

void test("accepts the configured public app origin behind an HTTPS proxy", () => {
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://internal-web:3000/api/ledger/v1/customers",
        "https://ledger.example.com",
        "internal-web:3000",
      ),
      "https://ledger.example.com",
    ),
    true,
  );
});

void test("rejects requests from an unrelated origin", () => {
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://localhost:3000/api/ledger/v1/customers",
        "https://attacker.example",
        "localhost:3000",
      ),
      "http://localhost:3000",
    ),
    false,
  );
});

void test("rejects missing and malformed origins", () => {
  assert.equal(
    isSameOriginRequest(
      postRequest("http://localhost:3000/api/ledger/v1/customers"),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://localhost:3000/api/ledger/v1/customers",
        "not-an-origin",
      ),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      postRequest(
        "http://localhost:3000/api/ledger/v1/customers",
        "http://localhost:3000/path",
      ),
    ),
    false,
  );
});
