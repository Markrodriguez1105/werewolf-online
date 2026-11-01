import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleTargets, inviteUrl, parseSession } from '../src/client/game-ui.ts';
import { DEFAULT_SETTINGS, type RoomView } from '../src/shared/protocol.ts';

const room = (overrides: Partial<RoomView> = {}): RoomView => ({
  code: 'ABCDEF', hostId: 'a', youId: 'a', lanUrls: [], phase: 'night', round: 1,
  players: [
    { id: 'a', name: 'Ana', alive: true, connected: true, ready: true },
    { id: 'b', name: 'Bea', alive: true, connected: true, ready: true },
    { id: 'c', name: 'Cal', alive: true, connected: true, ready: true },
    { id: 'd', name: 'Dan', alive: false, connected: true, ready: true },
  ], settings: DEFAULT_SETTINGS, deadline: null, winner: null, events: [],
  ownRole: 'seer', investigations: [], hasSubmitted: false, hasAcknowledged: false,
  runoffCandidates: null, voteTally: null, lastEliminated: [], ...overrides,
});

test('night selectors exclude self, dead players, wolf teammates and last guarded player', () => {
  assert.deepEqual(eligibleTargets(room()).map(p => p.id), ['b', 'c']);
  assert.deepEqual(eligibleTargets(room({ ownRole: 'werewolf', wolfIds: ['a', 'b'] })).map(p => p.id), ['c']);
  assert.deepEqual(eligibleTargets(room({ ownRole: 'guard', forbiddenGuardTarget: 'b' })).map(p => p.id), ['c']);
  assert.deepEqual(eligibleTargets(room({ ownRole: 'villager' })), []);
  assert.deepEqual(eligibleTargets(room({ players: room().players.map(p => p.id === 'a' ? { ...p, alive: false } : p) })), []);
});

test('a runoff selector allows only living tied candidates other than oneself', () => {
  assert.deepEqual(eligibleTargets(room({ phase: 'vote', runoffCandidates: ['a', 'c', 'd'] })).map(p => p.id), ['c']);
  assert.deepEqual(eligibleTargets(room({ phase: 'discussion' })), []);
});

test('localhost invites use the LAN address while phone invites preserve the reachable origin', () => {
  assert.equal(inviteUrl('http://localhost:3000', ['http://192.168.1.8:3000'], 'ABCDEF'), 'http://192.168.1.8:3000/?room=ABCDEF');
  assert.equal(inviteUrl('http://192.168.1.9:3000', ['http://192.168.1.8:3000'], 'ABCDEF'), 'http://192.168.1.9:3000/?room=ABCDEF');
  assert.equal(inviteUrl('http://localhost:3000', [], 'ABCDEF'), 'http://localhost:3000/?room=ABCDEF');
});

test('malformed stored sessions cannot be sent as a resume identity', () => {
  assert.equal(parseSession('{broken'), null);
  assert.equal(parseSession('{"code":"ABCDEF"}'), null);
  assert.equal(parseSession('null'), null);
  assert.deepEqual(parseSession('{"code":"ABCDEF","playerId":"a","token":"private","role":"werewolf"}'), { code: 'ABCDEF', playerId: 'a', token: 'private' });
});
