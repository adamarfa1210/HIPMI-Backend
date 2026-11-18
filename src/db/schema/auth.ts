import {
  pgTable,
  uuid,
  varchar,
  boolean,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const cadreInterestEnum = pgEnum("cadre_interest", [
  "Kompetisi",
  "Punya Bisnis",
  "Belum Punya Bisnis",
  "Belum Punya Bisnis tapi Minat Kompetisi",
]);

export const cadreStatusEnum = pgEnum("cadre_status", [
  "Aktif",
  "Non-Aktif",
  "Alumni",
]);

export const passwordResetStatusEnum = pgEnum("password_reset_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

// 1. Roles Table
export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  isSystemDefault: boolean("is_system_default").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Modules Table
export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  label: varchar("label", { length: 80 }).notNull(),
});

// 3. Role Permissions Table
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "cascade" })
      .notNull(),
    moduleId: uuid("module_id")
      .references(() => modules.id, { onDelete: "cascade" })
      .notNull(),
    canRead: boolean("can_read").default(false).notNull(),
    canCreate: boolean("can_create").default(false).notNull(),
    canUpdate: boolean("can_update").default(false).notNull(),
    canDelete: boolean("can_delete").default(false).notNull(),
    canApprove: boolean("can_approve").default(false).notNull(),
  },
  (table) => ({
    roleModuleUnique: uniqueIndex("idx_role_module_unique").on(
      table.roleId,
      table.moduleId
    ),
  })
);

// 4. Kaders Table
export const kaders = pgTable(
  "kaders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "restrict" })
      .notNull(),
    nim: varchar("nim", { length: 20 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    whatsappNumber: varchar("whatsapp_number", { length: 20 }).notNull(),
    prodi: varchar("prodi", { length: 80 }).notNull(),
    fakultas: varchar("fakultas", { length: 80 }).notNull(),
    instagram: varchar("instagram", { length: 60 }),
    businessName: varchar("business_name", { length: 120 }),
    interestCategory: cadreInterestEnum("interest_category").notNull(),
    status: cadreStatusEnum("status").default("Aktif").notNull(),
    totalScore: integer("total_score").default(0).notNull(),
    profileCompleted: boolean("profile_completed").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nimIdx: index("idx_kaders_nim").on(table.nim),
    scoreIdx: index("idx_kaders_total_score").on(table.totalScore),
    statusIdx: index("idx_kaders_status").on(table.status),
    prodiIdx: index("idx_kaders_prodi").on(table.prodi),
    fakultasIdx: index("idx_kaders_fakultas").on(table.fakultas),
  })
);

// 5. Password Reset Requests Table
export const passwordResetRequests = pgTable(
  "password_reset_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kaderId: uuid("kader_id")
      .references(() => kaders.id, { onDelete: "cascade" })
      .notNull(),
    nim: varchar("nim", { length: 20 }).notNull(),
    status: passwordResetStatusEnum("status").default("PENDING").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedBy: uuid("resolved_by").references(() => kaders.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notes: varchar("notes", { length: 240 }),
  },
  (table) => ({
    statusIdx: index("idx_password_reset_status").on(table.status),
    nimIdx: index("idx_password_reset_nim").on(table.nim),
  })
);

// 6. Audit Logs Table
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorKaderId: uuid("actor_kader_id").references(() => kaders.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    entityName: varchar("entity_name", { length: 60 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    actorIdx: index("idx_audit_logs_actor").on(table.actorKaderId),
    entityIdx: index("idx_audit_logs_entity").on(
      table.entityName,
      table.entityId
    ),
  })
);

// Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  kaders: many(kaders),
}));

export const modulesRelations = relations(modules, ({ many }) => ({
  permissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  module: one(modules, { fields: [rolePermissions.moduleId], references: [modules.id] }),
}));

export const kadersRelations = relations(kaders, ({ one, many }) => ({
  role: one(roles, { fields: [kaders.roleId], references: [roles.id] }),
  auditLogs: many(auditLogs),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(kaders, { fields: [auditLogs.actorKaderId], references: [kaders.id] }),
}));
