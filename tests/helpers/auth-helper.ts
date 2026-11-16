import crypto from 'node:crypto';

export type RoleType = 'admin' | 'topman' | 'kabid' | 'kadiv' | 'staff' | 'kader_1';

export interface AuthUser {
  id: string;
  nim: string;
  fullName: string;
  name?: string;
  roleId: string;
  roleCode: RoleType;
  roleName: string;
  status: 'Aktif' | 'Non-Aktif' | 'Alumni';
  totalScore: number;
  fakultas: string;
  prodi: string;
}

export const TEST_USERS: Record<RoleType, AuthUser> = {
  admin: {
    id: '11111111-1111-1111-1111-111111111111',
    nim: '1301210001',
    fullName: 'Super Admin HIPMI',
    name: 'Super Admin HIPMI',
    roleId: 'r1111111-1111-1111-1111-111111111111',
    roleCode: 'admin',
    roleName: 'Admin',
    status: 'Aktif',
    totalScore: 1000,
    fakultas: 'FIF',
    prodi: 'S1 Informatika',
  },
  topman: {
    id: '22222222-2222-2222-2222-222222222222',
    nim: '1301210002',
    fullName: 'Ketua Umum Topman',
    name: 'Ketua Umum Topman',
    roleId: 'r2222222-2222-2222-2222-222222222222',
    roleCode: 'topman',
    roleName: 'Topman',
    status: 'Aktif',
    totalScore: 850,
    fakultas: 'FRI',
    prodi: 'S1 Teknik Industri',
  },
  kabid: {
    id: '33333333-3333-3333-3333-333333333333',
    nim: '1301210003',
    fullName: 'Kepala Bidang OKK',
    name: 'Kepala Bidang OKK',
    roleId: 'r3333333-3333-3333-3333-333333333333',
    roleCode: 'kabid',
    roleName: 'Kabid',
    status: 'Aktif',
    totalScore: 600,
    fakultas: 'FEB',
    prodi: 'S1 Manajemen Bisnis Telekomunikasi & Informatika',
  },
  kadiv: {
    id: '44444444-4444-4444-4444-444444444444',
    nim: '1301210004',
    fullName: 'Kepala Divisi Internal',
    name: 'Kepala Divisi Internal',
    roleId: 'r4444444-4444-4444-4444-444444444444',
    roleCode: 'kadiv',
    roleName: 'Kadiv',
    status: 'Aktif',
    totalScore: 450,
    fakultas: 'FTE',
    prodi: 'S1 Teknik Telekomunikasi',
  },
  staff: {
    id: '55555555-5555-5555-5555-555555555555',
    nim: '1301210005',
    fullName: 'Staff Operasional',
    name: 'Staff Operasional',
    roleId: 'r5555555-5555-5555-5555-555555555555',
    roleCode: 'staff',
    roleName: 'Staff',
    status: 'Aktif',
    totalScore: 200,
    fakultas: 'FIK',
    prodi: 'S1 Desain Komunikasi Visual',
  },
  kader_1: {
    id: '66666666-6666-6666-6666-666666666666',
    nim: '1301210006',
    fullName: 'Kader Tingkat 1',
    name: 'Kader Tingkat 1',
    roleId: 'r6666666-6666-6666-6666-666666666666',
    roleCode: 'kader_1',
    roleName: 'Kader 1',
    status: 'Aktif',
    totalScore: 50,
    fakultas: 'FIT',
    prodi: 'D3 Sistem Informasi',
  },
};

export const DEFAULT_JWT_SECRET = process.env.JWT_SECRET || 'hipmi-secret-key-2024';

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function createTestToken(
  userOrRole: RoleType | Partial<AuthUser>,
  options?: { secret?: string; expiresIn?: number }
): string {
  const secret = options?.secret || DEFAULT_JWT_SECRET;
  const expiresIn = options?.expiresIn ?? 86400; // 24 hours default

  const user: AuthUser =
    typeof userOrRole === 'string'
      ? TEST_USERS[userOrRole] || {
          ...TEST_USERS.kader_1,
          roleCode: userOrRole as RoleType,
          roleName: userOrRole,
        }
      : {
          ...TEST_USERS[userOrRole.roleCode || 'kader_1'],
          ...userOrRole,
        };

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    id: user.id,
    nim: user.nim,
    fullName: user.fullName,
    name: user.name || user.fullName,
    roleId: user.roleId,
    roleCode: user.roleCode,
    roleName: user.roleName,
    fakultas: user.fakultas,
    prodi: user.prodi,
    status: user.status,
    totalScore: user.totalScore,
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${message}.${encodedSignature}`;
}

export function getAuthHeaders(
  userOrRole: RoleType | Partial<AuthUser>,
  options?: { secret?: string }
): { Authorization: string } {
  const token = createTestToken(userOrRole, options);
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function decodeToken(token: string): { header: any; payload: any; signature: string } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  return { header, payload, signature: parts[2] };
}

export function verifyToken(
  token: string,
  secret: string = DEFAULT_JWT_SECRET
): { valid: boolean; payload?: any; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed token' };
    }
    const message = `${parts[0]}.${parts[1]}`;
    const expectedSignature = base64UrlEncode(
      crypto.createHmac('sha256', secret).update(message).digest()
    );

    if (parts[2] !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired', payload };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}
