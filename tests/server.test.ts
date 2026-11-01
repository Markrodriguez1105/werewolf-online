import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createAppServer } from '../src/server/app.ts';
import type { Reply, RoomView, Session } from '../src/shared/protocol.ts';

async function setup(t: TestContext) {
  const server = createAppServer({ port: 0, host: '127.0.0.1', lanUrls: ['http://192.168.1.2:3000'] });
  const port = await server.listen();
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await server.close(); });
  const connect = async () => {
    const socket = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    const states: RoomView[] = [];
    socket.on('room:state', state => states.push(state));
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return { socket, states };
  };
  return { connect, port };
}
function emit(socket: Socket, event: string, payload: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    socket.timeout(2000).emit(event, payload, (error: Error | null, reply: Reply) => error ? reject(error) : resolve(reply));
  });
}
async function stateWhere(states: RoomView[], predicate: (s: RoomView) => boolean) {
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    const found = states.slice().reverse().find(predicate);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected room state was not received');
}

// Catches accidentally public session secrets and bypassed room/name validation.
test('room creation normalizes names and never broadcasts session tokens', async t => {
  const { connect, port } = await setup(t);
  const a = await connect();
  assert.equal((await emit(a.socket, 'room:create', { name: '\u0000bad' })).ok, false);
  const reply = await emit(a.socket, 'room:create', { name: '  Ada   Lovelace  ' });
  assert.equal(reply.ok, true);
  assert.match(reply.session!.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const state = await stateWhere(a.states, s => s.code === reply.session!.code);
  assert.equal(state.players[0].name, 'Ada Lovelace');
  assert.equal(state.hostId, reply.session!.playerId);
  assert.equal(JSON.stringify(state).includes(reply.session!.token), false);
  const network = await fetch(`http://127.0.0.1:${port}/api/network`).then(r => r.json());
  assert.deepEqual(network, { urls: ['http://192.168.1.2:3000'] });
  assert.deepEqual(await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.json()), { ok: true });
});

test('lobby rejects duplicate names, unauthorized settings and malformed actions', async t => {
  const { connect } = await setup(t);
  const a = await connect(), b = await connect();
  const session = (await emit(a.socket, 'room:create', { name: 'Ada' })).session!;
  assert.equal((await emit(b.socket, 'room:join', { code: session.code, name: ' ada ' })).ok, false);
  assert.equal((await emit(b.socket, 'room:join', { code: session.code.toLowerCase(), name: 'Ben' })).ok, true);
  assert.equal((await emit(b.socket, 'room:action', { type: 'settings', settings: { wolves: 1 } })).ok, false);
  assert.equal((await emit(a.socket, 'room:action', { type: 'settings', settings: { wolves: 99 } })).ok, false);
  assert.equal((await emit(a.socket, 'room:action', { type: 'settings', settings: { unexpected: true } })).ok, false);
  for (const payload of [null, {}, { type: 'ready', ready: 'yes' }, { type: 'night', targetId: 123 }]) {
    assert.equal((await emit(a.socket, 'room:action', payload)).ok, false);
  }
  assert.equal((await emit(a.socket, 'room:action', { type: 'start' })).ok, false);
});

test('resume requires the secret and replaces the previous connection', async t => {
  const { connect } = await setup(t);
  const a = await connect(), b = await connect();
  const session = (await emit(a.socket, 'room:create', { name: 'Ada' })).session!;
  assert.equal((await emit(b.socket, 'room:resume', { ...session, token: 'wrong' })).ok, false);
  const disconnected = new Promise(resolve => a.socket.once('disconnect', resolve));
  assert.equal((await emit(b.socket, 'room:resume', session)).ok, true);
  await disconnected;
  const state = await stateWhere(b.states, s => s.youId === session.playerId);
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].connected, true);
});

test('host transfers after disconnect and does not reclaim on resume', async t => {
  const { connect } = await setup(t);
  const a = await connect(), b = await connect();
  const oldHost = (await emit(a.socket, 'room:create', { name: 'Ada' })).session!;
  const newHost = (await emit(b.socket, 'room:join', { name: 'Ben', code: oldHost.code })).session!;
  a.socket.disconnect();
  await stateWhere(b.states, s => s.hostId === newHost.playerId);
  const c = await connect();
  assert.equal((await emit(c.socket, 'room:resume', oldHost)).ok, true);
  const state = await stateWhere(c.states, s => s.youId === oldHost.playerId);
  assert.equal(state.hostId, newHost.playerId);
});

