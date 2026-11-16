import { db } from "../../db/index.js";
import {
  prokers,
  prokerCommittees,
  meetings,
  meetingAttendances,
  scoreLedgers,
} from "../../db/schema/erp.js";
import { kaders } from "../../db/schema/auth.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { AppError } from "../../middlewares/error.middleware.js";
import type {
  CreateProkerInput,
  UpdateProkerInput,
  AssignCommitteeInput,
  CreateMeetingInput,
  LogAttendanceInput,
  ProkerQueryInput,
} from "./tracking.schema.js";

export class TrackingService {
  async getProkers(query: ProkerQueryInput) {
    const conditions = [];
    if (query.bidang) conditions.push(eq(prokers.bidang, query.bidang));
    if (query.status) conditions.push(eq(prokers.status, query.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const [prokerList, countRes] = await Promise.all([
      db
        .select({
          id: prokers.id,
          bidang: prokers.bidang,
          title: prokers.title,
          picKaderId: prokers.picKaderId,
          startDate: prokers.startDate,
          endDate: prokers.endDate,
          status: prokers.status,
          createdAt: prokers.createdAt,
          picName: kaders.fullName,
        })
        .from(prokers)
        .leftJoin(kaders, eq(prokers.picKaderId, kaders.id))
        .where(whereClause)
        .orderBy(desc(prokers.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(prokers)
        .where(whereClause),
    ]);

    const total = Number(countRes[0]?.count || 0);

    return {
      prokers: prokerList,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createProker(input: CreateProkerInput) {
    // Validate PIC exists
    const pic = await db
      .select({ id: kaders.id })
      .from(kaders)
      .where(eq(kaders.id, input.picKaderId))
      .limit(1);

    if (!pic.length) {
      throw new AppError(404, "NOT_FOUND", "PIC Kader tidak ditemukan");
    }

    if (input.endDate < input.startDate) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Tanggal selesai proker tidak boleh lebih awal dari tanggal mulai"
      );
    }

    const [created] = await db
      .insert(prokers)
      .values({
        bidang: input.bidang,
        title: input.title,
        picKaderId: input.picKaderId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status || "PLANNED",
      })
      .returning();

    return created;
  }

  async updateProker(id: string, input: UpdateProkerInput) {
    const existing = await db
      .select()
      .from(prokers)
      .where(eq(prokers.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Proker tidak ditemukan");
    }

    if (input.picKaderId) {
      const pic = await db
        .select({ id: kaders.id })
        .from(kaders)
        .where(eq(kaders.id, input.picKaderId))
        .limit(1);
      if (!pic.length) {
        throw new AppError(404, "NOT_FOUND", "PIC Kader tidak ditemukan");
      }
    }

    const [updated] = await db
      .update(prokers)
      .set(input)
      .where(eq(prokers.id, id))
      .returning();

    return updated;
  }

  async assignCommittee(prokerId: string, input: AssignCommitteeInput) {
    return await db.transaction(async (tx) => {
      // 1. Verify proker exists
      const prokerRes = await tx
        .select()
        .from(prokers)
        .where(eq(prokers.id, prokerId))
        .limit(1);

      if (!prokerRes.length) {
        throw new AppError(404, "NOT_FOUND", "Proker tidak ditemukan");
      }
      const proker = prokerRes[0];

      // 2. Verify cadre exists
      const kaderRes = await tx
        .select()
        .from(kaders)
        .where(eq(kaders.id, input.kaderId))
        .limit(1);

      if (!kaderRes.length) {
        throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
      }

      // 3. Unique check on (prokerId, kaderId)
      const existing = await tx
        .select()
        .from(prokerCommittees)
        .where(
          and(
            eq(prokerCommittees.prokerId, prokerId),
            eq(prokerCommittees.kaderId, input.kaderId)
          )
        )
        .limit(1);

      if (existing.length) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          "Kader sudah terdaftar dalam kepanitiaan proker ini"
        );
      }

      const pointsAwarded = input.pointsAwarded ?? 20;

      // 4. Insert into proker_committees
      const [committee] = await tx
        .insert(prokerCommittees)
        .values({
          prokerId,
          kaderId: input.kaderId,
          committeeRole: input.committeeRole,
          pointsAwarded,
        })
        .returning();

      // 5. Insert into score_ledgers
      await tx.insert(scoreLedgers).values({
        kaderId: input.kaderId,
        sourceType: "PROKER_COMMITTEE",
        sourceId: committee.id,
        points: pointsAwarded,
        description: `Kepanitiaan Proker: ${proker.title} (${input.committeeRole})`,
      });

      // 6. Increment kaders.total_score atomically
      await tx
        .update(kaders)
        .set({
          totalScore: sql`${kaders.totalScore} + ${pointsAwarded}`,
        })
        .where(eq(kaders.id, input.kaderId));

      return committee;
    });
  }

  async createMeeting(input: CreateMeetingInput) {
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

    const [created] = await db
      .insert(meetings)
      .values({
        prokerId: input.prokerId || null,
        title: input.title,
        meetingDate: new Date(input.meetingDate),
        pointsPerAttendance: input.pointsPerAttendance ?? 5,
      })
      .returning();

    return created;
  }

  async getMeeting(id: string) {
    const meetingRes = await db
      .select({
        id: meetings.id,
        prokerId: meetings.prokerId,
        title: meetings.title,
        meetingDate: meetings.meetingDate,
        pointsPerAttendance: meetings.pointsPerAttendance,
        createdAt: meetings.createdAt,
        prokerTitle: prokers.title,
      })
      .from(meetings)
      .leftJoin(prokers, eq(meetings.prokerId, prokers.id))
      .where(eq(meetings.id, id))
      .limit(1);

    if (!meetingRes.length) {
      throw new AppError(404, "NOT_FOUND", "Sesi rapat tidak ditemukan");
    }

    const attendances = await db
      .select({
        id: meetingAttendances.id,
        meetingId: meetingAttendances.meetingId,
        kaderId: meetingAttendances.kaderId,
        status: meetingAttendances.status,
        pointsAwarded: meetingAttendances.pointsAwarded,
        createdAt: meetingAttendances.createdAt,
        kaderName: kaders.fullName,
        nim: kaders.nim,
      })
      .from(meetingAttendances)
      .leftJoin(kaders, eq(meetingAttendances.kaderId, kaders.id))
      .where(eq(meetingAttendances.meetingId, id));

    return {
      ...meetingRes[0],
      attendances,
    };
  }

  async logAttendances(meetingId: string, input: LogAttendanceInput) {
    return await db.transaction(async (tx) => {
      const meetingRes = await tx
        .select()
        .from(meetings)
        .where(eq(meetings.id, meetingId))
        .limit(1);

      if (!meetingRes.length) {
        throw new AppError(404, "NOT_FOUND", "Sesi rapat tidak ditemukan");
      }
      const meeting = meetingRes[0];
      const basePoints = meeting.pointsPerAttendance || 5;

      const results = [];

      for (const item of input.attendances) {
        // Verify cadre exists
        const cadre = await tx
          .select({ id: kaders.id })
          .from(kaders)
          .where(eq(kaders.id, item.kaderId))
          .limit(1);

        if (!cadre.length) {
          throw new AppError(
            404,
            "NOT_FOUND",
            `Kader dengan ID [${item.kaderId}] tidak ditemukan`
          );
        }

        // Check existing attendance record
        const existingAtt = await tx
          .select()
          .from(meetingAttendances)
          .where(
            and(
              eq(meetingAttendances.meetingId, meetingId),
              eq(meetingAttendances.kaderId, item.kaderId)
            )
          )
          .limit(1);

        // Check all existing ledgers for this meeting & cadre
        const existingLedgers = await tx
          .select({ points: scoreLedgers.points })
          .from(scoreLedgers)
          .where(
            and(
              eq(scoreLedgers.kaderId, item.kaderId),
              eq(scoreLedgers.sourceType, "MEETING_ATTENDANCE"),
              eq(scoreLedgers.sourceId, meetingId)
            )
          );

        const currentNetPoints = existingLedgers.reduce(
          (sum, l) => sum + l.points,
          0
        );

        if (item.status === "HADIR") {
          const pointsToAward = item.pointsAwarded ?? basePoints;

          if (currentNetPoints <= 0) {
            // First time or recovered from previous absence: award points
            await tx.insert(scoreLedgers).values({
              kaderId: item.kaderId,
              sourceType: "MEETING_ATTENDANCE",
              sourceId: meetingId,
              points: pointsToAward,
              description: `Presensi Rapat: ${meeting.title} (HADIR)`,
            });

            await tx
              .update(kaders)
              .set({
                totalScore: sql`${kaders.totalScore} + ${pointsToAward}`,
              })
              .where(eq(kaders.id, item.kaderId));
          }

          let attendanceRecord;
          if (existingAtt.length) {
            const [updated] = await tx
              .update(meetingAttendances)
              .set({
                status: "HADIR",
                pointsAwarded: pointsToAward,
              })
              .where(eq(meetingAttendances.id, existingAtt[0].id))
              .returning();
            attendanceRecord = updated;
          } else {
            const [inserted] = await tx
              .insert(meetingAttendances)
              .values({
                meetingId,
                kaderId: item.kaderId,
                status: "HADIR",
                pointsAwarded: pointsToAward,
              })
              .returning();
            attendanceRecord = inserted;
          }
          results.push(attendanceRecord);
        } else {
          // Status is IZIN, SAKIT, or ALPHA
          if (currentNetPoints > 0) {
            // Compensating reversal ledger entry
            await tx.insert(scoreLedgers).values({
              kaderId: item.kaderId,
              sourceType: "MEETING_ATTENDANCE",
              sourceId: meetingId,
              points: -currentNetPoints,
              description: `Koreksi Presensi Rapat: ${meeting.title} (${item.status})`,
            });

            await tx
              .update(kaders)
              .set({
                totalScore: sql`${kaders.totalScore} - ${currentNetPoints}`,
              })
              .where(eq(kaders.id, item.kaderId));
          }

          let attendanceRecord;
          if (existingAtt.length) {
            const [updated] = await tx
              .update(meetingAttendances)
              .set({
                status: item.status,
                pointsAwarded: 0,
              })
              .where(eq(meetingAttendances.id, existingAtt[0].id))
              .returning();
            attendanceRecord = updated;
          } else {
            const [inserted] = await tx
              .insert(meetingAttendances)
              .values({
                meetingId,
                kaderId: item.kaderId,
                status: item.status,
                pointsAwarded: 0,
              })
              .returning();
            attendanceRecord = inserted;
          }
          results.push(attendanceRecord);
        }
      }

      return results;
    });
  }
}

export const trackingService = new TrackingService();
