import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, orderCollectionAmounts, parseYuan, yuanText } from "./money";

void test("money display keeps cents exact beyond JavaScript safe integer range", () => {
  assert.equal(formatMoney("9007199254740993"), "¥90,071,992,547,409.93");
  assert.equal(yuanText("9007199254740993"), "90071992547409.93");
});

void test("money display preserves zero padding and overpayment signs", () => {
  assert.equal(formatMoney("305"), "¥3.05");
  assert.equal(formatMoney("-7"), "¥-0.07");
});

void test("yuan input converts to safe integer cents and rejects excess precision", () => {
  assert.equal(parseYuan("0.05"), 5);
  assert.equal(parseYuan("123456789012.34"), 12_345_678_901_234);
  assert.throws(() => parseYuan("12.345"), /最多两位小数/);
});

void test("order collection status covers unpaid, partial, complete, and missing amount", () => {
  assert.deepEqual(orderCollectionAmounts(10_000n, 0n), {
    receivedCents: 0n,
    receivableCents: 10_000n,
    collectionStatus: "UNPAID",
  });
  assert.deepEqual(orderCollectionAmounts(10_000n, 4_000n), {
    receivedCents: 4_000n,
    receivableCents: 6_000n,
    collectionStatus: "PARTIAL",
  });
  assert.deepEqual(orderCollectionAmounts(10_000n, 10_000n), {
    receivedCents: 10_000n,
    receivableCents: 0n,
    collectionStatus: "PAID",
  });
  assert.deepEqual(orderCollectionAmounts(null, 2_500n), {
    receivedCents: 2_500n,
    receivableCents: null,
    collectionStatus: "PARTIAL",
  });
  assert.equal(orderCollectionAmounts(null, 0n).collectionStatus, "UNPAID");
  assert.equal(orderCollectionAmounts(10_000n, 12_000n).collectionStatus, "PAID");
});
