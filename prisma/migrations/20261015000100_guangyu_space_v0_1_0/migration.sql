-- CreateEnum
CREATE TYPE "LedgerWorkspaceType" AS ENUM ('PERSONAL', 'TEAM');

-- CreateEnum
CREATE TYPE "LedgerMemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "LedgerPermission" AS ENUM ('NONE', 'VIEW', 'EDIT', 'MANAGE');

-- CreateEnum
CREATE TYPE "LedgerProjectPermission" AS ENUM ('VIEW', 'EDIT', 'MANAGE');

-- CreateEnum
CREATE TYPE "LedgerProjectAccessScope" AS ENUM ('WORKSPACE', 'PRIVATE_USER');

-- CreateEnum
CREATE TYPE "LedgerProjectRegion" AS ENUM ('SERVICE', 'PRODUCT', 'BUSINESS', 'EXPLORATION', 'NON_BUSINESS', 'LEARNING');

-- CreateEnum
CREATE TYPE "LedgerProjectStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LedgerTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LedgerPriority" AS ENUM ('P0', 'P1', 'P2');

-- CreateEnum
CREATE TYPE "LedgerCustomerStatus" AS ENUM ('POTENTIAL', 'NEGOTIATING', 'ACTIVE', 'HISTORIC', 'PAUSED');

-- CreateEnum
CREATE TYPE "LedgerPartnerStatus" AS ENUM ('TO_CONTACT', 'NEGOTIATING', 'ACTIVE', 'HISTORIC', 'PAUSED');

-- CreateEnum
CREATE TYPE "LedgerOrderStatus" AS ENUM ('TO_CONFIRM', 'IN_PROGRESS', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LedgerReviewType" AS ENUM ('WEEK', 'MONTH', 'QUARTER');

-- CreateEnum
CREATE TYPE "LedgerPersonType" AS ENUM ('CUSTOMER', 'PARTNER');

-- CreateEnum
CREATE TYPE "LedgerRecordType" AS ENUM ('CUSTOMER', 'PARTNER', 'PROJECT', 'TASK', 'ORDER', 'INCOME', 'RESOURCE', 'EXPERIENCE', 'PRODUCT', 'REVIEW');

-- CreateEnum
CREATE TYPE "LedgerAuditSource" AS ENUM ('WEB', 'AGENT', 'OPERATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LedgerProductStatus" AS ENUM ('ON_SALE', 'PAUSED', 'OFF_SHELF');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "username" TEXT,
ADD COLUMN     "username_normalized" TEXT;

-- CreateTable
CREATE TABLE "ledger_workspaces" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "type" "LedgerWorkspaceType" NOT NULL DEFAULT 'PERSONAL',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "data_epoch" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_workspace_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "LedgerMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "customer_permission" "LedgerPermission" NOT NULL DEFAULT 'NONE',
    "finance_permission" "LedgerPermission" NOT NULL DEFAULT 'NONE',
    "order_permission" "LedgerPermission" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_project_members" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "LedgerProjectPermission" NOT NULL DEFAULT 'VIEW',
    "status" "LedgerMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_customers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "status" "LedgerCustomerStatus" NOT NULL DEFAULT 'POTENTIAL',
    "source" TEXT,
    "needs" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_partners" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "status" "LedgerPartnerStatus" NOT NULL DEFAULT 'TO_CONTACT',
    "directions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capabilities" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_projects" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "access_scope" "LedgerProjectAccessScope" NOT NULL DEFAULT 'WORKSPACE',
    "business_number" TEXT NOT NULL,
    "region" "LedgerProjectRegion" NOT NULL,
    "status" "LedgerProjectStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "upgrade_type" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "expected_outcome" TEXT,
    "start_date" DATE,
    "due_date" DATE,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_project_customers" (
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,

    CONSTRAINT "ledger_project_customers_pkey" PRIMARY KEY ("workspace_id","project_id","customer_id")
);

-- CreateTable
CREATE TABLE "ledger_project_partners" (
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,

    CONSTRAINT "ledger_project_partners_pkey" PRIMARY KEY ("workspace_id","project_id","partner_id")
);

-- CreateTable
CREATE TABLE "ledger_tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "business_number" TEXT NOT NULL,
    "project_id" TEXT,
    "customer_id" TEXT,
    "partner_id" TEXT,
    "name" TEXT NOT NULL,
    "status" "LedgerTaskStatus" NOT NULL DEFAULT 'TODO',
    "status_before_complete" "LedgerTaskStatus",
    "priority" "LedgerPriority" NOT NULL DEFAULT 'P1',
    "planned_date" DATE,
    "due_date" DATE,
    "description" TEXT,
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_orders" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "status" "LedgerOrderStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "amount_cents" BIGINT,
    "order_date" DATE,
    "due_date" DATE,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_order_projects" (
    "workspace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "ledger_order_projects_pkey" PRIMARY KEY ("workspace_id","order_id","project_id")
);

