import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  date,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { kaders, roles } from "./auth.js";

// Enums
export const transactionTypeEnum = pgEnum("transaction_type", ["CASH_IN", "CASH_OUT"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["PENDING", "APPROVED", "REJECTED"]);
export const prokerBidangEnum = pgEnum("proker_bidang", ["OKK", "MEDKOMINFO", "EKSTERNAL", "EKRAF"]);
export const prokerStatusEnum = pgEnum("proker_status", ["PLANNED", "ON_PROGRESS", "COMPLETED"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["HADIR", "IZIN", "SAKIT", "ALPHA"]);
export const scoreSourceTypeEnum = pgEnum("score_source_type", [
  "PROKER_COMMITTEE",
  "MEETING_ATTENDANCE",
  "MANUAL_ADJUSTMENT",
]);
export const calendarCategoryEnum = pgEnum("calendar_category", [
  "PROKER",
  "INTERNAL_MEETING",
  "RBPL",
  "COMPETITION_DEADLINE",
  "ORGANIZATION_HOLIDAY",
]);

// 1. Transactions Table
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptNumber: varchar("receipt_number", { length: 40 }).unique(),
    type: transactionTypeEnum("type").notNull(),
    fromEntity: varchar("from_entity", { length: 120 }).notNull(),
    toEntity: varchar("to_entity", { length: 120 }).notNull(),
    amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
    description: text("description").notNull(),
    transactionDate: date("transaction_date").notNull(),
    status: transactionStatusEnum("status").default("PENDING").notNull(),
    receiptPdfUrl: text("receipt_pdf_url"),
    createdBy: uuid("created_by")
      .references(() => kaders.id, { onDelete: "restrict" })
      .notNull(),
    approvedBy: uuid("approved_by").references(() => kaders.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    statusDateIdx: index("idx_transactions_status_date").on(
      table.status,
      table.transactionDate
    ),
    createdByIdx: index("idx_transactions_created_by").on(table.createdBy),
  })
);

// 2. Prokers Table
export const prokers = pgTable(
  "prokers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bidang: prokerBidangEnum("bidang").notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    picKaderId: uuid("pic_kader_id")
      .references(() => kaders.id, { onDelete: "restrict" })
      .notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: prokerStatusEnum("status").default("PLANNED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    bidangStatusIdx: index("idx_prokers_bidang_status").on(
      table.bidang,
      table.status
    ),
  })
);

// 3. Proker Committees Table
export const prokerCommittees = pgTable(
  "proker_committees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prokerId: uuid("proker_id")
      .references(() => prokers.id, { onDelete: "cascade" })
      .notNull(),
    kaderId: uuid("kader_id")
      .references(() => kaders.id, { onDelete: "cascade" })
      .notNull(),
    committeeRole: varchar("committee_role", { length: 60 }).notNull(),
    pointsAwarded: integer("points_awarded").default(20).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    prokerKaderUnique: uniqueIndex("idx_proker_committee_unique").on(
      table.prokerId,
      table.kaderId
    ),
  })
);

// 4. Meetings Table
export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  prokerId: uuid("proker_id").references(() => prokers.id, {
    onDelete: "set null",
  }),
  title: varchar("title", { length: 120 }).notNull(),
  meetingDate: timestamp("meeting_date", { withTimezone: true }).notNull(),
  pointsPerAttendance: integer("points_per_attendance").default(5).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 5. Meeting Attendances Table
export const meetingAttendances = pgTable(
  "meeting_attendances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .references(() => meetings.id, { onDelete: "cascade" })
      .notNull(),
    kaderId: uuid("kader_id")
      .references(() => kaders.id, { onDelete: "cascade" })
      .notNull(),
    status: attendanceStatusEnum("status").notNull(),
    pointsAwarded: integer("points_awarded").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    meetingKaderUnique: uniqueIndex("idx_meeting_kader_unique").on(
      table.meetingId,
      table.kaderId
    ),
  })
);

