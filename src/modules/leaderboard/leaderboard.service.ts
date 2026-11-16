import { db } from "../../db/index.js";
import { kaders, roles } from "../../db/schema/auth.js";
import { scoreLedgers } from "../../db/schema/erp.js";
import { eq, desc, asc } from "drizzle-orm";
import { AppError } from "../../middlewares/error.middleware.js";

export class LeaderboardService {
  async getLeaderboard(page: number = 1, limit: number = 50, currentUserId?: string) {
    const allActive = await db
      .select({
        id: kaders.id,
        nim: kaders.nim,
        fullName: kaders.fullName,
        prodi: kaders.prodi,
        roleId: kaders.roleId,
        roleName: roles.name,
        totalScore: kaders.totalScore,
      })
      .from(kaders)
      .leftJoin(roles, eq(kaders.roleId, roles.id))
      .where(eq(kaders.status, "Aktif"))
      .orderBy(desc(kaders.totalScore), asc(kaders.fullName));

    // Compute dense rank
    let currentRank = 0;
    let prevScore: number | null = null;
    const rankedAll = allActive.map((k) => {
      if (prevScore === null || k.totalScore < prevScore) {
        currentRank++;
        prevScore = k.totalScore;
      }
      return {
        rank: currentRank,
        id: k.id,
        nim: k.nim,
        fullName: k.fullName,
        prodi: k.prodi,
        role: k.roleName || "-",
        totalScore: k.totalScore,
      };
    });

    const userEntry = currentUserId
      ? rankedAll.find((k) => k.id === currentUserId)
      : null;

    const currentUserRank = userEntry
      ? {
          rank: userEntry.rank,
          id: userEntry.id,
          fullName: userEntry.fullName,
          totalScore: userEntry.totalScore,
        }
      : null;

    const total = rankedAll.length;
    const offset = (page - 1) * limit;
    const paginatedLeaderboard = rankedAll.slice(offset, offset + limit);

    return {
      leaderboard: paginatedLeaderboard,
      currentUserRank,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCadreLedger(kaderId: string) {
    const cadreRes = await db
      .select({
        id: kaders.id,
        nim: kaders.nim,
        fullName: kaders.fullName,
        prodi: kaders.prodi,
        status: kaders.status,
        totalScore: kaders.totalScore,
      })
      .from(kaders)
      .where(eq(kaders.id, kaderId))
      .limit(1);

    if (!cadreRes.length) {
      throw new AppError(404, "NOT_FOUND", "Kader tidak ditemukan");
    }

    const ledgers = await db
      .select({
        id: scoreLedgers.id,
        kaderId: scoreLedgers.kaderId,
        sourceType: scoreSourceTypeEnumString(scoreLedgers.sourceType),
        sourceId: scoreLedgers.sourceId,
        points: scoreLedgers.points,
        description: scoreLedgers.description,
        createdAt: scoreLedgers.createdAt,
      })
      .from(scoreLedgers)
      .where(eq(scoreLedgers.kaderId, kaderId))
      .orderBy(desc(scoreLedgers.createdAt));

    return {
      kader: cadreRes[0],
      ledgers,
    };
  }
}

function scoreSourceTypeEnumString(col: any) {
  return col;
}

export const leaderboardService = new LeaderboardService();
