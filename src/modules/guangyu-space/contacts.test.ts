import assert from "node:assert/strict";
import test from "node:test";
import {
  contactFollowupDate,
  contactLinkPayload,
  contactMaterialLinks,
  PARTNER_DIRECTIONS,
} from "./contacts";

void test("contact follow-up date uses the planned date and never falls back to a deadline", () => {
  assert.equal(
    contactFollowupDate({
      plannedDate: "2026-11-03T00:00:00.000Z",
      dueDate: "2026-11-01T00:00:00.000Z",
    }),
    "2026-11-03",
  );
  assert.equal(
    contactFollowupDate({
      plannedDate: null,
      dueDate: "2026-11-01T00:00:00.000Z",
    }),
    null,
  );
  assert.equal(contactFollowupDate(null), null);
});

void test("contact forms preserve structured material links and accept the previous line format", () => {
  assert.deepEqual(
    contactMaterialLinks([
      { id: "link-1", label: "方案", url: "obsidian://open?vault=work" },
    ]),
    [{ id: "link-1", label: "方案", url: "obsidian://open?vault=work" }],
  );
  assert.deepEqual(
    contactLinkPayload("方案 | /Users/lala/方案.md\nhttps://example.com"),
    [
      { label: "方案", url: "/Users/lala/方案.md" },
      { label: "https://example.com", url: "https://example.com" },
    ],
  );
});

void test("partner direction choices stay aligned with the confirmed six options", () => {
  assert.deepEqual(PARTNER_DIRECTIONS, [
    "资源互补",
    "联合交付",
    "渠道合作",
    "内容合作",
    "顾问支持",
    "其他",
  ]);
});