// 6. Score Ledgers Table
export const scoreLedgers = pgTable(
  "score_ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kaderId: uuid("kader_id")
      .references(() => kaders.id, { onDelete: "cascade" })
      .notNull(),
    sourceType: scoreSourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    points: integer("points").notNull(),
    description: varchar("description", { length: 180 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    kaderIdx: index("idx_score_ledgers_kader").on(
      table.kaderId,
      table.createdAt
    ),
    idempotencyIdx: index("idx_score_ledgers_idempotency").on(
      table.kaderId,
      table.sourceType,
      table.sourceId
    ),
  })
);

// 7. Calendar Events Table
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prokerId: uuid("proker_id").references(() => prokers.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 140 }).notNull(),
    category: calendarCategoryEnum("category").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    location: varchar("location", { length: 140 }).notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    googleEventId: varchar("google_event_id", { length: 120 }),
    createdBy: uuid("created_by").references(() => kaders.id, {
      onDelete: "set null",
    }),
    enableQrAttendance: boolean("enable_qr_attendance").default(false).notNull(),
    pointsPerAttendance: integer("points_per_attendance").default(5).notNull(),
    qrToken: varchar("qr_token", { length: 120 }).unique(),
    qrIsOpen: boolean("qr_is_open").default(false).notNull(),
    meetingId: uuid("meeting_id").references(() => meetings.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    startAtIdx: index("idx_calendar_events_start").on(table.startAt),
    publicIdx: index("idx_calendar_events_public").on(
      table.isPublic,
      table.startAt
    ),
  })
);

// 8. Calendar Event Target Roles (Per-agenda audience & attendance eligibility)
export const calendarEventTargetRoles = pgTable(
  "calendar_event_target_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .references(() => calendarEvents.id, { onDelete: "cascade" })
      .notNull(),
    roleId: uuid("role_id")
      .references(() => roles.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => ({
    eventRoleUnique: uniqueIndex("idx_calendar_event_target_role_unique").on(
      table.eventId,
      table.roleId
    ),
  })
);

// Relations
export const transactionsRelations = relations(transactions, ({ one }) => ({
  creator: one(kaders, {
    fields: [transactions.createdBy],
    references: [kaders.id],
  }),
  approver: one(kaders, {
    fields: [transactions.approvedBy],
    references: [kaders.id],
  }),
}));

export const prokersRelations = relations(prokers, ({ one, many }) => ({
  pic: one(kaders, {
    fields: [prokers.picKaderId],
    references: [kaders.id],
  }),
  committees: many(prokerCommittees),
  meetings: many(meetings),
  calendarEvents: many(calendarEvents),
}));

export const prokerCommitteesRelations = relations(
  prokerCommittees,
  ({ one }) => ({
    proker: one(prokers, {
      fields: [prokerCommittees.prokerId],
      references: [prokers.id],
    }),
    kader: one(kaders, {
      fields: [prokerCommittees.kaderId],
      references: [kaders.id],
    }),
  })
);

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  proker: one(prokers, {
    fields: [meetings.prokerId],
    references: [prokers.id],
  }),
  attendances: many(meetingAttendances),
}));

export const meetingAttendancesRelations = relations(
  meetingAttendances,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingAttendances.meetingId],
      references: [meetings.id],
    }),
    kader: one(kaders, {
      fields: [meetingAttendances.kaderId],
      references: [kaders.id],
    }),
  })
);

export const scoreLedgersRelations = relations(scoreLedgers, ({ one }) => ({
  kader: one(kaders, {
    fields: [scoreLedgers.kaderId],
    references: [kaders.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  proker: one(prokers, {
    fields: [calendarEvents.prokerId],
    references: [prokers.id],
  }),
  creator: one(kaders, {
    fields: [calendarEvents.createdBy],
    references: [kaders.id],
  }),
  meeting: one(meetings, {
    fields: [calendarEvents.meetingId],
    references: [meetings.id],
  }),
  targetRoles: many(calendarEventTargetRoles),
}));

export const calendarEventTargetRolesRelations = relations(
  calendarEventTargetRoles,
  ({ one }) => ({
    event: one(calendarEvents, {
      fields: [calendarEventTargetRoles.eventId],
      references: [calendarEvents.id],
    }),
    role: one(roles, {
      fields: [calendarEventTargetRoles.roleId],
      references: [roles.id],
    }),
  })
);