-- CreateTable
CREATE TABLE "ledger_incomes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "order_id" TEXT,
    "name" TEXT,
    "received_on" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_resources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "business_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "purpose" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_resource_projects" (
    "workspace_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "ledger_resource_projects_pkey" PRIMARY KEY ("workspace_id","resource_id","project_id")
);

-- CreateTable
CREATE TABLE "ledger_experiences" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "recorded_on" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_products" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product_type" TEXT,
    "product_version" TEXT,
    "price_cents" BIGINT,
    "status" "LedgerProductStatus" NOT NULL DEFAULT 'ON_SALE',
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_reviews" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "business_number" TEXT NOT NULL,
    "review_type" "LedgerReviewType" NOT NULL,
    "reviewed_on" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_communications" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_type" "LedgerPersonType" NOT NULL,
    "customer_id" TEXT,
    "partner_id" TEXT,
    "occurred_on" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_project_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_project_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_material_links" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "owner_type" "LedgerRecordType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ledger_material_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_id_sequences" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence_key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_id_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_request_dedup" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_credential_id" TEXT,
    "identity_key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_body" JSONB,
    "result_type" TEXT,
    "result_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_request_dedup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "actor_user_id" TEXT,
    "source" "LedgerAuditSource" NOT NULL,
    "action" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_agent_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "token_digest" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auth_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_agent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_workspaces_type_status_idx" ON "ledger_workspaces"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_workspaces_owner_user_id_type_key" ON "ledger_workspaces"("owner_user_id", "type");

