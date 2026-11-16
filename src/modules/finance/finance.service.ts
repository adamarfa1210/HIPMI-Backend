import { db } from "../../db/index.js";
import { transactions } from "../../db/schema/erp.js";
import { kaders } from "../../db/schema/auth.js";
import { eq, and, gte, lte, sql, desc, like } from "drizzle-orm";
import { AppError } from "../../middlewares/error.middleware.js";
import { pdfService } from "../../services/pdf.service.js";
import { excelService } from "../../services/excel.service.js";
import type {
  CreateTransactionInput,
  ApproveTransactionInput,
  FinanceQueryInput,
} from "./finance.schema.js";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export class FinanceService {
  async getSummary(year?: number, month?: number) {
    const targetYear = year || new Date().getFullYear();

    // Query approved transactions for dynamic balance
    const approvedTxs = await db
      .select({
        type: transactions.type,
        amount: transactions.amount,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .where(eq(transactions.status, "APPROVED"));

    let totalCashIn = 0;
    let totalCashOut = 0;

    for (const t of approvedTxs) {
      const amt = Number(t.amount);
      if (t.type === "CASH_IN") {
        totalCashIn += amt;
      } else if (t.type === "CASH_OUT") {
        totalCashOut += amt;
      }
    }

    const totalBalance = totalCashIn - totalCashOut;

    // Monthly cashflow for targetYear
    const monthlyMap: Record<number, { cashIn: number; cashOut: number }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyMap[m] = { cashIn: 0, cashOut: 0 };
    }

    for (const t of approvedTxs) {
      const d = new Date(t.transactionDate);
      if (d.getFullYear() === targetYear) {
        const m = d.getMonth() + 1;
        const amt = Number(t.amount);
        if (t.type === "CASH_IN") {
          monthlyMap[m].cashIn += amt;
        } else if (t.type === "CASH_OUT") {
          monthlyMap[m].cashOut += amt;
        }
      }
    }

    const monthlyCashflow = Object.entries(monthlyMap).map(([mStr, val]) => {
      const mIdx = parseInt(mStr, 10) - 1;
      return {
        month: MONTH_NAMES[mIdx] || `M${mStr}`,
        monthNumber: parseInt(mStr, 10),
        cashIn: val.cashIn,
        cashOut: val.cashOut,
        net: val.cashIn - val.cashOut,
      };
    });

    let periodProfit = totalBalance;
    if (month && month >= 1 && month <= 12) {
      periodProfit = monthlyMap[month].cashIn - monthlyMap[month].cashOut;
    }

    return {
      totalBalance,
      periodProfit,
      totalCashIn,
      totalCashOut,
      monthlyCashflow,
      year: targetYear,
    };
  }

  async getTransactions(query: FinanceQueryInput) {
    const conditions = [];

    if (query.startDate) {
      conditions.push(gte(transactions.transactionDate, query.startDate));
    }
    if (query.endDate) {
      conditions.push(lte(transactions.transactionDate, query.endDate));
    }
    if (query.type) {
      conditions.push(eq(transactions.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(transactions.status, query.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const [txList, countRes] = await Promise.all([
      db
        .select({
          id: transactions.id,
          receiptNumber: transactions.receiptNumber,
          type: transactions.type,
          fromEntity: transactions.fromEntity,
          toEntity: transactions.toEntity,
          amount: transactions.amount,
          description: transactions.description,
          transactionDate: transactions.transactionDate,
          status: transactions.status,
          receiptPdfUrl: transactions.receiptPdfUrl,
          createdBy: transactions.createdBy,
          approvedBy: transactions.approvedBy,
          approvedAt: transactions.approvedAt,
          rejectionReason: transactions.rejectionReason,
          createdAt: transactions.createdAt,
          creatorName: kaders.fullName,
        })
        .from(transactions)
        .leftJoin(kaders, eq(transactions.createdBy, kaders.id))
        .where(whereClause)
        .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(whereClause),
    ]);

    const total = Number(countRes[0]?.count || 0);

    return {
      transactions: txList.map((t) => ({
        ...t,
        amount: Number(t.amount),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createTransaction(input: CreateTransactionInput, createdById: string) {
    const [created] = await db
      .insert(transactions)
      .values({
        type: input.type,
        fromEntity: input.fromEntity,
        toEntity: input.toEntity,
        amount: input.amount.toFixed(2),
        description: input.description,
        transactionDate: input.transactionDate,
        status: "PENDING",
        receiptNumber: null,
        createdBy: createdById,
      })
      .returning();

    return {
      ...created,
      amount: Number(created.amount),
    };
  }

  async approveTransaction(
    id: string,
    input: ApproveTransactionInput,
    approvedById: string
  ) {
    const existing = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Transaksi tidak ditemukan");
    }

    const tx = existing[0];
    if (tx.status !== "PENDING") {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Transaksi ini sudah diproses dan tidak dapat diubah lagi"
      );
    }

    if (input.status === "APPROVED") {
      const year = new Date().getFullYear();
      const prefix = `INV/HIPMI/${year}/`;

      // Find highest existing sequence for this year
      const matchingTxs = await db
        .select({ receiptNumber: transactions.receiptNumber })
        .from(transactions)
        .where(like(transactions.receiptNumber, `${prefix}%`));

      let maxSeq = 0;
      for (const item of matchingTxs) {
        if (item.receiptNumber) {
          const parts = item.receiptNumber.split("/");
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      }

      const nextSeq = maxSeq + 1;
      const receiptNumber = `${prefix}${String(nextSeq).padStart(4, "0")}`;
      const receiptPdfUrl = `/api/finance/transactions/${id}/receipt`;

      const [updated] = await db
        .update(transactions)
        .set({
          status: "APPROVED",
          receiptNumber,
          receiptPdfUrl,
          approvedBy: approvedById,
          approvedAt: new Date(),
          rejectionReason: null,
        })
        .where(eq(transactions.id, id))
        .returning();

      return {
        ...updated,
        amount: Number(updated.amount),
      };
    } else {
      const [updated] = await db
        .update(transactions)
        .set({
          status: "REJECTED",
          approvedBy: approvedById,
          approvedAt: new Date(),
          rejectionReason: input.rejectionReason || "Ditolak",
        })
        .where(eq(transactions.id, id))
        .returning();

      return {
        ...updated,
        amount: Number(updated.amount),
      };
    }
  }

  async getTransactionReceipt(id: string): Promise<Buffer> {
    const existing = await db
      .select({
        id: transactions.id,
        receiptNumber: transactions.receiptNumber,
        type: transactions.type,
        fromEntity: transactions.fromEntity,
        toEntity: transactions.toEntity,
        amount: transactions.amount,
        description: transactions.description,
        transactionDate: transactions.transactionDate,
        status: transactions.status,
        approvedAt: transactions.approvedAt,
      })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Transaksi tidak ditemukan");
    }

    const tx = existing[0];
    if (tx.status !== "APPROVED") {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Kuitansi hanya dapat diunduh untuk transaksi yang telah disetujui (APPROVED)"
      );
    }

    return await pdfService.generateReceiptPdf({
      receiptNumber: tx.receiptNumber || `INV/HIPMI/PENDING/${tx.id.substring(0, 8)}`,
      transactionDate: tx.transactionDate,
      fromEntity: tx.fromEntity,
      toEntity: tx.toEntity,
      amount: Number(tx.amount),
      description: tx.description,
      status: tx.status,
      type: tx.type,
      approvedAt: tx.approvedAt,
    });
  }

  async exportTransactions(query: FinanceQueryInput, format: "xlsx" | "pdf" = "xlsx") {
    const conditions = [];
    if (query.startDate) conditions.push(gte(transactions.transactionDate, query.startDate));
    if (query.endDate) conditions.push(lte(transactions.transactionDate, query.endDate));
    if (query.type) conditions.push(eq(transactions.type, query.type));
    if (query.status) conditions.push(eq(transactions.status, query.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const txList = await db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));

    const summary = await this.getSummary();
    const statementSummary = {
      ...summary,
      balance: summary.totalBalance,
    };

    if (format === "pdf") {
      const buffer = await pdfService.generateFinancialStatementPdf(
        txList.map((t) => ({ ...t, amount: Number(t.amount) })),
        statementSummary
      );
      return {
        buffer,
        mimeType: "application/pdf",
        fileName: `laporan-keuangan-hipmi-${Date.now()}.pdf`,
      };
    }

    const buffer = excelService.generateFinancialReportExcel(
      txList.map((t) => ({ ...t, amount: Number(t.amount) })),
      statementSummary
    );
    return {
      buffer,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: `laporan-keuangan-hipmi-${Date.now()}.xlsx`,
    };
  }
}

export const financeService = new FinanceService();
