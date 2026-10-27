import assert from "node:assert/strict";
import test from "node:test";
import { toLocalFileUrl } from "./material-url";

void test("local material URLs encode Chinese and spaces on macOS-style paths", () => {
  const url = new URL(toLocalFileUrl("/Users/lala/资料 文件/项目.docx"));
  assert.equal(url.protocol, "file:");
  assert.equal(url.pathname, "/Users/lala/%E8%B5%84%E6%96%99%20%E6%96%87%E4%BB%B6/%E9%A1%B9%E7%9B%AE.docx");
});

void test("local material URLs normalize Windows drive paths", () => {
  const url = new URL(toLocalFileUrl("C:\\资料\\项目 文件.docx"));
  assert.equal(url.href, "file:///C:/%E8%B5%84%E6%96%99/%E9%A1%B9%E7%9B%AE%20%E6%96%87%E4%BB%B6.docx");
});

void test("local material URLs reject relative and remote paths", () => {
  assert.throws(() => toLocalFileUrl("docs/file.docx"), /完整的本机路径/);
  assert.throws(() => toLocalFileUrl("file://server/share/file.docx"), /仅支持当前设备/);
});
