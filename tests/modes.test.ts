import test from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgeRole, advance, createGame, submitNightAction, submitVote, submitWitchAction, viewForPlayer } from '../src/game/engine.ts';
import { DEFAULT_SETTINGS, type GameMode, type GameState, type WitchChoice } from '../src/shared/protocol.ts';

const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, connected: true, ready: true }));
function game(mode: GameMode, guard = false, random = () => .999) {
  const g = createGame(players, { ...DEFAULT_SETTINGS, mode, guard, nightSeconds: 10, voteSeconds: 10 }, 0, random);
  players.forEach(p => acknowledgeRole(g, p.id, 0)); return g;
}
function wolves(g: GameState, targetId: string, kind: 'kill' | 'infect' = 'kill') {
  for (const p of g.players.filter(p => p.alive && p.role === 'werewolf')) submitNightAction(g, p.id, targetId, kind);
}
function next(g: GameState) { advance(g, g.deadline!); }
function nextNight(g: GameState) { while (g.phase !== 'night' && g.phase !== 'ended') next(g); }
function toVote(g: GameState) { while (g.phase !== 'vote' && g.phase !== 'ended') next(g); }
function unanimousVote(g: GameState, id: string) {
  for (const p of g.players.filter(p => p.alive)) submitVote(g, p.id, p.id === id ? g.players.find(x => x.alive && x.id !== id)!.id : id, g.deadline! - 1);
}
function pactRandom(a: number, b: number) {
  let calls = 0; return () => calls++ < 7 ? .999 : calls === 8 ? a : b;
}

// Mutation caught: accepting unsupported mode or silently retaining the Seer in No Seer.
test('No Seer deals Witch and Drunk, replacing Seer and one villager', () => {
  const g = game('no-seer', true);
  assert.deepEqual(g.players.map(p => p.role), ['werewolf','werewolf','witch','drunk','guard','villager','villager','villager']);
  assert.match(g.events[0].text, /witch/i); assert.doesNotMatch(g.events[0].text, /seer/i);
  assert.throws(() => game('invalid' as GameMode));
  assert.throws(() => submitNightAction(g, 'p3', 'p0'));
  assert.throws(() => submitNightAction(g, 'p2', 'p0'));
});

// Mutation caught: eliminating the Witch before her stage or resolving a stage early.
test('attacked Witch gets a fixed second stage and can heal herself while poisoning a wolf', () => {
  const g = game('no-seer'); wolves(g, 'p2');
  assert.throws(() => submitWitchAction(g, 'p2', { heal: true, poisonTargetId: 'p0' })); next(g);
  assert.equal(g.phase, 'witch'); assert.equal(g.players[2].alive, true); assert.equal(g.winner, null);
  assert.equal(viewForPlayer(g, 'p2').witch?.attackTargetId, 'p2');
  submitWitchAction(g, 'p2', { heal: true, poisonTargetId: 'p0' });
  assert.throws(() => advance(g, g.deadline! - 1)); assert.equal(g.phase, 'witch');
  next(g); assert.equal(g.phase, 'morning'); assert.equal(g.players[2].alive, true); assert.equal(g.players[0].alive, false);
  assert.deepEqual(g.witchPotions, { heal: false, kill: false });
});

// Mutation caught: early potion consumption or failing to copy submitted/private choices.
test('Witch may revise choices and potion state is isolated from clients', () => {
  const g = game('no-seer'); wolves(g, 'p5'); next(g);
  const choice: WitchChoice = { heal: true, poisonTargetId: 'p0' }; submitWitchAction(g, 'p2', choice);
  choice.poisonTargetId = 'p1'; assert.equal(g.witchChoice?.poisonTargetId, 'p0');
  assert.deepEqual(g.witchPotions, { heal: true, kill: true });
  const own = viewForPlayer(g, 'p2'); assert.equal(own.hasSubmitted, true);
  own.witch!.choice!.heal = false; assert.equal(g.witchChoice?.heal, true);
  submitWitchAction(g, 'p2', { heal: false, poisonTargetId: null }); next(g);
  assert.equal(g.players[5].alive, false); assert.equal(g.players[0].alive, true);
  assert.deepEqual(g.witchPotions, { heal: true, kill: true });
});

// Mutation caught: treating poison as a wolf attack, or double-counting the same victim.
test('poison bypasses healing and Guard protection and duplicate deaths occur once', () => {
  const g = game('no-seer', true); wolves(g, 'p5'); submitNightAction(g, 'p4', 'p5'); next(g);
  submitWitchAction(g, 'p2', { heal: true, poisonTargetId: 'p5' }); next(g);
  assert.equal(g.players[5].alive, false); assert.deepEqual(g.lastEliminated, ['p5']);
  assert.deepEqual(g.witchPotions, { heal: false, kill: false });
  const duplicate = game('no-seer'); wolves(duplicate, 'p5'); next(duplicate);
  submitWitchAction(duplicate, 'p2', { heal: false, poisonTargetId: 'p5' }); next(duplicate);
  assert.deepEqual(duplicate.lastEliminated, ['p5']);
});

