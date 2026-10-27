import type { RecordName } from "./record-schemas";

type RelationJoinModel =
  | "ledgerProjectCustomer"
  | "ledgerProjectPartner"
  | "ledgerOrderProject"
  | "ledgerResourceProject";

const relationFieldsByRecord: Partial<
  Record<RecordName, Readonly<Record<string, RelationJoinModel>>>
> = {
  projects: {
    customerIds: "ledgerProjectCustomer",
    partnerIds: "ledgerProjectPartner",
    orderIds: "ledgerOrderProject",
  },
  orders: { projectIds: "ledgerOrderProject" },
  resources: { projectIds: "ledgerResourceProject" },
};

export function relationFieldsFor(
  name: RecordName,
): Readonly<Record<string, RelationJoinModel>> {
  return relationFieldsByRecord[name] ?? {};
}

export function relationRows(
  name: RecordName,
  joinModel: string,
  workspaceId: string,
  recordId: string,
  ids: string[],
): Record<string, string>[] {
  if (
    !Object.values(relationFieldsFor(name)).some((field) => field === joinModel)
  ) {
    throw new Error(`Relation ${joinModel} cannot be written from ${name}`);
  }

  if (joinModel === "ledgerProjectCustomer" && name === "projects") {
    return ids.map((customerId) => ({
      workspaceId,
      projectId: recordId,
      customerId,
    }));
  }
  if (joinModel === "ledgerProjectPartner" && name === "projects") {
    return ids.map((partnerId) => ({
      workspaceId,
      projectId: recordId,
      partnerId,
    }));
  }
  if (joinModel === "ledgerOrderProject") {
    return name === "orders"
      ? ids.map((projectId) => ({ workspaceId, orderId: recordId, projectId }))
      : ids.map((orderId) => ({ workspaceId, projectId: recordId, orderId }));
  }
  if (joinModel === "ledgerResourceProject" && name === "resources") {
    return ids.map((projectId) => ({
      workspaceId,
      resourceId: recordId,
      projectId,
    }));
  }

  throw new Error(`Relation ${joinModel} cannot be written from ${name}`);
}
