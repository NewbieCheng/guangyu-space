"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, ClipboardCheck, ClipboardList, FolderKanban, Handshake, LayoutDashboard, LibraryBig, Lightbulb, ListTodo, LogOut, Package, Settings2, UsersRound, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { contactFollowupDate, contactLinkPayload, contactMaterialLinks, PARTNER_DIRECTIONS } from "../contacts";
import { filterMultiSelectOptions, normalizeMultiSelectValues, toggleMultiSelectValue } from "../multi-select";
import { formatMoney, integerCents, parseYuan, yuanText } from "../money";
import { toLocalFileUrl } from "../material-url";
import type { TaskGroupsResponse } from "../server/task-groups";

type EntityKey = "customers" | "partners" | "projects" | "tasks" | "orders" | "incomes" | "resources" | "experiences" | "products" | "reviews";
type ViewKey = EntityKey | "overview" | "settings" | "learning";
type JsonRecord = { id: string; version?: number; businessNumber?: string; [key: string]: unknown };
type Option = { id: string; name: string; businessNumber?: string };
type Field = { name: string; label: string; kind?: "text" | "textarea" | "date" | "select" | "multi" | "money" | "tags" | "links" | "directions"; required?: boolean; options?: Array<[string, string]>; from?: EntityKey; placeholder?: string; helperText?: string };
type EntityConfig = { title: string; singular: string; description: string; fields: Field[]; columns: string[]; filters?: Array<[string, string, Array<[string, string]>]> };

type EnumKey = "customerStatus" | "partnerStatus" | "projectStatus" | "taskStatus" | "priority" | "region" | "learningRegion" | "upgrade" | "orderStatus" | "incomeMethod" | "productStatus" | "reviewType";
const ENUMS: Record<EnumKey, Array<[string, string]>> = {
  customerStatus: [["POTENTIAL", "潜在客户"], ["NEGOTIATING", "洽谈中"], ["ACTIVE", "合作中"], ["HISTORIC", "历史客户"], ["PAUSED", "暂不跟进"]],
  partnerStatus: [["TO_CONTACT", "待接洽"], ["NEGOTIATING", "洽谈中"], ["ACTIVE", "合作中"], ["HISTORIC", "历史合作"], ["PAUSED", "暂停合作"]],
  projectStatus: [["NOT_STARTED", "未开始"], ["IN_PROGRESS", "进行中"], ["WAITING", "等待中"], ["PAUSED", "暂停"], ["COMPLETED", "已完成"], ["ABANDONED", "已放弃"]],
  taskStatus: [["TODO", "待办"], ["IN_PROGRESS", "进行中"], ["WAITING", "等待中"], ["COMPLETED", "已完成"], ["ABANDONED", "已放弃"]],
  priority: [["P0", "高"], ["P1", "中"], ["P2", "低"]],
  region: [["SERVICE", "服务型"], ["PRODUCT", "产品型"], ["BUSINESS", "经营型"], ["EXPLORATION", "探索型"], ["NON_BUSINESS", "非经营型"]],
  learningRegion: [["LEARNING", "学习排期"]],
  upgrade: [["学习", "学习"], ["工具升级", "工具升级"], ["系统维护", "系统维护"]],
  orderStatus: [["TO_CONFIRM", "待确认"], ["IN_PROGRESS", "执行中"], ["DELIVERED", "已交付"], ["CANCELED", "已取消"]],
  incomeMethod: [["WECHAT", "微信"], ["ALIPAY", "支付宝"], ["BANK", "银行转账"], ["CASH", "现金"], ["OTHER", "其他"]],
  productStatus: [["ON_SALE", "在售"], ["PAUSED", "暂停销售"], ["OFF_SHELF", "已下架"]],
  reviewType: [["WEEK", "周复盘"], ["MONTH", "月复盘"], ["QUARTER", "季复盘"]],
};
const PROJECT_TYPE_TABS = [
  { label: "服务型", value: "SERVICE" },
  { label: "产品型", value: "PRODUCT" },
  { label: "经营型", value: "BUSINESS" },
  { label: "探索型", value: "EXPLORATION" },
  { label: "非经营型", value: "NON_BUSINESS" },
] as const;
const PROJECT_REGION_OPTIONS: Array<[string, string]> = [
  ...PROJECT_TYPE_TABS.map(({ label, value }) => [value, label] as [string, string]),
  ...ENUMS.learningRegion,
];
const CONTACT_COLUMNS = ["name", "status", "lastCommunication", "nextFollowup", "projectIds", "createdAt"];
const CONTACT_COLUMN_LABELS: Record<string, string> = { name: "名称", status: "状态", lastCommunication: "最近沟通", nextFollowup: "下一次跟进", projectIds: "关联项目", createdAt: "创建时间" };

