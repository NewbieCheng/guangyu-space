import assert from "node:assert/strict";
import test from "node:test";
import {
  filterMultiSelectOptions,
  normalizeMultiSelectValues,
  toggleMultiSelectValue,
} from "./multi-select";

void test("empty or missing association selections stay empty", () => {
  assert.deepEqual(normalizeMultiSelectValues(undefined), []);
  assert.deepEqual(normalizeMultiSelectValues([]), []);
});

void test("association selections preserve valid unique IDs", () => {
  assert.deepEqual(
    normalizeMultiSelectValues(["project-1", "project-1", "", 12, "project-2"]),
    ["project-1", "project-2"],
  );
});

void test("association options can be searched by their visible labels", () => {
  const options = [
    ["project-1", "XM00001 · Garden plan"],
    ["project-2", "XM00002 · Well repair"],
  ] as const;

  assert.deepEqual(filterMultiSelectOptions(options, "well"), [options[1]]);
  assert.deepEqual(filterMultiSelectOptions(options, " "), [...options]);
});

void test("association options can be selected independently and cleared", () => {
  const selected = toggleMultiSelectValue(["project-1"], "project-2", true);

  assert.deepEqual(selected, ["project-1", "project-2"]);
  assert.deepEqual(toggleMultiSelectValue(selected, "project-1", false), [
    "project-2",
  ]);
  assert.deepEqual(toggleMultiSelectValue([], "project-2", false), []);
});
