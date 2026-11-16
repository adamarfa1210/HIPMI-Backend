import * as xlsx from "xlsx";

export interface FinancialExportRow {
  No: number;
  "No. Kuitansi": string;
  Tanggal: string;
  Tipe: string;
  "Dari (Pihak Pembayar)": string;
  "Kepada (Pihak Penerima)": string;
  Deskripsi: string;
  Jumlah: number;
  Status: string;
}

export function generateFinancialReportExcel(
  transactions: any[],
  summary?: {
    totalCashIn?: number;
    totalCashOut?: number;
    balance?: number;
  }
): Buffer {
  const rows: FinancialExportRow[] = transactions.map((t, idx) => ({
    No: idx + 1,
    "No. Kuitansi": t.receiptNumber || "-",
    Tanggal:
      typeof t.transactionDate === "string"
        ? t.transactionDate
        : t.transactionDate instanceof Date
        ? t.transactionDate.toISOString().split("T")[0]
        : String(t.transactionDate),
    Tipe: t.type,
    "Dari (Pihak Pembayar)": t.fromEntity,
    "Kepada (Pihak Penerima)": t.toEntity,
    Deskripsi: t.description,
    Jumlah:
      typeof t.amount === "string" ? parseFloat(t.amount) : Number(t.amount),
    Status: t.status,
  }));

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);

  if (summary) {
    const summaryRows = [
      {
        Indikator: "Total Kas Masuk (Approved)",
        Nilai: summary.totalCashIn ?? 0,
      },
      {
        Indikator: "Total Kas Keluar (Approved)",
        Nilai: summary.totalCashOut ?? 0,
      },
      { Indikator: "Saldo Kas Berjalan", Nilai: summary.balance ?? 0 },
    ];
    const summarySheet = xlsx.utils.json_to_sheet(summaryRows);
    xlsx.utils.book_append_sheet(workbook, summarySheet, "Ringkasan");
  }

  xlsx.utils.book_append_sheet(workbook, worksheet, "Transaksi");

  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buffer);
}

export const excelService = {
  generateFinancialReportExcel,
};
