export class DocumentsService {
  async getTemplates() {
    const googleDocsTemplateUrl =
      process.env.GOOGLE_DOCS_TEMPLATE_URL ||
      "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";

    return {
      label: "Template Surat Resmi HIPMI PT Telkom University",
      googleDocsTemplateUrl,
      guidelinesUrl: "https://docs.google.com/document/d/guideline-administrasi-hipmi/edit",
      updatedAt: new Date().toISOString(),
    };
  }

  async getDocuments() {
    return [
      {
        id: "doc-01",
        title: "Template Surat Peminjaman Ruangan & Fasilitas",
        category: "TEMPLATE_SURAT",
        format: "DOCX",
        url: "https://docs.google.com/document/d/template-peminjaman-fasilitas/edit",
        updatedAt: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "doc-02",
        title: "Template Surat Undangan Pemateri & Juri",
        category: "TEMPLATE_SURAT",
        format: "DOCX",
        url: "https://docs.google.com/document/d/template-undangan-pemateri/edit",
        updatedAt: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "doc-03",
        title: "Format Laporan Pertanggungjawaban (LPJ) Proker",
        category: "PANDUAN_LPJ",
        format: "DOCX",
        url: "https://docs.google.com/document/d/format-lpj-proker/edit",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "doc-04",
        title: "AD/ART & Pedoman Tata Kelola Organisasi HIPMI PT",
        category: "PEDOMAN_ORGANISASI",
        format: "PDF",
        url: "https://drive.google.com/file/d/ad-art-hipmi-pt-telkom/view",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
  }
}

export const documentsService = new DocumentsService();
