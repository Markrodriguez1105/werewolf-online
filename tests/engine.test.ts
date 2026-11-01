import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, acknowledgeRole, submitNightAction, submitVote, advance, viewForPlayer } from '../src/game/engine.ts';
import type { GameState, Settings } from '../src/shared/protocol.js';

const settings: Settings = { mode: 'classic', wolves: 2, guard: true, discussionSeconds: 30, nightSeconds: 20, voteSeconds: 15 };
const identities = (count = 8) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, connected: true, ready: true }));
function game() { return createGame(identities(), settings, 1000, () => .999); }
function night(g: GameState) { for (const p of g.players) acknowledgeRole(g, p.id, 1000); }
function ids(g: GameState, role: string) { return g.players.filter(p => p.role === role).map(p => p.id); }
function voting(g: GameState) { while (g.phase !== 'vote') advance(g, g.deadline!); }
function voteAll(g: GameState, target: string, fallback: string) { for (const p of g.players.filter(p => p.alive)) submitVote(g, p.id, p.id === target ? fallback : target, 100000); }

// Catches invalid deck construction, biased non-shuffling, and premature night entry.
test('deals the chosen deck and waits for every role acknowledgement', () => {
  const g = game();
  assert.equal(g.phase, 'reveal');
  assert.deepEqual(g.players.map(p => p.role), ['werewolf', 'werewolf', 'seer', 'guard', 'villager', 'villager', 'villager', 'villager']);
  const shuffled = createGame(identities(), settings, 1000, () => 0);
  assert.notDeepEqual(shuffled.players.map(p => p.role), g.players.map(p => p.role));
  acknowledgeRole(g, 'p0', 1000); acknowledgeRole(g, 'p0', 1000);
  assert.equal(g.phase, 'reveal');
  night(g); assert.equal(g.phase, 'night'); assert.equal(g.deadline, 21000);
  for (const bad of [0, 4, 2.5]) assert.throws(() => createGame(identities(), { ...settings, wolves: bad }));
  assert.throws(() => createGame(identities(5), settings));
  assert.throws(() => createGame([...identities(7), identities()[0]], settings));
  assert.throws(() => acknowledgeRole(g, 'unknown'));
});

// Catches early night resolution, leaked checks, ignored protection, or lost dying-seer checks.
test('night stays fixed and resolves protection and investigation simultaneously', () => {
  const g = game(); night(g);
  submitNightAction(g, 'p0', 'p2'); submitNightAction(g, 'p1', 'p2');
  submitNightAction(g, 'p2', 'p0'); submitNightAction(g, 'p3', 'p2');
  assert.deepEqual(viewForPlayer(g, 'p2').investigations, []);
  assert.throws(() => advance(g, 20999));
  advance(g, 21000);
  assert.equal(g.phase, 'morning'); assert.equal(g.players[2].alive, true);
  assert.deepEqual(viewForPlayer(g, 'p2').investigations, [{ round: 1, targetId: 'p0', isWolf: true }]);
  voting(g); advance(g, g.deadline!); // No votes => no elimination, next night.
  assert.equal(g.phase, 'night'); assert.equal(g.round, 2);
  assert.throws(() => submitNightAction(g, 'p3', 'p2'));
  submitNightAction(g, 'p0', 'p2'); submitNightAction(g, 'p1', 'p2'); submitNightAction(g, 'p2', 'p4');
  advance(g, g.deadline!);
  assert.equal(g.players[2].alive, false);
  assert.equal(viewForPlayer(g, 'p2').investigations.length, 2);
  assert.deepEqual(g.lastEliminated, ['p2']);
});

// Catches wolf disagreement or missing actions accidentally attacking a player.
test('wolves require unanimity and can revise their selection', () => {
  for (const disagreement of [true, false]) {
    const g = game(); night(g); submitNightAction(g, 'p0', 'p4');
    if (disagreement) submitNightAction(g, 'p1', 'p5');
    advance(g, g.deadline!); assert.equal(g.players.every(p => p.alive), true);
  }
  const g = game(); night(g); submitNightAction(g, 'p0', 'p4'); submitNightAction(g, 'p0', 'p5'); submitNightAction(g, 'p1', 'p5');
  advance(g, g.deadline!); assert.equal(g.players[5].alive, false);
});

