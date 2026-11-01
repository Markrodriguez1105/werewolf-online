import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleTargets, inviteUrl, parseSession, moderatorNarration } from '../src/client/game-ui.ts';
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

test('only a living Witch selects poison targets in the potion stage, excluding self and dead players', () => {
  assert.deepEqual(eligibleTargets(room({ ownRole: 'witch' })), []);
  assert.deepEqual(eligibleTargets(room({ ownRole: 'drunk' })), []);
  const witch = room({ phase: 'witch', ownRole: 'witch', witch: { healAvailable: true, killAvailable: true, attackTargetId: 'a', choice: null } });
  assert.deepEqual(eligibleTargets(witch).map(p => p.id), ['b', 'c']);
  assert.deepEqual(eligibleTargets({ ...witch, witch: { ...witch.witch!, killAvailable: false } }), []);
  assert.deepEqual(eligibleTargets(room({ phase: 'witch', ownRole: 'villager' })), []);
});

test('infection targets do not disclose hidden special-role eligibility', () => {
  const infected = room({ settings: { ...DEFAULT_SETTINGS, mode: 'infected' }, ownRole: 'werewolf', wolfIds: ['a'], ownWolfAction: 'infect' });
  assert.deepEqual(eligibleTargets(infected).map(p => p.id), ['b', 'c']);
  assert.deepEqual(eligibleTargets({ ...infected, players: infected.players.map(p => p.id === 'b' ? { ...p, role: 'guard' as const } : p) }).map(p => p.id), ['b', 'c']);
});

test('moderator narration is identical for everyone despite infection, Witch and pact secrets', () => {
  const publicRoom = room({ settings: { ...DEFAULT_SETTINGS, mode: 'no-seer' }, phase: 'witch' });
  const privateRoom = { ...publicRoom, ownRole: 'witch' as const, wasInfected: true, pactPartnerId: 'c', ownTarget: 'b', witch: { healAvailable: true, killAvailable: true, attackTargetId: 'b', choice: { heal: true, poisonTargetId: 'c' } } };
  assert.equal(moderatorNarration(privateRoom), moderatorNarration(publicRoom));
  assert.ok(moderatorNarration(publicRoom).length > 25);
  assert.notEqual(moderatorNarration(room({ round: 1 })), moderatorNarration(room({ round: 2 })));
  assert.notEqual(moderatorNarration(room({ phase: 'morning', lastEliminated: [] })), moderatorNarration(room({ phase: 'morning', lastEliminated: ['d'] })));
  assert.notEqual(moderatorNarration(room({ phase: 'night', settings: { ...DEFAULT_SETTINGS, mode: 'classic' } })), moderatorNarration(room({ phase: 'night', settings: { ...DEFAULT_SETTINGS, mode: 'no-seer' } })));
});
