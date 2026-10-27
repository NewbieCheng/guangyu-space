import { db } from "@/server/db";
import type { Viewer } from "./context";
import { orderCollectionAmounts } from "../money";

function beijingDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function getSummary(viewer: Viewer) {
  const todayText = beijingDate();
  const today = new Date(`${todayText}T00:00:00.000Z`);
  const monthStart = new Date(`${todayText.slice(0, 7)}-01T00:00:00.000Z`);
  const soon = new Date(today.valueOf() + 7 * 86_400_000);
  const [incomes, monthlyIncomes, projectsInProgress, taskCount, todayTasks, projects, orders] = await Promise.all([
    db.ledgerIncome.findMany({ where: { workspaceId: viewer.workspaceId, deletedAt: null }, select: { amountCents: true } }),
    db.ledgerIncome.findMany({ where: { workspaceId: viewer.workspaceId, deletedAt: null, receivedOn: { gte: monthStart } }, select: { amountCents: true } }),
    db.ledgerProject.count({ where: { workspaceId: viewer.workspaceId, deletedAt: null, status: "IN_PROGRESS" } }),
    db.ledgerTask.count({ where: { workspaceId: viewer.workspaceId, deletedAt: null, plannedDate: today, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, OR: [{ ownerUserId: viewer.userId }, { project: { workspaceId: viewer.workspaceId } }] } }),
    db.ledgerTask.findMany({ where: { workspaceId: viewer.workspaceId, deletedAt: null, plannedDate: { lte: today }, status: { in: ["TODO", "IN_PROGRESS", "WAITING"] }, OR: [{ ownerUserId: viewer.userId }, { project: { workspaceId: viewer.workspaceId } }] }, include: { project: { select: { id: true, name: true, region: true } }, customer: { select: { id: true, name: true } }, partner: { select: { id: true, name: true } } }, orderBy: [{ priority: "asc" }, { plannedDate: "asc" }, { id: "asc" }], take: 12 }),
    db.ledgerProject.findMany({ where: { workspaceId: viewer.workspaceId, deletedAt: null, status: { notIn: ["COMPLETED", "ABANDONED"] }, OR: [{ accessScope: "WORKSPACE" }, { accessScope: "PRIVATE_USER", ownerUserId: viewer.userId }] }, select: { id: true, name: true, businessNumber: true, region: true, status: true, dueDate: true }, orderBy: [{ region: "asc" }, { businessNumber: "asc" }], take: 50 }),
    db.ledgerOrder.findMany({ where: { workspaceId: viewer.workspaceId, deletedAt: null, status: { not: "CANCELED" }, OR: [{ dueDate: { lte: soon } }, { dueDate: null, amountCents: null }] }, include: { customer: { select: { id: true, name: true } }, incomes: { where: { deletedAt: null }, select: { amountCents: true } } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 12 }),
  ]);
  const totalReceived = incomes.reduce((total, income) => total + income.amountCents, 0n);
  const monthReceived = monthlyIncomes.reduce((total, income) => total + income.amountCents, 0n);
  const orderItems = orders.map((order) => {
    const received = order.incomes.reduce((sum, income) => sum + income.amountCents, 0n);
    const collection = orderCollectionAmounts(order.amountCents, received);
    return {
      id: order.id,
      businessNumber: order.businessNumber,
      name: order.name,
      status: order.status,
      dueDate: order.dueDate?.toISOString() ?? null,
      amountCents: order.amountCents?.toString() ?? null,
      receivedCents: collection.receivedCents.toString(),
      receivableCents: collection.receivableCents?.toString() ?? null,
      collectionStatus: collection.collectionStatus,
      customer: order.customer,
    };
  });
  const regions = ["SERVICE", "PRODUCT", "BUSINESS", "EXPLORATION", "NON_BUSINESS"];
  const regionCards = regions.map((region) => ({ region, projects: projects.filter((project) => project.region === region) }));
  return {
    today: todayText,
    metrics: { totalReceivedCents: totalReceived.toString(), monthReceivedCents: monthReceived.toString(), projectsInProgress, tasksToday: taskCount },
    todayTasks,
    projects: regionCards,
    learningProjects: projects.filter((project) => project.region === "LEARNING"),
    deliveryOrders: orderItems,
  };
}
