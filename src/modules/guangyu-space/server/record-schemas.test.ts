import assert from "node:assert/strict";
import test from "node:test";
import { schemas } from "./record-schemas";

void test("customer and partner inputs do not accept project associations", () => {
  assert.equal(
    schemas.customers.create.safeParse({
      name: "客户甲",
      projectIds: ["project-1"],
    }).success,
    false,
  );
  assert.equal(
    schemas.customers.patch.safeParse({ projectIds: ["project-1"] }).success,
    false,
  );
  assert.equal(
    schemas.partners.create.safeParse({
      name: "合作方甲",
      projectIds: ["project-1"],
    }).success,
    false,
  );
  assert.equal(
    schemas.partners.patch.safeParse({ projectIds: ["project-1"] }).success,
    false,
  );
});

void test("projects can be created without related contacts and clear associations", () => {
  assert.equal(
    schemas.projects.create.safeParse({ name: "项目甲", region: "SERVICE" })
      .success,
    true,
  );
  assert.equal(
    schemas.projects.create.safeParse({
      name: "项目甲",
      region: "SERVICE",
      customerIds: [],
      partnerIds: [],
    }).success,
    true,
  );
  assert.equal(
    schemas.projects.patch.safeParse({ customerIds: [], partnerIds: [] })
      .success,
    true,
  );
});

void test("income method can be omitted or left empty on create and update", () => {
  const requiredIncome = { receivedOn: "2026-10-15", amountCents: 500 };
  assert.equal(schemas.incomes.create.safeParse(requiredIncome).success, true);
  assert.equal(schemas.incomes.create.safeParse({ ...requiredIncome, method: null }).success, true);
  assert.equal(schemas.incomes.patch.safeParse({ method: null }).success, true);
  assert.equal(schemas.incomes.create.safeParse({ ...requiredIncome, method: "WECHAT" }).success, true);
});

void test("tasks can associate a customer and partner at the same time", () => {
  assert.equal(
    schemas.tasks.create.safeParse({
      name: "共同跟进",
      customerId: "customer-1",
      partnerId: "partner-1",
    }).success,
    true,
  );
  assert.equal(
    schemas.tasks.patch.safeParse({
      customerId: "customer-1",
      partnerId: "partner-1",
    }).success,
    true,
  );
});
