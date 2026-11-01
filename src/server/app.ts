import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { acknowledgeRole, advance, createGame, submitNightAction, submitVote, submitWitchAction, viewForPlayer } from '../game/engine.ts';
import { DEFAULT_SETTINGS, type Action, type Ack, type ClientToServerEvents, type GameState, type PlayerIdentity, type RoomView, type ServerToClientEvents, type Session, type Settings } from '../shared/protocol.ts';

type Player = PlayerIdentity & { token: string; socketId?: string };
type Room = { code: string; hostId: string; players: Player[]; settings: Settings; game?: GameState; touchedAt: number };
type Connection = Socket<ClientToServerEvents, ServerToClientEvents>;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const IDLE_MS = 30 * 60_000;
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid request');
}
function nameOf(value: unknown): string {
  assert(typeof value === 'string' && !/[\x00-\x1f\x7f-\x9f]/.test(value), 'Use a name without control characters');
  const name = value.trim().replace(/\s+/g, ' ');
  assert(name.length >= 1 && name.length <= 20, 'Name must be 1–20 characters');
  return name;
}
function codeOf(value: unknown): string {
  assert(typeof value === 'string', 'Enter a room code');
  const code = value.trim().toUpperCase();
  assert(/^[A-HJ-NP-Z2-9]{6}$/.test(code), 'Enter a valid six-character room code');
  return code;
}
function validateSettings(input: unknown, current: Settings): Settings {
  object(input);
  const allowed = ['mode', 'wolves', 'guard', 'discussionSeconds', 'nightSeconds', 'voteSeconds'];
  assert(Object.keys(input).length > 0 && Object.keys(input).every(key => allowed.includes(key)), 'Invalid settings');
  const settings = { ...current, ...input } as Settings;
  assert(['classic', 'no-seer', 'infected', 'secret-pact'].includes(settings.mode), 'Choose a supported game mode');
  assert(Number.isInteger(settings.wolves) && settings.wolves >= 1 && settings.wolves <= 4, 'Choose 1–4 werewolves');
  assert(typeof settings.guard === 'boolean', 'Invalid guard setting');
  for (const [key, min, max] of [['discussionSeconds', 15, 900], ['nightSeconds', 10, 300], ['voteSeconds', 10, 300]] as const) {
    assert(Number.isInteger(settings[key]) && settings[key] >= min && settings[key] <= max, `${key} must be ${min}–${max} seconds`);
  }
  return settings;
}

