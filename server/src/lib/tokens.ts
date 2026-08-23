import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProd } from '../env.js';
import { prisma } from '../db.js';

export type JwtPayload = { sub: string; email: string; role: 'CUSTOMER' | 'ADMIN' };

export const ACCESS_COOKIE = 'lk_access';
export const REFRESH_COOKIE = 'lk_refresh';
export const CART_COOKIE = 'lk_cart';

export function signAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export async function issueRefreshToken(userId: string) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TTL_DAYS * 864e5);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

export async function rotateRefreshToken(oldToken: string) {
  const found = await prisma.refreshToken.findUnique({ where: { token: oldToken }, include: { user: true } });
  if (!found || found.revokedAt || found.expiresAt < new Date() || !found.user.active) return null;
  await prisma.refreshToken.update({ where: { id: found.id }, data: { revokedAt: new Date() } });
  const fresh = await issueRefreshToken(found.userId);
  return { user: found.user, refresh: fresh };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({ where: { token, revokedAt: null }, data: { revokedAt: new Date() } });
}

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  domain: env.COOKIE_DOMAIN,
  path: '/',
};

export function setAuthCookies(res: Response, access: string, refresh: string, refreshExpires: Date) {
  res.cookie(ACCESS_COOKIE, access, { ...baseCookie, maxAge: 1000 * 60 * 30 });
  res.cookie(REFRESH_COOKIE, refresh, { ...baseCookie, expires: refreshExpires });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, baseCookie);
}

export function setCartCookie(res: Response, token: string) {
  res.cookie(CART_COOKIE, token, { ...baseCookie, httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 60 });
}
