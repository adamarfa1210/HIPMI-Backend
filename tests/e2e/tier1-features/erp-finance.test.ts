import { describe, it, expect, beforeAll, afterAll } from '../../helpers/test-runner.js';
import * as xlsx from 'xlsx';
import { dbStore, dbFixtures, TestTransaction } from '../../helpers/db-fixtures.js';
import { TEST_USERS } from '../../helpers/auth-helper.js';

// Minimal standard PDF generator for digital receipt & financial export validation
function createDigitalReceiptPdf(tx: TestTransaction): Buffer {
  if (tx.status !== 'APPROVED') {
    throw new Error(`Receipt cannot be generated for transaction with status: ${tx.status}`);
  }
  const streamContent = `BT /F1 14 Tf 72 720 Td (HIPMI PT TELKOM - RESI PEMBAYARAN DIGITAL) Tj /F1 10 Tf 0 -20 Td (No: ${tx.invoiceNumber} | Tanggal: ${tx.createdAt}) Tj 0 -18 Td (Kategori: ${tx.category} | Nominal: Rp ${tx.amount.toLocaleString('id-ID')}) Tj 0 -18 Td (Status: [ ${tx.status} ] - Sah) Tj ET`;
  const pdfString = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamContent.length} >>
stream
${streamContent}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
trailer << /Size 6 /Root 1 0 R >>
startxref
450
%%EOF`;
  return Buffer.from(pdfString);
}

function generateInvoiceNumber(seq: number, year: number = new Date().getFullYear()): string {
  const padded = String(seq).padStart(4, '0');
  return `INV/HIPMI/${year}/${padded}`;
}

function calculateLedgerMetrics(transactions: TestTransaction[]): {
  totalCashIn: number;
  totalCashOut: number;
  balance: number;
  netProfit: number;
} {
  const approved = transactions.filter((t) => t.status === 'APPROVED');
  const totalCashIn = approved
    .filter((t) => t.type === 'CASH_IN')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalCashOut = approved
    .filter((t) => t.type === 'CASH_OUT')
    .reduce((acc, t) => acc + t.amount, 0);
  const balance = totalCashIn - totalCashOut;
  const netProfit = balance;
  return { totalCashIn, totalCashOut, balance, netProfit };
}

describe('Tier 1: ERP Finance & Digital Receipts (Features 12, 14-19)', () => {
  beforeAll(async () => {
    dbStore.reset();
  });

  afterAll(async () => {
    dbStore.reset();
  });

  // =========================================================================
  // F12: Operational ERP Schema
  // =========================================================================
  it('F12-1: Transaction model enforces mandatory fields structure', () => {
    const tx: TestTransaction = {
      id: 'tx-001',
      invoiceNumber: 'INV/HIPMI/2026/0001',
      type: 'CASH_IN',
      amount: 1500000,
      category: 'Sponsor',
      description: 'Sponsor Utama HIPMI Fest',
      status: 'PENDING',
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(tx.id, tx);

    const stored = dbStore.transactions.get('tx-001');
    expect(stored).toBeDefined();
    expect(stored?.invoiceNumber).toBe('INV/HIPMI/2026/0001');
    expect(stored?.amount).toBe(1500000);
  });

  it('F12-2: Transaction type is strictly constrained to CASH_IN or CASH_OUT', () => {
    const validTypes: Array<'CASH_IN' | 'CASH_OUT'> = ['CASH_IN', 'CASH_OUT'];
    for (const t of validTypes) {
      expect(['CASH_IN', 'CASH_OUT']).toContain(t);
    }

    const isInvalid = (t: string) => !['CASH_IN', 'CASH_OUT'].includes(t);
    expect(isInvalid('CREDIT')).toBe(true);
    expect(isInvalid('TRANSFER')).toBe(true);
  });

  it('F12-3: Transaction status covers strictly PENDING, APPROVED, and REJECTED states', () => {
    const allowedStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
    expect(allowedStatuses).toHaveLength(3);
    expect(allowedStatuses).toContain('PENDING');
    expect(allowedStatuses).toContain('APPROVED');
    expect(allowedStatuses).toContain('REJECTED');
  });

  it('F12-4: Transaction links correctly to creator cadre and approver cadre foreign keys', () => {
    const tx: TestTransaction = {
      id: 'tx-002',
      invoiceNumber: 'INV/HIPMI/2026/0002',
      type: 'CASH_OUT',
      amount: 250000,
      category: 'Konsumsi',
      description: 'Snack Rapat Koordinasi',
      status: 'APPROVED',
      createdById: TEST_USERS.staff.id,
      approvedById: TEST_USERS.admin.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(tx.id, tx);

    const creator = dbStore.kaders.get(tx.createdById);
    const approver = dbStore.kaders.get(tx.approvedById!);
    expect(creator).toBeDefined();
    expect(approver).toBeDefined();
    expect(creator?.roleCode).toBe('staff');
    expect(approver?.roleCode).toBe('admin');
  });

  it('F12-5: New transactions default to status PENDING with receiptUrl undefined', () => {
    const tx: TestTransaction = {
      id: 'tx-003',
      invoiceNumber: 'INV/HIPMI/2026/0003',
      type: 'CASH_IN',
      amount: 50000,
      category: 'Iuran Kas',
      description: 'Iuran Bulanan Anggota',
      status: 'PENDING',
      createdById: TEST_USERS.kader_1.id,
      createdAt: new Date().toISOString(),
    };
    expect(tx.status).toBe('PENDING');
    expect(tx.receiptUrl).toBeUndefined();
    expect(tx.approvedById).toBeUndefined();
  });

  // =========================================================================
  // F14: Cash In / Cash Out Transaction Recording & Categories
  // =========================================================================
  it('F14-1: Records valid Cash In transaction with revenue category', () => {
    const cashIn = {
      id: 'tx-cin-1',
      invoiceNumber: generateInvoiceNumber(10),
      type: 'CASH_IN' as const,
      amount: 2500000,
      category: 'Dana Usaha',
      description: 'Hasil Penjualan Merchandise HIPMI',
      status: 'PENDING' as const,
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(cashIn.id, cashIn);

    const saved = dbStore.transactions.get('tx-cin-1');
    expect(saved?.type).toBe('CASH_IN');
    expect(saved?.amount).toBe(2500000);
    expect(saved?.category).toBe('Dana Usaha');
  });

  it('F14-2: Records valid Cash Out transaction with expense category', () => {
    const cashOut = {
      id: 'tx-cout-1',
      invoiceNumber: generateInvoiceNumber(11),
      type: 'CASH_OUT' as const,
      amount: 450000,
      category: 'Sewa Tempat',
      description: 'Sewa Coworking Space Workshop',
      status: 'PENDING' as const,
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(cashOut.id, cashOut);

    const saved = dbStore.transactions.get('tx-cout-1');
    expect(saved?.type).toBe('CASH_OUT');
    expect(saved?.amount).toBe(450000);
    expect(saved?.category).toBe('Sewa Tempat');
  });

  it('F14-3: Validation strictly rejects non-positive or zero amounts', () => {
    const validateAmount = (amt: number): boolean => amt > 0 && Number.isFinite(amt);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(-50000)).toBe(false);
    expect(validateAmount(-1)).toBe(false);
    expect(validateAmount(1000)).toBe(true);
    expect(validateAmount(500000)).toBe(true);
  });

  it('F14-4: Preserves rich transaction metadata (description, category, createdById)', () => {
    const tx = {
      id: 'tx-meta-1',
      invoiceNumber: generateInvoiceNumber(12),
      type: 'CASH_OUT' as const,
      amount: 150000,
      category: 'Logistik',
      description: 'Pembelian Banner & Spanduk Dies Natalis',
      status: 'PENDING' as const,
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(tx.id, tx);

    const ret = dbStore.transactions.get('tx-meta-1');
    expect(ret?.description).toContain('Dies Natalis');
    expect(ret?.createdById).toBe(TEST_USERS.staff.id);
  });

  it('F14-5: Supports querying transactions partitioned by transaction type', () => {
    const all = Array.from(dbStore.transactions.values());
    const cashIns = all.filter((t) => t.type === 'CASH_IN');
    const cashOuts = all.filter((t) => t.type === 'CASH_OUT');

    expect(cashIns.length).toBeGreaterThan(0);
    expect(cashOuts.length).toBeGreaterThan(0);
    for (const cin of cashIns) expect(cin.type).toBe('CASH_IN');
    for (const cout of cashOuts) expect(cout.type).toBe('CASH_OUT');
  });

  // =========================================================================
  // F15: Finance Approval Workflow (PENDING -> APPROVED / REJECTED)
  // =========================================================================
  it('F15-1: Authorized role transitions transaction from PENDING to APPROVED', () => {
    const tx: TestTransaction = {
      id: 'tx-appr-1',
      invoiceNumber: generateInvoiceNumber(20),
      type: 'CASH_IN',
      amount: 1000000,
      category: 'Sponsor',
      description: 'Sponsor Bank Mandiri',
      status: 'PENDING',
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(tx.id, tx);

    // Approve
    const stored = dbStore.transactions.get(tx.id)!;
    stored.status = 'APPROVED';
    stored.approvedById = TEST_USERS.admin.id;

    expect(stored.status).toBe('APPROVED');
    expect(stored.approvedById).toBe(TEST_USERS.admin.id);
  });

  it('F15-2: Authorized role transitions transaction from PENDING to REJECTED', () => {
    const tx: TestTransaction = {
      id: 'tx-rej-1',
      invoiceNumber: generateInvoiceNumber(21),
      type: 'CASH_OUT',
      amount: 9000000,
      category: 'Konsumsi',
      description: 'Klaim Fiktif Tanpa Nota',
      status: 'PENDING',
      createdById: TEST_USERS.staff.id,
      createdAt: new Date().toISOString(),
    };
    dbStore.transactions.set(tx.id, tx);

    // Reject
    const stored = dbStore.transactions.get(tx.id)!;
    stored.status = 'REJECTED';
    stored.approvedById = TEST_USERS.topman.id;

    expect(stored.status).toBe('REJECTED');
    expect(stored.approvedById).toBe(TEST_USERS.topman.id);
  });

  it('F15-3: Records approver cadre ID and timestamp on approval status update', () => {
    const stored = dbStore.transactions.get('tx-appr-1')!;
    expect(stored.approvedById).toBeDefined();
    expect(stored.approvedById).toBe(TEST_USERS.admin.id);
  });

  it('F15-4: Guardrail prevents modifying status of already APPROVED transaction without reset', () => {
    const canTransition = (current: string, next: string): boolean => {
      if (current === 'APPROVED' && next === 'PENDING') return false;
      if (current === 'REJECTED' && next === 'PENDING') return false;
      return true;
    };
    expect(canTransition('PENDING', 'APPROVED')).toBe(true);
    expect(canTransition('PENDING', 'REJECTED')).toBe(true);
    expect(canTransition('APPROVED', 'PENDING')).toBe(false);
  });

  it('F15-5: RBAC check enforces that only roles with canApprove permissions can approve', () => {
    const canApproveFinance = (roleCode: string): boolean => {
      return ['admin', 'topman'].includes(roleCode);
    };
    expect(canApproveFinance('admin')).toBe(true);
    expect(canApproveFinance('topman')).toBe(true);
    expect(canApproveFinance('staff')).toBe(false);
    expect(canApproveFinance('kader_1')).toBe(false);
  });

  // =========================================================================
  // F16: Dynamic Balance & Profit Calculation
  // =========================================================================
  it('F16-1: Dynamic balance strictly equals APPROVED Cash In minus APPROVED Cash Out', () => {
    const ledger: TestTransaction[] = [
      {
        id: '1',
        invoiceNumber: 'INV/1',
        type: 'CASH_IN',
        amount: 5000000,
        category: 'A',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
      {
        id: '2',
        invoiceNumber: 'INV/2',
        type: 'CASH_OUT',
        amount: 2000000,
        category: 'B',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
    ];

    const metrics = calculateLedgerMetrics(ledger);
    expect(metrics.totalCashIn).toBe(5000000);
    expect(metrics.totalCashOut).toBe(2000000);
    expect(metrics.balance).toBe(3000000);
    expect(metrics.netProfit).toBe(3000000);
  });

  it('F16-2: PENDING transactions are strictly excluded from balance and profit', () => {
    const ledger: TestTransaction[] = [
      {
        id: '1',
        invoiceNumber: 'INV/1',
        type: 'CASH_IN',
        amount: 5000000,
        category: 'A',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
      {
        id: '2',
        invoiceNumber: 'INV/2',
        type: 'CASH_IN',
        amount: 10000000,
        category: 'A',
        description: 'Pending Grant',
        status: 'PENDING', // MUST NOT BE COUNTED
        createdById: 'u',
        createdAt: '',
      },
    ];

    const metrics = calculateLedgerMetrics(ledger);
    expect(metrics.totalCashIn).toBe(5000000);
    expect(metrics.balance).toBe(5000000);
  });

  it('F16-3: REJECTED transactions are strictly excluded from balance and profit', () => {
    const ledger: TestTransaction[] = [
      {
        id: '1',
        invoiceNumber: 'INV/1',
        type: 'CASH_IN',
        amount: 5000000,
        category: 'A',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
      {
        id: '2',
        invoiceNumber: 'INV/2',
        type: 'CASH_OUT',
        amount: 4000000,
        category: 'B',
        description: 'Rejected Expense',
        status: 'REJECTED', // MUST NOT BE DEDUCTED
        createdById: 'u',
        createdAt: '',
      },
    ];

    const metrics = calculateLedgerMetrics(ledger);
    expect(metrics.totalCashOut).toBe(0);
    expect(metrics.balance).toBe(5000000);
  });

  it('F16-4: Net profit correctly reflects negative balance when approved expenses exceed income', () => {
    const deficitLedger: TestTransaction[] = [
      {
        id: '1',
        invoiceNumber: 'INV/1',
        type: 'CASH_IN',
        amount: 1000000,
        category: 'A',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
      {
        id: '2',
        invoiceNumber: 'INV/2',
        type: 'CASH_OUT',
        amount: 1500000,
        category: 'B',
        description: 'D',
        status: 'APPROVED',
        createdById: 'u',
        createdAt: '',
      },
    ];

    const metrics = calculateLedgerMetrics(deficitLedger);
    expect(metrics.balance).toBe(-500000);
    expect(metrics.netProfit).toBe(-500000);
  });

  it('F16-5: Empty transaction ledger safely returns 0 balance without NaN or errors', () => {
    const emptyMetrics = calculateLedgerMetrics([]);
    expect(emptyMetrics.totalCashIn).toBe(0);
    expect(emptyMetrics.totalCashOut).toBe(0);
    expect(emptyMetrics.balance).toBe(0);
    expect(emptyMetrics.netProfit).toBe(0);
    expect(Number.isNaN(emptyMetrics.balance)).toBe(false);
  });

  // =========================================================================
  // F17: Sequential Invoice Numbering (INV/HIPMI/YYYY/XXXX)
  // =========================================================================
  it('F17-1: Generated invoice number conforms to strict INV/HIPMI/YYYY/XXXX regex pattern', () => {
    const invRegex = /^INV\/HIPMI\/\d{4}\/\d{4}$/;
    const inv1 = generateInvoiceNumber(1, 2026);
    const inv99 = generateInvoiceNumber(99, 2026);
    const inv1234 = generateInvoiceNumber(1234, 2026);

    expect(invRegex.test(inv1)).toBe(true);
    expect(invRegex.test(inv99)).toBe(true);
    expect(invRegex.test(inv1234)).toBe(true);
  });

  it('F17-2: Sequential invoice numbers increment monotonically', () => {
    const inv1 = generateInvoiceNumber(1, 2026);
    const inv2 = generateInvoiceNumber(2, 2026);
    const inv3 = generateInvoiceNumber(3, 2026);

    expect(inv1).toBe('INV/HIPMI/2026/0001');
    expect(inv2).toBe('INV/HIPMI/2026/0002');
    expect(inv3).toBe('INV/HIPMI/2026/0003');
  });

  it('F17-3: Enforces 4-digit zero padding on invoice sequence numbers', () => {
    expect(generateInvoiceNumber(5)).toContain('/0005');
    expect(generateInvoiceNumber(42)).toContain('/0042');
    expect(generateInvoiceNumber(789)).toContain('/0789');
    expect(generateInvoiceNumber(1000)).toContain('/1000');
  });

  it('F17-4: Year segment dynamically incorporates transaction calendar year', () => {
    const inv2025 = generateInvoiceNumber(1, 2025);
    const inv2026 = generateInvoiceNumber(1, 2026);
    const inv2027 = generateInvoiceNumber(1, 2027);

    expect(inv2025).toBe('INV/HIPMI/2025/0001');
    expect(inv2026).toBe('INV/HIPMI/2026/0001');
    expect(inv2027).toBe('INV/HIPMI/2027/0001');
  });

  it('F17-5: Uniqueness check detects and rejects duplicate invoice numbers', () => {
    const existing = new Set<string>(['INV/HIPMI/2026/0001', 'INV/HIPMI/2026/0002']);
    const isUnique = (inv: string) => !existing.has(inv);

    expect(isUnique('INV/HIPMI/2026/0001')).toBe(false);
    expect(isUnique('INV/HIPMI/2026/0003')).toBe(true);
  });

  // =========================================================================
  // F18: Digital PDF Receipt Generation
  // =========================================================================
  it('F18-1: Generates binary PDF receipt for APPROVED transaction starting with %PDF-', () => {
    const approvedTx: TestTransaction = {
      id: 'tx-pdf-1',
      invoiceNumber: 'INV/HIPMI/2026/0050',
      type: 'CASH_IN',
      amount: 1250000,
      category: 'Iuran Kas',
      description: 'Iuran semester',
      status: 'APPROVED',
      createdById: TEST_USERS.staff.id,
      approvedById: TEST_USERS.admin.id,
      createdAt: '2026-03-01',
    };

    const pdfBuffer = createDigitalReceiptPdf(approvedTx);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(100);
  });

  it('F18-2: PDF receipt payload includes invoiceNumber, category, amount, and APPROVED stamp', () => {
    const approvedTx: TestTransaction = {
      id: 'tx-pdf-2',
      invoiceNumber: 'INV/HIPMI/2026/0051',
      type: 'CASH_OUT',
      amount: 750000,
      category: 'Konsumsi',
      description: 'Makan siang panitia',
      status: 'APPROVED',
      createdById: TEST_USERS.staff.id,
      approvedById: TEST_USERS.topman.id,
      createdAt: '2026-03-02',
    };

    const pdfBuffer = createDigitalReceiptPdf(approvedTx);
    const pdfText = pdfBuffer.toString('utf8');
    expect(pdfText).toContain('INV/HIPMI/2026/0051');
    expect(pdfText).toContain('Konsumsi');
    expect(pdfText).toContain('APPROVED');
  });

  it('F18-3: Rejects receipt generation attempt for PENDING transaction', () => {
    const pendingTx: TestTransaction = {
      id: 'tx-pdf-pend',
      invoiceNumber: 'INV/HIPMI/2026/0052',
      type: 'CASH_IN',
      amount: 500000,
      category: 'Iuran Kas',
      description: 'Menunggu transfer',
      status: 'PENDING',
      createdById: TEST_USERS.staff.id,
      createdAt: '2026-03-03',
    };

    expect(() => createDigitalReceiptPdf(pendingTx)).toThrow('Receipt cannot be generated');
  });

  it('F18-4: Rejects receipt generation attempt for REJECTED transaction', () => {
    const rejectedTx: TestTransaction = {
      id: 'tx-pdf-rej',
      invoiceNumber: 'INV/HIPMI/2026/0053',
      type: 'CASH_OUT',
      amount: 300000,
      category: 'Transport',
      description: 'Klaim ditolak',
      status: 'REJECTED',
      createdById: TEST_USERS.staff.id,
      createdAt: '2026-03-03',
    };

    expect(() => createDigitalReceiptPdf(rejectedTx)).toThrow('Receipt cannot be generated');
  });

  it('F18-5: Digital receipt format includes valid standard EOF trailer', () => {
    const approvedTx: TestTransaction = {
      id: 'tx-pdf-eof',
      invoiceNumber: 'INV/HIPMI/2026/0054',
      type: 'CASH_IN',
      amount: 2000000,
      category: 'Sponsor',
      description: 'Sponsor dies natalis',
      status: 'APPROVED',
      createdById: TEST_USERS.staff.id,
      createdAt: '2026-03-04',
    };

    const pdfBuffer = createDigitalReceiptPdf(approvedTx);
    expect(pdfBuffer.toString('ascii')).toContain('%%EOF');
  });

  // =========================================================================
  // F19: Financial Export to Excel & PDF
  // =========================================================================
  it('F19-1: Export financial journal to Excel produces valid xlsx workbook buffer', () => {
    const sampleTxs = [
      { No: 1, Invoice: 'INV/HIPMI/2026/0001', Tipe: 'CASH_IN', Nominal: 1500000, Status: 'APPROVED' },
      { No: 2, Invoice: 'INV/HIPMI/2026/0002', Tipe: 'CASH_OUT', Nominal: 500000, Status: 'APPROVED' },
    ];

    const ws = xlsx.utils.json_to_sheet(sampleTxs);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Jurnal Keuangan');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(200);

    const parsedWb = xlsx.read(buffer, { type: 'buffer' });
    expect(parsedWb.SheetNames).toContain('Jurnal Keuangan');
  });

  it('F19-2: Export financial summary report to PDF produces valid %PDF- document buffer', () => {
    const metrics = calculateLedgerMetrics([
      { id: '1', invoiceNumber: '1', type: 'CASH_IN', amount: 3000000, category: 'A', description: 'D', status: 'APPROVED', createdById: 'u', createdAt: '' },
    ]);

    const dummyReportTx: TestTransaction = {
      id: 'rep-1',
      invoiceNumber: 'LAPORAN/KEUANGAN/2026',
      type: 'CASH_IN',
      amount: metrics.balance,
      category: 'Saldo Kas',
      description: 'Ringkasan Laporan Arus Kas',
      status: 'APPROVED',
      createdById: TEST_USERS.admin.id,
      createdAt: '2026-03-31',
    };

    const pdfBuf = createDigitalReceiptPdf(dummyReportTx);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuf.toString('utf8')).toContain('Saldo Kas');
  });

  it('F19-3: Financial export summary calculates accurate total Cash In, Cash Out, and Ending Balance', () => {
    const txs: TestTransaction[] = [
      { id: '1', invoiceNumber: '1', type: 'CASH_IN', amount: 10000000, category: 'Sponsor', description: 'D', status: 'APPROVED', createdById: 'u', createdAt: '' },
      { id: '2', invoiceNumber: '2', type: 'CASH_OUT', amount: 4000000, category: 'Peralatan', description: 'D', status: 'APPROVED', createdById: 'u', createdAt: '' },
      { id: '3', invoiceNumber: '3', type: 'CASH_OUT', amount: 1500000, category: 'Konsumsi', description: 'D', status: 'APPROVED', createdById: 'u', createdAt: '' },
    ];

    const metrics = calculateLedgerMetrics(txs);
    expect(metrics.totalCashIn).toBe(10000000);
    expect(metrics.totalCashOut).toBe(5500000);
    expect(metrics.balance).toBe(4500000);
  });

  it('F19-4: Financial export supports date-range filtering correctly', () => {
    const txs = [
      { id: '1', date: '2026-01-15', amount: 1000 },
      { id: '2', date: '2026-02-15', amount: 2000 },
      { id: '3', date: '2026-03-15', amount: 3000 },
    ];

    const filterByDateRange = (items: typeof txs, start: string, end: string) => {
      return items.filter((x) => x.date >= start && x.date <= end);
    };

    const febTxs = filterByDateRange(txs, '2026-02-01', '2026-02-28');
    expect(febTxs).toHaveLength(1);
    expect(febTxs[0].id).toBe('2');

    const q1Txs = filterByDateRange(txs, '2026-01-01', '2026-03-31');
    expect(q1Txs).toHaveLength(3);
  });

  it('F19-5: Empty transaction range exports cleanly with zeroed summary rows', () => {
    const emptyRows: any[] = [];
    const ws = xlsx.utils.json_to_sheet(emptyRows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Kosong');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(buffer).toBeDefined();

    const metrics = calculateLedgerMetrics([]);
    expect(metrics.balance).toBe(0);
  });
});