const ENTITIES: Record<EntityKey, EntityConfig> = {
  customers: { title: "客户管理", singular: "客户", description: "维护客户关系、需求和跟进记录。", fields: [
    { name: "name", label: "客户名称", required: true }, { name: "industry", label: "行业 / 业务领域" }, { name: "status", label: "客户状态", kind: "select", options: ENUMS.customerStatus }, { name: "source", label: "客户来源" }, { name: "needs", label: "需求说明", kind: "textarea" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: CONTACT_COLUMNS, filters: [["status", "客户状态", ENUMS.customerStatus]] },
  partners: { title: "合作方", singular: "合作方", description: "记录合作方向、能力和沟通进展。", fields: [
    { name: "name", label: "合作方名称", required: true }, { name: "industry", label: "行业 / 业务领域" }, { name: "status", label: "合作状态", kind: "select", options: ENUMS.partnerStatus }, { name: "directions", label: "合作方向", kind: "directions" }, { name: "capabilities", label: "资源与能力", kind: "textarea" }, { name: "description", label: "合作说明", kind: "textarea" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: CONTACT_COLUMNS, filters: [["status", "合作状态", ENUMS.partnerStatus]] },
  projects: { title: "项目", singular: "项目", description: "按所属区域管理普通项目，关联客户、合作方、订单、任务和跟进日志。", fields: [
    { name: "name", label: "项目名称", required: true }, { name: "region", label: "所属区域", kind: "select", required: true, options: PROJECT_REGION_OPTIONS }, { name: "status", label: "项目状态", kind: "select", options: ENUMS.projectStatus }, { name: "upgradeType", label: "提升类型", kind: "select", options: ENUMS.upgrade }, { name: "description", label: "项目说明", kind: "textarea" }, { name: "expectedOutcome", label: "目标 / 预期产出", kind: "textarea" }, { name: "startDate", label: "开始日期", kind: "date" }, { name: "dueDate", label: "目标完成日期", kind: "date" }, { name: "customerIds", label: "关联客户", kind: "multi", from: "customers" }, { name: "partnerIds", label: "关联合作方", kind: "multi", from: "partners" }, { name: "orderIds", label: "关联订单", kind: "multi", from: "orders" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["name", "region", "status", "dueDate", "customerIds", "updatedAt"], filters: [["status", "项目状态", ENUMS.projectStatus]] },
  tasks: { title: "任务管理", singular: "任务", description: "安排任务、关联项目或跟进对象，并保留完成历史。", fields: [
    { name: "name", label: "任务名称", required: true }, { name: "projectId", label: "所属项目", kind: "select", from: "projects" }, { name: "customerId", label: "关联客户", kind: "select", from: "customers" }, { name: "partnerId", label: "关联合作方", kind: "select", from: "partners" }, { name: "status", label: "任务状态", kind: "select", options: ENUMS.taskStatus }, { name: "priority", label: "优先级", kind: "select", options: ENUMS.priority }, { name: "plannedDate", label: "计划日期", kind: "date" }, { name: "dueDate", label: "截止日期", kind: "date" }, { name: "description", label: "说明", kind: "textarea" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["businessNumber", "name", "project", "status", "priority", "plannedDate", "dueDate"], filters: [["status", "任务状态", ENUMS.taskStatus]] },
  orders: { title: "订单", singular: "订单", description: "订单约定金额与实际到账分开管理。", fields: [
    { name: "name", label: "订单名称", required: true }, { name: "customerId", label: "关联客户", kind: "select", from: "customers", required: true }, { name: "content", label: "订单内容", kind: "textarea" }, { name: "projectIds", label: "关联项目", kind: "multi", from: "projects" }, { name: "status", label: "订单状态", kind: "select", options: ENUMS.orderStatus }, { name: "amountCents", label: "订单金额（元）", kind: "money" }, { name: "orderDate", label: "下单日期", kind: "date" }, { name: "dueDate", label: "约定交付日", kind: "date" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["name", "customer", "status", "amountCents", "receivedCents", "receivableCents", "dueDate"], filters: [["status", "订单状态", ENUMS.orderStatus]] },
  incomes: { title: "收入流水", singular: "收入", description: "按实际到账日期记录每一笔收入，可关联订单，也可独立登记。", fields: [
    { name: "name", label: "收入名称" }, { name: "receivedOn", label: "到账日期", kind: "date", required: true }, { name: "amountCents", label: "到账金额（元）", kind: "money", required: true }, { name: "orderId", label: "关联订单", kind: "select", from: "orders" }, { name: "method", label: "收款方式", kind: "select", options: ENUMS.incomeMethod }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["name", "receivedOn", "amountCents", "order", "method"] },
  resources: { title: "资料库", singular: "资料", description: "管理资料索引与项目关联；文件正文仍在原位置。", fields: [
    { name: "name", label: "资料名称", required: true }, { name: "category", label: "资料分类" }, { name: "purpose", label: "用途说明", kind: "textarea" }, { name: "projectIds", label: "关联项目", kind: "multi", from: "projects" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["name", "category", "purpose", "projectIds", "updatedAt"] },
  experiences: { title: "经验资产库", singular: "经验", description: "忠实保存原话、日期和自由标签。", fields: [
    { name: "recordedOn", label: "记录日期", kind: "date", required: true }, { name: "title", label: "经验标题", required: true }, { name: "content", label: "原话内容", kind: "textarea", required: true }, { name: "tags", label: "标签", kind: "tags" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["title", "recordedOn", "tags", "content"] },
  products: { title: "产品库", singular: "产品", description: "整理产品类型、版本、价格、销售状态和说明。", fields: [
    { name: "name", label: "产品名称", required: true }, { name: "productType", label: "产品类型" }, { name: "productVersion", label: "产品版本" }, { name: "priceCents", label: "售价（元）", kind: "money" }, { name: "status", label: "销售状态", kind: "select", options: ENUMS.productStatus }, { name: "description", label: "产品说明", kind: "textarea" }, { name: "notes", label: "备注", kind: "textarea" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["name", "productType", "productVersion", "priceCents", "status", "updatedAt"], filters: [["status", "销售状态", ENUMS.productStatus]] },
  reviews: { title: "复盘资产库", singular: "复盘", description: "按周、月、季保存 Markdown 正文；类型与日期保存后固定。", fields: [
    { name: "reviewedOn", label: "复盘日期", kind: "date", required: true }, { name: "reviewType", label: "复盘类型", kind: "select", options: ENUMS.reviewType, required: true }, { name: "content", label: "复盘正文", kind: "textarea", required: true, helperText: "支持标题、列表、引用、链接和代码。" }, { name: "links", label: "资料链接", kind: "links" },
  ], columns: ["reviewedOn", "reviewType", "businessNumber", "updatedAt", "content"], filters: [["reviewType", "复盘类型", ENUMS.reviewType]] },
};

const NAV: Array<{ title: string; items: Array<{ key: ViewKey; label: string; icon: LucideIcon }> }> = [
  { title: "工作台", items: [{ key: "overview", label: "经营总览", icon: LayoutDashboard }] },
  { title: "客户管理", items: [{ key: "customers", label: "客户", icon: UsersRound }, { key: "partners", label: "合作方", icon: Handshake }] },
  { title: "财务管理", items: [{ key: "orders", label: "订单", icon: ClipboardList }, { key: "incomes", label: "收入流水", icon: WalletCards }] },
  { title: "项目", items: [{ key: "projects", label: "项目", icon: FolderKanban }] },
  { title: "任务管理", items: [{ key: "tasks", label: "任务管理", icon: ListTodo }] },
  { title: "学习提升", items: [{ key: "resources", label: "资料库", icon: LibraryBig }, { key: "learning", label: "学习排期", icon: CalendarDays }] },
  { title: "经营资产", items: [{ key: "experiences", label: "经验资产库", icon: Lightbulb }, { key: "products", label: "产品库", icon: Package }, { key: "reviews", label: "复盘资产库", icon: ClipboardCheck }] },
];

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function textValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function safeScalarText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return "—";
}
function formatDate(value: unknown): string { return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : "—"; }
function formatReceivable(value: unknown): string {
  const cents = integerCents(value);
  return cents !== null && cents < 0n ? `多收 ${formatMoney(-cents)}` : formatMoney(value);
}
function formatDateTime(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function displayEnum(value: unknown, preferred?: EnumKey): string {
  const key = typeof value === "string" ? value : "";
  if (key === "UNPAID") return "未收款";
  if (key === "PARTIAL") return "部分收款";
  if (key === "PAID") return "已收齐";
  if (preferred) { const match = ENUMS[preferred].find(([id]) => id === key); if (match) return match[1]; }
  for (const items of Object.values(ENUMS)) { const match = items.find(([id]) => id === key); if (match) return match[1]; }
  return key || "—";
}
function displayProjectArea(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  return PROJECT_TYPE_TABS.find((tab) => tab.value === key)?.label ?? (key === "LEARNING" ? "学习排期" : displayEnum(value));
}
function openDatePicker(input: HTMLInputElement) {
  if (typeof input.showPicker !== "function") return;
  try { input.showPicker(); } catch { input.focus(); }
}
function dateInput(value: unknown): string { return typeof value === "string" ? value.slice(0, 10) : ""; }
function relationName(resource: EntityKey, id: unknown, options: Partial<Record<EntityKey, Option[]>>): string {
  if (typeof id !== "string") return "—";
  return options[resource]?.find((item) => item.id === id)?.name ?? "关联记录";
}
function projectRelationNames(item: JsonRecord, value: unknown, resource: "customers" | "partners" | "orders", options: Partial<Record<EntityKey, Option[]>>): string {
  const relation = resource === "customers"
    ? { list: "customers", id: "customerId", record: "customer" }
    : resource === "partners"
      ? { list: "partners", id: "partnerId", record: "partner" }
      : { list: "orders", id: "orderId", record: "order" };
  const links = Array.isArray(item[relation.list]) ? item[relation.list] as JsonRecord[] : [];
  const ids = Array.isArray(value) ? value : [];
  return ids.map((id) => {
    const link = links.find((candidate) => candidate[relation.id] === id);
    const record = link?.[relation.record];
    return record && typeof record === "object" && textValue((record as JsonRecord).name)
      ? textValue((record as JsonRecord).name)
      : relationName(resource, id, options);
  }).join("、") || "—";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  if (response.status === 401) { window.location.href = "/login"; throw new Error("登录状态已失效。"); }
  const body = await response.json() as T & { error?: string | { message?: string } };
  if (!response.ok) {
    const issue = body.error;
    throw new Error(typeof issue === "string" ? issue : issue?.message ?? "请求没有完成。" );
  }
  return body;
}

function recordLabel(resource: EntityKey, item: JsonRecord): string {
  const code = item.businessNumber ? `${item.businessNumber} · ` : "";
  return `${code}${textValue(item.name) || textValue(item.title) || "未命名记录"}`;
}

function columnValue(resource: EntityKey, item: JsonRecord, field: string, options: Partial<Record<EntityKey, Option[]>>) {
  const value = item[field];
  if (resource === "projects" && field === "region") return displayProjectArea(value);
  if (resource === "projects" && field === "customerIds") {
    return projectRelationNames(item, value, "customers", options);
  }
  if (field === "lastCommunication") return formatDate((item.lastCommunication as JsonRecord | null)?.occurredOn);
  if (field === "nextFollowup") return formatDate(contactFollowupDate(item.nextFollowup));
  if (field === "createdAt") return formatDateTime(value);
  if (field === "projectIds") {
    const ids = Array.isArray(value) ? value : [];
    if (resource === "resources") {
      const relatedProjects = Array.isArray(item.projects) ? item.projects as JsonRecord[] : [];
      const names = ids.map((id) => {
        const relation = relatedProjects.find((candidate) => candidate.projectId === id);
        const project = relation?.project;
        if (project && typeof project === "object" && textValue((project as JsonRecord).name)) return textValue((project as JsonRecord).name);
        return options.projects?.find((option) => option.id === id)?.name ?? "关联记录";
      });
      return names.join("、") || "—";
    }
    return ids.length ? `${ids.length} 个` : "—";
  }
  if (field === "receivableCents") return formatReceivable(value);
  if (field === "amountCents" || field === "receivedCents" || field === "totalReceivedCents" || field === "priceCents") return formatMoney(value);
  if (["status", "region", "priority", "reviewType", "method"].includes(field)) return displayEnum(value, field === "status" && resource === "products" ? "productStatus" : undefined);
  if (field === "updatedAt") return formatDateTime(value);
  if (["dueDate", "plannedDate", "orderDate", "receivedOn", "recordedOn", "reviewedOn", "startDate", "completedAt"].includes(field)) return formatDate(value);
  if (field === "name") return textValue(value) || textValue(item.title) || "—";
  if (field === "project") return item.project && typeof item.project === "object" ? textValue((item.project as JsonRecord).name) : "未关联项目";
  if (field === "customer") return item.customer && typeof item.customer === "object" ? textValue((item.customer as JsonRecord).name) : relationName("customers", item.customerId, options);
  if (field === "partner") return item.partner && typeof item.partner === "object" ? textValue((item.partner as JsonRecord).name) : relationName("partners", item.partnerId, options);
  if (field === "order") return item.order && typeof item.order === "object" ? textValue((item.order as JsonRecord).name) : item.orderId ? relationName("orders", item.orderId, options) : "独立收入";
  if (field === "projectIds" || field === "customerIds" || field === "partnerIds" || field === "orderIds") {
    const ids = Array.isArray(value) ? value : [];
    return ids.length ? `${ids.length} 项关联` : "—";
  }
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("、") || "—";
  return value == null || value === "" ? "—" : safeScalarText(value);
}

function columnLabel(entity: EntityConfig, field: string): string {
  if (field === "name") return `${entity.singular}名称`;
  if (field === "customer") return "客户";
  if (field === "status") return entity.singular === "订单" ? "交付状态" : entity.singular === "产品" ? "销售状态" : "状态";
  if (field === "amountCents") return entity.singular === "订单" ? "订单金额" : entity.singular === "收入" ? "到账金额" : "约定金额";
  if (field === "receivedCents") return "已收";
  if (field === "receivableCents") return "应收";
  if (field === "dueDate") return entity.singular === "订单" ? "交付日期" : entity.singular === "项目" ? "目标完成日期" : "截止／目标日";
  if (field === "receivedOn") return "到账日期";
  if (field === "order") return "关联订单";
  if (field === "method") return "收款方式";
  if (field === "businessNumber") return entity.singular === "复盘" ? "记录编号" : "编号";
  if (field === "region") return entity.singular === "项目" ? "所属区域" : "项目类型";
  if (field === "customerIds") return "关联客户";
  if (field === "priority") return "优先级";
  if (field === "plannedDate") return "计划日期";
  if (field === "totalReceivedCents") return "累计到账";
  if (field === "reviewType") return "复盘类型";
  if (field === "recordedOn") return "记录日期";
  if (field === "reviewedOn") return entity.singular === "复盘" ? "复盘时间" : "复盘日期";
  if (field === "project") return "所属项目";
  if (field === "partner") return "合作方";
  if (field === "industry") return "行业领域";
  if (field === "category") return "资料分类";
  if (field === "purpose") return "用途说明";
  if (field === "projectIds") return "关联项目";
  if (field === "productType") return "产品类型";
  if (field === "productVersion") return "产品版本";
  if (field === "title") return "经验标题";
  if (field === "content") return entity.singular === "经验" ? "原话内容" : "复盘正文";
  if (field === "priceCents") return "售价（元）";
  if (field === "tags") return "标签";
  if (field === "updatedAt") return "更新时间";
  return field;
}

export function Workspace({ username }: { username: string }) {
  const [active, setActive] = useState<ViewKey>("overview");
  const [projectRegion, setProjectRegion] = useState<string>(PROJECT_TYPE_TABS[0].value);
  const [reviewCycle, setReviewCycle] = useState("WEEK");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [trash, setTrash] = useState(false);
  const [history, setHistory] = useState(false);
  const [historyDate, setHistoryDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [taskPageSize, setTaskPageSize] = useState(50);
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroupsResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [options, setOptions] = useState<Partial<Record<EntityKey, Option[]>>>({});
  const [summary, setSummary] = useState<JsonRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<JsonRecord | null>(null);
  const [editing, setEditing] = useState<JsonRecord | null | false>(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && (tab === "overview" || tab === "settings" || tab === "learning" || tab in ENTITIES)) setActive(tab as ViewKey);
    const listener = () => {
      const next = new URLSearchParams(window.location.search).get("tab");
      if (next && (next === "overview" || next === "settings" || next === "learning" || next in ENTITIES)) setActive(next as ViewKey);
    };
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  const loadSummary = useCallback(async () => {
    try { setSummary(await requestJson<JsonRecord>("/api/ledger/v1/summary")); } catch (issue) { setError(issue instanceof Error ? issue.message : "总览暂时不可用。"); }
  }, []);

  const loadOptions = useCallback(async () => {
    const resources: EntityKey[] = ["customers", "partners", "projects", "orders"];
    const values = await Promise.all(resources.map(async (resource) => {
      const result = await requestJson<{ items: JsonRecord[] }>(`/api/ledger/v1/${resource}?limit=200`);
      return [resource, result.items.map((item) => ({ id: item.id, name: textValue(item.name), businessNumber: textValue(item.businessNumber) }))] as const;
    }));
    setOptions(Object.fromEntries(values));
  }, []);

  const loadRecords = useCallback(async () => {
    if (!(active in ENTITIES) && active !== "learning") return;
    const resource: EntityKey = active === "learning" ? "projects" : active as EntityKey;
    const isContactView = active === "customers" || active === "partners";
    const isLedgerView = active === "orders" || active === "incomes";
    const isProjectView = active === "projects";
    const isAssetLibraryView = active === "experiences" || active === "products" || active === "reviews";
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(active === "tasks" ? taskPageSize : isContactView || isLedgerView || isProjectView || active === "learning" || active === "resources" || isAssetLibraryView ? pageSize : 50), page: String(page) });
      if (search.trim()) params.set("q", search.trim());
      for (const [field, value] of Object.entries(filters)) if (value) params.set(field, value);
      if (trash) params.set("onlyDeleted", "true");
      if (resource === "tasks" && !history) {
        const result = await requestJson<TaskGroupsResponse>(`/api/ledger/v1/tasks/grouped?${params}`);
        setTaskGroups(result);
        if (result.page !== page) setPage(result.page);
        setTotal(result.totalTasks);
        setTotalPages(result.totalPages);
        setItems([]);
        return;
      }
      if (resource === "tasks" && history) {
        const historyParams = new URLSearchParams({ limit: String(taskPageSize), page: String(page), date: historyDate || "all" });
        if (search.trim()) historyParams.set("q", search.trim());
        const result = await requestJson<{ items: JsonRecord[]; total: number; totalPages: number }>(`/api/ledger/v1/tasks/history?${historyParams}`);
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        return;
      }
      if (isProjectView) params.set("region", projectRegion);
      else if (active === "learning") params.set("region", "LEARNING");
      if (active === "reviews") params.set("reviewType", reviewCycle);
      if (sort && (!isContactView || ["name", "status", "createdAt"].includes(sort))) params.set("sort", sort);
      params.set("direction", direction);
      const path = `/api/ledger/v1/${resource}?${params}`;
      const result = await requestJson<{ items: JsonRecord[]; total: number; totalPages: number }>(path);
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "记录暂时不可用。"); }
    finally { setLoading(false); }
  }, [active, projectRegion, reviewCycle, page, pageSize, taskPageSize, search, filters, sort, direction, trash, history, historyDate]);

  useEffect(() => { if (active === "overview") void loadSummary(); }, [active, loadSummary]);
  useEffect(() => {
    if (active in ENTITIES || active === "learning") {
      const timer = window.setTimeout(() => { void loadRecords(); }, search ? 220 : 0);
      return () => window.clearTimeout(timer);
    }
  }, [active, loadRecords, search]);
  useEffect(() => { void loadOptions().catch(() => undefined); }, [loadOptions]);

  function selectView(view: ViewKey) {
    setActive(view); setPage(1); setFilters({}); setSort(""); setDirection("desc"); setSearch(""); setTrash(false); setHistory(false); setHistoryDate(""); setDrawer(null); setEditing(false);
    const url = new URL(window.location.href); url.searchParams.set("tab", view); window.history.pushState({}, "", url);
  }

  async function refresh() { await loadRecords(); await loadSummary(); }
  const entityResource: EntityKey | null = active === "learning" ? "projects" : active in ENTITIES ? active as EntityKey : null;
  const entity = entityResource ? ENTITIES[entityResource] : null;
  const contactPage = active === "customers" || active === "partners";
  const ledgerPage = active === "orders" || active === "incomes";
  const projectPage = active === "projects";
  const taskPage = active === "tasks";
  const groupedTaskPage = taskPage && !history;
  const columns = entity ? (contactPage ? CONTACT_COLUMNS : entity.columns) : [];
  const assetLibraryPage = active === "experiences" || active === "products" || active === "reviews";
  const reviewPage = active === "reviews";
  const showRowActions = assetLibraryPage || projectPage || active === "learning" || active === "resources" ? false : contactPage ? trash : !ledgerPage;
  const libraryLearningPage = active === "resources" || active === "learning";
  const sortableListPage = contactPage || ledgerPage || projectPage || libraryLearningPage || assetLibraryPage;
  const entityTitle = active === "learning" ? "学习排期" : entity?.title;
  const displayedItems = contactPage && sort && !["name", "status", "createdAt"].includes(sort)
    ? [...items].sort((left, right) => {
      const value = (item: JsonRecord): string | number => {
        if (sort === "lastCommunication") return textValue((item.lastCommunication as JsonRecord | null)?.occurredOn);
        if (sort === "nextFollowup") return contactFollowupDate(item.nextFollowup) ?? "";
        if (sort === "projectIds") return Array.isArray(item.projectIds) ? item.projectIds.length : 0;
        return "";
      };
      const leftValue = value(left);
      const rightValue = value(right);
      if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * (direction === "asc" ? 1 : -1);
      return String(leftValue).localeCompare(String(rightValue), "zh-CN", { numeric: true, sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
    })
    : items;

  function toggleSort(column: string) {
    if (sort === column) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(column); setDirection("asc"); }
    setPage(1);
  }

  function isSortableColumn(column: string) {
    if (active === "experiences") return column === "title" || column === "recordedOn";
    if (active === "products") return true;
    if (active === "reviews") return column === "reviewedOn" || column === "updatedAt";
    return sortableListPage;
  }

  function openRelatedRecord(resource: EntityKey, item: JsonRecord) {
    selectView(resource);
    setDrawer(item);
  }

  async function openTaskProject(projectId: string) {
    try {
      const result = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/projects/${projectId}`);
      if (result.item.region === "LEARNING") selectView("learning");
      else selectView("projects");
      setDrawer(result.item);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "项目详情暂时不可用。"); }
  }

  async function toggleTaskStatus(item: JsonRecord) {
    try {
      const result = await completeTask(item);
      setNotice(result.status === "COMPLETED" ? "任务已完成。" : "任务已恢复到完成前状态。");
      await refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "任务状态更新失败。"); }
  }

  return (
    <div className="gy-workspace">
      <aside className="gy-sidebar">
        <Link className="gy-brand" href="/space"><Image src="/brand/guangyu-logo-full.png" alt="光域空间" width={2172} height={724} priority unoptimized /></Link>
        <nav className="gy-nav">
          {NAV.map((group) => <div className="gy-nav-group" key={group.title}><p>{group.title}</p>{group.items.map((item) => { const Icon = item.icon; return <button key={item.key} className={active === item.key ? "active" : ""} onClick={() => selectView(item.key)}><Icon className="gy-nav-mark" aria-hidden="true" />{item.label}</button>; })}</div>)}
        </nav>
        <div className="gy-sidebar-bottom">
          <button className={active === "settings" ? "active" : ""} onClick={() => selectView("settings")}><Settings2 className="gy-nav-mark" aria-hidden="true" />账号与备份</button>
          <button onClick={() => void signOut({ redirectTo: "/login" })}><LogOut className="gy-nav-mark" aria-hidden="true" />退出登录</button>
        </div>
      </aside>
      <main className="gy-main">
        <header className="gy-topbar"><div><span className="gy-breadcrumb">光域空间</span><span className="gy-breadcrumb-sep">/</span><span>{entityTitle ?? (active === "overview" ? "经营总览" : "账号与备份")}</span></div><div className="gy-topbar-right"><span className="gy-top-date">{TODAY}</span><span className="gy-top-user">{username}</span></div></header>
        <div className="gy-content">
          {notice ? <div className="gy-notice" role="status">{notice}<button onClick={() => setNotice("")}>关闭</button></div> : null}
          {error ? <div className="gy-notice gy-notice-error" role="alert">{error}<button onClick={() => setError("")}>关闭</button></div> : null}
          {active === "overview" ? <Overview summary={summary} onGo={selectView} onOpen={(resource, item) => { selectView(resource); setDrawer(item); }} onCreateTask={() => { selectView("tasks"); setEditing(null); }} onComplete={async (item) => { try { await completeTask(item); await loadSummary(); } catch (issue) { setError(issue instanceof Error ? issue.message : "任务状态更新失败。"); } }} /> : null}
          {entity && entityResource ? <>
            <div className="gy-page-heading"><div><h1>{history ? "历史任务" : trash ? `${entityTitle} · 已删除` : entityTitle}</h1><p>{active === "learning" ? "维护个人学习、工具升级和系统维护项目。" : entity.description}</p></div><button className="gy-button gy-button-primary" onClick={() => { setEditing(null); void loadOptions(); }}>＋ 新增{entity.singular}</button></div>
            {libraryLearningPage ? <div className="gy-page-tabs" role="tablist" aria-label="学习提升页面">
              <button type="button" role="tab" aria-selected={active === "resources"} className={active === "resources" ? "selected" : ""} onClick={() => selectView("resources")}>资料库</button>
              <button type="button" role="tab" aria-selected={active === "learning"} className={active === "learning" ? "selected" : ""} onClick={() => selectView("learning")}>学习排期</button>
            </div> : null}
            {projectPage ? <div className="gy-page-tabs gy-project-type-tabs" role="tablist" aria-label="项目所属区域">
              {PROJECT_TYPE_TABS.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={projectRegion === tab.value} className={projectRegion === tab.value ? "selected" : ""} onClick={() => { setProjectRegion(tab.value); setPage(1); }}>{tab.label}</button>)}
            </div> : null}
            {contactPage ? <div className="gy-page-tabs" role="tablist" aria-label="客户管理页面">
              <button role="tab" aria-selected={active === "customers"} className={active === "customers" ? "selected" : ""} onClick={() => selectView("customers")}>客户</button>
              <button role="tab" aria-selected={active === "partners"} className={active === "partners" ? "selected" : ""} onClick={() => selectView("partners")}>合作方</button>
            </div> : null}
            {ledgerPage ? <div className="gy-page-tabs" role="tablist" aria-label="订单与收入流水">
              <button role="tab" aria-selected={active === "orders"} className={active === "orders" ? "selected" : ""} onClick={() => selectView("orders")}>订单</button>
              <button role="tab" aria-selected={active === "incomes"} className={active === "incomes" ? "selected" : ""} onClick={() => selectView("incomes")}>收入流水</button>
            </div> : null}
            {reviewPage ? <div className="gy-page-tabs gy-review-cycle-tabs" role="tablist" aria-label="复盘周期">
              {ENUMS.reviewType.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={reviewCycle === value} className={reviewCycle === value ? "selected" : ""} onClick={() => { setReviewCycle(value); setPage(1); }}>{label}</button>)}
            </div> : null}
            <div className="gy-toolbar"><div className="gy-search"><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={active === "experiences" ? "搜索经验标题或原话内容" : `搜索${entity.singular}名称、编号或内容`} /></div>
              {taskPage && !history ? <>
                <label className="gy-filter"><span>区域</span><select value={filters.region ?? ""} onChange={(event) => { setFilters((current) => ({ ...current, region: event.target.value })); setPage(1); }}><option value="">全部</option>{PROJECT_REGION_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="gy-filter"><span>项目</span><select value={filters.projectId ?? ""} onChange={(event) => { setFilters((current) => ({ ...current, projectId: event.target.value })); setPage(1); }}><option value="">全部</option>{(options.projects ?? []).map((project) => <option value={project.id} key={project.id}>{project.businessNumber ? `${project.businessNumber} · ` : ""}{project.name}</option>)}</select></label>
              </> : null}
              {(!taskPage || !history) && !reviewPage && entity.filters?.map(([field, label, values]) => <label className="gy-filter" key={field}><span>{label}</span><select value={filters[field] ?? ""} onChange={(event) => { setFilters((current) => ({ ...current, [field]: event.target.value })); setPage(1); }}><option value="">全部</option>{values.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
              {taskPage && history ? <>
                <label className="gy-filter gy-history-date-filter"><span>完成日期</span><input aria-label="历史任务完成日期" type="date" value={historyDate} onChange={(event) => { setHistoryDate(event.target.value); setPage(1); }} onClick={(event) => openDatePicker(event.currentTarget)} /></label>
                <button className={`gy-quiet-button ${historyDate ? "" : "selected"}`} onClick={() => { setHistoryDate(""); setPage(1); }}>查看全部历史</button>
                <button className="gy-quiet-button" onClick={() => { setHistory(false); setTrash(false); setPage(1); }}>返回当前任务</button>
              </> : taskPage ? <button className="gy-quiet-button" onClick={() => { setHistory(true); setTrash(false); setHistoryDate(""); setPage(1); }}>查看历史任务</button> : null}
              {!contactPage && !ledgerPage && !projectPage && !taskPage && !libraryLearningPage ? <><label className="gy-filter gy-sort-filter"><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="">默认</option>{entity.columns.filter((column) => ["name", "status", "region", "priority", "plannedDate", "dueDate", "orderDate", "receivedOn", "recordedOn", "reviewedOn", "createdAt", "updatedAt"].includes(column)).map((column) => <option key={column} value={column}>{column === "name" ? "名称" : column === "status" ? "状态" : column === "region" ? "项目类型" : column === "priority" ? "优先级" : column === "plannedDate" ? "计划日期" : column === "dueDate" ? "截止日期" : column === "orderDate" ? "下单日期" : column === "receivedOn" ? "到账日期" : column === "recordedOn" ? "记录日期" : column === "reviewedOn" ? "复盘日期" : column === "updatedAt" ? "更新时间" : "创建时间"}</option>)}</select></label>
              <button className="gy-quiet-button" onClick={() => setDirection((current) => current === "asc" ? "desc" : "asc")}>{direction === "asc" ? "升序 ↑" : "降序 ↓"}</button></> : null}
              {!taskPage || !history ? <button className={`gy-quiet-button ${trash ? "selected" : ""}`} onClick={() => { setTrash(!trash); setHistory(false); setPage(1); }}>{trash ? "返回正常记录" : "查看已删除"}</button> : null}
            </div>
            {reviewPage && !trash && !loading && displayedItems.length === 0 ? <div className="gy-review-empty-state"><ClipboardCheck aria-hidden="true" /><strong>当前没有{displayEnum(reviewCycle)}记录</strong><span>可以从本周期新增一条复盘。</span><button className="gy-button gy-button-primary" onClick={() => setEditing(null)}>新增复盘</button></div> : groupedTaskPage ? <TaskGroupsBoard groups={taskGroups} page={page} pageSize={taskPageSize} loading={loading} deleted={trash} onPage={setPage} onPageSize={(size) => { setTaskPageSize(size); setPage(1); }} onOpenTask={setDrawer} onOpenProject={(projectId) => void openTaskProject(projectId)} onComplete={toggleTaskStatus} onRestore={(item) => void changeDeleted("tasks", item, true)} /> : <div className="gy-table-card">
              <div className="gy-table-meta"><span>{trash ? "已删除记录" : history ? "已完成任务" : "全部记录"}</span><span>{total} 条记录</span></div>
              <div className={`gy-table-scroll ${active === "experiences" ? "gy-experience-table-scroll" : ""} ${reviewPage ? "gy-review-table-scroll" : ""}`}><table><thead><tr>{columns.map((column, index) => <th className={`${index === columns.length - 1 ? "gy-table-last-field" : ""} ${reviewPage && column === "content" ? "gy-review-content-head" : ""}`} key={column}>{isSortableColumn(column) ? <button className="gy-sort-header" onClick={() => toggleSort(column)} aria-label={`按${contactPage ? CONTACT_COLUMN_LABELS[column] : columnLabel(entity, column)}排序`}>{contactPage ? CONTACT_COLUMN_LABELS[column] : columnLabel(entity, column)}<span>{sort === column ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button> : columnLabel(entity, column)}</th>)}{showRowActions ? <th className="gy-actions-head">操作</th> : null}</tr></thead><tbody>
                {loading ? <tr><td className="gy-empty" colSpan={columns.length + Number(showRowActions)}>正在读取记录…</td></tr> : displayedItems.length === 0 ? <tr><td className="gy-empty" colSpan={columns.length + Number(showRowActions)}><strong>{trash ? "这里还没有已删除记录" : "从一条真实记录开始"}</strong><span>{trash ? "删除的记录可以在这里恢复。" : `当前${entity.singular}列表为空，可以直接新建。`}</span>{!trash ? <button className="gy-button gy-button-primary" onClick={() => setEditing(null)}>新增{active === "learning" ? "学习项目" : entity.singular}</button> : null}</td></tr> : displayedItems.map((item) => <tr key={item.id} onDoubleClick={() => setDrawer(item)}>
                  {columns.map((column, index) => <td className={`${index === columns.length - 1 ? "gy-table-last-field" : ""} ${active === "experiences" && column === "content" ? "gy-experience-content-cell" : ""} ${reviewPage && column === "content" ? "gy-review-content-cell" : ""}`} key={column}>{(projectPage || active === "learning") && column === "name" ? <button className="gy-cell-link gy-project-name-link" aria-label={`打开项目详情：${textValue(item.name)}`} onClick={() => setDrawer(item)}>{columnValue(entityResource, item, column, options)}<span aria-hidden="true">→</span></button> : column === "businessNumber" && assetLibraryPage ? <button className="gy-record-code gy-record-code-button" onClick={() => setDrawer(item)}>{textValue(item[column]) || "—"}</button> : column === "businessNumber" ? <span className="gy-record-code">{textValue(item[column]) || "—"}</span> : <button className={`gy-cell-link ${active === "experiences" && column === "content" ? "gy-experience-content" : ""} ${reviewPage && column === "content" ? "gy-review-content" : ""}`} onClick={() => setDrawer(item)}>{columnValue(entityResource, item, column, options)}</button>}</td>)}
                  {showRowActions ? <td className="gy-row-actions">{active === "tasks" && !trash ? <input className="gy-history-complete-check" type="checkbox" checked={item.status === "COMPLETED"} aria-label={`取消完成：${textValue(item.name)}`} onChange={() => void toggleTaskStatus(item)} /> : null}
                    {contactPage ? <button className="gy-row-text-action" onClick={() => void changeDeleted(entityResource, item, true)}>恢复</button> : <><button className="gy-icon-action" title="查看详情" onClick={() => setDrawer(item)}>↗</button>{trash ? <button className="gy-row-text-action" onClick={() => void changeDeleted(entityResource, item, true)}>恢复</button> : <button className="gy-row-text-action" onClick={() => { setEditing(item); void loadOptions(); }}>编辑</button>}</>}
                  </td> : null}
                </tr>)}
              </tbody></table></div>
              <div className="gy-pagination"><span>第 {page} 页，共 {totalPages || 1} 页 · {total} 条</span><div>{taskPage && history ? <label className="gy-page-size">每页<select value={taskPageSize} onChange={(event) => { setTaskPageSize(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>条</label> : contactPage || ledgerPage || projectPage || libraryLearningPage || assetLibraryPage ? <label className="gy-page-size">每页<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>条</label> : null}<button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</button><button disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>下一页</button></div></div>
            </div>}
          </> : null}
          {active === "settings" ? <Settings username={username} onNotice={setNotice} onError={setError} /> : null}
        </div>
      </main>
      {editing !== false && entity && entityResource ? <RecordForm resource={entityResource} config={entity} record={editing} options={options} defaultRegion={active === "learning" ? "LEARNING" : active === "projects" ? projectRegion : undefined} defaultReviewType={active === "reviews" ? reviewCycle : undefined} onClose={() => setEditing(false)} onSaved={async (savedRecord) => { if (active === "projects" && typeof savedRecord.region === "string") setProjectRegion(savedRecord.region); setEditing(false); setNotice(`${entity.singular}${editing ? "已更新" : "已创建"}。`); await refresh(); await loadOptions(); }} onError={setError} /> : null}
      {drawer && entity && entityResource ? <RecordDrawer key={drawer.id} resource={entityResource} record={drawer} config={entity} options={options} onClose={() => setDrawer(null)} onEdit={() => { setEditing(drawer); setDrawer(null); void loadOptions(); }} onDeleted={() => { setDrawer(null); void refresh(); }} onOpenRecord={openRelatedRecord} onRecordUpdate={setDrawer} onChanged={refresh} onNotice={setNotice} onError={setError} /> : null}
    </div>
  );

  async function changeDeleted(resource: EntityKey, item: JsonRecord, restore: boolean) {
    if (!restore && !window.confirm(`删除“${recordLabel(resource, item)}”？记录会保留，可之后恢复。`)) return;
    try {
      await requestJson(`/api/ledger/v1/${resource}/${item.id}${restore ? "/restore" : ""}`, {
        method: restore ? "POST" : "DELETE",
        headers: { "content-type": "application/json", "if-match": String(item.version ?? 1), ...(restore ? {} : {}) },
        ...(restore ? { body: JSON.stringify({ expectedVersion: item.version ?? 1 }) } : {}),
      });
      setNotice(restore ? "记录已恢复。" : "记录已移入已删除列表。");
      await refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "记录状态更新失败。"); }
  }
}

async function completeTask(item: JsonRecord): Promise<JsonRecord> {
  const completed = item.status !== "COMPLETED";
  const response = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/tasks/${item.id}/${completed ? "complete" : "uncomplete"}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({ expectedVersion: item.version }),
  });
  return response.item;
}

function TaskGroupsBoard({ groups, page, pageSize, loading, deleted, onPage, onPageSize, onOpenTask, onOpenProject, onComplete, onRestore }: {
  groups: TaskGroupsResponse | null;
  page: number;
  pageSize: number;
  loading: boolean;
  deleted: boolean;
  onPage: (nextPage: number) => void;
  onPageSize: (nextSize: number) => void;
  onOpenTask: (task: JsonRecord) => void;
  onOpenProject: (projectId: string) => void;
  onComplete: (task: JsonRecord) => Promise<void>;
  onRestore: (task: JsonRecord) => void;
}) {
  return <div className="gy-task-board">
    {loading && !groups ? <div className="gy-task-board-empty">正在读取任务…</div> : null}
    {groups?.regions.map((region) => <section className="gy-task-region-card" key={region.region}>
      <header className="gy-task-region-heading"><h2>{region.label}</h2><span>{region.total} 条任务</span></header>
      {region.projects.length ? region.projects.map((project) => <section className="gy-task-project-group" key={project.projectId}>
        <button className="gy-task-project-heading" onClick={() => onOpenProject(project.projectId)} aria-label={`打开项目详情：${project.businessNumber} ${project.name}`}>
          <span className="gy-task-project-number">{project.businessNumber || "项目"}</span><strong>{project.name}</strong><ArrowRight aria-hidden="true" size={17} />
        </button>
        <div className="gy-task-group-count">{project.total} 条任务</div>
        <div className="gy-task-table-scroll"><table className="gy-task-table"><thead><tr><th className="gy-task-check-column"><span className="gy-visually-hidden">完成状态</span></th><th>任务名称</th><th>优先级</th><th>状态</th><th>所属项目</th><th>计划日期</th><th>截止日期</th>{deleted ? <th>操作</th> : null}</tr></thead><tbody>
          {project.tasks.map((task) => <tr key={task.id} className={task.status === "COMPLETED" ? "gy-task-row-completed" : ""}>
            <td className="gy-task-check-column"><input type="checkbox" checked={task.status === "COMPLETED"} disabled={deleted || task.status === "ABANDONED"} aria-label={task.status === "COMPLETED" ? `取消完成：${textValue(task.name)}` : `标记完成：${textValue(task.name)}`} onChange={() => void onComplete(task as JsonRecord)} /></td>
            <td><button className="gy-task-cell-link" onClick={() => onOpenTask(task as JsonRecord)}>{textValue(task.name) || "未命名任务"}</button></td>
            <td><span className={`gy-priority priority-${textValue(task.priority).toLowerCase()}`}>{displayEnum(task.priority)}</span></td>
            <td><span className="gy-task-status">{displayEnum(task.status)}</span></td>
            <td>{textValue((task.project as JsonRecord | null)?.name) || "未关联项目"}</td>
            <td>{formatDate(task.plannedDate)}</td><td>{formatDate(task.dueDate)}</td>
            {deleted ? <td><button className="gy-row-text-action" onClick={() => onRestore(task as JsonRecord)}>恢复</button></td> : null}
          </tr>)}
        </tbody></table></div>
      </section>) : <p className="gy-task-region-empty">{region.total ? `当前页没有项目组 · 此类型共有 ${region.total} 条任务` : "暂无任务"}</p>}
    </section>)}
    {groups ? <section className="gy-task-region-card gy-task-unassigned-card">
      <header className="gy-task-region-heading"><h2>未归属</h2><span>{groups.unassigned.total} 条任务</span></header>
      {groups.unassigned.tasks.length ? <div className="gy-task-table-scroll"><table className="gy-task-table"><thead><tr><th className="gy-task-check-column"><span className="gy-visually-hidden">完成状态</span></th><th>任务名称</th><th>优先级</th><th>状态</th><th>所属项目</th><th>计划日期</th><th>截止日期</th>{deleted ? <th>操作</th> : null}</tr></thead><tbody>
        {groups.unassigned.tasks.map((task) => <tr key={task.id} className={task.status === "COMPLETED" ? "gy-task-row-completed" : ""}>
          <td className="gy-task-check-column"><input type="checkbox" checked={task.status === "COMPLETED"} disabled={deleted || task.status === "ABANDONED"} aria-label={task.status === "COMPLETED" ? `取消完成：${textValue(task.name)}` : `标记完成：${textValue(task.name)}`} onChange={() => void onComplete(task as JsonRecord)} /></td>
          <td><button className="gy-task-cell-link" onClick={() => onOpenTask(task as JsonRecord)}>{textValue(task.name) || "未命名任务"}</button></td>
          <td><span className={`gy-priority priority-${textValue(task.priority).toLowerCase()}`}>{displayEnum(task.priority)}</span></td>
          <td><span className="gy-task-status">{displayEnum(task.status)}</span></td>
          <td>{textValue((task.project as JsonRecord | null)?.name) || "未关联项目"}</td>
          <td>{formatDate(task.plannedDate)}</td><td>{formatDate(task.dueDate)}</td>
          {deleted ? <td><button className="gy-row-text-action" onClick={() => onRestore(task as JsonRecord)}>恢复</button></td> : null}
        </tr>)}
      </tbody></table></div> : <p className="gy-task-region-empty">{groups.unassigned.total ? `未归属组在其他页 · 共 ${groups.unassigned.total} 条任务` : "暂无未归属任务"}</p>}
    </section> : null}
    {groups && groups.totalGroups > 0 ? <div className="gy-pagination gy-task-pagination"><span>共 {groups.totalTasks} 条任务 · {groups.totalGroups} 个项目组</span><div><label className="gy-page-size">每页<select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select>组</label><button disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>上一页</button><span>第 {page} / {groups.totalPages} 页</span><button disabled={page >= groups.totalPages || loading} onClick={() => onPage(page + 1)}>下一页</button></div></div> : groups && !groups.totalGroups ? <div className="gy-task-board-empty">{deleted ? "这里还没有已删除任务。" : "还没有任务，先安排一个清晰的小行动。"}</div> : null}
  </div>;
}

function Overview({ summary, onGo, onOpen, onCreateTask, onComplete }: { summary: JsonRecord | null; onGo: (view: ViewKey) => void; onOpen: (resource: EntityKey, item: JsonRecord) => void; onCreateTask: () => void; onComplete: (item: JsonRecord) => Promise<void> }) {
  const metrics = summary?.metrics as JsonRecord | undefined;
  const tasks = Array.isArray(summary?.todayTasks) ? summary.todayTasks as JsonRecord[] : [];
  const projects = Array.isArray(summary?.projects) ? summary.projects as Array<JsonRecord & { projects?: JsonRecord[] }> : [];
  const orders = Array.isArray(summary?.deliveryOrders) ? summary.deliveryOrders as JsonRecord[] : [];
  return <>
    <div className="gy-page-heading gy-overview-heading"><div><p className="gy-eyebrow">{TODAY} · 星期{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" }).format(new Date()).slice(-1)}</p><h1>经营总览</h1><p>看清今天要推进的事，也看见事业正在积累的部分。</p></div><button className="gy-button" onClick={onCreateTask}>＋ 安排任务</button></div>
    <section className="gy-metrics">
      <Metric label="累计到账" value={formatMoney(metrics?.totalReceivedCents)} color="purple" detail="包含独立收入" onClick={() => onGo("incomes")} />
      <Metric label="本月到账" value={formatMoney(metrics?.monthReceivedCents)} color="teal" detail="按实际到账日期" onClick={() => onGo("incomes")} />
      <Metric label="进行中项目" value={safeScalarText(metrics?.projectsInProgress)} color="rose" detail="经营项目与学习排期" onClick={() => onGo("projects")} />
      <Metric label="今日未完成任务" value={safeScalarText(metrics?.tasksToday)} color="ink" detail="按计划日期统计" onClick={() => onGo("tasks")} />
    </section>
    <section className="gy-overview-grid">
      <article className="gy-card gy-overview-tasks"><header className="gy-card-heading"><div><h2>今天要推进</h2><p>今天计划及已经逾期的未完成任务</p></div><button className="gy-link-button" onClick={() => onGo("tasks")}>全部任务 →</button></header>
        {tasks.length ? <div className="gy-task-list">{tasks.map((task) => <div className="gy-task-line" key={task.id}><button className="gy-task-check" onClick={() => void onComplete(task)} aria-label="标记完成"/><button className="gy-task-name" onClick={() => onOpen("tasks", task)}>{textValue(task.name)}</button><span className={`gy-priority priority-${textValue(task.priority).toLowerCase()}`}>{displayEnum(task.priority)}</span><span className="gy-task-date">{formatDate(task.plannedDate)}</span></div>)}</div> : <EmptyInline title="今天还没有安排" text="把一个清晰的小行动放进任务清单。" button="安排任务" onClick={onCreateTask} />}
      </article>
      <article className="gy-card gy-overview-orders"><header className="gy-card-heading"><div><h2>交付与收款</h2><p>近期交付节点与待收款订单</p></div><button className="gy-link-button" onClick={() => onGo("orders")}>订单列表 →</button></header>
        {orders.length ? <div className="gy-order-list">{orders.map((order) => <button className="gy-order-line" key={order.id} onClick={() => onOpen("orders", order)}><span className="gy-order-dot"/><span className="gy-order-info"><strong>{textValue(order.name)}</strong><small>{textValue((order.customer as JsonRecord | undefined)?.name)} · {displayEnum(order.status)}</small></span><span className="gy-order-money">{order.amountCents == null ? "金额待录入" : `${formatMoney(order.receivedCents)} / ${formatMoney(order.amountCents)}`}<small>{formatDate(order.dueDate)}</small></span></button>)}</div> : <EmptyInline title="暂时没有需要关注的订单" text="订单交付日期或收款信息会在这里提醒。" button="查看订单" onClick={() => onGo("orders")} />}
      </article>
    </section>
    <section className="gy-card gy-region-section"><header className="gy-card-heading"><div><h2>我的经营项目</h2><p>按项目类型整理，进入项目查看关联任务与日志。</p></div><button className="gy-link-button" onClick={() => onGo("projects")}>全部项目 →</button></header>
      <div className="gy-region-grid">{projects.map((group) => <button className="gy-region-card" key={textValue(group.region)} onClick={() => onGo("projects")}><span>{displayEnum(group.region)}</span><strong>{Array.isArray(group.projects) ? group.projects.length : 0}<small> 个项目</small></strong><div>{(group.projects ?? []).slice(0, 3).map((project) => <p key={textValue(project.id)}>{textValue(project.name)}<small>{displayEnum(project.status)}</small></p>)}</div></button>)}</div>
    </section>
    <section className="gy-shortcuts"><button onClick={() => onGo("customers")}><strong>客户</strong><span>关系与跟进</span></button><button onClick={() => onGo("partners")}><strong>合作方</strong><span>能力与合作</span></button><button onClick={() => onGo("resources")}><strong>资料库</strong><span>链接与项目关联</span></button><button onClick={() => onGo("reviews")}><strong>复盘资产库</strong><span>每周回看一次</span></button></section>
  </>;
}

function Metric({ label, value, color, detail, onClick }: { label: string; value: string; color: string; detail: string; onClick: () => void }) {
  return <button className={`gy-metric gy-metric-${color}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{detail}</small></button>;
}

function EmptyInline({ title, text, button, onClick }: { title: string; text: string; button: string; onClick: () => void }) {
  return <div className="gy-empty-inline"><span className="gy-empty-orbit">✳</span><strong>{title}</strong><p>{text}</p><button className="gy-link-button" onClick={onClick}>{button} →</button></div>;
}

function RecordForm({ resource, config, record, options, defaultRegion, defaultReviewType, onClose, onSaved, onError }: { resource: EntityKey; config: EntityConfig; record: JsonRecord | null; options: Partial<Record<EntityKey, Option[]>>; defaultRegion?: string; defaultReviewType?: string; onClose: () => void; onSaved: (savedRecord: JsonRecord) => Promise<void>; onError: (message: string) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(resource, config, record, defaultRegion, defaultReviewType));
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const initialValuesJson = useRef(JSON.stringify({ values, tagDrafts: {} }));
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const isContact = resource === "customers" || resource === "partners";
  const isLedgerForm = resource === "orders" || resource === "incomes";
  const isTaskForm = resource === "tasks";
  const isProjectForm = resource === "projects";
  const isOrdinaryProjectForm = isProjectForm && defaultRegion !== "LEARNING";
  const isResourceForm = resource === "resources";
  const isAssetForm = resource === "experiences" || resource === "products" || resource === "reviews";
  const isStructuredLinkForm = isContact || isLedgerForm || isProjectForm || isResourceForm || isTaskForm || isAssetForm;
  const hasUnsavedChanges = JSON.stringify({ values, tagDrafts }) !== initialValuesJson.current;
  function change(name: string, value: unknown) { setValues((current) => ({ ...current, [name]: value })); }
  function requestClose() {
    if (saving) return;
    if (hasUnsavedChanges && !window.confirm("还有未保存的修改，确定离开并放弃草稿吗？")) return;
    onClose();
  }
  useEffect(() => {
    if (!hasUnsavedChanges || saving) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsavedChanges, saving]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setLocalError("");
    try {
      const payload = payloadFromForm(config, values, resource, defaultRegion);
      if (resource === "reviews" && record) {
        delete payload.reviewType;
        delete payload.reviewedOn;
      }
      let url = `/api/ledger/v1/${resource}`;
      let method = "POST";
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (record) { url += `/${record.id}`; method = "PATCH"; headers["if-match"] = String(record.version ?? 1); payload.expectedVersion = record.version ?? 1; }
      else headers["idempotency-key"] = crypto.randomUUID();
      const result = await requestJson<{ item: JsonRecord }>(url, { method, headers, body: JSON.stringify(payload) });
      await onSaved(result.item);
    } catch (issue) { const message = issue instanceof Error ? issue.message : "保存失败。"; setLocalError(message); onError(message); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const formFields = config.fields.filter((field) => field.name !== "links" && !(resource === "products" && field.name === "notes"));
  const visibleFormFields = formFields.filter((field) => !(isOrdinaryProjectForm && field.name === "upgradeType"));
  const renderField = (field: Field) => {
    const visibleField = isOrdinaryProjectForm && field.name === "region"
      ? { ...field, options: PROJECT_TYPE_TABS.map(({ label, value }) => [value, label] as [string, string]) }
      : field;
    const privateRelation = defaultRegion === "LEARNING" && ["customerIds", "partnerIds", "orderIds"].includes(field.name);
    const lockedReviewIdentity = resource === "reviews" && Boolean(record) && (field.name === "reviewType" || field.name === "reviewedOn");
    return <FormField key={field.name} field={visibleField} value={values[field.name]} options={options} disabled={privateRelation || lockedReviewIdentity} helperText={privateRelation ? "个人学习项目不能关联经营簿客户、合作方或订单。" : undefined} tagDraft={tagDrafts[field.name] ?? ""} onTagDraftChange={(draft) => setTagDrafts((currentDrafts) => ({ ...currentDrafts, [field.name]: draft }))} onChange={(value) => change(field.name, value)} />;
  };
  return <div className="gy-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className={`gy-form-drawer ${isProjectForm ? "gy-project-form-drawer" : ""} ${isResourceForm ? "gy-resource-form-drawer" : ""} ${isTaskForm ? "gy-task-form-drawer" : ""} ${isAssetForm ? "gy-asset-form-drawer" : ""}`} role="dialog" aria-modal="true" aria-label={`${record ? "编辑" : "新增"}${config.singular}`}>
      <header className="gy-drawer-header"><div><span className="gy-eyebrow">{record ? "编辑记录" : "新记录"}</span><h2>{record ? `编辑${config.singular}` : `新增${config.singular}`}</h2><p>带有 * 的字段需要填写</p></div><button className="gy-close-button" onClick={requestClose} aria-label="关闭" disabled={saving}>×</button></header>
      {record?.businessNumber ? <div className="gy-drawer-number">{record.businessNumber}</div> : null}
      <form className={`gy-record-form ${isContact ? "gy-contact-form" : ""} ${isLedgerForm ? "gy-ledger-form" : ""} ${isProjectForm ? "gy-project-form" : ""} ${isResourceForm ? "gy-resource-form" : ""} ${isTaskForm ? "gy-task-form" : ""} ${isAssetForm ? "gy-asset-form" : ""}`} onSubmit={submit}>
        {isProjectForm ? visibleFormFields.map((field) => {
          if (field.name === "dueDate") return null;
          if (field.name === "startDate") {
            const dueDate = visibleFormFields.find((item) => item.name === "dueDate");
            return <div className="gy-project-date-row" key="project-dates">{renderField(field)}{dueDate ? renderField(dueDate) : null}</div>;
          }
          return renderField(field);
        }) : isTaskForm ? formFields.map((field) => {
          if (field.name === "dueDate") return null;
          if (field.name === "plannedDate") {
            const dueDate = formFields.find((item) => item.name === "dueDate");
            return <div className="gy-task-date-row" key="task-dates">{renderField(field)}{dueDate ? renderField(dueDate) : null}</div>;
          }
          return renderField(field);
        }) : resource === "orders" ? formFields.map((field) => {
          if (field.name === "dueDate") return null;
          if (field.name === "orderDate") {
            const dueDate = formFields.find((item) => item.name === "dueDate");
            return <div className="gy-order-date-row" key="order-dates">{renderField(field)}{dueDate ? renderField(dueDate) : null}</div>;
          }
          return renderField(field);
        }) : formFields.map(renderField)}
        {isAssetForm ? <details className="gy-secondary-fields"><summary>{resource === "products" ? "备注与资料链接" : "资料链接"}</summary>{resource === "products" ? renderField(config.fields.find((field) => field.name === "notes")!) : null}<ContactLinksField value={values.links} onChange={(value) => change("links", value)} /></details> : isStructuredLinkForm ? <ContactLinksField value={values.links} onChange={(value) => change("links", value)} /> : config.fields.filter((field) => field.name === "links").map(renderField)}
        {localError ? <div role="alert" className="gy-form-error">{localError}</div> : null}
        <div className="gy-form-actions"><button type="button" className="gy-button" onClick={requestClose} disabled={saving}>取消</button><button type="submit" className="gy-button gy-button-primary" disabled={saving}>{saving ? "正在保存…" : "保存"}</button></div>
      </form>
    </section>
  </div>;
}

function initialValues(resource: EntityKey, config: EntityConfig, record: JsonRecord | null, defaultRegion?: string, defaultReviewType?: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of config.fields) {
    let value = record?.[field.name];
    if (field.kind === "money") value = yuanText(value);
    else if (field.kind === "date") value = dateInput(value) || (field.required ? TODAY : "");
    else if (field.kind === "links") value = resource === "customers" || resource === "partners" || resource === "orders" || resource === "incomes" || resource === "tasks" || resource === "projects" || resource === "resources" || resource === "experiences" || resource === "products" || resource === "reviews" ? contactMaterialLinks(value) : Array.isArray(value) ? (value as JsonRecord[]).map((item) => `${textValue(item.label)} | ${textValue(item.url)}`).join("\n") : "";
    else if (field.kind === "tags") value = Array.isArray(value) ? (value as string[]).filter((tag) => typeof tag === "string") : [];
    else if (field.kind === "directions") value = Array.isArray(value) ? value : [];
    else if (field.kind === "multi") value = normalizeMultiSelectValues(value);
    else if (field.kind === "select" && field.from && field.from !== "projects" && field.name.endsWith("Id")) value = typeof value === "string" ? value : "";
    if (value == null) {
      if (field.kind === "multi" || field.kind === "tags") value = [];
      else if (field.name === "status") value = field.options?.[0]?.[0] ?? "";
      else if (field.name === "priority") value = "P1";
      else if (field.name === "region") value = "SERVICE";
      else if (field.name === "upgradeType") value = !record && defaultRegion === "LEARNING" ? "学习" : "";
      else if (field.name === "method") value = "";
      else if (field.name === "reviewType") value = !record && defaultReviewType ? defaultReviewType : "WEEK";
      else value = "";
    }
    values[field.name] = value;
  }
  if (!record && resource === "tasks") values.plannedDate = TODAY;
  if (!record && resource === "incomes") values.receivedOn = TODAY;
  if (!record && resource === "experiences") values.recordedOn = TODAY;
  if (!record && resource === "projects") { values.status = "NOT_STARTED"; if (defaultRegion) values.region = defaultRegion; }
  return values;
}

function payloadFromForm(config: EntityConfig, values: Record<string, unknown>, resource?: EntityKey, defaultRegion?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of config.fields) {
    const value = values[field.name];
    if (field.kind === "money") { payload[field.name] = parseYuan(value); continue; }
    if (field.kind === "links") {
      if (["customers", "partners", "orders", "incomes", "tasks", "projects", "resources", "experiences", "products", "reviews"].includes(resource ?? "")) { payload.links = contactLinkPayload(value); continue; }
      const lines = typeof value === "string" ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
      payload.links = lines.map((line) => { const divider = line.indexOf("|"); return divider < 0 ? { label: line.slice(0, 120), url: line } : { label: line.slice(0, divider).trim(), url: line.slice(divider + 1).trim() }; });
      continue;
    }
    if (field.kind === "directions") { payload[field.name] = Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))] : []; continue; }
    if (field.kind === "tags") {
      payload[field.name] = Array.isArray(value) ? [...new Set(value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))] : [];
      continue;
    }
    if (field.kind === "multi") { payload[field.name] = normalizeMultiSelectValues(value); continue; }
    if (field.kind === "date") { payload[field.name] = typeof value === "string" && value ? value : null; continue; }
    if (field.kind === "select" && field.from) { payload[field.name] = typeof value === "string" && value ? value : null; continue; }
    if (typeof value === "string" && !value.trim() && !field.required) payload[field.name] = null;
    else payload[field.name] = value;
  }
  if (resource === "projects" && defaultRegion === "LEARNING") {
    delete payload.customerIds;
    delete payload.partnerIds;
    delete payload.orderIds;
  }
  return payload;
}

function FormField({ field, value, options, disabled = false, helperText, tagDraft = "", onTagDraftChange, onChange }: { field: Field; value: unknown; options: Partial<Record<EntityKey, Option[]>>; disabled?: boolean; helperText?: string; tagDraft?: string; onTagDraftChange?: (value: string) => void; onChange: (value: unknown) => void }) {
  const kind = field.kind ?? "text";
  const optionItems = field.options ?? (field.from ? (options[field.from] ?? []).map((item) => [item.id, `${item.businessNumber ? `${item.businessNumber} · ` : ""}${item.name}`] as [string, string]) : []);
  const current = typeof value === "string" ? value : "";
  if (kind === "multi") {
    const labelId = `field-label-${field.name}`;
    return <div className="gy-field">
      <label id={labelId}>{field.label}{field.required ? " *" : ""}</label>
      <SearchableMultiSelect field={field} labelId={labelId} optionItems={optionItems} value={value} disabled={disabled} onChange={onChange} />
      {helperText ? <small>{helperText}</small> : null}
    </div>;
  }
  if (kind === "tags") {
    const tags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
    return <div className="gy-field gy-tag-field">
      <label htmlFor={`field-${field.name}`}>{field.label}{field.required ? " *" : ""}</label>
      <input id={`field-${field.name}`} maxLength={64} disabled={disabled} value={tagDraft} onChange={(event) => onTagDraftChange?.(event.target.value)} onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const nextTag = tagDraft.trim();
        if (!nextTag || tags.includes(nextTag) || tags.length >= 50) return;
        onChange([...tags, nextTag]);
        onTagDraftChange?.("");
      }} placeholder="输入标签后按回车添加" />
      {tags.length ? <div className="gy-tag-list" aria-label="已添加标签">{tags.map((tag) => <span className="gy-tag-chip" key={tag}>{tag}<button type="button" disabled={disabled} aria-label={`删除标签 ${tag}`} onClick={() => onChange(tags.filter((item) => item !== tag))}>×</button></span>)}</div> : <small>按回车添加标签，可逐个删除。</small>}
    </div>;
  }
  return <div className={`gy-field ${kind === "textarea" || kind === "links" ? "gy-field-wide" : ""}`}>
    <label htmlFor={`field-${field.name}`}>{field.label}{field.required ? " *" : ""}</label>
    {kind === "textarea" ? <textarea id={`field-${field.name}`} required={field.required} disabled={disabled} value={current} onChange={(event) => onChange(event.target.value)} rows={field.label === "复盘正文" ? 14 : 4} placeholder={field.placeholder} />
      : kind === "select" ? <select id={`field-${field.name}`} required={field.required} disabled={disabled} value={current} onChange={(event) => onChange(event.target.value)}><option value="">请选择</option>{optionItems.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      : kind === "directions" ? <SearchableDirections value={Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []} onChange={onChange} />
      : kind === "links" ? <textarea id={`field-${field.name}`} value={current} onChange={(event) => onChange(event.target.value)} placeholder="每行一条：标签 | 网址或本地路径" rows={4} />
      : kind === "money" ? <div className="gy-money-input"><span>¥</span><input id={`field-${field.name}`} type="text" inputMode="decimal" required={field.required} disabled={disabled} value={current} onChange={(event) => onChange(event.target.value)} placeholder="0.00" /></div>
      : <input id={`field-${field.name}`} type={kind === "date" ? "date" : "text"} required={field.required} disabled={disabled} value={current} onChange={(event) => onChange(event.target.value)} onClick={kind === "date" && !disabled ? (event) => openDatePicker(event.currentTarget) : undefined} placeholder={field.placeholder} />}
    {field.helperText || helperText ? <small>{field.helperText ?? helperText}</small> : null}
  </div>;
}

function SearchableMultiSelect({ field, labelId, optionItems, value, disabled = false, onChange }: { field: Field; labelId: string; optionItems: Array<[string, string]>; value: unknown; disabled?: boolean; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = normalizeMultiSelectValues(value);
  const knownIds = new Set(optionItems.map(([optionId]) => optionId));
  const completeOptions = [...optionItems, ...selected.filter((optionId) => !knownIds.has(optionId)).map((optionId) => [optionId, "已关联记录"] as [string, string])];
  const labels = new Map(completeOptions);
  const filteredOptions = filterMultiSelectOptions(completeOptions, query);
  const listId = `field-options-${field.name}`;

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
      const top = rect.bottom + 6;
      setMenuPosition({
        left,
        top,
        width,
        maxHeight: Math.max(120, window.innerHeight - top - viewportPadding),
      });
    };
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeWhenPointerLeaves(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeWhenPointerLeaves);
    return () => document.removeEventListener("pointerdown", closeWhenPointerLeaves);
  }, [open]);

  const menu = open && menuPosition ? <div
    className="gy-multi-select-menu"
    id={listId}
    ref={menuRef}
    style={{ left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}
  >
    <input type="search" aria-label={`搜索${field.label}`} placeholder={`搜索${field.label}名称或编号`} value={query} onChange={(event) => setQuery(event.target.value)} />
    {filteredOptions.length ? <div className="gy-multi-select-options" role="group" aria-labelledby={labelId}>
      {filteredOptions.map(([optionId, label]) => <label className="gy-multi-select-option" key={optionId}>
        <input type="checkbox" checked={selected.includes(optionId)} disabled={disabled} onChange={(event) => onChange(toggleMultiSelectValue(selected, optionId, event.target.checked))} />
        <span>{label}</span>
      </label>)}
    </div> : <p className="gy-multi-select-no-options">{completeOptions.length ? "没有匹配的关联项。" : "暂无可关联项，可以留空继续。"}</p>}
  </div> : null;

  return <>
  <div className="gy-multi-select" ref={containerRef}>
    <div className="gy-multi-select-toolbar">
      <button ref={triggerRef} type="button" className="gy-multi-select-trigger" aria-label={`${field.label}，${selected.length ? `已选 ${selected.length} 项` : "可留空"}`} aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => setOpen((current) => !current)}>
        {open ? "收起选项" : selected.length ? `已选 ${selected.length} 项` : "选择关联项（可留空）"}
      </button>
      {selected.length && !disabled ? <button type="button" className="gy-multi-select-clear" onClick={() => onChange([])}>清空</button> : null}
    </div>
    <div className="gy-multi-select-selected" aria-live="polite">
      {selected.length ? selected.map((optionId) => {
        const label = labels.get(optionId) ?? "已关联记录";
        return <span className="gy-multi-select-chip" key={optionId}>
          <span>{label}</span>
          {!disabled ? <button type="button" aria-label={`移除${label}`} onClick={() => onChange(toggleMultiSelectValue(selected, optionId, false))}>×</button> : null}
        </span>;
      }) : <span className="gy-multi-select-empty">未选择关联项</span>}
    </div>
    {!disabled ? <small>选填：可以不关联；搜索名称或编号后勾选，可选择多项。</small> : null}
  </div>
  {menu ? createPortal(menu, containerRef.current?.closest(".gy-overlay") ?? document.body) : null}
  </>;
}

function ContactLinksField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const links = contactMaterialLinks(value);
  function update(index: number, key: "label" | "url", nextValue: string) {
    onChange(links.map((link, linkIndex) => linkIndex === index ? { ...link, [key]: nextValue } : link));
  }
  return <section className="gy-field gy-field-wide gy-contact-links">
    <div className="gy-contact-field-heading"><label>资料链接</label><button type="button" className="gy-link-button" onClick={() => onChange([...links, { label: "", url: "" }])}>＋ 添加链接</button></div>
    {links.length ? links.map((link, index) => <div className="gy-contact-link-row" key={link.id ?? `link-${index}`}>
      <input aria-label={`第 ${index + 1} 条资料名称`} value={link.label} onChange={(event) => update(index, "label", event.target.value)} placeholder="资料名称" required={Boolean(link.url.trim())} />
      <input aria-label={`第 ${index + 1} 条资料地址`} value={link.url} onChange={(event) => update(index, "url", event.target.value)} placeholder="Obsidian 链接、文件路径或网页地址" required={Boolean(link.label.trim())} />
      <button type="button" className="gy-remove-link" aria-label={`删除第 ${index + 1} 条资料链接`} onClick={() => onChange(links.filter((_, linkIndex) => linkIndex !== index))}>删除</button>
    </div>) : <p className="gy-muted">尚未添加资料链接。</p>}
  </section>;
}

function SearchableDirections({ value, onChange }: { value: string[]; onChange: (value: unknown) => void }) {
  const [query, setQuery] = useState("");
  const legacyValues = value.filter((item) => !(PARTNER_DIRECTIONS as readonly string[]).includes(item));
  const visibleOptions = PARTNER_DIRECTIONS.filter((item) => item.includes(query.trim()));
  function toggle(option: string, checked: boolean) {
    onChange(checked ? [...new Set([...value, option])] : value.filter((item) => item !== option));
  }
  return <div className="gy-directions-picker">
    <input type="search" aria-label="搜索合作方向" placeholder="搜索合作方向" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="gy-directions-options" role="group" aria-label="合作方向">
      {visibleOptions.length ? visibleOptions.map((option) => <label key={option}><input type="checkbox" checked={value.includes(option)} onChange={(event) => toggle(option, event.target.checked)} />{option}</label>) : <span className="gy-muted">没有匹配的合作方向。</span>}
    </div>
    {legacyValues.length ? <div className="gy-legacy-directions"><span>已有合作方向</span>{legacyValues.map((item) => <button type="button" key={item} onClick={() => toggle(item, false)}>{item} ×</button>)}</div> : null}
  </div>;
}

function ContactRecordDrawer({ resource, record, config, options, onClose, onEdit, onDeleted, onOpenRecord, onRecordUpdate, onChanged, onNotice, onError }: {
  resource: "customers" | "partners";
  record: JsonRecord;
  config: EntityConfig;
  options: Partial<Record<EntityKey, Option[]>>;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenRecord: (resource: EntityKey, item: JsonRecord) => void;
  onRecordUpdate: (record: JsonRecord) => void;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [detailRecord, setDetailRecord] = useState(record);
  const [communications, setCommunications] = useState<JsonRecord[]>([]);
  const [tasks, setTasks] = useState<JsonRecord[]>([]);
  const [activityDate, setActivityDate] = useState(TODAY);
  const [activityText, setActivityText] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskPlanDate, setTaskPlanDate] = useState(TODAY);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [quickAction, setQuickAction] = useState<"" | "task" | "communication" | "material">("");
  const [busy, setBusy] = useState(false);
  const isCustomer = resource === "customers";
  const isDeleted = Boolean(detailRecord.deletedAt);

  useEffect(() => { setDetailRecord(record); }, [record]);
  useEffect(() => {
    let mounted = true;
    const tasksParams = new URLSearchParams({ limit: "200", page: "1", sort: "plannedDate", direction: "asc" });
    tasksParams.set(isCustomer ? "customerId" : "partnerId", detailRecord.id);
    void Promise.all([
      requestJson<{ items: JsonRecord[] }>(`/api/ledger/v1/${resource}/${detailRecord.id}/communications?limit=200`),
      requestJson<{ items: JsonRecord[] }>(`/api/ledger/v1/tasks?${tasksParams}`),
    ]).then(([communicationResult, taskResult]) => {
      if (!mounted) return;
      setCommunications(communicationResult.items);
      setTasks(taskResult.items);
    }).catch((issue) => {
      if (mounted) onError(issue instanceof Error ? issue.message : "关联记录读取失败。");
    });
    return () => { mounted = false; };
  }, [resource, detailRecord.id, isCustomer, onError]);

  async function reloadRecord() {
    const result = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/${resource}/${detailRecord.id}`);
    setDetailRecord(result.item);
    onRecordUpdate(result.item);
  }

  async function appendCommunication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/${resource}/${detailRecord.id}/communications`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ occurredOn: activityDate, content: activityText }),
      });
      setCommunications((current) => [result.item, ...current]);
      setActivityText("");
      setQuickAction("");
      onNotice("沟通记录已追加。");
      await reloadRecord();
      await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "沟通记录追加失败。"); }
    finally { setBusy(false); }
  }

  async function createFollowupTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: taskName.trim(), status: "TODO", priority: "P1", [isCustomer ? "customerId" : "partnerId"]: detailRecord.id };
      if (taskPlanDate) body.plannedDate = taskPlanDate;
      const result = await requestJson<{ item: JsonRecord }>("/api/ledger/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setTasks((current) => [...current, result.item].sort((left, right) => textValue(left.plannedDate).localeCompare(textValue(right.plannedDate))));
      setTaskName("");
      setQuickAction("");
      onNotice("任务已添加。");
      await reloadRecord();
      await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "任务添加失败。"); }
    finally { setBusy(false); }
  }

  async function addCustomerMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCustomer || !linkUrl.trim()) return;
    setBusy(true);
    try {
      const links = contactLinkPayload([...contactMaterialLinks(detailRecord.links), { label: linkLabel, url: linkUrl }]);
      const result = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/${resource}/${detailRecord.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "if-match": String(detailRecord.version ?? 1) },
        body: JSON.stringify({ expectedVersion: detailRecord.version ?? 1, links }),
      });
      setDetailRecord(result.item);
      onRecordUpdate(result.item);
      setLinkLabel("");
      setLinkUrl("");
      setQuickAction("");
      onNotice("资料链接已添加。");
      await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "资料链接添加失败。"); }
    finally { setBusy(false); }
  }

  async function removeRecord() {
    if (!window.confirm(`删除“${recordLabel(resource, detailRecord)}”？记录会保留，可之后恢复。`)) return;
    try {
      await requestJson(`/api/ledger/v1/${resource}/${detailRecord.id}`, { method: "DELETE", headers: { "if-match": String(detailRecord.version ?? 1) } });
      onNotice(`${config.singular}已移入已删除列表。`);
      onDeleted();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "删除失败。"); }
  }

  async function copyBusinessNumber() {
    const businessNumber = textValue(detailRecord.businessNumber);
    if (!businessNumber) { onError("这条记录没有可复制的业务编号。"); return; }
    try { await navigator.clipboard.writeText(businessNumber); onNotice("业务编号已复制。"); }
    catch { onError("复制失败，请检查浏览器剪贴板权限。"); }
  }

  const linkedProjects = Array.isArray(detailRecord.projectLinks) ? (detailRecord.projectLinks as JsonRecord[]).flatMap((link) => {
    const project = link.project as JsonRecord | undefined;
    return project ? [recordLabel("projects", project)] : [];
  }) : [];
  const projectIds = Array.isArray(detailRecord.projectIds) ? detailRecord.projectIds as string[] : [];
  const projectNames = linkedProjects.length ? linkedProjects : projectIds.map((id) => relationName("projects", id, options));
  const linkedOrders = Array.isArray(detailRecord.orders) ? (detailRecord.orders as JsonRecord[]).map((order) => recordLabel("orders", order)) : [];
  const orderIds = Array.isArray(detailRecord.orderIds) ? detailRecord.orderIds as string[] : [];
  const orderNames = linkedOrders.length ? linkedOrders : orderIds.map((id) => relationName("orders", id, options));
  const detailRows: Array<[string, string]> = [
    ["记录 ID", textValue(detailRecord.businessNumber) || "—"],
    ["记录版本", String(detailRecord.version ?? 1)],
    [isCustomer ? "客户状态" : "合作状态", displayEnum(detailRecord.status)],
    ["行业 / 业务领域", textValue(detailRecord.industry) || "—"],
  ];
  if (isCustomer) {
    detailRows.push(["客户来源", textValue(detailRecord.source) || "—"]);
    detailRows.push(["需求说明", textValue(detailRecord.needs) || "—"]);
    detailRows.push(["累计到账", formatMoney(detailRecord.totalReceivedCents)]);
    detailRows.push(["当前应收", formatMoney(detailRecord.receivableCents)]);
  } else {
    const directions = Array.isArray(detailRecord.directions) ? detailRecord.directions.filter((item): item is string => typeof item === "string") : [];
    detailRows.push(["合作方向", directions.join("、") || "—"]);
    detailRows.push(["资源与能力", textValue(detailRecord.capabilities) || "—"]);
    detailRows.push(["合作说明", textValue(detailRecord.description) || "—"]);
  }
  detailRows.push(["最近沟通", formatDate((detailRecord.lastCommunication as JsonRecord | null)?.occurredOn)]);
  detailRows.push(["下一次跟进", formatDate(contactFollowupDate(detailRecord.nextFollowup))]);
  detailRows.push(["关联项目", projectNames.join("、") || "—"]);
  if (isCustomer) detailRows.push(["关联订单", orderNames.join("、") || "—"]);
  detailRows.push(["备注", textValue(detailRecord.notes) || "—"]);
  detailRows.push(["创建时间", formatDateTime(detailRecord.createdAt)]);
  detailRows.push(["更新时间", formatDateTime(detailRecord.updatedAt)]);

  return <div className="gy-overlay gy-overlay-detail" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="gy-detail-drawer gy-contact-detail-drawer" role="dialog" aria-modal="true" aria-label={`${config.singular}详情`}>
      <header className="gy-drawer-header"><div><span className="gy-eyebrow">记录详情</span><h2>{textValue(detailRecord.name) || config.singular}</h2><p>{textValue(detailRecord.businessNumber)} · {displayEnum(detailRecord.status)}</p></div><button className="gy-close-button" onClick={onClose} aria-label="关闭">×</button></header>
      <div className="gy-detail-actions gy-contact-detail-actions">
        {!isDeleted ? <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button" onClick={() => setQuickAction((current) => current === "task" ? "" : "task")}>添加任务</button><button className="gy-button" onClick={() => setQuickAction((current) => current === "communication" ? "" : "communication")}>添加沟通</button>{isCustomer ? <button className="gy-button" onClick={() => setQuickAction((current) => current === "material" ? "" : "material")}>添加资料</button> : null}<button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button><button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button></> : <span className="gy-muted">此记录已删除。</span>}
      </div>
      {quickAction === "task" ? <form className="gy-contact-quick-form" onSubmit={createFollowupTask}><h3>添加任务</h3><label>任务名称<input value={taskName} onChange={(event) => setTaskName(event.target.value)} required maxLength={160} /></label><label>计划日期<input type="date" value={taskPlanDate} onChange={(event) => setTaskPlanDate(event.target.value)} onClick={(event) => openDatePicker(event.currentTarget)} /></label><div><button className="gy-button" type="button" onClick={() => setQuickAction("")} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !taskName.trim()}>{busy ? "正在保存…" : "保存任务"}</button></div></form> : null}
      {quickAction === "communication" ? <form className="gy-contact-quick-form" onSubmit={appendCommunication}><h3>添加沟通</h3><label>沟通日期<input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} onClick={(event) => openDatePicker(event.currentTarget)} required /></label><label>沟通内容<textarea value={activityText} onChange={(event) => setActivityText(event.target.value)} required rows={4} maxLength={20000} /></label><div><button className="gy-button" type="button" onClick={() => setQuickAction("")} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !activityText.trim()}>{busy ? "正在保存…" : "保存沟通"}</button></div></form> : null}
      {quickAction === "material" && isCustomer ? <form className="gy-contact-quick-form" onSubmit={addCustomerMaterial}><h3>添加资料</h3><label>资料名称<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} maxLength={120} /></label><label>资料链接<input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} required maxLength={2048} placeholder="Obsidian 链接、文件路径或网页地址" /></label><div><button className="gy-button" type="button" onClick={() => setQuickAction("")} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !linkUrl.trim()}>{busy ? "正在保存…" : "保存资料"}</button></div></form> : null}
      <div className="gy-detail-fields gy-contact-detail-fields">{detailRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {Array.isArray(detailRecord.links) && detailRecord.links.length ? <section className="gy-detail-section"><header><h3>资料链接</h3><span>{detailRecord.links.length}</span></header>{(detailRecord.links as JsonRecord[]).map((link) => <MaterialLink key={textValue(link.id) || textValue(link.url)} link={link} onNotice={onNotice} />)}</section> : null}
      <section className="gy-detail-section"><header><h3>关联任务</h3><span>{tasks.length}</span></header>{tasks.length ? <div className="gy-contact-related-list">{tasks.map((task) => <button key={task.id} onClick={() => onOpenRecord("tasks", task)}><span><strong>{textValue(task.name)}</strong><small>{textValue(task.businessNumber)} · 计划日期 {formatDate(task.plannedDate)}</small></span><em>{displayEnum(task.status)}</em></button>)}</div> : <p className="gy-muted">暂无关联任务。</p>}</section>
      <section className="gy-detail-section"><header><h3>沟通记录</h3><span>{communications.length}</span></header>{communications.length ? <div className="gy-activity-list">{communications.map((activity) => <article key={textValue(activity.id)}><time>{formatDate(activity.occurredOn)}</time><p>{textValue(activity.content)}</p></article>)}</div> : <p className="gy-muted">还没有沟通记录。</p>}</section>
    </section>
  </div>;
}

