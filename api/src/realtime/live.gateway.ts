import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { TokenService } from '../application/auth.ports';
import { OrderRepository } from '../application/order-repository';
import { EventBus } from './event-bus';

export const LIVE_PATH = '/live';
/** Close code for a missing or invalid token. */
export const CLOSE_UNAUTHORIZED = 4401;
const HEARTBEAT_MS = 25_000;

/**
 * WebSocket endpoint at /live?token=<jwt>. Sends `{ type: 'hello', lastSeq }` on connect, then every
 * event from the bus. Clients catch up through GET /events?after=<lastSeq> after a reconnect.
 */
@Injectable()
export class LiveGateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LiveGateway.name);
  private server: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly alive = new WeakSet<WebSocket>();

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly tokens: TokenService,
    private readonly orders: OrderRepository,
    private readonly bus: EventBus,
  ) {}

  onApplicationBootstrap(): void {
    const httpServer: Server = this.adapterHost.httpAdapter.getHttpServer();
    this.server = new WebSocketServer({ server: httpServer, path: LIVE_PATH });
    this.server.on('connection', (socket, request) => void this.accept(socket, request));
    this.bus.onMessage((message) => this.broadcast(message));
    this.heartbeat = setInterval(() => this.checkAlive(), HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.server?.clients.forEach((socket) => socket.terminate());
    this.server?.close();
  }

  private async accept(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const token = new URL(request.url ?? '', 'http://localhost').searchParams.get('token');
    const actor = token ? await this.tokens.verify(token) : null;
    if (!actor) {
      socket.close(CLOSE_UNAUTHORIZED, 'SESSION_INVALID');
      return;
    }

    this.alive.add(socket);
    socket.on('pong', () => this.alive.add(socket));
    socket.on('error', (error) => this.logger.warn(`Socket error: ${error.message}`));
    try {
      socket.send(JSON.stringify({ type: 'hello', lastSeq: await this.orders.lastSeq() }));
    } catch (error) {
      this.logger.warn(`Hello failed: ${String(error)}`);
      socket.close(1011, 'unavailable');
    }
  }

  private broadcast(message: string): void {
    this.server?.clients.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN && this.alive.has(socket)) {
        socket.send(message);
      }
    });
  }

  /** Drops sockets that did not answer the last ping; the client reconnects and catches up. */
  private checkAlive(): void {
    this.server?.clients.forEach((socket) => {
      if (!this.alive.has(socket)) {
        socket.terminate();
        return;
      }
      this.alive.delete(socket);
      socket.ping();
    });
  }
}
