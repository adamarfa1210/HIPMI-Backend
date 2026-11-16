import * as xlsx from "xlsx";

export interface KaderImportRow {
  nim: string;
  fullName: string;
  whatsappNumber: string;
  prodi: string;
  fakultas: string;
  instagram?: string;
  businessName?: string;
  interestCategory: "Kompetisi" | "Punya Bisnis" | "Belum Punya Bisnis" | "Belum Punya Bisnis tapi Minat Kompetisi";
  status: "Aktif" | "Non-Aktif" | "Alumni";
  roleName?: string;
}

export function normalizeInterest(val?: string): "Kompetisi" | "Punya Bisnis" | "Belum Punya Bisnis" | "Belum Punya Bisnis tapi Minat Kompetisi" {
  if (!val) return "Belum Punya Bisnis";
  const s = val.trim().toLowerCase();
  if (s.includes("minat kompetisi") || s.includes("tapi minat")) {
    return "Belum Punya Bisnis tapi Minat Kompetisi";
  }
  if (s.includes("punya bisnis") && !s.includes("belum")) {
    return "Punya Bisnis";
  }
  if (s.includes("kompetisi")) {
    return "Kompetisi";
  }
  return "Belum Punya Bisnis";
}

export function normalizeStatus(val?: string): "Aktif" | "Non-Aktif" | "Alumni" {
  if (!val) return "Aktif";
  const s = val.trim().toLowerCase();
  if (s === "non-aktif" || s === "nonaktif" || s === "inactive") return "Non-Aktif";
  if (s === "alumni") return "Alumni";
  return "Aktif";
}

export function normalizeHeaders(row: Record<string, any>): KaderImportRow | null {
  const findVal = (...keys: string[]): string => {
    for (const k of keys) {
      const match = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
      if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== "") {
        return String(row[match]).trim();
      }
    }
    return "";
  };

  const nim = findVal("nim", "no induk", "nomor induk", "student id");
  const fullName = findVal("nama lengkap", "nama", "full name", "fullname", "name");
  const whatsappNumber = findVal("whatsapp", "no wa", "no whatsapp", "telepon", "phone", "whatsapp number");
  const prodi = findVal("prodi", "program studi", "jurusan");
  const fakultas = findVal("fakultas", "faculty");

  if (!nim || !fullName) return null;

  return {
    nim,
    fullName,
    whatsappNumber: whatsappNumber || "081234567890",
    prodi: prodi || "S1 Sistem Informasi",
    fakultas: fakultas || "Fakultas Rekayasa Industri",
    instagram: findVal("instagram", "ig", "username ig") || undefined,
    businessName: findVal("bisnis", "nama bisnis", "usaha", "business", "business name") || undefined,
    interestCategory: normalizeInterest(findVal("kategori minat", "minat", "interest", "interest category")),
    status: normalizeStatus(findVal("status")),
    roleName: findVal("role", "nama role", "role name") || undefined,
  };
}

export function parseExcelOrCsv(buffer: Buffer): KaderImportRow[] {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet);

  const results: KaderImportRow[] = [];
  for (const raw of rawRows) {
    const normalized = normalizeHeaders(raw);
    if (normalized) {
      results.push(normalized);
    }
  }
  return results;
}

export function generateKaderSpreadsheet(
  kaderList: any[],
  format: "xlsx" | "csv" = "xlsx"
): { buffer: Buffer; mimeType: string; fileName: string } {
  const formattedData = kaderList.map((k, idx) => ({
    No: idx + 1,
    NIM: k.nim,
    "Nama Lengkap": k.fullName,
    Role: k.roleName || (k.role?.name ?? "-"),
    WhatsApp: k.whatsappNumber,
    Prodi: k.prodi,
    Fakultas: k.fakultas,
    Instagram: k.instagram || "-",
    Bisnis: k.businessName || "-",
    "Kategori Minat": k.interestCategory,
    Status: k.status,
    "Total Skor": k.totalScore,
    "Tanggal Terdaftar": k.createdAt ? new Date(k.createdAt).toISOString().split("T")[0] : "-",
  }));

  const worksheet = xlsx.utils.json_to_sheet(formattedData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Data Kader");

  if (format === "csv") {
    const csvContent = xlsx.write(workbook, { type: "buffer", bookType: "csv" });
    return {
      buffer: Buffer.from(csvContent),
      mimeType: "text/csv; charset=utf-8",
      fileName: `data-kader-hipmi-${Date.now()}.csv`,
    };
  }

  const xlsxContent = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
  return {
    buffer: Buffer.from(xlsxContent),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: `data-kader-hipmi-${Date.now()}.xlsx`,
  };
}
