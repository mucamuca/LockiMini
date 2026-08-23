import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from './env.js';
import { ACCESS_COOKIE, verifyAccessToken, type JwtPayload } from './lib/tokens.js';

export type StockEvent = {
  productId: string;
  sku: string;
  available: number;
  quantity: number;
  reserved: number;
  lowStock: boolean;
  outOfStock: boolean;
};

let io: IOServer | null = null;

const ROOM_CATALOG = 'catalog';
const ROOM_ADMIN = 'admin';
const userRoom = (id: string) => `user:${id}`;

function readHandshakeUser(socket: Socket): JwtPayload | null {
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const fromCookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ACCESS_COOKIE}=`))
    ?.split('=')[1];
  const token = fromAuth ?? (fromCookie ? decodeURIComponent(fromCookie) : undefined);
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

export function initRealtime(server: HttpServer) {
  io = new IOServer(server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    path: '/realtime',
  });

  io.on('connection', (socket) => {
    // Todo mundo acompanha o estoque do catalogo — e informacao publica.
    socket.join(ROOM_CATALOG);

    const user = readHandshakeUser(socket);
    if (user) {
      socket.join(userRoom(user.sub));
      if (user.role === 'ADMIN') socket.join(ROOM_ADMIN);
    }
    socket.emit('ready', { authenticated: Boolean(user), role: user?.role ?? null });
  });

  return io;
}

/** Estoque mudou: catalogo inteiro recebe. Admin recebe alerta de nivel baixo. */
export function emitStock(event: StockEvent) {
  if (!io) return;
  io.to(ROOM_CATALOG).emit('stock:update', event);
  if (event.lowStock || event.outOfStock) io.to(ROOM_ADMIN).emit('stock:low', event);
}

export function emitStockBatch(events: StockEvent[]) {
  for (const e of events) emitStock(e);
}

export function emitOrderCreated(payload: unknown, userId?: string | null) {
  if (!io) return;
  io.to(ROOM_ADMIN).emit('order:created', payload);
  if (userId) io.to(userRoom(userId)).emit('order:created', payload);
}

export function emitOrderUpdated(payload: { id: string; status: string; number: string }, userId?: string | null) {
  if (!io) return;
  io.to(ROOM_ADMIN).emit('order:updated', payload);
  if (userId) io.to(userRoom(userId)).emit('order:updated', payload);
}