test('leaving the lobby removes the seat and invalidates its session', async t => {
  const { connect } = await setup(t);
  const a = await connect(), b = await connect();
  const session = (await emit(a.socket, 'room:create', { name: 'Ada' })).session!;
  await emit(b.socket, 'room:join', { name: 'Ben', code: session.code });
  assert.equal((await emit(a.socket, 'room:action', { type: 'leave' })).ok, true);
  await stateWhere(b.states, s => s.players.length === 1 && s.players[0].name === 'Ben');
  assert.equal((await emit(a.socket, 'room:resume', session)).ok, false);
});

test('six ready players start with private roles and cannot bypass night or join midgame', async t => {
  const { connect } = await setup(t);
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  let host: Session | undefined;
  for (const name of ['Ada', 'Ben', 'Cleo', 'Dan', 'Eve', 'Flo']) {
    const client = await connect(); clients.push(client);
    const reply = await emit(client.socket, host ? 'room:join' : 'room:create', { name, code: host?.code });
    assert.equal(reply.ok, true); host ??= reply.session!;
  }
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'start' })).ok, false);
  for (const client of clients) await emit(client.socket, 'room:action', { type: 'ready', ready: true });
  assert.equal((await emit(clients[1].socket, 'room:action', { type: 'start' })).ok, false);
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'start' })).ok, true);
  for (const client of clients) {
    const state = await stateWhere(client.states, s => s.phase === 'reveal');
    assert.ok(state.ownRole);
    assert.equal(state.players.some(p => p.id !== state.youId && p.role !== undefined), false);
    assert.equal((await emit(client.socket, 'room:action', { type: 'acknowledge' })).ok, true);
  }
  for (const client of clients) await stateWhere(client.states, s => s.phase === 'night');
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'advance' })).ok, false);
  const extra = await connect();
  assert.equal((await emit(extra.socket, 'room:join', { name: 'Extra', code: host!.code })).ok, false);
});

test('disconnected lobby players block start and active-game leaves preserve seats for reconnection', async t => {
  const { connect } = await setup(t);
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  const sessions: Session[] = [];
  for (const name of ['Ada', 'Ben', 'Cleo', 'Dan', 'Eve', 'Flo']) {
    const c = await connect(); clients.push(c);
    const reply = await emit(c.socket, sessions.length ? 'room:join' : 'room:create', { name, code: sessions[0]?.code });
    sessions.push(reply.session!); await emit(c.socket, 'room:action', { type: 'ready', ready: true });
  }
  clients[5].socket.disconnect();
  await stateWhere(clients[0].states, s => s.players.length === 6 && s.players.some(p => p.id === sessions[5].playerId && !p.connected));
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'start' })).ok, false);
  const replacement = await connect();
  assert.equal((await emit(replacement.socket, 'room:resume', sessions[5])).ok, true);
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'start' })).ok, true);
  assert.equal((await emit(replacement.socket, 'room:action', { type: 'leave' })).ok, true);
  const state = await stateWhere(clients[0].states, s => s.phase === 'reveal' && s.players.some(p => p.id === sessions[5].playerId && !p.connected));
  assert.equal(state.players.length, 6);
  assert.equal((await emit(replacement.socket, 'room:resume', sessions[5])).ok, true);
});

test('rooms enforce the 16-player limit', async t => {
  const { connect } = await setup(t);
  const host = await connect();
  const session = (await emit(host.socket, 'room:create', { name: 'Host' })).session!;
  for (let i = 1; i < 16; i++) {
    const client = await connect();
    assert.equal((await emit(client.socket, 'room:join', { name: `Player ${i}`, code: session.code })).ok, true);
  }
  const extra = await connect();
  assert.equal((await emit(extra.socket, 'room:join', { name: 'Extra', code: session.code })).ok, false);
});

test('creation attempts are bounded per address', async t => {
  const { connect } = await setup(t);
  const client = await connect();
  let accepted = 0;
  for (let i = 0; i < 11; i++) {
    const result = await emit(client.socket, 'room:create', { name: `Host ${i}` });
    if (result.ok) { accepted++; await emit(client.socket, 'room:action', { type: 'leave' }); }
  }
  assert.equal(accepted, 10);
});

