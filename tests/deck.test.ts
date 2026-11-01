import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/shared/protocol.ts';
import { roleDeck } from '../src/shared/modes.ts';

// Catches mode decks silently retaining the Seer or changing the number of seats.
test('No Seer replaces the Seer and one ordinary Villager with Witch and Drunk', () => {
  const deck = roleDeck({ ...DEFAULT_SETTINGS, mode: 'no-seer' }, 8);
  assert.deepEqual(deck, ['werewolf', 'werewolf', 'witch', 'drunk', 'villager', 'villager', 'villager', 'villager']);
});

test('Classic, Infected Village and Secret Pact retain the Classic role deck', () => {
  for (const mode of ['classic', 'infected', 'secret-pact'] as const) {
    assert.deepEqual(roleDeck({ ...DEFAULT_SETTINGS, mode, guard: true }, 6), ['werewolf', 'werewolf', 'seer', 'guard', 'villager', 'villager']);
  }
});
