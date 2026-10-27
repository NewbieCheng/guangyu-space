import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUsername, validatePassword, validateUsername } from "./username";

void test("username normalization applies Unicode compatibility normalization and case folding", () => {
  assert.equal(normalizeUsername("  Ａlice_1  "), "alice_1");
  assert.equal(validateUsername("Ａlice_1"), null);
});

void test("username validation enforces the documented alphabet and length", () => {
  assert.match(validateUsername(".alice") ?? "", /用户名需为/);
  assert.match(validateUsername("ab") ?? "", /用户名需为/);
  assert.equal(validateUsername("farm-owner.2026"), null);
});

void test("password validation checks characters and bcrypt UTF-8 byte limit", () => {
  assert.equal(validatePassword("经营密码".repeat(3)), null);
  assert.match(validatePassword("short") ?? "", /至少需要/);
  assert.match(validatePassword("汉".repeat(25)) ?? "", /72 个 UTF-8 字节/);
});