function RecordDrawer({ resource, record, config, options, onClose, onEdit, onDeleted, onOpenRecord, onRecordUpdate, onChanged, onNotice, onError }: { resource: EntityKey; record: JsonRecord; config: EntityConfig; options: Partial<Record<EntityKey, Option[]>>; onClose: () => void; onEdit: () => void; onDeleted: () => void; onOpenRecord: (resource: EntityKey, item: JsonRecord) => void; onRecordUpdate: (record: JsonRecord) => void; onChanged: () => Promise<void>; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [activities, setActivities] = useState<JsonRecord[]>([]);
  const [activityText, setActivityText] = useState("");
  const [activityDate, setActivityDate] = useState(TODAY);
  const [quickAction, setQuickAction] = useState<"task" | "log" | "material" | null>(null);
  const [projectTasks, setProjectTasks] = useState<JsonRecord[]>(() => Array.isArray(record.tasks) ? record.tasks as JsonRecord[] : []);
  const [projectTaskName, setProjectTaskName] = useState("");
  const [projectTaskPriority, setProjectTaskPriority] = useState("P1");
  const [materialLabel, setMaterialLabel] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const isPerson = resource === "customers" || resource === "partners";
  const isProject = resource === "projects";
  const isResource = resource === "resources";
  const isTask = resource === "tasks";
  useEffect(() => {
    if ((!isPerson && !isProject) || record.deletedAt) return;
    const path = isProject ? `/api/ledger/v1/projects/${record.id}/logs` : `/api/ledger/v1/${resource}/${record.id}/communications`;
    void requestJson<{ items: JsonRecord[] }>(path).then((result) => setActivities(result.items)).catch((issue) => onError(issue instanceof Error ? issue.message : "关联记录读取失败。"));
  }, [isPerson, isProject, resource, record.id, record.deletedAt, onError]);

  async function appendActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const path = isProject ? `/api/ledger/v1/projects/${record.id}/logs` : `/api/ledger/v1/${resource}/${record.id}/communications`;
    const body = isProject ? { logDate: activityDate, content: activityText } : { occurredOn: activityDate, content: activityText };
    try {
      const result = await requestJson<{ item: JsonRecord }>(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
      setActivities((items) => [...items, result.item].sort((left, right) => textValue(right.logDate).localeCompare(textValue(left.logDate)) || textValue(right.createdAt).localeCompare(textValue(left.createdAt))));
      setActivityText(""); setQuickAction(null); onNotice(isProject ? "项目跟进日志已添加。" : "沟通记录已追加。"); await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "追加失败。"); }
    finally { setBusy(false); }
  }

  async function addProjectTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProject || !projectTaskName.trim()) return;
    setBusy(true);
    try {
      const result = await requestJson<{ item: JsonRecord }>("/api/ledger/v1/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ name: projectTaskName.trim(), projectId: record.id, status: "TODO", priority: projectTaskPriority }),
      });
      setProjectTasks((items) => [...items, result.item].sort((left, right) => textValue(left.priority).localeCompare(textValue(right.priority)) || textValue(left.plannedDate).localeCompare(textValue(right.plannedDate))));
      setProjectTaskName(""); setQuickAction(null); onNotice("所属任务已添加。"); await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "任务添加失败。"); }
    finally { setBusy(false); }
  }

  async function addProjectMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProject || !materialUrl.trim()) return;
    setBusy(true);
    try {
      const links = contactLinkPayload([...contactMaterialLinks(record.links), { label: materialLabel, url: materialUrl }]);
      const result = await requestJson<{ item: JsonRecord }>(`/api/ledger/v1/projects/${record.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "if-match": String(record.version ?? 1) },
        body: JSON.stringify({ expectedVersion: record.version ?? 1, links }),
      });
      onRecordUpdate(result.item); setMaterialLabel(""); setMaterialUrl(""); setQuickAction(null); onNotice("资料链接已添加。"); await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "资料链接添加失败。"); }
    finally { setBusy(false); }
  }

  async function removeRecord() {
    if (!window.confirm(`删除“${recordLabel(resource, record)}”？记录会保留，可之后恢复。`)) return;
    try {
      await requestJson(`/api/ledger/v1/${resource}/${record.id}`, { method: "DELETE", headers: { "if-match": String(record.version ?? 1) } });
      onNotice(`${config.singular}已移入已删除列表。`); onDeleted();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "删除失败。"); }
  }

  async function restoreRecord() {
    try {
      await requestJson(`/api/ledger/v1/${resource}/${record.id}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json", "if-match": String(record.version ?? 1) },
        body: JSON.stringify({ expectedVersion: record.version ?? 1 }),
      });
      onNotice(`${config.singular}已恢复。`);
      onDeleted();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "恢复失败。"); }
  }

  async function toggleTaskCompletion() {
    setBusy(true);
    try {
      const updated = await completeTask(record);
      onRecordUpdate(updated);
      onNotice(updated.status === "COMPLETED" ? "任务已完成。" : "任务已恢复到完成前状态。");
      await onChanged();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "任务状态更新失败。"); }
    finally { setBusy(false); }
  }

  async function copyBusinessNumber() {
    const businessNumber = textValue(record.businessNumber);
    if (!businessNumber) { onError("这条记录没有可复制的业务编号。"); return; }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(businessNumber);
      else throw new Error("Clipboard API unavailable");
      onNotice("业务编号已复制。");
    } catch {
      const input = document.createElement("textarea");
      input.value = businessNumber;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (copied) onNotice("业务编号已复制。");
      else onError("复制失败，请手动选择业务编号。");
    }
  }

  if (isPerson) return <ContactRecordDrawer resource={resource} record={record} config={config} options={options} onClose={onClose} onEdit={onEdit} onDeleted={onDeleted} onOpenRecord={onOpenRecord} onRecordUpdate={onRecordUpdate} onChanged={onChanged} onNotice={onNotice} onError={onError} />;

  const isLedgerRecord = resource === "orders" || resource === "incomes";
  const isExperience = resource === "experiences";
  const isProduct = resource === "products";
  const isReview = resource === "reviews";
  const isAssetRecord = isExperience || isProduct || isReview;
  const isDeleted = Boolean(record.deletedAt);
  const projectIds = Array.isArray(record.projectIds) ? record.projectIds : [];
  const linkedProjects = Array.isArray(record.projects) ? record.projects as JsonRecord[] : [];
  const projectNames = projectIds.map((id) => {
    const option = options.projects?.find((item) => item.id === id);
    if (option) return option.name;
    const relation = linkedProjects.find((item) => item.projectId === id);
    const project = relation?.project;
    return project && typeof project === "object" ? textValue((project as JsonRecord).name) : "关联记录";
  }).filter(Boolean).join("、") || "—";
  const customer = record.customer;
  const order = record.order;
  const ledgerDetails = resource === "orders" ? [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["客户", customer && typeof customer === "object" ? textValue((customer as JsonRecord).name) : relationName("customers", record.customerId, options)],
    ["订单内容", textValue(record.content) || "—"],
    ["关联项目", projectNames],
    ["交付状态", displayEnum(record.status)],
    ["收款状态", displayEnum(record.collectionStatus)],
    ["订单金额", formatMoney(record.amountCents)],
    ["已收金额", formatMoney(record.receivedCents)],
    ["应收金额", formatReceivable(record.receivableCents)],
    ["下单日期", formatDate(record.orderDate)],
    ["约定交付日期", formatDate(record.dueDate)],
    ["备注", textValue(record.notes) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ] : resource === "incomes" ? [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["到账日期", formatDate(record.receivedOn)],
    ["到账金额", formatMoney(record.amountCents)],
    ["关联订单", order && typeof order === "object" ? textValue((order as JsonRecord).name) : record.orderId ? relationName("orders", record.orderId, options) : "独立收入"],
    ["收款方式", displayEnum(record.method)],
    ["备注", textValue(record.notes) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ] : null;
  const taskProject = record.project && typeof record.project === "object" ? record.project as JsonRecord : null;
  const taskCustomer = record.customer && typeof record.customer === "object" ? record.customer as JsonRecord : null;
  const taskPartner = record.partner && typeof record.partner === "object" ? record.partner as JsonRecord : null;
  const taskDetails: Array<[string, string]> | null = isTask ? [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["任务状态", displayEnum(record.status)],
    ["优先级", displayEnum(record.priority)],
    ["所属项目及项目区域", taskProject ? `${textValue(taskProject.businessNumber) ? `${textValue(taskProject.businessNumber)} · ` : ""}${textValue(taskProject.name)} · ${displayProjectArea(taskProject.region)}` : "—"],
    ["关联客户", taskCustomer ? textValue(taskCustomer.name) : relationName("customers", record.customerId, options)],
    ["关联合作方", taskPartner ? textValue(taskPartner.name) : relationName("partners", record.partnerId, options)],
    ["计划日期", formatDate(record.plannedDate)],
    ["截止日期", formatDate(record.dueDate)],
    ["完成时间", formatDateTime(record.completedAt)],
    ["说明", textValue(record.description) || "—"],
    ["备注", textValue(record.notes) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ] : null;
  const projectDetails: Array<[string, string]> = [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["所属区域", displayProjectArea(record.region)],
    ["项目状态", displayEnum(record.status)],
  ];
  if (record.region === "LEARNING" || textValue(record.upgradeType)) projectDetails.push(["提升类型", textValue(record.upgradeType) ? displayEnum(record.upgradeType) : "—"]);
  projectDetails.push(
    ["项目说明", textValue(record.description) || "—"],
    ["目标 / 预期产出", textValue(record.expectedOutcome) || "—"],
    ["开始日期", formatDate(record.startDate)],
    ["目标完成日期", formatDate(record.dueDate)],
    ["关联客户", projectRelationNames(record, record.customerIds, "customers", options)],
    ["关联合作方", projectRelationNames(record, record.partnerIds, "partners", options)],
    ["关联订单", projectRelationNames(record, record.orderIds, "orders", options)],
    ["备注", textValue(record.notes) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  );
  const resourceDetails: Array<[string, string]> = [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["资料分类", textValue(record.category) || "—"],
    ["用途说明", textValue(record.purpose) || "—"],
    ["关联项目", projectNames],
    ["备注", textValue(record.notes) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ];
  const experienceDetails: Array<[string, string]> = [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["记录日期", formatDate(record.recordedOn)],
    ["原话内容", textValue(record.content) || "—"],
    ["标签", Array.isArray(record.tags) ? (record.tags as string[]).join("、") || "—" : "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ];
  const productDetails: Array<[string, string]> = [
    ["记录 ID", textValue(record.businessNumber) || "—"],
    ["记录版本", String(record.version ?? 1)],
    ["产品类型", textValue(record.productType) || "—"],
    ["产品版本", textValue(record.productVersion) || "—"],
    ["售价（元）", formatMoney(record.priceCents)],
    ["销售状态", displayEnum(record.status, "productStatus")],
    ["产品说明", textValue(record.description) || "—"],
    ["创建时间", formatDateTime(record.createdAt)],
    ["更新时间", formatDateTime(record.updatedAt)],
  ];

  return <div className="gy-overlay gy-overlay-detail" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`gy-detail-drawer ${isTask ? "gy-task-detail-drawer" : ""} ${isReview ? "gy-review-detail-drawer" : ""}`} role="dialog" aria-modal="true" aria-label={`${config.singular}详情`}>
      <header className="gy-drawer-header"><div><span className="gy-eyebrow">记录详情</span><h2>{isReview ? `${displayEnum(record.reviewType)} · ${formatDate(record.reviewedOn)}` : isProduct ? textValue(record.name) || config.singular : isExperience ? textValue(record.title) || config.singular : textValue(record.name) || textValue(record.title) || config.singular}</h2>{isReview ? <div className="gy-review-summary"><span className="gy-review-cycle-badge">{displayEnum(record.reviewType)}</span><span>{formatDate(record.reviewedOn)}</span><span>{textValue(record.businessNumber) || "—"}</span></div> : isProduct ? null : isExperience ? <p>{textValue(record.businessNumber)} · {formatDate(record.recordedOn)}</p> : <p>{textValue(record.businessNumber)} · {isProject ? displayProjectArea(record.region) : displayEnum(record.status || record.region || record.reviewType)}</p>}</div><button className="gy-close-button" onClick={onClose} aria-label="关闭">×</button></header>
      <div className="gy-detail-actions">
        {isProject ? <>
          {!isDeleted ? <>
            <button className="gy-button" onClick={onEdit}>编辑</button>
            <button className="gy-button" onClick={() => setQuickAction((current) => current === "task" ? null : "task")}>添加任务</button>
            <button className="gy-button" onClick={() => setQuickAction((current) => current === "log" ? null : "log")}>添加跟进日志</button>
            <button className="gy-button" onClick={() => setQuickAction((current) => current === "material" ? null : "material")}>添加资料</button>
            <button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button>
          </> : <button className="gy-button" onClick={() => void restoreRecord()}>恢复</button>}
          <button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button>
        </> : isResource ? <>
          {!isDeleted ? <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button></> : <button className="gy-button" onClick={() => void restoreRecord()}>恢复</button>}
          <button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button>
        </> : isLedgerRecord ? <>
          {!isDeleted ? <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button></> : <button className="gy-button" onClick={() => void restoreRecord()}>恢复</button>}
          <button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button>
        </> : isTask ? <>
          {!isDeleted ? <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button></> : <button className="gy-button" onClick={() => void restoreRecord()}>恢复</button>}
          <button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button>
        </> : isAssetRecord ? <>
          {!isDeleted ? <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button></> : <button className="gy-button" onClick={() => void restoreRecord()}>恢复</button>}
          <button className="gy-button" onClick={() => void copyBusinessNumber()}>复制编号</button>
        </> : <><button className="gy-button" onClick={onEdit}>编辑</button><button className="gy-button gy-danger-button" onClick={() => void removeRecord()}>删除</button></>}
      </div>
      {isProject && quickAction === "task" ? <form className="gy-project-quick-form" onSubmit={addProjectTask}><h3>添加任务</h3><label>任务名称<input value={projectTaskName} onChange={(event) => setProjectTaskName(event.target.value)} required maxLength={160} /></label><label>优先级<select value={projectTaskPriority} onChange={(event) => setProjectTaskPriority(event.target.value)}><option value="P0">高</option><option value="P1">中</option><option value="P2">低</option></select></label><div><button className="gy-button" type="button" onClick={() => setQuickAction(null)} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !projectTaskName.trim()}>{busy ? "正在保存…" : "保存任务"}</button></div></form> : null}
      {isProject && quickAction === "log" ? <form className="gy-project-quick-form" onSubmit={appendActivity}><h3>添加跟进日志</h3><label>日志日期<input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} onClick={(event) => openDatePicker(event.currentTarget)} required /></label><label>日志内容<textarea value={activityText} onChange={(event) => setActivityText(event.target.value)} required rows={4} maxLength={20000} placeholder="记录项目进展" /></label><div><button className="gy-button" type="button" onClick={() => setQuickAction(null)} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !activityText.trim()}>{busy ? "正在保存…" : "保存日志"}</button></div></form> : null}
      {isProject && quickAction === "material" ? <form className="gy-project-quick-form" onSubmit={addProjectMaterial}><h3>添加资料</h3><label>资料名称<input value={materialLabel} onChange={(event) => setMaterialLabel(event.target.value)} maxLength={120} /></label><label>资料链接<input value={materialUrl} onChange={(event) => setMaterialUrl(event.target.value)} required maxLength={2048} placeholder="Obsidian 链接、文件路径或网页地址" /></label><div><button className="gy-button" type="button" onClick={() => setQuickAction(null)} disabled={busy}>取消</button><button className="gy-button gy-button-primary" disabled={busy || !materialUrl.trim()}>{busy ? "正在保存…" : "保存资料"}</button></div></form> : null}
      {isReview ? <>
        <section className="gy-review-body"><h3>复盘正文</h3><div className="gy-review-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]} components={{ img: () => null }}>{textValue(record.content)}</ReactMarkdown></div><p>最近更新时间：{formatDateTime(record.updatedAt)}</p></section>
        <div className="gy-detail-fields gy-project-detail-fields gy-review-system-fields"><div><span>记录版本</span><strong>{String(record.version ?? 1)}</strong></div><div><span>创建时间</span><strong>{formatDateTime(record.createdAt)}</strong></div></div>
      </> : <div className={`gy-detail-fields ${isLedgerRecord ? "gy-ledger-detail-fields" : ""} ${isProject || isResource || isExperience || isProduct ? "gy-project-detail-fields" : ""} ${isProduct ? "gy-product-detail-fields" : ""} ${isTask ? "gy-task-detail-fields" : ""}`}>{isProject ? projectDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : isResource ? resourceDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : ledgerDetails ? ledgerDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : taskDetails ? taskDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : isExperience ? experienceDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : isProduct ? productDetails.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>) : <>{config.fields.filter((field) => field.name !== "links").map((field) => <div key={field.name}><span>{field.label}</span><strong>{detailValue(resource, field, record[field.name], record, options)}</strong></div>)}<div><span>创建时间</span><strong>{formatDateTime(record.createdAt)}</strong></div><div><span>更新时间</span><strong>{formatDateTime(record.updatedAt)}</strong></div><div><span>记录版本</span><strong>{String(record.version ?? 1)}</strong></div></>}</div>}
      {isProduct ? <section className="gy-detail-section"><header><h3>备注</h3></header><p className="gy-asset-notes">{textValue(record.notes) || "尚未添加备注。"}</p></section> : null}
      {isAssetRecord ? <section className="gy-detail-section"><header><h3>资料链接</h3><span>{Array.isArray(record.links) ? record.links.length : 0}</span></header>{Array.isArray(record.links) && record.links.length ? (record.links as JsonRecord[]).map((link) => <MaterialLink key={textValue(link.id) || textValue(link.url)} link={link} onNotice={onNotice} />) : <p className="gy-muted">尚未添加资料链接。</p>}</section> : null}
      {isProject ? <>
        <section className="gy-detail-section"><header><h3>所属任务</h3><span>{projectTasks.length}</span></header>{projectTasks.length ? <div className="gy-project-task-list">{projectTasks.map((task) => <button className="gy-project-task" key={textValue(task.id)} onClick={() => onOpenRecord("tasks", task)}><span><strong>{textValue(task.name)}</strong><small>优先级：{displayEnum(task.priority)}</small></span><em>状态：{displayEnum(task.status)}</em></button>)}</div> : <p className="gy-muted">当前项目尚无任务。</p>}</section>
        <section className="gy-detail-section"><header><h3>项目跟进日志</h3><span>{activities.length}</span></header><div className="gy-activity-list">{activities.length ? activities.map((activity) => <article key={textValue(activity.id)}><time>{formatDate(activity.logDate)}</time><p>{textValue(activity.content)}</p></article>) : <p className="gy-muted">还没有跟进日志。</p>}</div></section>
        <section className="gy-detail-section"><header><h3>资料链接</h3><span>{Array.isArray(record.links) ? record.links.length : 0}</span></header>{Array.isArray(record.links) && record.links.length ? (record.links as JsonRecord[]).map((link) => <MaterialLink key={textValue(link.id) || textValue(link.url)} link={link} onNotice={onNotice} />) : <p className="gy-muted">尚未添加资料链接。</p>}</section>
      </> : <>
        {isResource ? <section className="gy-detail-section"><header><h3>资料链接</h3><span>{Array.isArray(record.links) ? record.links.length : 0}</span></header>{Array.isArray(record.links) && record.links.length ? (record.links as JsonRecord[]).map((link) => <MaterialLink key={textValue(link.id) || textValue(link.url)} link={link} onNotice={onNotice} />) : <p className="gy-muted">尚未添加资料链接。</p>}</section> : null}
        {isPerson ? <section className="gy-detail-section"><header><h3>沟通记录</h3><span>{activities.length}</span></header><div className="gy-activity-list">{activities.length ? activities.map((activity) => <article key={textValue(activity.id)}><time>{formatDate(activity.occurredOn)}</time><p>{textValue(activity.content)}</p></article>) : <p className="gy-muted">还没有记录。</p>}</div></section> : null}
      </>}
      {isTask && !isDeleted ? <div className="gy-task-detail-footer"><button className="gy-button gy-button-primary" disabled={busy} onClick={() => void toggleTaskCompletion()}>{busy ? "正在更新…" : record.status === "COMPLETED" ? "取消完成" : "标记完成"}</button></div> : null}
    </section>
  </div>;
}

function detailValue(resource: EntityKey, field: Field, value: unknown, record: JsonRecord, options: Partial<Record<EntityKey, Option[]>>) {
  if (field.kind === "money") return formatMoney(value);
  if (field.kind === "select") return field.from ? relationName(field.from, value, options) : field.options?.find(([id]) => id === value)?.[1] ?? displayEnum(value, field.name === "status" && resource === "products" ? "productStatus" : undefined);
  if (field.kind === "multi") {
    const ids = Array.isArray(value) ? value : [];
    return ids.map((id) => relationName(field.from ?? "projects", id, options)).join("、") || "—";
  }
  if (field.kind === "date") return formatDate(value);
  if (field.kind === "tags") return Array.isArray(value) ? (value as string[]).join("、") || "—" : "—";
  if (["status", "region", "priority", "reviewType", "method"].includes(field.name)) return displayEnum(value, field.name === "status" && resource === "products" ? "productStatus" : undefined);
  if (field.from && field.name.endsWith("Id")) return relationName(field.from, value, options);
  if (field.name === "projectId") return relationName("projects", value, options);
  if (field.name === "customerId") return relationName("customers", value, options);
  if (field.name === "partnerId") return relationName("partners", value, options);
  if (field.name === "orderId") return relationName("orders", value, options);
  return value == null || value === "" ? "—" : safeScalarText(value);
}

function MaterialLink({ link, onNotice }: { link: JsonRecord; onNotice: (message: string) => void }) {
  const label = textValue(link.label) || textValue(link.url);
  const url = textValue(link.url);
  function open() {
    if (/^https?:\/\//i.test(url) || /^obsidian:\/\//i.test(url)) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    try {
      window.location.href = `guangyu-open://open?target=${encodeURIComponent(toLocalFileUrl(url))}`;
      onNotice("已发送本机打开请求；工具会显示打开结果。请确认已安装光域空间本机配套工具。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "本机路径格式无效。");
    }
  }
  return <div className="gy-material-link"><div><strong>{label}</strong><small>{url}</small></div><button className="gy-link-button" onClick={open}>打开 ↗</button></div>;
}

function Settings({ username, onNotice, onError }: { username: string; onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      await requestJson("/api/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      onNotice("密码已更新，请使用新密码重新登录。");
      await signOut({ redirectTo: "/login" });
    } catch (issue) { onError(issue instanceof Error ? issue.message : "密码更新失败。"); }
    finally { setSaving(false); }
  }
  return <>
    <div className="gy-page-heading"><div><p className="gy-eyebrow">个人设置</p><h1>账号与备份</h1><p>管理登录凭据、Agent 授权和个人数据备份。</p></div></div>
    <div className="gy-settings-grid">
      <section className="gy-card gy-settings-card"><h2>账号信息</h2><div className="gy-setting-row"><span>用户名</span><strong>{username}</strong></div><div className="gy-setting-row"><span>工作空间</span><strong>我的经营簿</strong></div><p className="gy-muted">用户名用于登录，当前版本不支持更改。</p></section>
      <section className="gy-card gy-settings-card"><h2>修改密码</h2><form className="gy-form gy-password-form" onSubmit={changePassword}><div className="gy-field"><label htmlFor="current-password">当前密码</label><input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></div><div className="gy-field"><label htmlFor="new-password">新密码</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={next} onChange={(event) => setNext(event.target.value)} /></div><small>至少 12 个字符，最多 72 个 UTF-8 字节。</small><button className="gy-button gy-button-primary" disabled={saving}>{saving ? "正在保存…" : "更新密码"}</button></form></section>
      <AgentSettings onNotice={onNotice} onError={onError} />
      <BackupSettings onNotice={onNotice} onError={onError} />
      <section className="gy-card gy-settings-card gy-settings-wide"><h2>密码找回</h2><p>为保护账号，找回密码需要由部署此服务的运营者核验身份后，通过受控维护命令办理。请联系服务运营者，不要把密码发到聊天或邮件里。</p></section>
    </div>
  </>;
}

function AgentSettings({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [items, setItems] = useState<JsonRecord[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [scopes, setScopes] = useState<string[]>(["read:summary", "read:records"]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const scopeLabels: Array<[string, string]> = [["read:summary", "读取经营总览"], ["read:records", "读取业务记录"], ["write:records", "新增、修改、删除与恢复记录"], ["append:communications", "追加客户与合作方沟通"], ["append:project-logs", "追加项目日志"], ["tasks:complete", "完成或恢复任务"], ["tasks:history", "读取已完成任务历史"]];
  const load = useCallback(async () => {
    try { const result = await requestJson<{ items: JsonRecord[] }>("/api/account/agent-credentials"); setItems(result.items); }
    catch (issue) { onError(issue instanceof Error ? issue.message : "授权列表暂时不可用。"); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setToken("");
    try {
      const result = await requestJson<{ token: string; credential: JsonRecord }>("/api/account/agent-credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, scopes, expiresInDays: Number(days) }) });
      setToken(result.token); setName(""); onNotice("Agent 授权已创建。请现在复制并安全保存密钥。"); await load();
    } catch (issue) { onError(issue instanceof Error ? issue.message : "授权创建失败。"); }
    finally { setBusy(false); }
  }
  async function revoke(item: JsonRecord) {
    if (!window.confirm(`撤销“${textValue(item.name)}”的 Agent 授权？`)) return;
    try { await requestJson(`/api/account/agent-credentials/${item.id}`, { method: "DELETE" }); onNotice("Agent 授权已撤销。"); await load(); }
    catch (issue) { onError(issue instanceof Error ? issue.message : "撤销失败。"); }
  }
  return <section className="gy-card gy-settings-card gy-agent-settings"><h2>Agent API 授权</h2><p className="gy-muted">为外部 Agent 创建独立密钥，按最小需要选择权限并设置到期时间。密钥只显示一次。</p>
    <form className="gy-agent-create" onSubmit={create}><div className="gy-agent-create-row"><input className="gy-input" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="授权名称，例如：个人助理" /><select className="gy-input" value={days} onChange={(event) => setDays(event.target.value)}><option value="30">30 天</option><option value="90">90 天</option><option value="180">180 天</option><option value="365">365 天</option></select></div>
      <div className="gy-scope-grid">{scopeLabels.map(([key, label]) => <label key={key}><input type="checkbox" checked={scopes.includes(key)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} /><span>{label}</span></label>)}</div>
      <button className="gy-button gy-button-primary" disabled={busy || !scopes.length}>{busy ? "正在创建…" : "创建授权密钥"}</button>
    </form>
    {token ? <div className="gy-token-reveal"><strong>请立即复制密钥</strong><p>离开此页面后无法再次查看。</p><code>{token}</code><button className="gy-button" onClick={() => { void navigator.clipboard.writeText(token); onNotice("密钥已复制。请保存到你的密码管理器。"); }}>复制密钥</button><small>Agent API 地址：/api/agent/v1；请求头：Authorization: Bearer &lt;密钥&gt;</small></div> : null}
    <div className="gy-agent-list">{items.length ? items.map((item) => <article key={textValue(item.id)}><div><strong>{textValue(item.name)}</strong><small>{textValue(item.tokenPrefix)}… · 到期 {formatDate(item.expiresAt)} · 最近使用 {formatDate(item.lastUsedAt)}</small><small>{Array.isArray(item.scopes) ? (item.scopes as string[]).join(" · ") : ""}</small></div>{item.revokedAt ? <span className="gy-revoked-pill">已撤销</span> : <button className="gy-row-text-action" onClick={() => void revoke(item)}>撤销</button>}</article>) : <p className="gy-muted">还没有 Agent 授权。</p>}</div>
  </section>;
}

function BackupSettings({ onNotice, onError }: { onNotice: (message: string) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [backupText, setBackupText] = useState("");
  const [preview, setPreview] = useState<JsonRecord | null>(null);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/account/backup", { credentials: "same-origin" });
      if (!response.ok) throw new Error("备份下载没有完成。");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const downloadName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "guangyu-space-backup.json";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = downloadName; anchor.click(); URL.revokeObjectURL(url);
      onNotice("个人备份已下载。请保存在安全的位置。");
    } catch (issue) { onError(issue instanceof Error ? issue.message : "备份下载失败。"); }
    finally { setBusy(false); }
  }
  async function prepare(file: File | undefined) {
    if (!file) return;
    setBusy(true); setPreview(null); setFileName(file.name);
    try {
      const text = await file.text();
      const local = JSON.parse(text) as JsonRecord;
      setBackupText(text);
      const response = await requestJson<JsonRecord>("/api/account/backup/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: text });
      setPreview(response);
      onNotice("备份已校验，并创建了恢复前保护快照。请核对范围后再确认恢复。");
      if (local.format !== "guangyu-space-personal-backup") throw new Error("这不是光域空间个人备份文件。");
    } catch (issue) { setBackupText(""); setPreview(null); onError(issue instanceof Error ? issue.message : "备份文件无法读取。"); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!preview) return;
    const counts = preview.counts && typeof preview.counts === "object" ? preview.counts as Record<string, number> : {};
    const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    if (!window.confirm(`将从“${fileName}”恢复 ${total} 条记录。当前经营簿的保护快照已保存到本机备份目录。继续恢复吗？`)) return;
    setBusy(true);
    try {
      const result = await requestJson<{ ok: boolean; message: string }>("/api/account/backup/restore", { method: "POST", headers: { "content-type": "application/json", "x-restore-id": textValue(preview.restoreId) }, body: backupText });
      onNotice(result.message);
      await signOut({ redirectTo: "/login" });
    } catch (issue) { onError(issue instanceof Error ? issue.message : "恢复失败，当前数据没有被部分覆盖。"); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = { customers: "客户", partners: "合作方", projects: "项目", tasks: "任务", orders: "订单", incomes: "收入流水", resources: "资料", experiences: "经验", products: "产品", reviews: "复盘", projectCustomers: "项目与客户关联", projectPartners: "项目与合作方关联", orderProjects: "订单与项目关联", resourceProjects: "资料与项目关联", communications: "沟通记录", projectLogs: "项目日志", materialLinks: "资料链接", idSequences: "业务编号序列" };
  const counts = preview?.counts && typeof preview.counts === "object" ? preview.counts as Record<string, number> : {};
  return <section className="gy-card gy-settings-card gy-backup-settings"><h2>个人备份与恢复</h2><p className="gy-muted">备份包含本人经营记录、私有内容、关联、资料指针和编号序列；不包含外部文件正文、密码、网页登录会话或 Agent 密钥。</p>
    <div className="gy-backup-actions"><button className="gy-button" onClick={() => void download()} disabled={busy}>{busy ? "正在处理…" : "下载个人备份"}</button><label className="gy-button gy-backup-file">选择备份恢复<input type="file" accept=".json,application/json" onChange={(event) => { void prepare(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={busy} /></label></div>
    {preview ? <div className="gy-restore-preview"><div><strong>恢复前检查完成</strong><small>{fileName} · 备份时间 {formatDate(preview.backupCreatedAt)}</small></div><p>已创建当前数据快照：<code>{textValue(preview.protectiveSnapshot)}</code></p><div className="gy-restore-counts">{Object.entries(counts).filter(([, count]) => Number(count) > 0).map(([key, count]) => <span key={key}>{labels[key] ?? key}<strong>{count}</strong></span>)}</div><div className="gy-restore-warning">确认后会以备份中的状态恢复个人经营簿；网页登录和现有 Agent 授权将失效。</div><button className="gy-button gy-button-primary" onClick={() => void restore()} disabled={busy}>{busy ? "正在恢复…" : "确认恢复这份备份"}</button></div> : null}
    <small className="gy-backup-footnote">恢复前会在服务本机备份目录再次保存当前快照。恢复按账号隔离执行，失败时事务回滚。</small>
  </section>;
}
