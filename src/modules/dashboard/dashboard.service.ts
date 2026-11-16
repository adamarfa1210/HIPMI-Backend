import { db } from "../../db/index.js";
import { kaders } from "../../db/schema/auth.js";
import {
  transactions,
  prokers,
  calendarEvents,
} from "../../db/schema/erp.js";
import { eq, gte, asc } from "drizzle-orm";

export class DashboardService {
  async getSummary() {
    // 1. Cadres KPI
    const allCadres = await db
      .select({
        id: kaders.id,
        status: kaders.status,
        totalScore: kaders.totalScore,
      })
      .from(kaders);

    const totalCadres = allCadres.length;
    const activeCadresList = allCadres.filter((k) => k.status === "Aktif");
    const activeCadres = activeCadresList.length;

    let cadreActivityIndex = 0;
    if (activeCadres > 0) {
      const sumScore = activeCadresList.reduce((acc, k) => acc + k.totalScore, 0);
      cadreActivityIndex = Math.round((sumScore / activeCadres) * 100) / 100;
    }

    // 2. Financial Balance (strictly APPROVED transactions)
    const approvedTxs = await db
      .select({
        type: transactions.type,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(eq(transactions.status, "APPROVED"));

    let cashIn = 0;
    let cashOut = 0;
    for (const t of approvedTxs) {
      const amt = Number(t.amount);
      if (t.type === "CASH_IN") {
        cashIn += amt;
      } else if (t.type === "CASH_OUT") {
        cashOut += amt;
      }
    }
    const currentBalance = cashIn - cashOut;

    // 3. Proker Distribution
    const allProkers = await db
      .select({
        id: prokers.id,
        status: prokers.status,
      })
      .from(prokers);

    const planned = allProkers.filter((p) => p.status === "PLANNED").length;
    const onProgress = allProkers.filter((p) => p.status === "ON_PROGRESS").length;
    const completed = allProkers.filter((p) => p.status === "COMPLETED").length;
    const prokerDistribution = {
      planned,
      onProgress,
      completed,
      total: allProkers.length,
    };

    // 4. Upcoming Agendas (nearest 5 events with startAt >= now)
    const now = new Date();
    const upcomingAgendas = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        category: calendarEvents.category,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
        location: calendarEvents.location,
        isPublic: calendarEvents.isPublic,
      })
      .from(calendarEvents)
      .where(gte(calendarEvents.startAt, now))
      .orderBy(asc(calendarEvents.startAt))
      .limit(5);

    return {
      cadreActivityIndex,
      totalCadres,
      activeCadres,
      currentBalance,
      kpi: {
        cadreActivityIndex,
        totalCadres,
        activeCadres,
        currentBalance,
      },
      prokerDistribution,
      upcomingAgendas,
      activeAnnouncement: null,
    };
  }
}

export const dashboardService = new DashboardService();
