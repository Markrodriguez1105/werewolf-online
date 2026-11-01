import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createAppServer } from '../src/server/app.ts';
import type { Action, Reply, RoomView, Session } from '../src/shared/protocol.ts';

// Catches a working engine becoming a broken match through timer/event/privacy integration.
test('six clients complete a protected night, private Seer check, village victory and rematch', { timeout: 25000 }, async t => {
  const server = createAppServer({ port: 0, host: '127.0.0.1' });
  const port = await server.listen();
  const clients: { socket: Socket; state?: RoomView; session?: Session }[] = [];
  t.after(async () => { clients.forEach(c => c.socket.disconnect()); await server.close(); });
  async function request(client: typeof clients[number], event: string, payload: unknown): Promise<Reply> {
    const reply = await new Promise<Reply>((resolve, reject) => client.socket.timeout(2000).emit(event, payload, (error: Error | null, result: Reply) => error ? reject(error) : resolve(result)));
    assert.equal(reply.ok, true, reply.error);
    return reply;
  }
  async function action(client: typeof clients[number], value: Action) { return request(client, 'room:action', value); }
  async function until(predicate: () => boolean, timeout = 2000) {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (Date.now() >= deadline) assert.fail('Match did not reach its expected state');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  for (const name of ['Mira', 'Sol', 'Luna', 'Ash', 'Fern', 'Wren']) {
    const socket = io(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
    const client: typeof clients[number] = { socket }; clients.push(client);
    socket.on('room:state', state => { client.state = state; });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    client.session = (await request(client, clients.length === 1 ? 'room:create' : 'room:join', { name, code: clients[0].session?.code })).session;
  }
  const host = clients[0];
  await action(host, { type: 'settings', settings: { wolves: 1, guard: true, nightSeconds: 10, discussionSeconds: 15, voteSeconds: 10 } });
  for (const c of clients) await action(c, { type: 'ready', ready: true });
  await action(host, { type: 'start' });
  await until(() => clients.every(c => c.state?.phase === 'reveal'));
  const wolf = clients.find(c => c.state!.ownRole === 'werewolf')!;
  const seer = clients.find(c => c.state!.ownRole === 'seer')!;
  const guard = clients.find(c => c.state!.ownRole === 'guard')!;
  const victim = clients.find(c => c.state!.ownRole === 'villager')!;
  assert.ok(wolf && seer && guard && victim);
  for (const c of clients) await action(c, { type: 'acknowledge' });
  await until(() => clients.every(c => c.state?.phase === 'night'));
  await action(wolf, { type: 'night', targetId: victim.session!.playerId });
  await action(guard, { type: 'night', targetId: victim.session!.playerId });
  await action(seer, { type: 'night', targetId: wolf.session!.playerId });
  await until(() => wolf.state?.hasSubmitted === true);
  assert.equal(host.state!.phase, 'night');
  assert.deepEqual(seer.state!.investigations, []);
  assert.equal(victim.state!.wolfSelections, undefined);
  assert.equal(victim.state!.players.find(p => p.id === wolf.session!.playerId)?.role, undefined);
  await until(() => clients.every(c => c.state?.phase === 'morning'), 12000);
  assert.equal(host.state!.players.every(p => p.alive), true);
  assert.deepEqual(seer.state!.investigations, [{ round: 1, targetId: wolf.session!.playerId, isWolf: true }]);
  assert.deepEqual(victim.state!.investigations, []);
  await action(host, { type: 'advance' });
  await action(host, { type: 'advance' });
  await until(() => clients.every(c => c.state?.phase === 'vote'));
  for (const c of clients) await action(c, { type: 'vote', targetId: c === wolf ? victim.session!.playerId : wolf.session!.playerId });
  await until(() => clients.every(c => c.state?.phase === 'ended'));
  assert.equal(host.state!.winner, 'village');
  assert.equal(host.state!.players.every(p => !!p.role), true);
  assert.equal(host.state!.voteTally![wolf.session!.playerId], 5);
  await action(host, { type: 'rematch' });
  await until(() => clients.every(c => c.state?.phase === 'lobby'));
  assert.equal(host.state!.players.length, 6);
  assert.equal(host.state!.players.every(p => !p.ready && p.role === undefined), true);
});