test('discovered LAN addresses include the actual assigned server port', async t => {
  const server = createAppServer({ host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const port = await server.listen();
  const network = await fetch(`http://127.0.0.1:${port}/api/network`).then(r => r.json()) as { urls: string[] };
  for (const url of network.urls) assert.equal(new URL(url).port, String(port));
});

test('a night action received after its deadline cannot change the resolved night', async t => {
  const { connect } = await setup(t);
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  let code: string | undefined;
  for (const name of ['Ada', 'Ben', 'Cleo', 'Dan', 'Eve', 'Flo']) {
    const c = await connect(); clients.push(c);
    const result = await emit(c.socket, code ? 'room:join' : 'room:create', { name, code });
    code ??= result.session!.code;
    await emit(c.socket, 'room:action', { type: 'ready', ready: true });
  }
  await emit(clients[0].socket, 'room:action', { type: 'settings', settings: { nightSeconds: 10 } });
  await emit(clients[0].socket, 'room:action', { type: 'start' });
  for (const c of clients) await emit(c.socket, 'room:action', { type: 'acknowledge' });
  const views = await Promise.all(clients.map(c => stateWhere(c.states, s => s.phase === 'night')));
  const wolfIndex = views.findIndex(s => s.ownRole === 'werewolf');
  const wolf = views[wolfIndex];
  const target = wolf.players.find(p => p.id !== wolf.youId)!;
  const originalNow = Date.now;
  const offset = wolf.deadline! - originalNow() + 1;
  try {
    Date.now = () => originalNow() + offset;
    const result = await emit(clients[wolfIndex].socket, 'room:action', { type: 'night', targetId: target.id });
    assert.equal(result.ok, false, JSON.stringify(result));
    const morning = await stateWhere(clients[wolfIndex].states, s => s.phase === 'morning');
    assert.deepEqual(morning.lastEliminated, []);
  } finally { Date.now = originalNow; }
});

test('only the host can remove disconnected lobby seats and removed sessions cannot resume', async t => {
  const { connect } = await setup(t);
  const a = await connect(), b = await connect(), c = await connect();
  const host = (await emit(a.socket, 'room:create', { name: 'Ada' })).session!;
  const guest = (await emit(b.socket, 'room:join', { name: 'Ben', code: host.code })).session!;
  await emit(c.socket, 'room:join', { name: 'Cleo', code: host.code });
  assert.equal((await emit(a.socket, 'room:action', { type: 'remove', playerId: guest.playerId })).ok, false);
  b.socket.disconnect();
  await stateWhere(a.states, s => s.players.some(p => p.id === guest.playerId && !p.connected));
  assert.equal((await emit(c.socket, 'room:action', { type: 'remove', playerId: guest.playerId })).ok, false);
  assert.equal((await emit(a.socket, 'room:action', { type: 'remove', playerId: guest.playerId })).ok, true);
  await stateWhere(a.states, s => s.players.length === 2 && s.players.every(p => p.id !== guest.playerId));
  const replacement = await connect();
  assert.equal((await emit(replacement.socket, 'room:resume', guest)).ok, false);
});

test('host can reset a stalled reveal to a clean lobby while guests cannot', async t => {
  const { connect } = await setup(t);
  const clients: Awaited<ReturnType<typeof connect>>[] = [];
  const sessions: Session[] = [];
  for (const name of ['Ada', 'Ben', 'Cleo', 'Dan', 'Eve', 'Flo']) {
    const c = await connect(); clients.push(c);
    sessions.push((await emit(c.socket, sessions.length ? 'room:join' : 'room:create', { name, code: sessions[0]?.code })).session!);
    await emit(c.socket, 'room:action', { type: 'ready', ready: true });
  }
  await emit(clients[0].socket, 'room:action', { type: 'start' });
  clients[5].socket.disconnect();
  await stateWhere(clients[0].states, s => s.phase === 'reveal' && s.players.some(p => !p.connected));
  assert.equal((await emit(clients[1].socket, 'room:action', { type: 'reset' })).ok, false);
  assert.equal((await emit(clients[0].socket, 'room:action', { type: 'reset' })).ok, true);
  const lobby = await stateWhere(clients[0].states, s => s.phase === 'lobby' && s.players.length === 5);
  assert.equal(lobby.players.some(p => p.ready || p.role !== undefined), false);
  assert.equal(lobby.ownRole, undefined);
  const replacement = await connect();
  assert.equal((await emit(replacement.socket, 'room:resume', sessions[5])).ok, false);
});
