import PDFDocument from "pdfkit";

export interface TransactionReceiptData {
  receiptNumber: string;
  transactionDate: string | Date;
  fromEntity: string;
  toEntity: string;
  amount: number | string;
  description: string;
  status: string;
  type: string;
  approvedAt?: Date | string | null;
  approverName?: string | null;
}

export function formatIDR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(isNaN(num) ? 0 : num);
}

export async function generateReceiptPdf(
  data: TransactionReceiptData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // Header
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("HIPMI PT TELKOM UNIVERSITY", { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(
          "Himpunan Pengusaha Muda Indonesia Perguruan Tinggi Telkom University",
          { align: "center" }
        );
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Title
      doc
        .fontSize(15)
        .font("Helvetica-Bold")
        .text("RESI BUKTI TRANSAKSI KEUANGAN", { align: "center" });
      doc.moveDown(0.3);

      const receiptNo = data.receiptNumber || "-";
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`No. Resi: ${receiptNo}`, { align: "center" });
      doc.moveDown(1.5);

      // Transaction Details Table / Key-Values
      const formattedDate =
        typeof data.transactionDate === "string"
          ? data.transactionDate
          : data.transactionDate instanceof Date
          ? data.transactionDate.toISOString().split("T")[0]
          : String(data.transactionDate);

      const rows: [string, string][] = [
        ["No. Resi", receiptNo],
        ["Tanggal Transaksi", formattedDate || "-"],
        [
          "Tipe Transaksi",
          data.type === "CASH_IN"
            ? "Kas Masuk (CASH_IN)"
            : "Kas Keluar (CASH_OUT)",
        ],
        ["Pihak Pembayar / Dari", data.fromEntity],
        ["Pihak Penerima / Untuk", data.toEntity],
        ["Jumlah Transaksi", formatIDR(data.amount)],
        ["Status Transaksi", `[ ${data.status} ] - Sah & Terverifikasi`],
        ["Deskripsi / Keterangan", data.description],
      ];

      if (data.approvedAt) {
        rows.push([
          "Tanggal Disetujui",
          typeof data.approvedAt === "string"
            ? data.approvedAt
            : data.approvedAt instanceof Date
            ? data.approvedAt.toISOString()
            : String(data.approvedAt),
        ]);
      }

      let yPos = doc.y;
      rows.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").fontSize(10).text(label, 70, yPos);
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(`:  ${value}`, 220, yPos, { width: 280 });
        yPos += 24;
      });

      doc.y = yPos + 30;

      // Official Signature Section
      doc
        .font("Helvetica")
        .fontSize(10)
        .text("Bandung, " + formattedDate, 350, doc.y);
      doc.moveDown(0.5);
      doc
        .font("Helvetica-Bold")
        .text("Bendahara Umum HIPMI PT Telkom", 350, doc.y);
      doc.moveDown(4);
      doc.font("Helvetica").text("( ___________________________ )", 350, doc.y);
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .text("Tanda Tangan & Cap Resmi Organisasi", 350, doc.y + 4);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function generateFinancialStatementPdf(
  transactions: any[],
  summary: {
    totalCashIn: number;
    totalCashOut: number;
    balance: number;
    periodProfit?: number;
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // Header
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text("LAPORAN ARUS KAS KEUANGAN", { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text("HIPMI PT Telkom University", { align: "center" });
      doc.moveDown(0.8);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);

      // Summary Box
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Ringkasan Eksekutif Keuangan:");
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(`Total Kas Masuk (Approved): ${formatIDR(summary.totalCashIn)}`);
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(`Total Kas Keluar (Approved): ${formatIDR(summary.totalCashOut)}`);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(`Saldo Kas Berjalan: ${formatIDR(summary.balance)}`);
      doc.moveDown(1);

      // Table Header
      let y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9);
      doc.text("No", 40, y);
      doc.text("Tanggal", 65, y);
      doc.text("No. Kuitansi", 130, y);
      doc.text("Tipe", 225, y);
      doc.text("Keterangan", 280, y);
      doc.text("Jumlah", 430, y);
      doc.text("Status", 510, y);
      doc.moveTo(40, y + 14).lineTo(555, y + 14).stroke();

      y += 20;
      doc.font("Helvetica").fontSize(8);
      transactions.forEach((tx, idx) => {
        if (y > 750) {
          doc.addPage();
          y = 40;
        }
        const dateStr =
          typeof tx.transactionDate === "string"
            ? tx.transactionDate
            : tx.transactionDate instanceof Date
            ? tx.transactionDate.toISOString().split("T")[0]
            : String(tx.transactionDate);
        doc.text(String(idx + 1), 40, y);
        doc.text(dateStr, 65, y);
        doc.text(tx.receiptNumber || "-", 130, y, { width: 90 });
        doc.text(tx.type, 225, y);
        doc.text(tx.description || "-", 280, y, { width: 140 });
        doc.text(formatIDR(tx.amount), 430, y);
        doc.text(tx.status, 510, y);
        y += 18;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export const pdfService = {
  generateReceiptPdf,
  generateFinancialStatementPdf,
  formatIDR,
};
