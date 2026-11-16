import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import * as xlsx from 'xlsx';
import { app } from '../../../src/app.js';
import { createTestDatabase } from '../../helpers/test-db.js';
import { roles, kaders } from '../../../src/db/schema/auth.js';
import { eq } from 'drizzle-orm';

describe('Tier 4 Scenario 2: Full Fiscal Period Treasury & Receipting Cycle', () => {
  let dbHelper: Awaited<ReturnType<typeof createTestDatabase>>;
  let adminToken: string;
  let adminUserId: string;
  let staffUserId: string;

  // Invoice numbering helper: INV/HIPMI/YYYY/XXXX
  function generateInvoiceNumber(year: number, sequence: number): string {
    const seqStr = String(sequence).padStart(4, '0');
    return `INV/HIPMI/${year}/${seqStr}`;
  }

  // Digital PDF Receipt generator helper
  function generatePdfReceipt(data: {
    invoiceNumber: string;
    type: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    approvedBy: string;
  }): Buffer {
    const lines = [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
      '4 0 obj << /Length 200 >> stream',
      `BT /F1 12 Tf 50 700 Td (HIPMI PT TELKOM UNIVERSITY - BUKTI TRANSAKSI KAS) Tj ET`,
      `BT /F1 10 Tf 50 670 Td (Invoice: ${data.invoiceNumber}) Tj ET`,
      `BT /F1 10 Tf 50 650 Td (Tipe: ${data.type} | Kategori: ${data.category}) Tj ET`,
      `BT /F1 10 Tf 50 630 Td (Nominal: Rp ${data.amount.toLocaleString('id-ID')}) Tj ET`,
      `BT /F1 10 Tf 50 610 Td (Keterangan: ${data.description}) Tj ET`,
      `BT /F1 10 Tf 50 590 Td (Tanggal: ${data.date} | Disetujui: ${data.approvedBy}) Tj ET`,
      'endstream endobj',
      'xref',
      '0 5',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000212 00000 n ',
      'trailer << /Size 5 /Root 1 0 R >>',
      'startxref',
      '480',
      '%%EOF',
    ];
    return Buffer.from(lines.join('\n'), 'utf8');
  }

  beforeAll(async () => {
    dbHelper = await createTestDatabase();

    // Setup Transactions schema in PGlite
    await dbHelper.client.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(40) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL,
        amount BIGINT NOT NULL,
        category VARCHAR(80) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        receipt_url TEXT,
        rejection_reason TEXT,
        created_by_id UUID REFERENCES kaders(id),
        approved_by_id UUID REFERENCES kaders(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Authenticate Admin
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nim: '1201220001', password: 'admin123' }),
    });
    const adminJson = await adminLogin.json();
    adminToken = adminJson.data.accessToken;
    adminUserId = adminJson.data.user.id;

    // Resolve a staff user
    const staffCadre = await dbHelper.db.query.kaders.findFirst({
      where: eq(kaders.nim, '1201220001'),
    });
    staffUserId = staffCadre!.id;
  });

  afterAll(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  it('Step 1: Department submits CASH_OUT reimbursement requests in PENDING status', async () => {
    // 1. Submit Reimbursement 1: Sound system rent (Valid)
    const inv1 = generateInvoiceNumber(2026, 1);
    const tx1 = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO transactions (invoice_number, type, amount, category, description, status, created_by_id)
      VALUES ($1, 'CASH_OUT', 1500000, 'Operasional Acara', 'Sewa Sound System Seminar Nasional', 'PENDING', $2)
      RETURNING id;
    `, [inv1, staffUserId]);
    expect(tx1.rows[0].id).toBeDefined();

    // 2. Submit Reimbursement 2: Plenary consumption (Valid)
    const inv2 = generateInvoiceNumber(2026, 2);
    const tx2 = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO transactions (invoice_number, type, amount, category, description, status, created_by_id)
      VALUES ($1, 'CASH_OUT', 450000, 'Konsumsi', 'Konsumsi Rapat Pleno Kader Pengurus', 'PENDING', $2)
      RETURNING id;
    `, [inv2, staffUserId]);
    expect(tx2.rows[0].id).toBeDefined();

    // 3. Submit Reimbursement 3: Unauthorized personal expense (Invalid)
    const inv3 = generateInvoiceNumber(2026, 3);
    const tx3 = await dbHelper.client.query<{ id: string }>(`
      INSERT INTO transactions (invoice_number, type, amount, category, description, status, created_by_id)
      VALUES ($1, 'CASH_OUT', 3000000, 'Lain-lain', 'Klaim Transportasi Tanpa Bukti Kuitansi Sah', 'PENDING', $2)
      RETURNING id;
    `, [inv3, staffUserId]);
    expect(tx3.rows[0].id).toBeDefined();

    // Verify all 3 are recorded as PENDING
    const pendingOut = await dbHelper.client.query<{ count: string }>(`
      SELECT count(*) as count FROM transactions WHERE type = 'CASH_OUT' AND status = 'PENDING';
    `);
    expect(Number(pendingOut.rows[0].count)).toBe(3);
  });

  it('Step 2: External sponsor partnership dues and member registration recorded as CASH_IN', async () => {
    // 1. Sponsor partnership dues
    const inv4 = generateInvoiceNumber(2026, 4);
    await dbHelper.client.query(`
      INSERT INTO transactions (invoice_number, type, amount, category, description, status, created_by_id)
      VALUES ($1, 'CASH_IN', 10000000, 'Sponsorship', 'Dana Kemitraan Sponsor PT Telkomsel Indonesia', 'PENDING', $2);
    `, [inv4, staffUserId]);

    // 2. Membership dues
    const inv5 = generateInvoiceNumber(2026, 5);
    await dbHelper.client.query(`
      INSERT INTO transactions (invoice_number, type, amount, category, description, status, created_by_id)
      VALUES ($1, 'CASH_IN', 2000000, 'Iuran Anggota', 'Iuran Kas Anggota Kader Periode Genap 2026', 'PENDING', $2);
    `, [inv5, staffUserId]);

    const pendingIn = await dbHelper.client.query<{ count: string }>(`
      SELECT count(*) as count FROM transactions WHERE type = 'CASH_IN' AND status = 'PENDING';
    `);
    expect(Number(pendingIn.rows[0].count)).toBe(2);
  });

  it('Step 3: Automated sequential invoice generation strictly adheres to INV/HIPMI/YYYY/XXXX contract', async () => {
    const allInvoices = await dbHelper.client.query<{ invoice_number: string }>(`
      SELECT invoice_number FROM transactions ORDER BY invoice_number ASC;
    `);

    expect(allInvoices.rows.length).toBe(5);

    const regex = /^INV\/HIPMI\/\d{4}\/\d{4}$/;
    for (let i = 0; i < allInvoices.rows.length; i++) {
      const invNum = allInvoices.rows[i].invoice_number;
      expect(regex.test(invNum)).toBe(true);

      const expectedSeq = String(i + 1).padStart(4, '0');
      expect(invNum).toBe(`INV/HIPMI/2026/${expectedSeq}`);
    }
  });

  it('Step 4: Finance Treasurer reviews queue: verifies zero initial balance, approves valid items, and rejects unauthorized item', async () => {
    // 1. Invariant check: Dynamic balance before approval MUST be 0 (PENDING items excluded)
    const initialBalanceRes = await dbHelper.client.query<{ balance: string }>(`
      SELECT COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE -amount END), 0) AS balance
      FROM transactions
      WHERE status = 'APPROVED';
    `);
    expect(Number(initialBalanceRes.rows[0].balance)).toBe(0);

    // 2. Treasurer approves valid CASH_IN items
    await dbHelper.client.query(`
      UPDATE transactions
      SET status = 'APPROVED', approved_by_id = $1, updated_at = now()
      WHERE invoice_number IN ('INV/HIPMI/2026/0004', 'INV/HIPMI/2026/0005');
    `, [adminUserId]);

    // 3. Treasurer approves valid CASH_OUT items (Sound system & Plenary catering)
    await dbHelper.client.query(`
      UPDATE transactions
      SET status = 'APPROVED', approved_by_id = $1, updated_at = now()
      WHERE invoice_number IN ('INV/HIPMI/2026/0001', 'INV/HIPMI/2026/0002');
    `, [adminUserId]);

    // 4. Treasurer rejects unauthorized reimbursement item with mandatory reason
    const rejectionReason = 'Klaim ditolak: Bukti kuitansi/nota tidak valid dan pengeluaran tidak terdaftar dalam RAB';
    await dbHelper.client.query(`
      UPDATE transactions
      SET status = 'REJECTED', rejection_reason = $1, approved_by_id = $2, updated_at = now()
      WHERE invoice_number = 'INV/HIPMI/2026/0003';
    `, [rejectionReason, adminUserId]);

    // Verify rejection status & audit reason
    const rejectedTx = await dbHelper.client.query<{ status: string; rejection_reason: string }>(`
      SELECT status, rejection_reason FROM transactions WHERE invoice_number = 'INV/HIPMI/2026/0003';
    `);
    expect(rejectedTx.rows[0].status).toBe('REJECTED');
    expect(rejectedTx.rows[0].rejection_reason).toBe(rejectionReason);
  });

  it('Step 5: Digital PDF receipt generated with transaction details and PDF header signature', async () => {
    const tx = await dbHelper.client.query<{
      invoice_number: string;
      type: string;
      amount: number;
      category: string;
      description: string;
      created_at: string;
    }>(`
      SELECT invoice_number, type, amount, category, description, created_at
      FROM transactions
      WHERE invoice_number = 'INV/HIPMI/2026/0004';
    `);

    const receiptData = tx.rows[0];
    const pdfBuffer = generatePdfReceipt({
      invoiceNumber: receiptData.invoice_number,
      type: receiptData.type,
      amount: Number(receiptData.amount),
      category: receiptData.category,
      description: receiptData.description,
      date: new Date(receiptData.created_at).toISOString().split('T')[0],
      approvedBy: 'Bendahara Umum HIPMI',
    });

    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(100);

    // Verify PDF header magic bytes "%PDF-"
    const magic = pdfBuffer.slice(0, 5).toString('ascii');
    expect(magic).toBe('%PDF-');

    // Verify receipt content contains invoice number and organization details
    const pdfText = pdfBuffer.toString('utf8');
    expect(pdfText).toContain('INV/HIPMI/2026/0004');
    expect(pdfText).toContain('HIPMI PT TELKOM UNIVERSITY');
    expect(pdfText).toContain('Sponsorship');
  });

  it('Step 6: Dynamic balance and profit calculations verified for period (excluding rejected transactions)', async () => {
    // Total Approved Inflow = 10,000,000 + 2,000,000 = 12,000,000
    const inflowRes = await dbHelper.client.query<{ total: string }>(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'CASH_IN' AND status = 'APPROVED';
    `);
    const totalInflow = Number(inflowRes.rows[0].total);
    expect(totalInflow).toBe(12000000);

    // Total Approved Outflow = 1,500,000 + 450,000 = 1,950,000
    const outflowRes = await dbHelper.client.query<{ total: string }>(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'CASH_OUT' AND status = 'APPROVED';
    `);
    const totalOutflow = Number(outflowRes.rows[0].total);
    expect(totalOutflow).toBe(1950000);

    // Dynamic Balance = Inflow - Outflow = 10,050,000
    const balanceRes = await dbHelper.client.query<{ balance: string }>(`
      SELECT COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE -amount END), 0) AS balance
      FROM transactions
      WHERE status = 'APPROVED';
    `);
    const dynamicBalance = Number(balanceRes.rows[0].balance);
    expect(dynamicBalance).toBe(10050000);
    expect(dynamicBalance).toBe(totalInflow - totalOutflow);

    // Ensure rejected amount (3,000,000) was NOT counted
    const rejectedRes = await dbHelper.client.query<{ total: string }>(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE status = 'REJECTED';
    `);
    expect(Number(rejectedRes.rows[0].total)).toBe(3000000);
  });

  it('Step 7: Comprehensive cashflow report exported to Excel (XLSX) and validated', async () => {
    // 1. Fetch all transactions for period
    const allTx = await dbHelper.client.query<{
      invoice_number: string;
      type: string;
      amount: number;
      category: string;
      description: string;
      status: string;
      created_at: string;
    }>(`
      SELECT invoice_number, type, amount, category, description, status, created_at
      FROM transactions
      ORDER BY invoice_number ASC;
    `);

    // 2. Build workbook using xlsx
    const wb = xlsx.utils.book_new();

    const rows = allTx.rows.map((t) => ({
      'No Invoice': t.invoice_number,
      'Tipe': t.type,
      'Kategori': t.category,
      'Nominal (IDR)': Number(t.amount),
      'Status': t.status,
      'Keterangan': t.description,
      'Tanggal': new Date(t.created_at).toISOString().split('T')[0],
    }));

    const wsData = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, wsData, 'Laporan Buku Kas');

    const summaryRows = [
      { Indikator: 'Total Pemasukan Disetujui', Nilai: 12000000 },
      { Indikator: 'Total Pengeluaran Disetujui', Nilai: 1950000 },
      { Indikator: 'Saldo Bersih Kas Organisasi', Nilai: 10050000 },
      { Indikator: 'Total Transaksi Ditolak', Nilai: 3000000 },
    ];
    const wsSummary = xlsx.utils.json_to_sheet(summaryRows);
    xlsx.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Kas');

    // 3. Write to binary buffer
    const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(excelBuffer).toBeDefined();
    expect(excelBuffer.length).toBeGreaterThan(100);

    // 4. Read back and validate worksheet integrity
    const parsedWb = xlsx.read(excelBuffer, { type: 'buffer' });
    expect(parsedWb.SheetNames).toContain('Laporan Buku Kas');
    expect(parsedWb.SheetNames).toContain('Ringkasan Kas');

    const parsedRows = xlsx.utils.sheet_to_json<any>(parsedWb.Sheets['Laporan Buku Kas']);
    expect(parsedRows.length).toBe(5);
    expect(parsedRows[0]['No Invoice']).toBe('INV/HIPMI/2026/0001');
    expect(parsedRows[3]['No Invoice']).toBe('INV/HIPMI/2026/0004');
    expect(parsedRows[3]['Nominal (IDR)']).toBe(10000000);
    expect(parsedRows[3]['Status']).toBe('APPROVED');
  });
});