-- CreateIndex
CREATE INDEX "ledger_workspace_members_user_id_status_idx" ON "ledger_workspace_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_workspace_members_workspace_id_user_id_key" ON "ledger_workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "ledger_project_members_workspace_id_user_id_status_idx" ON "ledger_project_members"("workspace_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_project_members_project_id_user_id_key" ON "ledger_project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "ledger_customers_workspace_id_deleted_at_created_at_idx" ON "ledger_customers"("workspace_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "ledger_customers_workspace_id_status_deleted_at_idx" ON "ledger_customers"("workspace_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "ledger_customers_workspace_id_name_idx" ON "ledger_customers"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_customers_workspace_id_id_key" ON "ledger_customers"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_customers_workspace_id_business_number_key" ON "ledger_customers"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_partners_workspace_id_deleted_at_created_at_idx" ON "ledger_partners"("workspace_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "ledger_partners_workspace_id_status_deleted_at_idx" ON "ledger_partners"("workspace_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "ledger_partners_workspace_id_name_idx" ON "ledger_partners"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_partners_workspace_id_id_key" ON "ledger_partners"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_partners_workspace_id_business_number_key" ON "ledger_partners"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_projects_workspace_id_region_status_deleted_at_idx" ON "ledger_projects"("workspace_id", "region", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "ledger_projects_workspace_id_owner_user_id_access_scope_idx" ON "ledger_projects"("workspace_id", "owner_user_id", "access_scope");

-- CreateIndex
CREATE INDEX "ledger_projects_workspace_id_name_idx" ON "ledger_projects"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_projects_workspace_id_id_key" ON "ledger_projects"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_projects_workspace_id_business_number_key" ON "ledger_projects"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_project_customers_workspace_id_customer_id_idx" ON "ledger_project_customers"("workspace_id", "customer_id");

-- CreateIndex
CREATE INDEX "ledger_project_partners_workspace_id_partner_id_idx" ON "ledger_project_partners"("workspace_id", "partner_id");

-- CreateIndex
CREATE INDEX "ledger_tasks_workspace_id_status_deleted_at_planned_date_idx" ON "ledger_tasks"("workspace_id", "status", "deleted_at", "planned_date");

-- CreateIndex
CREATE INDEX "ledger_tasks_workspace_id_project_id_status_priority_planne_idx" ON "ledger_tasks"("workspace_id", "project_id", "status", "priority", "planned_date");

-- CreateIndex
CREATE INDEX "ledger_tasks_workspace_id_completed_at_status_idx" ON "ledger_tasks"("workspace_id", "completed_at", "status");

-- CreateIndex
CREATE INDEX "ledger_tasks_workspace_id_owner_user_id_status_deleted_at_idx" ON "ledger_tasks"("workspace_id", "owner_user_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_tasks_workspace_id_id_key" ON "ledger_tasks"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_tasks_workspace_id_business_number_key" ON "ledger_tasks"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_orders_workspace_id_status_deleted_at_due_date_idx" ON "ledger_orders"("workspace_id", "status", "deleted_at", "due_date");

-- CreateIndex
CREATE INDEX "ledger_orders_workspace_id_customer_id_deleted_at_idx" ON "ledger_orders"("workspace_id", "customer_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_orders_workspace_id_id_key" ON "ledger_orders"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_orders_workspace_id_business_number_key" ON "ledger_orders"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_order_projects_workspace_id_project_id_idx" ON "ledger_order_projects"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "ledger_incomes_workspace_id_received_on_deleted_at_idx" ON "ledger_incomes"("workspace_id", "received_on", "deleted_at");

-- CreateIndex
CREATE INDEX "ledger_incomes_workspace_id_order_id_deleted_at_idx" ON "ledger_incomes"("workspace_id", "order_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_incomes_workspace_id_id_key" ON "ledger_incomes"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_incomes_workspace_id_business_number_key" ON "ledger_incomes"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_resources_workspace_id_owner_user_id_deleted_at_crea_idx" ON "ledger_resources"("workspace_id", "owner_user_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "ledger_resources_workspace_id_name_idx" ON "ledger_resources"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_resources_workspace_id_id_key" ON "ledger_resources"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_resources_workspace_id_business_number_key" ON "ledger_resources"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_resource_projects_workspace_id_project_id_idx" ON "ledger_resource_projects"("workspace_id", "project_id");

-- CreateIndex
CREATE INDEX "ledger_experiences_owner_user_id_deleted_at_recorded_on_idx" ON "ledger_experiences"("owner_user_id", "deleted_at", "recorded_on");

-- CreateIndex
CREATE INDEX "ledger_experiences_workspace_id_owner_user_id_title_idx" ON "ledger_experiences"("workspace_id", "owner_user_id", "title");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_experiences_workspace_id_id_key" ON "ledger_experiences"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_experiences_workspace_id_business_number_key" ON "ledger_experiences"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_products_workspace_id_status_deleted_at_idx" ON "ledger_products"("workspace_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "ledger_products_workspace_id_name_idx" ON "ledger_products"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_products_workspace_id_id_key" ON "ledger_products"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_products_workspace_id_business_number_key" ON "ledger_products"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_reviews_owner_user_id_review_type_reviewed_on_delete_idx" ON "ledger_reviews"("owner_user_id", "review_type", "reviewed_on", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_reviews_workspace_id_id_key" ON "ledger_reviews"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_reviews_owner_user_id_review_type_reviewed_on_key" ON "ledger_reviews"("owner_user_id", "review_type", "reviewed_on");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_reviews_workspace_id_business_number_key" ON "ledger_reviews"("workspace_id", "business_number");

-- CreateIndex
CREATE INDEX "ledger_communications_workspace_id_customer_id_occurred_on_idx" ON "ledger_communications"("workspace_id", "customer_id", "occurred_on");

-- CreateIndex
CREATE INDEX "ledger_communications_workspace_id_partner_id_occurred_on_idx" ON "ledger_communications"("workspace_id", "partner_id", "occurred_on");

-- CreateIndex
CREATE INDEX "ledger_project_logs_workspace_id_project_id_log_date_create_idx" ON "ledger_project_logs"("workspace_id", "project_id", "log_date", "created_at", "id");

-- CreateIndex
CREATE INDEX "ledger_material_links_workspace_id_owner_type_owner_id_dele_idx" ON "ledger_material_links"("workspace_id", "owner_type", "owner_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_id_sequences_workspace_id_name_sequence_key_key" ON "ledger_id_sequences"("workspace_id", "name", "sequence_key");

-- CreateIndex
CREATE INDEX "ledger_request_dedup_expires_at_idx" ON "ledger_request_dedup"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_request_dedup_workspace_id_identity_key_operation_id_key" ON "ledger_request_dedup"("workspace_id", "identity_key", "operation", "idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_audit_logs_workspace_id_created_at_idx" ON "ledger_audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_audit_logs_record_type_record_id_created_at_idx" ON "ledger_audit_logs"("record_type", "record_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_agent_credentials_token_digest_key" ON "ledger_agent_credentials"("token_digest");

-- CreateIndex
CREATE INDEX "ledger_agent_credentials_user_id_revoked_at_expires_at_idx" ON "ledger_agent_credentials"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "ledger_agent_credentials_workspace_id_user_id_idx" ON "ledger_agent_credentials"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_normalized_key" ON "users"("username_normalized");

-- CreateIndex
CREATE INDEX "users_username_normalized_idx" ON "users"("username_normalized");

-- AddForeignKey
ALTER TABLE "ledger_workspaces" ADD CONSTRAINT "ledger_workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_workspace_members" ADD CONSTRAINT "ledger_workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_workspace_members" ADD CONSTRAINT "ledger_workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_members" ADD CONSTRAINT "ledger_project_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_members" ADD CONSTRAINT "ledger_project_members_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_members" ADD CONSTRAINT "ledger_project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_customers" ADD CONSTRAINT "ledger_customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_customers" ADD CONSTRAINT "ledger_customers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_customers" ADD CONSTRAINT "ledger_customers_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_partners" ADD CONSTRAINT "ledger_partners_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_partners" ADD CONSTRAINT "ledger_partners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_partners" ADD CONSTRAINT "ledger_partners_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_projects" ADD CONSTRAINT "ledger_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_projects" ADD CONSTRAINT "ledger_projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_projects" ADD CONSTRAINT "ledger_projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_projects" ADD CONSTRAINT "ledger_projects_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_customers" ADD CONSTRAINT "ledger_project_customers_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_customers" ADD CONSTRAINT "ledger_project_customers_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "ledger_customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_partners" ADD CONSTRAINT "ledger_project_partners_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_partners" ADD CONSTRAINT "ledger_project_partners_workspace_id_partner_id_fkey" FOREIGN KEY ("workspace_id", "partner_id") REFERENCES "ledger_partners"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "ledger_customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_workspace_id_partner_id_fkey" FOREIGN KEY ("workspace_id", "partner_id") REFERENCES "ledger_partners"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_tasks" ADD CONSTRAINT "ledger_tasks_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_orders" ADD CONSTRAINT "ledger_orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_orders" ADD CONSTRAINT "ledger_orders_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "ledger_customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_orders" ADD CONSTRAINT "ledger_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_orders" ADD CONSTRAINT "ledger_orders_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_order_projects" ADD CONSTRAINT "ledger_order_projects_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "ledger_orders"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_order_projects" ADD CONSTRAINT "ledger_order_projects_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_incomes" ADD CONSTRAINT "ledger_incomes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_incomes" ADD CONSTRAINT "ledger_incomes_workspace_id_order_id_fkey" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "ledger_orders"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_incomes" ADD CONSTRAINT "ledger_incomes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_incomes" ADD CONSTRAINT "ledger_incomes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resources" ADD CONSTRAINT "ledger_resources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resources" ADD CONSTRAINT "ledger_resources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resources" ADD CONSTRAINT "ledger_resources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resources" ADD CONSTRAINT "ledger_resources_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resource_projects" ADD CONSTRAINT "ledger_resource_projects_workspace_id_resource_id_fkey" FOREIGN KEY ("workspace_id", "resource_id") REFERENCES "ledger_resources"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_resource_projects" ADD CONSTRAINT "ledger_resource_projects_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_experiences" ADD CONSTRAINT "ledger_experiences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_experiences" ADD CONSTRAINT "ledger_experiences_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_experiences" ADD CONSTRAINT "ledger_experiences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_experiences" ADD CONSTRAINT "ledger_experiences_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_products" ADD CONSTRAINT "ledger_products_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_products" ADD CONSTRAINT "ledger_products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_products" ADD CONSTRAINT "ledger_products_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_reviews" ADD CONSTRAINT "ledger_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_reviews" ADD CONSTRAINT "ledger_reviews_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_reviews" ADD CONSTRAINT "ledger_reviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_reviews" ADD CONSTRAINT "ledger_reviews_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_communications" ADD CONSTRAINT "ledger_communications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_communications" ADD CONSTRAINT "ledger_communications_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "ledger_customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_communications" ADD CONSTRAINT "ledger_communications_workspace_id_partner_id_fkey" FOREIGN KEY ("workspace_id", "partner_id") REFERENCES "ledger_partners"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_communications" ADD CONSTRAINT "ledger_communications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_logs" ADD CONSTRAINT "ledger_project_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_logs" ADD CONSTRAINT "ledger_project_logs_workspace_id_project_id_fkey" FOREIGN KEY ("workspace_id", "project_id") REFERENCES "ledger_projects"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_project_logs" ADD CONSTRAINT "ledger_project_logs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_material_links" ADD CONSTRAINT "ledger_material_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_material_links" ADD CONSTRAINT "ledger_material_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_material_links" ADD CONSTRAINT "ledger_material_links_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_id_sequences" ADD CONSTRAINT "ledger_id_sequences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_request_dedup" ADD CONSTRAINT "ledger_request_dedup_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_request_dedup" ADD CONSTRAINT "ledger_request_dedup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_request_dedup" ADD CONSTRAINT "ledger_request_dedup_agent_credential_id_fkey" FOREIGN KEY ("agent_credential_id") REFERENCES "ledger_agent_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_audit_logs" ADD CONSTRAINT "ledger_audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_audit_logs" ADD CONSTRAINT "ledger_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_agent_credentials" ADD CONSTRAINT "ledger_agent_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_agent_credentials" ADD CONSTRAINT "ledger_agent_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "ledger_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep account ownership and core business invariants in PostgreSQL.
CREATE UNIQUE INDEX "ledger_workspace_members_one_owner_per_workspace_idx"
  ON "ledger_workspace_members" ("workspace_id")
  WHERE "is_owner" = TRUE;

ALTER TABLE "ledger_projects"
  ADD CONSTRAINT "ledger_projects_access_scope_owner_check"
  CHECK (
    ("access_scope" = 'WORKSPACE' AND "owner_user_id" IS NULL)
    OR ("access_scope" = 'PRIVATE_USER' AND "owner_user_id" IS NOT NULL)
  );

ALTER TABLE "ledger_projects"
  ADD CONSTRAINT "ledger_projects_learning_private_check"
  CHECK (
    "region" <> 'LEARNING'
    OR ("access_scope" = 'PRIVATE_USER' AND "owner_user_id" IS NOT NULL)
  );

ALTER TABLE "ledger_tasks"
  ADD CONSTRAINT "ledger_tasks_one_person_relation_check"
  CHECK ("customer_id" IS NULL OR "partner_id" IS NULL);

ALTER TABLE "ledger_tasks"
  ADD CONSTRAINT "ledger_tasks_completion_state_check"
  CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "status_before_complete" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL AND "status_before_complete" IS NULL)
  );

ALTER TABLE "ledger_orders"
  ADD CONSTRAINT "ledger_orders_nonnegative_amount_check"
  CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0);

ALTER TABLE "ledger_incomes"
  ADD CONSTRAINT "ledger_incomes_nonnegative_amount_check"
  CHECK ("amount_cents" >= 0);

ALTER TABLE "ledger_products"
  ADD CONSTRAINT "ledger_products_nonnegative_price_check"
  CHECK ("price_cents" IS NULL OR "price_cents" >= 0);

ALTER TABLE "ledger_communications"
  ADD CONSTRAINT "ledger_communications_person_reference_check"
  CHECK (
    ("person_type" = 'CUSTOMER' AND "customer_id" IS NOT NULL AND "partner_id" IS NULL)
    OR ("person_type" = 'PARTNER' AND "partner_id" IS NOT NULL AND "customer_id" IS NULL)
  );