// Mutation caught: checking parity before poison resolution or stopping stages after Witch death.
test('night resolves both victims before victory and keeps Witch stage after her death', () => {
  const g = game('no-seer'); wolves(g, 'p3'); next(g); next(g); // Drunk dies, no potion use.
  nextNight(g); wolves(g, 'p4'); next(g); submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p0' }); next(g);
  assert.equal(g.winner, null); assert.deepEqual(g.lastEliminated, ['p4','p0']);
  nextNight(g); wolves(g, 'p2'); next(g); next(g); assert.equal(g.players[2].alive, false);
  nextNight(g); next(g); assert.equal(g.phase, 'witch'); assert.equal(viewForPlayer(g, 'p2').witch, undefined);
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p1' })); next(g);
});

// Catches an early wolf-parity check that would prevent the Witch's decisive poison.
test('Witch poison can prevent wolf parity and can kill the final wolf while she dies', () => {
  const seats = players.slice(0, 6);
  const g = createGame(seats, { ...DEFAULT_SETTINGS, mode: 'no-seer', wolves: 2, nightSeconds: 10 }, 0, () => .999);
  seats.forEach(p => acknowledgeRole(g, p.id, 0));
  toVote(g); unanimousVote(g, 'p3'); // 2 wolves, Witch, two villagers remain.
  wolves(g, 'p4'); next(g);
  assert.equal(g.phase, 'witch'); assert.equal(g.winner, null);
  submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p0' }); next(g);
  assert.equal(g.winner, null); assert.equal(g.players.filter(p => p.alive).length, 3);
  nextNight(g); wolves(g, 'p2'); next(g);
  // Poison is spent, so she cannot use it again even against the last wolf.
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p1' }));

  const final = createGame(seats, { ...DEFAULT_SETTINGS, mode: 'no-seer', wolves: 1, nightSeconds: 10 }, 0, () => .999);
  seats.forEach(p => acknowledgeRole(final, p.id, 0));
  wolves(final, 'p1'); next(final);
  submitWitchAction(final, 'p1', { heal: false, poisonTargetId: 'p0' }); next(final);
  assert.equal(final.players[1].alive, false); assert.equal(final.players[0].alive, false); assert.equal(final.winner, 'village');
});

// Mutation caught: allowing self poison, other roles, malformed commands or reusing potions.
test('Witch actions validate role, targets, heal availability and spent potions', () => {
  const g = game('no-seer'); next(g);
  assert.throws(() => submitWitchAction(g, 'p3', { heal: false, poisonTargetId: 'p0' }));
  assert.throws(() => submitWitchAction(g, 'p2', { heal: true, poisonTargetId: null }));
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p2' }));
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'bad' }));
  assert.throws(() => submitWitchAction(g, 'p2', { heal: 'yes', poisonTargetId: null } as unknown as WitchChoice));
  submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p5' }); next(g); nextNight(g); next(g);
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p6' }));
  assert.throws(() => submitWitchAction(g, 'p2', { heal: false, poisonTargetId: 'p5' }));
});

// Mutation caught: leaking Witch victim, choice or inventory through public views/events.
test('Witch choices and attack target remain private and generic submission fields do not leak them', () => {
  const g = game('no-seer'); wolves(g, 'p5'); next(g); submitWitchAction(g, 'p2', { heal: true, poisonTargetId: 'p0' });
  for (const id of ['p0','p3','p5']) {
    const view = viewForPlayer(g, id); assert.equal(view.witch, undefined); assert.equal(view.ownTarget, undefined); assert.equal(view.hasSubmitted, false);
    assert.equal(JSON.stringify(view.events).includes('Player 5'), false);
  }
  next(g); assert.equal(viewForPlayer(g, 'p2').witch?.attackTargetId, null);
});

// Mutation caught: infection behaving as a second attack, not changing role, or leaking conversion publicly.
test('unanimous infection converts a surviving ordinary Villager and privately joins the pack', () => {
  const g = game('infected'); wolves(g, 'p4', 'infect');
  assert.equal(viewForPlayer(g, 'p0').infectionAvailable, true);
  assert.deepEqual(viewForPlayer(g, 'p1').wolfActionSelections, { p0: 'infect', p1: 'infect' });
  next(g); assert.equal(g.players[4].role, 'werewolf'); assert.equal(g.players[4].alive, true);
  assert.equal(g.infectionAvailable, false); assert.equal(g.settings.wolves, 2);
  const converted = viewForPlayer(g, 'p4'); assert.equal(converted.wasInfected, true); assert.deepEqual(converted.wolfIds, ['p0','p1','p4']);
  assert.equal(viewForPlayer(g, 'p5').players[4].role, undefined); assert.equal(viewForPlayer(g, 'p5').wasInfected, undefined);
  assert.doesNotMatch(g.events.map(e => e.text).join(' '), /infect|convert|Player 4/i);
  nextNight(g); assert.throws(() => submitNightAction(g, 'p0', 'p5', 'infect')); wolves(g, 'p5'); next(g);
  assert.equal(g.players[5].alive, false);
});

