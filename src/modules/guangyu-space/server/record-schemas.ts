import { z } from "zod";

export type RecordName =
  | "customers"
  | "partners"
  | "projects"
  | "tasks"
  | "orders"
  | "incomes"
  | "resources"
  | "experiences"
  | "products"
  | "reviews";
export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD。");
const idList = z.array(z.string().min(1).max(64)).max(200);
const linksField = z
  .array(
    z
      .object({
        label: z.string().trim().min(1).max(120),
        url: z.string().trim().min(1).max(2048),
      })
      .strict(),
  )
  .max(100);
const moneyField = z.number().int().safe().nonnegative().nullable();
const commonFields = {
  notes: z.string().max(20_000).nullable().optional(),
  links: linksField.optional(),
  expectedVersion: z.number().int().positive().optional(),
};

export const schemas: Record<
  RecordName,
  { create: z.ZodObject<z.ZodRawShape>; patch: z.ZodObject<z.ZodRawShape> }
> = {
  customers: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        industry: z.string().max(200).nullable().optional(),
        status: z
          .enum(["POTENTIAL", "NEGOTIATING", "ACTIVE", "HISTORIC", "PAUSED"])
          .default("POTENTIAL"),
        source: z.string().max(200).nullable().optional(),
        needs: z.string().max(20_000).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        industry: z.string().max(200).nullable(),
        status: z.enum([
          "POTENTIAL",
          "NEGOTIATING",
          "ACTIVE",
          "HISTORIC",
          "PAUSED",
        ]),
        source: z.string().max(200).nullable(),
        needs: z.string().max(20_000).nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  partners: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        industry: z.string().max(200).nullable().optional(),
        status: z
          .enum(["TO_CONTACT", "NEGOTIATING", "ACTIVE", "HISTORIC", "PAUSED"])
          .default("TO_CONTACT"),
        directions: z
          .array(z.string().trim().min(1).max(80))
          .max(30)
          .default([]),
        capabilities: z.string().max(20_000).nullable().optional(),
        description: z.string().max(20_000).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        industry: z.string().max(200).nullable(),
        status: z.enum([
          "TO_CONTACT",
          "NEGOTIATING",
          "ACTIVE",
          "HISTORIC",
          "PAUSED",
        ]),
        directions: z.array(z.string().trim().min(1).max(80)).max(30),
        capabilities: z.string().max(20_000).nullable(),
        description: z.string().max(20_000).nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  projects: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        region: z.enum([
          "SERVICE",
          "PRODUCT",
          "BUSINESS",
          "EXPLORATION",
          "NON_BUSINESS",
          "LEARNING",
        ]),
        status: z
          .enum([
            "NOT_STARTED",
            "IN_PROGRESS",
            "WAITING",
            "PAUSED",
            "COMPLETED",
            "ABANDONED",
          ])
          .default("NOT_STARTED"),
        upgradeType: z.string().max(80).nullable().optional(),
        description: z.string().max(20_000).nullable().optional(),
        expectedOutcome: z.string().max(20_000).nullable().optional(),
        startDate: dateField.nullable().optional(),
        dueDate: dateField.nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
        customerIds: idList.optional(),
        partnerIds: idList.optional(),
        orderIds: idList.optional(),
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        region: z.enum([
          "SERVICE",
          "PRODUCT",
          "BUSINESS",
          "EXPLORATION",
          "NON_BUSINESS",
          "LEARNING",
        ]),
        status: z.enum([
          "NOT_STARTED",
          "IN_PROGRESS",
          "WAITING",
          "PAUSED",
          "COMPLETED",
          "ABANDONED",
        ]),
        upgradeType: z.string().max(80).nullable(),
        description: z.string().max(20_000).nullable(),
        expectedOutcome: z.string().max(20_000).nullable(),
        startDate: dateField.nullable(),
        dueDate: dateField.nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        customerIds: idList,
        partnerIds: idList,
        orderIds: idList,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  tasks: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        status: z
          .enum(["TODO", "IN_PROGRESS", "WAITING", "COMPLETED", "ABANDONED"])
          .default("TODO"),
        priority: z.enum(["P0", "P1", "P2"]).default("P1"),
        plannedDate: dateField.optional(),
        dueDate: dateField.nullable().optional(),
        description: z.string().max(20_000).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectId: z.string().nullable().optional(),
        customerId: z.string().nullable().optional(),
        partnerId: z.string().nullable().optional(),
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        status: z.enum([
          "TODO",
          "IN_PROGRESS",
          "WAITING",
          "COMPLETED",
          "ABANDONED",
        ]),
        priority: z.enum(["P0", "P1", "P2"]),
        plannedDate: dateField.nullable(),
        dueDate: dateField.nullable(),
        description: z.string().max(20_000).nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectId: z.string().nullable(),
        customerId: z.string().nullable(),
        partnerId: z.string().nullable(),
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  orders: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        customerId: z.string().min(1),
        content: z.string().max(20_000).nullable().optional(),
        status: z
          .enum(["TO_CONFIRM", "IN_PROGRESS", "DELIVERED", "CANCELED"])
          .default("TO_CONFIRM"),
        amountCents: moneyField.optional(),
        orderDate: dateField.nullable().optional(),
        dueDate: dateField.nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectIds: idList.optional(),
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        customerId: z.string().min(1),
        content: z.string().max(20_000).nullable(),
        status: z.enum(["TO_CONFIRM", "IN_PROGRESS", "DELIVERED", "CANCELED"]),
        amountCents: moneyField,
        orderDate: dateField.nullable(),
        dueDate: dateField.nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectIds: idList,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  incomes: {
    create: z
      .object({
        name: z.string().trim().max(160).nullable().optional(),
        receivedOn: dateField,
        amountCents: z.number().int().safe().positive(),
        orderId: z.string().nullable().optional(),
        method: z.enum(["WECHAT", "ALIPAY", "BANK", "CASH", "OTHER"]).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().max(160).nullable(),
        receivedOn: dateField,
        amountCents: z.number().int().safe().positive(),
        orderId: z.string().nullable(),
        method: z.enum(["WECHAT", "ALIPAY", "BANK", "CASH", "OTHER"]).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  resources: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        category: z.string().max(120).nullable().optional(),
        purpose: z.string().max(20_000).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectIds: idList.optional(),
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        category: z.string().max(120).nullable(),
        purpose: z.string().max(20_000).nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        projectIds: idList,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  experiences: {
    create: z
      .object({
        recordedOn: dateField.optional(),
        title: z.string().trim().min(1).max(240),
        content: z.string().min(1).max(50_000).refine((value) => value.trim().length > 0, "原话内容不能为空。"),
        tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        recordedOn: dateField,
        title: z.string().trim().min(1).max(240),
        content: z.string().min(1).max(50_000).refine((value) => value.trim().length > 0, "原话内容不能为空。"),
        tags: z.array(z.string().trim().min(1).max(64)).max(50),
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  products: {
    create: z
      .object({
        name: z.string().trim().min(1).max(160),
        productType: z.string().max(120).nullable().optional(),
        productVersion: z.string().max(120).nullable().optional(),
        priceCents: moneyField.optional(),
        status: z.enum(["ON_SALE", "PAUSED", "OFF_SHELF"]).default("ON_SALE"),
        description: z.string().max(20_000).nullable().optional(),
        notes: commonFields.notes,
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(160),
        productType: z.string().max(120).nullable(),
        productVersion: z.string().max(120).nullable(),
        priceCents: moneyField,
        status: z.enum(["ON_SALE", "PAUSED", "OFF_SHELF"]),
        description: z.string().max(20_000).nullable(),
        notes: commonFields.notes,
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
  reviews: {
    create: z
      .object({
        reviewType: z.enum(["WEEK", "MONTH", "QUARTER"]),
        reviewedOn: dateField,
        content: z.string().min(1).max(100_000).refine((value) => value.trim().length > 0, "复盘正文不能为空。"),
        links: commonFields.links,
      })
      .strict(),
    patch: z
      .object({
        content: z.string().min(1).max(100_000).refine((value) => value.trim().length > 0, "复盘正文不能为空。"),
        links: commonFields.links,
        expectedVersion: z.number().int().positive(),
      })
      .partial()
      .strict(),
  },
};
