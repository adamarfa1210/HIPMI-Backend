import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { kaders, roles } from "../../db/schema/auth.js";
import {
  calendarEvents,
  calendarEventTargetRoles,
  meetingAttendances,
  meetings,
  prokers,
  scoreLedgers,
} from "../../db/schema/erp.js";
import { eq, and, gte, lte, asc, inArray, sql } from "drizzle-orm";
import { AppError } from "../../middlewares/error.middleware.js";
import type { AuthUser } from "../../middlewares/auth.middleware.js";
import {
  hasUserModulePermission,
  isSuperadmin,
} from "../../middlewares/rbac.middleware.js";
import type {
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CalendarFilterInput,
} from "./calendar.schema.js";

const ROLE_DISPLAY_ORDER: Record<string, number> = {
  Topman: 1,
  Kabid: 2,
  Kadiv: 3,
  Staff: 4,
  "Kader 1": 5,
  Admin: 6,
};

export function getRoleDisplayOrder(roleName: string): number {
  return ROLE_DISPLAY_ORDER[roleName] ?? 50;
}

export function buildMeetingAttendanceQrPayload(eventId: string, token: string): string {
  return JSON.stringify({
    app: "HIPMI_ERP",
    v: 1,
    type: "MEETING_ATTENDANCE",
    eventId,
    token,
  });
}

function canUserAccessEvent(
  event: { createdBy: string | null; category: string },
  targetRoleIds: string[],
  user: AuthUser,
  canApproveRbpl: boolean
): boolean {
  if (isSuperadmin(user)) return true;
  if (event.createdBy && event.createdBy === user.id) return true;
  if (event.category === "RBPL" && canApproveRbpl) return true;
  if (targetRoleIds.length === 0) return true;
  return targetRoleIds.includes(user.roleId);
}

function canUserManageEventQr(
  event: { createdBy: string | null; category: string; enableQrAttendance: boolean },
  user: AuthUser,
  canApproveRbpl: boolean,
  canApproveCalendar: boolean
): boolean {
  if (!event.enableQrAttendance) return false;
  if (isSuperadmin(user)) return true;
  if (event.createdBy && event.createdBy === user.id) return true;
  return event.category === "RBPL" ? canApproveRbpl : canApproveCalendar;
}