// Mutation caught: disclosing hidden target eligibility or preserving a failed attempt.
test('ineligible or guarded infection quietly fails but spends the unanimous attempt', () => {
  for (const target of ['p2','p3','p4']) {
    const g = game('infected', true);
    if (target === 'p4') submitNightAction(g, 'p3', 'p4');
    assert.doesNotThrow(() => wolves(g, target, 'infect')); next(g);
    assert.equal(g.players[target === 'p2' ? 2 : target === 'p3' ? 3 : 4].role, target === 'p2' ? 'seer' : target === 'p3' ? 'guard' : 'villager');
    assert.equal(g.players.every(p => p.alive), true); assert.equal(g.infectionAvailable, false);
    assert.equal(viewForPlayer(g, target).wasInfected, undefined);
  }
});

// Catches investigations reporting a pre-conversion role instead of the target's status at dawn.
test('Seer checks reflect successful conversion at dawn and blocked infection remains village', () => {
  for (const protectedTarget of [false, true]) {
    const g = game('infected', true);
    wolves(g, 'p4', 'infect'); submitNightAction(g, 'p2', 'p4');
    if (protectedTarget) submitNightAction(g, 'p3', 'p4');
    next(g);
    assert.deepEqual(viewForPlayer(g, 'p2').investigations, [{ round: 1, targetId: 'p4', isWolf: !protectedTarget }]);
  }
});

// Mutation caught: spending infection or attacking despite nonunanimous action kinds/targets.
test('wolves must agree on kind and target and nonwolves cannot request infection', () => {
  const g = game('infected'); submitNightAction(g, 'p0', 'p4', 'infect'); submitNightAction(g, 'p1', 'p4', 'kill');
  assert.throws(() => submitNightAction(g, 'p2', 'p4', 'infect')); next(g);
  assert.equal(g.infectionAvailable, true); assert.equal(g.players.every(p => p.alive), true);
  const missing = game('infected'); submitNightAction(missing, 'p0', 'p4', 'infect'); next(missing);
  assert.equal(missing.infectionAvailable, true);
  const classic = game('classic'); assert.throws(() => submitNightAction(classic, 'p0', 'p4', 'infect'));
  assert.throws(() => submitNightAction(classic, 'p0', 'p4', 'oops' as 'kill'));
});

// Mutation caught: infection role/state leakage or mutable returned coordination maps.
test('infection coordination is cloned and visible only to living wolves', () => {
  const g = game('infected'); wolves(g, 'p4', 'infect');
  const view = viewForPlayer(g, 'p0'); view.wolfActionSelections!.p1 = 'kill'; assert.equal(g.wolfActions.p1, 'infect');
  const other = viewForPlayer(g, 'p5'); assert.equal(other.infectionAvailable, undefined); assert.equal(other.wolfActionSelections, undefined); assert.equal(other.ownWolfAction, undefined);
  next(g); assert.equal(viewForPlayer(g, 'p0').wolfActionSelections, undefined);
});

// Mutation caught: selecting pact participants from role-specific sets, duplicates, or revealing partner role.
test('pact selection is independent of teams and private without exposing the partner role', () => {
  const g = game('secret-pact', false, pactRandom(0, 1 / 7));
  assert.deepEqual(g.pact, ['p0','p2']);
  assert.equal(viewForPlayer(g, 'p0').pactPartnerId, 'p2'); assert.equal(viewForPlayer(g, 'p2').pactPartnerId, 'p0');
  assert.equal(viewForPlayer(g, 'p0').players[2].role, undefined); assert.equal(viewForPlayer(g, 'p2').players[0].role, undefined);
  assert.equal(viewForPlayer(g, 'p3').pactPartnerId, undefined);
  assert.doesNotMatch(g.events.map(e => e.text).join(' '), /pact|partner|bond|Player 2/i);
  const last = game('secret-pact'); assert.deepEqual(last.pact, ['p7','p6']);
});

// Mutation caught: Guard blocking bond death, missing the partner on day deaths or checking win too soon.
test('pact night death eliminates protected partner before winner check', () => {
  const g = game('secret-pact', true, pactRandom(0, 1 / 7));
  wolves(g, 'p2'); submitNightAction(g, 'p3', 'p0'); next(g);
  assert.equal(g.players[2].alive, false); assert.equal(g.players[0].alive, false); assert.deepEqual(g.lastEliminated, ['p2','p0']);
  assert.equal(g.winner, null);
  const day = game('secret-pact', false, pactRandom(0, 0)); // both wolves bonded
  toVote(day); unanimousVote(day, 'p0');
  assert.equal(day.players[0].alive, false); assert.equal(day.players[1].alive, false); assert.equal(day.winner, 'village');
  assert.equal(day.events.filter(e => e.text.startsWith('Player 0 was eliminated')).length, 1);
});

// Mutation caught: killing a protected pact target or its partner despite successful protection.
test('Guard blocks the direct attack and therefore prevents either pact death', () => {
  const g = game('secret-pact', true); wolves(g, 'p7'); submitNightAction(g, 'p3', 'p7'); next(g);
  assert.equal(g.players[7].alive, true); assert.equal(g.players[6].alive, true);
});