// Catches secret role, selection, history or pending-vote data leaking into another player's view.
test('personalized views expose secrets only to authorized players', () => {
  const g = game(); night(g); submitNightAction(g, 'p0', 'p4');
  const wolf = viewForPlayer(g, 'p1');
  assert.deepEqual(wolf.wolfIds, ['p0', 'p1']); assert.deepEqual(wolf.wolfSelections, { p0: 'p4' });
  const village = viewForPlayer(g, 'p4');
  assert.equal(village.wolfIds, undefined); assert.equal(village.wolfSelections, undefined);
  assert.equal(village.players[0].role, undefined); assert.equal(village.players[4].role, 'villager');
  assert.deepEqual(village.investigations, []); assert.equal(village.voteTally, null);
  // Returned objects cannot mutate authoritative state.
  village.players[0].name = 'tamper'; village.settings.wolves = 99; village.events.push({ id: 999, round: 1, text: 'tamper' });
  assert.equal(g.players[0].name, 'Player 0'); assert.equal(g.settings.wolves, 2); assert.equal(g.events.some(e => e.id === 999), false);
  submitNightAction(g, 'p1', 'p4'); advance(g, g.deadline!);
  assert.equal(viewForPlayer(g, 'p0').wolfSelections, undefined);
  assert.equal(viewForPlayer(g, 'p5').players[4].role, 'villager');
  assert.throws(() => viewForPlayer(g, 'stranger'));
});

// Catches illegal actors/targets, role permissions and phase bypasses.
test('rejects invalid actions and eliminates dead players from participation', () => {
  const g = game(); assert.throws(() => submitVote(g, 'p0', 'p4'));
  assert.throws(() => submitNightAction(g, 'p0', 'p4')); assert.throws(() => advance(g, 1000)); night(g);
  for (const [actor, target] of [['p4','p0'], ['p0','p1'], ['p2','p2'], ['p3','p3'], ['p2','bad'], ['bad','p4']]) assert.throws(() => submitNightAction(g, actor, target));
  submitNightAction(g, 'p0', 'p4'); submitNightAction(g, 'p1', 'p4'); voting(g);
  assert.throws(() => submitVote(g, 'p4', 'p0')); assert.throws(() => submitVote(g, 'p0', 'p0'));
  assert.throws(() => submitVote(g, 'p0', 'p4')); assert.throws(() => submitVote(g, 'p0', 'bad'));
  advance(g, g.deadline!); assert.throws(() => submitNightAction(g, 'p4', 'p0'));
});

// Catches disclosure of in-progress ballots and incorrect runoff/deadline processing.
test('ties run off once, a second tie eliminates nobody, and last tally stays public', () => {
  const g = game(); night(g); voting(g);
  ['p0','p1','p2','p3'].forEach(p => submitVote(g, p, 'p4', 50000));
  assert.equal(viewForPlayer(g, 'p7').voteTally, null);
  ['p4','p5','p6','p7'].forEach(p => submitVote(g, p, 'p0', 50000));
  assert.equal(g.phase, 'vote'); assert.deepEqual(g.runoffCandidates?.sort(), ['p0','p4']);
  assert.deepEqual(g.voteTally, { p4: 4, p0: 4 }); assert.throws(() => submitVote(g, 'p0', 'p5'));
  ['p0','p1','p2','p3'].forEach(p => submitVote(g, p, 'p4', 50000));
  ['p4','p5','p6','p7'].forEach(p => submitVote(g, p, 'p0', 50000));
  assert.equal(g.phase, 'night'); assert.equal(g.players.every(p => p.alive), true); assert.equal(g.round, 2);
  assert.deepEqual(g.voteTally, { p4: 4, p0: 4 });
});

// Catches incorrect plurality, vote revisions, final-wolf result and post-game role visibility.
test('village wins after the last wolf is voted out', () => {
  const g = game(); night(g); voting(g);
  submitVote(g, 'p1', 'p4', 50000); submitVote(g, 'p1', 'p0', 50000);
  for (const p of g.players.filter(p => p.id !== 'p1')) submitVote(g, p.id, p.id === 'p0' ? 'p4' : 'p0', 50000);
  assert.equal(g.phase, 'night'); assert.equal(g.players[0].alive, false);
  const deadWolf = viewForPlayer(g, 'p0'); assert.equal(deadWolf.wolfIds, undefined);
  submitNightAction(g, 'p1', 'p4'); voting(g); voteAll(g, 'p1', 'p5');
  assert.equal(g.phase, 'ended'); assert.equal(g.winner, 'village'); assert.equal(g.deadline, null);
  assert.equal(viewForPlayer(g, 'p5').players.every(p => p.role), true);
  assert.throws(() => submitVote(g, 'p5', 'p6')); assert.throws(() => advance(g));
});

// Catches parity ending too late and missing votes incorrectly blocking resolution.
test('wolves win at parity after deadline-driven plurality eliminations', () => {
  const g = game(); night(g);
  submitNightAction(g, 'p0', 'p4'); submitNightAction(g, 'p1', 'p4'); voting(g);
  submitVote(g, 'p0', 'p5', 50000); advance(g, g.deadline!);
  submitNightAction(g, 'p0', 'p6'); submitNightAction(g, 'p1', 'p6'); voting(g);
  submitVote(g, 'p0', 'p7', 50000); advance(g, g.deadline!);
  assert.equal(g.phase, 'ended'); assert.equal(g.winner, 'wolves');
});
