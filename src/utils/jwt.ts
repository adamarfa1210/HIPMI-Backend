import { SignJWT, jwtVerify } from "jose";

export const getJwtSecret = (): Uint8Array => {
  const secretString =
    process.env.JWT_SECRET || "hipmi-secret-key-2024";
  return new TextEncoder().encode(secretString);
};

export const DEFAULT_EXPIRATION = process.env.JWT_EXPIRES_IN || "7d";

export interface TokenPayload {
  sub: string; // Kader UUID
  id?: string;
  nim: string;
  fullName?: string;
  name?: string;
  roleId: string;
  roleName: string;
  roleCode?: string;
  fakultas?: string;
  prodi?: string;
  status?: string;
  totalScore?: number;
  [key: string]: unknown;
}

export async function signAccessToken(
  payload: TokenPayload,
  expiresIn = DEFAULT_EXPIRATION
): Promise<string> {
  const secret = getJwtSecret();
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch (error) {
    return null;
  }
}
