import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler } from '../lib/async.js';
import { hashPassword, passwordIssues, verifyPassword } from '../lib/password.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from '../lib/tokens.js';
import { badRequest, unauthorized } from '../http/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

export const authRouter = Router();

// Freia forca bruta sem atrapalhar o uso normal.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Muitas tentativas. Aguarde alguns minutos.' } },
});

const registerSchema = z.object({
  name: z.string().min(2, 'Informe seu nome.').max(120),
  email: z.string().email('E-mail invalido.').toLowerCase(),
  password: z.string().min(8, 'Minimo de 8 caracteres.'),
});

const loginSchema = z.object({
  email: z.string().email('E-mail invalido.').toLowerCase(),
  password: z.string().min(1, 'Informe a senha.'),
});

const publicUser = (u: { id: string; name: string; email: string; role: string; createdAt: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
});

authRouter.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body as z.infer<typeof registerSchema>;

    const issue = passwordIssues(password);
    if (issue) throw badRequest(issue, 'weak_password');

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw badRequest('Ja existe uma conta com este e-mail.', 'email_taken');

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });

    const access = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refresh = await issueRefreshToken(user.id);
    setAuthCookies(res, access, refresh.token, refresh.expiresAt);

    res.status(201).json({ user: publicUser(user), accessToken: access });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });

    // Mesma mensagem para e-mail inexistente e senha errada: nao entregamos
    // ao atacante a informacao de quais e-mails estao cadastrados.
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('E-mail ou senha incorretos.');
    }

    const access = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refresh = await issueRefreshToken(user.id);
    setAuthCookies(res, access, refresh.token, refresh.expiresAt);

    res.json({ user: publicUser(user), accessToken: access });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('Sessao expirada.');

    const rotated = await rotateRefreshToken(token);
    if (!rotated) {
      clearAuthCookies(res);
      throw unauthorized('Sessao expirada. Faca login novamente.');
    }

    const access = signAccessToken({
      sub: rotated.user.id,
      email: rotated.user.email,
      role: rotated.user.role,
    });
    setAuthCookies(res, access, rotated.refresh.token, rotated.refresh.expiresAt);
    res.json({ user: publicUser(rotated.user), accessToken: access });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (token) await revokeRefreshToken(token);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { addresses: true },
    });
    if (!user) throw unauthorized();
    res.json({ user: { ...publicUser(user), addresses: user.addresses } });
  }),
);

const addressSchema = z.object({
  label: z.string().max(40).default('Principal'),
  recipient: z.string().min(2),
  line1: z.string().min(3),
  line2: z.string().optional(),
  district: z.string().min(2),
  city: z.string().min(2),
  state: z.string().length(2, 'Use a sigla do estado (ex.: SP).'),
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP invalido.'),
  country: z.string().default('BR'),
  phone: z.string().optional(),
  isDefault: z.boolean().default(false),
});

authRouter.post(
  '/addresses',
  requireAuth,
  validate(addressSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof addressSchema>;
    const userId = req.user!.sub;
    if (data.isDefault) {
      await prisma.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({ data: { ...data, userId } });
    res.status(201).json({ address });
  }),
);

authRouter.delete(
  '/addresses/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.address.deleteMany({ where: { id: req.params.id, userId: req.user!.sub } });
    res.json({ ok: true });
  }),
);

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post(
  '/change-password',
  requireAuth,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof passwordSchema>;
    const issue = passwordIssues(newPassword);
    if (issue) throw badRequest(issue, 'weak_password');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest('Senha atual incorreta.', 'wrong_password');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    // Trocar a senha derruba as outras sessoes.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearAuthCookies(res);
    res.json({ ok: true, message: 'Senha alterada. Entre novamente.' });
  }),
);