export function createAppServer(options: { port?: number; host?: string; dev?: boolean; lanUrls?: string[] } = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { maxHttpBufferSize: 8192 });
  const rooms = new Map<string, Room>();
  const attempts = new Map<string, { count: number; until: number }>();
  let lanUrls = options.lanUrls ?? [];
  let vite: Awaited<ReturnType<typeof import('vite')['createServer']>> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let listening = false;
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => response.json({ ok: true }));
  app.get('/api/network', (_request, response) => response.json({ urls: lanUrls }));

  function limited(key: string, max: number, window = 60_000) {
    const now = Date.now();
    let bucket = attempts.get(key);
    if (!bucket || now >= bucket.until) {
      // Bound address buckets too; excess distinct addresses wait for cleanup.
      assert(attempts.size < 2048 || attempts.has(key), 'Server is busy. Try again shortly.');
      bucket = { count: 0, until: now + window }; attempts.set(key, bucket);
    }
    assert(++bucket.count <= max, 'Too many requests. Try again shortly.');
  }
  function preset(room: Room) {
    room.settings.wolves = room.players.length < 8 ? 1 : room.players.length < 12 ? 2 : 3;
  }
  function transferHost(room: Room) {
    if (!room.players.find(player => player.id === room.hostId)?.connected) {
      room.hostId = room.players.find(player => player.connected)?.id
        ?? (room.players.some(player => player.id === room.hostId) ? room.hostId : room.players[0]?.id ?? '');
    }
  }
  function syncGame(room: Room) {
    if (room.game) for (const player of room.game.players) {
      const seat = room.players.find(seat => seat.id === player.id);
      player.connected = seat?.connected ?? false;
      player.ready = seat?.ready ?? false;
    }
  }
  function broadcast(room: Room) {
    syncGame(room);
    for (const player of room.players) {
      if (!player.socketId) continue;
      const base = room.game ? viewForPlayer(room.game, player.id) : {
        phase: 'lobby' as const, round: 0,
        players: room.players.map(({ id, name, connected, ready }) => ({ id, name, connected, ready, alive: true })),
        settings: { ...room.settings }, deadline: null, winner: null, events: [], investigations: [],
        hasSubmitted: false, hasAcknowledged: false, runoffCandidates: null, voteTally: null, lastEliminated: [],
      };
      const view: RoomView = { ...base, code: room.code, hostId: room.hostId, youId: player.id, lanUrls };
      io.to(player.socketId).emit('room:state', view);
    }
  }
  function attached(socket: Connection): { room: Room; player: Player } {
    const session = socket.data.session as Session | undefined;
    const room = session && rooms.get(session.code);
    const player = room?.players.find(player => player.id === session!.playerId);
    assert(room && player && player.socketId === socket.id, 'Join or reconnect to a room first');
    return { room, player };
  }
  function detach(socket: Connection, leave: boolean) {
    let room: Room, player: Player;
    try { ({ room, player } = attached(socket)); } catch { return; }
    player.connected = false; player.socketId = undefined;
    if (leave && !room.game) {
      room.players = room.players.filter(p => p.id !== player.id); preset(room);
    }
    socket.data.session = undefined;
    transferHost(room); room.touchedAt = Date.now();
    if (!room.players.length) rooms.delete(room.code); else broadcast(room);
  }
  function attach(socket: Connection, room: Room, player: Player): Session {
    const previous = player.socketId;
    const session = { code: room.code, playerId: player.id, token: player.token };
    player.socketId = socket.id; player.connected = true; socket.data.session = session;
    // Replace before disconnect so the stale connection cannot detach the new one.
    if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.disconnect(true);
    transferHost(room); room.touchedAt = Date.now(); broadcast(room);
    return session;
  }
  function addPlayer(socket: Connection, room: Room, name: string) {
    assert(!room.game, 'This game has started. Join after the rematch.');
    assert(room.players.length < 16, 'This room is full');
    assert(!room.players.some(p => p.name.toLowerCase() === name.toLowerCase()), 'That name is already in use');
    const player: Player = { id: randomBytes(12).toString('hex'), token: randomBytes(24).toString('hex'), name, connected: false, ready: false };
    room.players.push(player); preset(room);
    return attach(socket, room, player);
  }
  function resetLobby(room: Room) {
    room.game = undefined;
    room.players = room.players.filter(player => player.connected);
    room.players.forEach(player => { player.ready = false; });
    preset(room); transferHost(room);
  }
  function action(socket: Connection, payload: unknown) {
    object(payload);
    assert(typeof payload.type === 'string', 'Invalid action');
    const { room, player } = attached(socket);
    const request = payload as unknown as Action;
    const now = Date.now();
    if (room.game?.deadline && now >= room.game.deadline && request.type !== 'leave' && request.type !== 'reset') {
      advance(room.game, now); room.touchedAt = now; broadcast(room);
      // Reject the original action: a vote for the expired ballot must not enter its runoff.
      throw new Error('That phase has ended. Review the current phase and try again.');
    }
    const host = () => assert(room.hostId === player.id, 'Only the host can do that');
    const lobby = () => assert(!room.game, 'This action is only available in the lobby');
    const game = () => { assert(room.game, 'The game has not started'); return room.game; };
    switch (request.type) {
      case 'ready':
        lobby(); assert(typeof request.ready === 'boolean', 'Invalid ready state'); player.ready = request.ready; break;
      case 'settings':
        host(); lobby(); room.settings = validateSettings(request.settings, room.settings); break;
      case 'start':
        host(); lobby();
        assert(room.players.length >= 6 && room.players.length <= 16, 'A game needs 6–16 players');
        assert(room.players.every(p => p.connected && p.ready), 'Every player must be connected and ready');
        room.game = createGame(room.players.map(({ id, name, connected, ready }) => ({ id, name, connected, ready })), room.settings); break;
      case 'acknowledge': acknowledgeRole(game(), player.id); break;
      case 'night':
        assert(typeof request.targetId === 'string' && request.targetId.length <= 64, 'Invalid target');
        assert(request.kind === undefined || request.kind === 'kill' || request.kind === 'infect', 'Invalid wolf action');
        submitNightAction(game(), player.id, request.targetId, request.kind); break;
      case 'witch': {
        object(request.choice);
        assert(Object.keys(request.choice).length === 2
          && Object.keys(request.choice).every(key => key === 'heal' || key === 'poisonTargetId'), 'Invalid Witch choice');
        assert(typeof request.choice.heal === 'boolean', 'Invalid healing choice');
        assert(request.choice.poisonTargetId === null || (typeof request.choice.poisonTargetId === 'string'
          && request.choice.poisonTargetId.length > 0 && request.choice.poisonTargetId.length <= 64), 'Invalid poison target');
        submitWitchAction(game(), player.id, request.choice); break;
      }
      case 'vote':
        assert(typeof request.targetId === 'string' && request.targetId.length <= 64, 'Invalid target');
        submitVote(game(), player.id, request.targetId); break;
      case 'advance':
        host(); assert(['morning', 'discussion'].includes(game().phase), 'Wait for the current phase to finish'); advance(game()); break;
      case 'rematch':
        host(); assert(game().phase === 'ended', 'Finish the game first'); resetLobby(room); break;
      case 'reset':
        host(); game(); resetLobby(room); break;
      case 'remove': {
        host(); lobby();
        assert(typeof request.playerId === 'string' && request.playerId.length <= 64, 'Invalid player');
        const target = room.players.find(player => player.id === request.playerId);
        assert(target && !target.connected, 'Only disconnected lobby players can be removed');
        room.players = room.players.filter(player => player.id !== target.id); preset(room); break;
      }
      case 'leave': detach(socket, true); return;
      default: throw new Error('Unknown action');
    }
    room.touchedAt = Date.now(); broadcast(room);
  }
  io.on('connection', socket => {
    const handle = (ack: Ack, operation: () => Session | void) => {
      try {
        limited(`socket:${socket.id}`, 120, 10_000);
        const session = operation();
        if (typeof ack === 'function') ack({ ok: true, ...(session ? { session } : {}) });
      } catch (error) {
        if (typeof ack === 'function') ack({ ok: false, error: error instanceof Error ? error.message : 'Request failed' });
      }
    };
    socket.on('room:create', (payload, ack) => handle(ack, () => {
      limited(`create:${socket.handshake.address}`, 10);
      assert(!socket.data.session, 'Leave your current room first');
      object(payload); const name = nameOf(payload.name);
      assert(rooms.size < 100, 'Server has reached its room limit');
      let code: string;
      do { code = Array.from(randomBytes(6), byte => ALPHABET[byte % ALPHABET.length]).join(''); } while (rooms.has(code));
      const room: Room = { code, hostId: '', players: [], settings: { ...DEFAULT_SETTINGS }, touchedAt: Date.now() };
      rooms.set(code, room); return addPlayer(socket, room, name);
    }));
    socket.on('room:join', (payload, ack) => handle(ack, () => {
      limited(`join:${socket.handshake.address}`, 60);
      assert(!socket.data.session, 'Leave your current room first');
      object(payload); const name = nameOf(payload.name), code = codeOf(payload.code);
      const room = rooms.get(code); assert(room, 'Room not found. Check the code or create a new room.');
      return addPlayer(socket, room, name);
    }));
    socket.on('room:resume', (payload, ack) => handle(ack, () => {
      limited(`resume:${socket.handshake.address}`, 60);
      object(payload);
      const code = codeOf(payload.code);
      assert(typeof payload.playerId === 'string' && typeof payload.token === 'string' && /^[a-f0-9]{48}$/.test(payload.token), 'Invalid session. Join again.');
      const room = rooms.get(code), player = room?.players.find(p => p.id === payload.playerId);
      assert(room && player && timingSafeEqual(Buffer.from(player.token), Buffer.from(payload.token)), 'Session expired. Join or create a room again.');
      const current = socket.data.session as Session | undefined;
      assert(!current || (current.code === code && current.playerId === player.id), 'Leave your current room first');
      return attach(socket, room, player);
    }));
    socket.on('room:action', (payload, ack) => handle(ack, () => action(socket, payload)));
    socket.on('disconnect', () => detach(socket, false));
  });
  function tick() {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.players.some(p => p.connected) && now - room.touchedAt > IDLE_MS) { rooms.delete(code); continue; }
      if (room.game?.deadline && now >= room.game.deadline) {
        advance(room.game, now); broadcast(room);
      }
    }
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  }
  return {
    httpServer, io,
    async listen() {
      assert(!listening, 'Server already listening');
      if (options.dev) {
        const { createServer: createViteServer } = await import('vite');
        vite = await createViteServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
        app.use(vite.middlewares);
      } else {
        app.use(express.static(path.resolve('dist')));
        app.get('/{*path}', (_request, response) => response.sendFile(path.resolve('dist/index.html')));
      }
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(options.port ?? 3000, options.host ?? '0.0.0.0', () => { httpServer.off('error', reject); resolve(); });
      });
      listening = true;
      const address = httpServer.address(); assert(address && typeof address !== 'string', 'No server address');
      if (!options.lanUrls) {
        const ips = Object.values(networkInterfaces()).flat().filter(address => address && address.family === 'IPv4' && !address.internal);
        lanUrls = ips.map(ip => `http://${ip!.address}:${address.port}`);
      }
      timer = setInterval(tick, 250); timer.unref();
      return address.port;
    },
    async close() {
      if (timer) clearInterval(timer);
      await vite?.close();
      await new Promise<void>(resolve => io.close(() => resolve()));
      if (httpServer.listening) await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
      listening = false;
    },
  };
}
