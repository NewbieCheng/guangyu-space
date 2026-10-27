import assert from "node:assert/strict";
import test from "node:test";
import { relationFieldsFor, relationRows } from "./record-relations";

void test("customer and partner project associations are written from projects only", () => {
  assert.deepEqual(relationFieldsFor("customers"), {});
  assert.deepEqual(relationFieldsFor("partners"), {});
  assert.deepEqual(relationFieldsFor("projects"), {
    customerIds: "ledgerProjectCustomer",
    partnerIds: "ledgerProjectPartner",
    orderIds: "ledgerOrderProject",
  });
});

void test("project associations create join rows owned by the selected project", () => {
  assert.deepEqual(
    relationRows(
      "projects",
      "ledgerProjectCustomer",
      "workspace-1",
      "project-1",
      ["customer-1"],
    ),
    [
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        customerId: "customer-1",
      },
    ],
  );
  assert.deepEqual(
    relationRows(
      "projects",
      "ledgerProjectPartner",
      "workspace-1",
      "project-1",
      ["partner-1"],
    ),
    [
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        partnerId: "partner-1",
      },
    ],
  );
  assert.throws(() =>
    relationRows(
      "customers",
      "ledgerProjectCustomer",
      "workspace-1",
      "customer-1",
      ["project-1"],
    ),
  );
});