export class CalendarService {
  async listSelectableRoles() {
    const allRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
        isSystemDefault: roles.isSystemDefault,
      })
      .from(roles);

    return allRoles.sort((a, b) => {
      const diff = getRoleDisplayOrder(a.name) - getRoleDisplayOrder(b.name);
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "id");
    });
  }

  async getEvents(filters: CalendarFilterInput, user?: AuthUser) {
    const conditions = [];

    if (filters.startDate) {
      conditions.push(gte(calendarEvents.startAt, new Date(filters.startDate)));
    }
    if (filters.endDate) {
      conditions.push(lte(calendarEvents.endAt, new Date(filters.endDate)));
    }
    if (filters.category) {
      conditions.push(eq(calendarEvents.category, filters.category));
    }
    if (filters.isPublic !== undefined) {
      conditions.push(eq(calendarEvents.isPublic, filters.isPublic));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rawEvents = await db
      .select({
        id: calendarEvents.id,
        prokerId: calendarEvents.prokerId,
        title: calendarEvents.title,
        category: calendarEvents.category,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        location: calendarEvents.location,
        isPublic: calendarEvents.isPublic,
        googleEventId: calendarEvents.googleEventId,
        createdBy: calendarEvents.createdBy,
        createdByName: kaders.fullName,
        enableQrAttendance: calendarEvents.enableQrAttendance,
        pointsPerAttendance: calendarEvents.pointsPerAttendance,
        qrToken: calendarEvents.qrToken,
        qrIsOpen: calendarEvents.qrIsOpen,
        meetingId: calendarEvents.meetingId,
        createdAt: calendarEvents.createdAt,
        prokerTitle: prokers.title,
      })
      .from(calendarEvents)
      .leftJoin(prokers, eq(calendarEvents.prokerId, prokers.id))
      .leftJoin(kaders, eq(calendarEvents.createdBy, kaders.id))
      .where(whereClause)
      .orderBy(asc(calendarEvents.startAt));

    if (!rawEvents.length) return [];

    const eventIds = rawEvents.map((e) => e.id);
    const targetRoleRows = await db
      .select({
        eventId: calendarEventTargetRoles.eventId,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(calendarEventTargetRoles)
      .innerJoin(roles, eq(calendarEventTargetRoles.roleId, roles.id))
      .where(inArray(calendarEventTargetRoles.eventId, eventIds));

    const targetMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of targetRoleRows) {
      const list = targetMap.get(row.eventId) ?? [];
      list.push({ id: row.roleId, name: row.roleName });
      targetMap.set(row.eventId, list);
    }

    const myAttendanceByMeeting = new Map<string, string>();
    const meetingIds = rawEvents
      .map((e) => e.meetingId)
      .filter((id): id is string => Boolean(id));
    if (user && meetingIds.length > 0) {
      const myAttRows = await db
        .select({
          meetingId: meetingAttendances.meetingId,
          status: meetingAttendances.status,
        })
        .from(meetingAttendances)
        .where(
          and(
            eq(meetingAttendances.kaderId, user.id),
            inArray(meetingAttendances.meetingId, meetingIds)
          )
        );
      for (const row of myAttRows) {
        myAttendanceByMeeting.set(row.meetingId, row.status);
      }
    }

    const canApproveRbpl = user
      ? await hasUserModulePermission(user, "rbpl", "approve")
      : false;
    const canApproveCalendar = user
      ? await hasUserModulePermission(user, "calendar", "approve")
      : false;

    const visibleEvents = [];
    for (const ev of rawEvents) {
      const targetRoles = (targetMap.get(ev.id) ?? []).sort((a, b) => {
        const diff = getRoleDisplayOrder(a.name) - getRoleDisplayOrder(b.name);
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "id");
      });
      const targetRoleIds = targetRoles.map((r) => r.id);

      if (user && !canUserAccessEvent(ev, targetRoleIds, user, canApproveRbpl)) {
        continue;
      }

      const canManageQr = user
        ? canUserManageEventQr(ev, user, canApproveRbpl, canApproveCalendar)
        : false;

      const qrPayload =
        canManageQr && ev.qrToken
          ? buildMeetingAttendanceQrPayload(ev.id, ev.qrToken)
          : null;

      visibleEvents.push({
        id: ev.id,
        prokerId: ev.prokerId,
        title: ev.title,
        category: ev.category,
        startAt: ev.startAt,
        endAt: ev.endAt,
        location: ev.location,
        isPublic: ev.isPublic,
        googleEventId: ev.googleEventId,
        createdBy: ev.createdBy,
        createdByName: ev.createdByName,
        enableQrAttendance: ev.enableQrAttendance,
        pointsPerAttendance: ev.pointsPerAttendance,
        qrIsOpen: ev.qrIsOpen,
        meetingId: ev.meetingId,
        createdAt: ev.createdAt,
        prokerTitle: ev.prokerTitle,
        targetRoles,
        canManageQr,
        qrPayload,
        myAttendanceStatus: ev.meetingId
          ? myAttendanceByMeeting.get(ev.meetingId) ??
            (ev.enableQrAttendance ? "BELUM_HADIR" : null)
          : null,
      });
    }

    return visibleEvents;
  }

  async getPublicEvents() {
    return await db
      .select({
        id: calendarEvents.id,
        prokerId: calendarEvents.prokerId,
        title: calendarEvents.title,
        category: calendarEvents.category,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        location: calendarEvents.location,
        isPublic: calendarEvents.isPublic,
        createdAt: calendarEvents.createdAt,
        prokerTitle: prokers.title,
      })
      .from(calendarEvents)
      .leftJoin(prokers, eq(calendarEvents.prokerId, prokers.id))
      .where(eq(calendarEvents.isPublic, true))
      .orderBy(asc(calendarEvents.startAt));
  }

  private async validateTargetRoles(roleIds: string[]): Promise<string[]> {
    const uniqueIds = Array.from(new Set(roleIds));
    if (!uniqueIds.length) return [];

    const found = await db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, uniqueIds));

    if (found.length !== uniqueIds.length) {
      throw new AppError(400, "BAD_REQUEST", "Sebagian role peserta tidak valid");
    }
    return uniqueIds;
  }

  async createEvent(input: CreateCalendarEventInput, user?: AuthUser) {
    if (user) {
      const requiredModule = input.category === "RBPL" ? "rbpl" : "calendar";
      const allowed = await hasUserModulePermission(user, requiredModule, "create");
      if (!allowed) {
        throw new AppError(
          403,
          "FORBIDDEN",
          input.category === "RBPL"
            ? "Akses ditolak: Anda tidak memiliki izin CREATE pada modul RBPL"
            : "Akses ditolak: Anda tidak memiliki izin CREATE pada modul Calendar HIPMI"
        );
      }
    }

    const start = new Date(input.startAt);
    const end = new Date(input.endAt);

    if (end < start) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Waktu selesai acara tidak boleh lebih awal dari waktu mulai"
      );
    }

    if (input.prokerId) {
      const proker = await db
        .select({ id: prokers.id })
        .from(prokers)
        .where(eq(prokers.id, input.prokerId))
        .limit(1);
      if (!proker.length) {
        throw new AppError(404, "NOT_FOUND", "Proker tidak ditemukan");
      }
    }

    const uniqueTargetRoleIds = await this.validateTargetRoles(
      input.targetRoleIds ?? []
    );

    let googleEventId: string | null = null;
    try {
      if (
        process.env.GOOGLE_CALENDAR_ID &&
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      ) {
        googleEventId = `gcal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }
    } catch (gcalErr) {
      console.warn(
        "[Google Calendar Adapter]: External sync unavailable, gracefully falling back to local DB storage",
        gcalErr
      );
      googleEventId = null;
    }

    const enableQr = Boolean(input.enableQrAttendance);
    const points = enableQr ? (input.pointsPerAttendance ?? 5) : 0;

    const createdId = await db.transaction(async (tx) => {
      let meetingId: string | null = null;
      let qrToken: string | null = null;
      let qrIsOpen = false;

      if (enableQr) {
        const [meeting] = await tx
          .insert(meetings)
          .values({
            prokerId: input.prokerId || null,
            title: input.title.slice(0, 120),
            meetingDate: start,
            pointsPerAttendance: points,
          })
          .returning({ id: meetings.id });
        meetingId = meeting.id;
        qrToken = crypto.randomBytes(24).toString("hex");
        qrIsOpen = input.qrIsOpen ?? true;
      }

      const [created] = await tx
        .insert(calendarEvents)
        .values({
          prokerId: input.prokerId || null,
          title: input.title,
          category: input.category,
          startAt: start,
          endAt: end,
          location: input.location,
          isPublic: input.isPublic ?? false,
          googleEventId,
          createdBy: user?.id ?? null,
          enableQrAttendance: enableQr,
          pointsPerAttendance: points,
          qrToken,
          qrIsOpen,
          meetingId,
        })
        .returning({ id: calendarEvents.id });

      if (uniqueTargetRoleIds.length > 0) {
        await tx.insert(calendarEventTargetRoles).values(
          uniqueTargetRoleIds.map((roleId) => ({
            eventId: created.id,
            roleId,
          }))
        );
      }

      return created.id;
    });

    const list = await this.getEvents({}, user);
    return list.find((ev) => ev.id === createdId)!;
  }

  async updateEvent(id: string, input: UpdateCalendarEventInput, user?: AuthUser) {
    const existing = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Agenda kalender tidak ditemukan");
    }

    const curr = existing[0];
    const targetCategory = input.category ?? curr.category;

    if (user) {
      const touchesRbpl = curr.category === "RBPL" || targetCategory === "RBPL";
      const isCreator = Boolean(curr.createdBy && curr.createdBy === user.id);
      if (touchesRbpl) {
        const canUpdateRbpl =
          (await hasUserModulePermission(user, "rbpl", "update")) ||
          (isCreator && (await hasUserModulePermission(user, "rbpl", "create")));
        if (!canUpdateRbpl) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Akses ditolak: Anda tidak memiliki izin mengubah agenda RBPL"
          );
        }
      } else {
        const canUpdateCal =
          (await hasUserModulePermission(user, "calendar", "update")) ||
          (isCreator && (await hasUserModulePermission(user, "calendar", "create")));
        if (!canUpdateCal) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Akses ditolak: Anda tidak memiliki izin mengubah agenda Calendar HIPMI"
          );
        }
      }
    }

    const nextStart = input.startAt ? new Date(input.startAt) : curr.startAt;
    const nextEnd = input.endAt ? new Date(input.endAt) : curr.endAt;

    if (nextEnd < nextStart) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Waktu selesai acara tidak boleh lebih awal dari waktu mulai"
      );
    }

    if (input.prokerId) {
      const proker = await db
        .select({ id: prokers.id })
        .from(prokers)
        .where(eq(prokers.id, input.prokerId))
        .limit(1);
      if (!proker.length) {
        throw new AppError(404, "NOT_FOUND", "Proker tidak ditemukan");
      }
    }

    const validatedRoleIds =
      input.targetRoleIds !== undefined
        ? await this.validateTargetRoles(input.targetRoleIds)
        : undefined;

    const nextEnableQr = input.enableQrAttendance ?? curr.enableQrAttendance;
    const nextPoints =
      input.pointsPerAttendance !== undefined
        ? input.pointsPerAttendance
        : curr.pointsPerAttendance;

    await db.transaction(async (tx) => {
      let meetingId = curr.meetingId;
      let qrToken = curr.qrToken;
      let qrIsOpen =
        input.qrIsOpen !== undefined ? input.qrIsOpen : curr.qrIsOpen;

      if (nextEnableQr) {
        if (!meetingId) {
          const [meeting] = await tx
            .insert(meetings)
            .values({
              prokerId:
                input.prokerId !== undefined ? input.prokerId || null : curr.prokerId,
              title: (input.title ?? curr.title).slice(0, 120),
              meetingDate: nextStart,
              pointsPerAttendance: nextPoints,
            })
            .returning({ id: meetings.id });
          meetingId = meeting.id;
        } else {
          await tx
            .update(meetings)
            .set({
              prokerId:
                input.prokerId !== undefined ? input.prokerId || null : curr.prokerId,
              title: (input.title ?? curr.title).slice(0, 120),
              meetingDate: nextStart,
              pointsPerAttendance: nextPoints,
            })
            .where(eq(meetings.id, meetingId));
        }
        if (!qrToken) {
          qrToken = crypto.randomBytes(24).toString("hex");
        }
        if (!curr.enableQrAttendance && input.qrIsOpen === undefined) {
          qrIsOpen = true;
        }
      } else {
        qrIsOpen = false;
      }

      const patch: Record<string, any> = {
        enableQrAttendance: nextEnableQr,
        pointsPerAttendance: nextEnableQr ? nextPoints : 0,
        qrToken,
        qrIsOpen,
        meetingId,
      };
      if (input.prokerId !== undefined) patch.prokerId = input.prokerId || null;
      if (input.title !== undefined) patch.title = input.title;
      if (input.category !== undefined) patch.category = input.category;
      if (input.startAt !== undefined) patch.startAt = nextStart;
      if (input.endAt !== undefined) patch.endAt = nextEnd;
      if (input.location !== undefined) patch.location = input.location;
      if (input.isPublic !== undefined) patch.isPublic = input.isPublic;

      await tx.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id));

      if (validatedRoleIds !== undefined) {
        await tx
          .delete(calendarEventTargetRoles)
          .where(eq(calendarEventTargetRoles.eventId, id));
        if (validatedRoleIds.length > 0) {
          await tx.insert(calendarEventTargetRoles).values(
            validatedRoleIds.map((roleId) => ({
              eventId: id,
              roleId,
            }))
          );
        }
      }
    });

    const list = await this.getEvents({}, user);
    return list.find((ev) => ev.id === id)!;
  }

  async deleteEvent(id: string, user?: AuthUser) {
    const existing = await db
      .select({
        id: calendarEvents.id,
        category: calendarEvents.category,
        createdBy: calendarEvents.createdBy,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Agenda kalender tidak ditemukan");
    }

    if (user) {
      const requiredModule = existing[0].category === "RBPL" ? "rbpl" : "calendar";
      const allowed = await hasUserModulePermission(user, requiredModule, "delete");
      if (!allowed) {
        throw new AppError(
          403,
          "FORBIDDEN",
          existing[0].category === "RBPL"
            ? "Akses ditolak: Anda tidak memiliki izin DELETE pada modul RBPL"
            : "Akses ditolak: Anda tidak memiliki izin DELETE pada modul Calendar HIPMI"
        );
      }
    }

    const [deleted] = await db
      .delete(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .returning();

    return deleted;
  }

  async toggleQrStatus(id: string, isOpen: boolean, user: AuthUser) {
    const existing = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Agenda kalender tidak ditemukan");
    }

    const ev = existing[0];
    if (!ev.enableQrAttendance) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Agenda ini tidak mengaktifkan absensi QR"
      );
    }

    const canApproveRbpl = await hasUserModulePermission(user, "rbpl", "approve");
    const canApproveCal = await hasUserModulePermission(user, "calendar", "approve");
    if (!canUserManageEventQr(ev, user, canApproveRbpl, canApproveCal)) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Hanya pembuat agenda atau pemegang hak akses QR yang berhak membuka/menutup QR absensi"
      );
    }

    const token = ev.qrToken || crypto.randomBytes(24).toString("hex");
    const [updated] = await db
      .update(calendarEvents)
      .set({ qrIsOpen: isOpen, qrToken: token })
      .where(eq(calendarEvents.id, id))
      .returning();

    return {
      eventId: updated.id,
      qrIsOpen: updated.qrIsOpen,
      qrPayload: buildMeetingAttendanceQrPayload(updated.id, token),
    };
  }

  async getEventAttendance(eventId: string, user: AuthUser) {
    const existing = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Agenda kalender tidak ditemukan");
    }

    const ev = existing[0];
    const targetRoleRows = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(calendarEventTargetRoles)
      .innerJoin(roles, eq(calendarEventTargetRoles.roleId, roles.id))
      .where(eq(calendarEventTargetRoles.eventId, eventId));

    const targetRoleIds = targetRoleRows.map((r) => r.roleId);
    const canApproveRbpl = await hasUserModulePermission(user, "rbpl", "approve");
    const canApproveCal = await hasUserModulePermission(user, "calendar", "approve");

    if (!canUserAccessEvent(ev, targetRoleIds, user, canApproveRbpl)) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Anda tidak memiliki akses untuk melihat daftar hadir agenda ini"
      );
    }

    if (!ev.enableQrAttendance || !ev.meetingId) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Agenda ini tidak mengaktifkan absensi QR"
      );
    }

    const activeKaderConds = [eq(kaders.status, "Aktif")];
    if (targetRoleIds.length > 0) {
      activeKaderConds.push(inArray(kaders.roleId, targetRoleIds));
    }

    const eligibleKaders = await db
      .select({
        kaderId: kaders.id,
        nim: kaders.nim,
        fullName: kaders.fullName,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(kaders)
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(and(...activeKaderConds));

    const attendanceRows = await db
      .select({
        kaderId: meetingAttendances.kaderId,
        status: meetingAttendances.status,
        pointsAwarded: meetingAttendances.pointsAwarded,
        createdAt: meetingAttendances.createdAt,
        nim: kaders.nim,
        fullName: kaders.fullName,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(meetingAttendances)
      .innerJoin(kaders, eq(meetingAttendances.kaderId, kaders.id))
      .innerJoin(roles, eq(kaders.roleId, roles.id))
      .where(eq(meetingAttendances.meetingId, ev.meetingId));

    const attMap = new Map<string, (typeof attendanceRows)[number]>();
    for (const row of attendanceRows) {
      attMap.set(row.kaderId, row);
    }

    // Merge eligible active kaders with anyone already recorded on this meeting
    const mergedMap = new Map<
      string,
      {
        kaderId: string;
        nim: string;
        fullName: string;
        roleId: string;
        roleName: string;
        status: string;
        pointsAwarded: number;
        attendedAt: Date | null;
      }
    >();

    for (const k of eligibleKaders) {
      const att = attMap.get(k.kaderId);
      mergedMap.set(k.kaderId, {
        kaderId: k.kaderId,
        nim: k.nim,
        fullName: k.fullName,
        roleId: k.roleId,
        roleName: k.roleName,
        status: att?.status ?? "BELUM_HADIR",
        pointsAwarded: att?.pointsAwarded ?? 0,
        attendedAt: att?.status === "HADIR" ? att.createdAt : null,
      });
    }

    for (const att of attendanceRows) {
      if (!mergedMap.has(att.kaderId)) {
        mergedMap.set(att.kaderId, {
          kaderId: att.kaderId,
          nim: att.nim,
          fullName: att.fullName,
          roleId: att.roleId,
          roleName: att.roleName,
          status: att.status,
          pointsAwarded: att.pointsAwarded,
          attendedAt: att.status === "HADIR" ? att.createdAt : null,
        });
      }
    }

    const sorted = Array.from(mergedMap.values()).sort((a, b) => {
      const aPresentRank = a.status === "HADIR" ? 0 : 1;
      const bPresentRank = b.status === "HADIR" ? 0 : 1;
      if (aPresentRank !== bPresentRank) return aPresentRank - bPresentRank;

      const roleDiff =
        getRoleDisplayOrder(a.roleName) - getRoleDisplayOrder(b.roleName);
      if (roleDiff !== 0) return roleDiff;

      const roleNameDiff = a.roleName.localeCompare(b.roleName, "id");
      if (roleNameDiff !== 0) return roleNameDiff;

      return a.fullName.localeCompare(b.fullName, "id");
    });

    const rows = sorted.map((item, idx) => ({
      no: idx + 1,
      ...item,
    }));

    const totalHadir = rows.filter((r) => r.status === "HADIR").length;

    return {
      eventId: ev.id,
      title: ev.title,
      category: ev.category,
      pointsPerAttendance: ev.pointsPerAttendance,
      qrIsOpen: ev.qrIsOpen,
      canManageQr: canUserManageEventQr(ev, user, canApproveRbpl, canApproveCal),
      totalEligible: rows.length,
      totalHadir,
      totalBelumHadir: rows.length - totalHadir,
      rows,
    };
  }

  async scanMeetingAttendanceQr(
    eventId: string,
    token: string,
    user: AuthUser
  ) {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, eventId))
        .limit(1);

      if (!existing.length) {
        throw new AppError(404, "NOT_FOUND", "Agenda rapat QR tidak ditemukan");
      }

      const ev = existing[0];
      if (!ev.enableQrAttendance || !ev.meetingId || !ev.qrToken) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "Agenda ini tidak mengaktifkan absensi QR"
        );
      }

      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(ev.qrToken);
      if (
        tokenBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(tokenBuf, expectedBuf)
      ) {
        throw new AppError(400, "INVALID_QR_TOKEN", "Token QR absensi tidak valid");
      }

      if (!ev.qrIsOpen) {
        throw new AppError(
          400,
          "QR_CLOSED",
          "QR absensi agenda ini sedang ditutup oleh pembuat agenda"
        );
      }

      const targetRoles = await tx
        .select({ roleId: calendarEventTargetRoles.roleId })
        .from(calendarEventTargetRoles)
        .where(eq(calendarEventTargetRoles.eventId, eventId));

      if (
        targetRoles.length > 0 &&
        !targetRoles.some((r) => r.roleId === user.roleId)
      ) {
        throw new AppError(
          403,
          "FORBIDDEN",
          `Role Anda (${user.roleName}) tidak termasuk peserta yang diwajibkan pada agenda ini`
        );
      }

      const existingAtt = await tx
        .select()
        .from(meetingAttendances)
        .where(
          and(
            eq(meetingAttendances.meetingId, ev.meetingId),
            eq(meetingAttendances.kaderId, user.id)
          )
        )
        .limit(1);

      if (existingAtt.length && existingAtt[0].status === "HADIR") {
        return {
          type: "MEETING_ATTENDANCE" as const,
          eventId: ev.id,
          eventTitle: ev.title,
          category: ev.category,
          status: "HADIR" as const,
          alreadyAttended: true,
          pointsAwarded: existingAtt[0].pointsAwarded,
          attendedAt: existingAtt[0].createdAt,
          message: `Anda sudah tercatat HADIR sebelumnya pada "${ev.title}".`,
        };
      }

      const pointsToAward = ev.pointsPerAttendance ?? 0;

      const existingLedgers = await tx
        .select({ points: scoreLedgers.points })
        .from(scoreLedgers)
        .where(
          and(
            eq(scoreLedgers.kaderId, user.id),
            eq(scoreLedgers.sourceType, "MEETING_ATTENDANCE"),
            eq(scoreLedgers.sourceId, ev.meetingId)
          )
        );

      const currentNetPoints = existingLedgers.reduce((sum, l) => sum + l.points, 0);

      if (pointsToAward > 0 && currentNetPoints <= 0) {
        await tx.insert(scoreLedgers).values({
          kaderId: user.id,
          sourceType: "MEETING_ATTENDANCE",
          sourceId: ev.meetingId,
          points: pointsToAward,
          description: `Presensi QR Agenda: ${ev.title} (HADIR)`,
        });

        await tx
          .update(kaders)
          .set({
            totalScore: sql`${kaders.totalScore} + ${pointsToAward}`,
          })
          .where(eq(kaders.id, user.id));
      }

      let recordedAt = new Date();
      if (existingAtt.length) {
        const [updatedAtt] = await tx
          .update(meetingAttendances)
          .set({
            status: "HADIR",
            pointsAwarded: pointsToAward,
            createdAt: recordedAt,
          })
          .where(eq(meetingAttendances.id, existingAtt[0].id))
          .returning();
        recordedAt = updatedAtt.createdAt;
      } else {
        const [insertedAtt] = await tx
          .insert(meetingAttendances)
          .values({
            meetingId: ev.meetingId,
            kaderId: user.id,
            status: "HADIR",
            pointsAwarded: pointsToAward,
          })
          .returning();
        recordedAt = insertedAtt.createdAt;
      }

      return {
        type: "MEETING_ATTENDANCE" as const,
        eventId: ev.id,
        eventTitle: ev.title,
        category: ev.category,
        status: "HADIR" as const,
        alreadyAttended: false,
        pointsAwarded: pointsToAward,
        attendedAt: recordedAt,
        message:
          pointsToAward > 0
            ? `Presensi HADIR berhasil dicatat untuk "${ev.title}" (+${pointsToAward} poin keaktifan).`
            : `Presensi HADIR berhasil dicatat untuk "${ev.title}".`,
      };
    });
  }
}

export const calendarService = new CalendarService();
