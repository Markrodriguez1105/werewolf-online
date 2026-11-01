import type { GameState, GameView, GamePlayer, PlayerIdentity, Settings, WitchChoice, WolfAction } from '../shared/protocol.js';
import { MODE_DETAILS, roleDeck } from '../shared/modes.ts';

function player(game: GameState, id: string): GamePlayer {
  const found = game.players.find(p => p.id === id);
  if (!found) throw Error('Unknown player.');
  return found;
}
function alive(game: GameState, id: string) {
  const found = player(game, id);
  if (!found.alive) throw Error('Eliminated players cannot act.');
  return found;
}
function log(game: GameState, text: string) {
  game.events.push({ id: game.events.length + 1, round: game.round, text });
}
function checkWinner(game: GameState): boolean {
  const living = game.players.filter(p => p.alive);
  const wolves = living.filter(p => p.role === 'werewolf').length;
  game.winner = wolves === 0 ? 'village' : wolves >= living.length - wolves ? 'wolves' : null;
  if (!game.winner) return false;
  game.phase = 'ended'; game.deadline = null;
  log(game, game.winner === 'village' ? 'The village has eliminated every werewolf.' : 'The werewolves control the village.');
  return true;
}
function enterNight(game: GameState, now: number, subsequent = true) {
  if (subsequent) game.round++;
  game.phase = 'night'; game.deadline = now + game.settings.nightSeconds * 1000;
  game.nightActions = {}; game.votes = {}; game.runoffCandidates = null; game.lastEliminated = [];
  game.wolfActions = {}; game.pendingAttack = null; game.witchChoice = null;
  log(game, `Night ${game.round} begins.`);
}
function eliminate(game: GameState, id: string) {
  const victim = player(game, id);
  if (!victim.alive) return;
  victim.alive = false;
  game.lastEliminated.push(id);
  log(game, `${victim.name} was eliminated (${victim.role}).`);
  if (game.pact?.includes(id)) {
    const partnerId = game.pact.find(partner => partner !== id)!;
    eliminate(game, partnerId);
  }
}

export function createGame(players: PlayerIdentity[], settings: Settings, now = Date.now(), random = Math.random): GameState {
  if (players.length < 6 || players.length > 16) throw Error('Games need 6–16 players.');
  if (new Set(players.map(p => p.id)).size !== players.length || players.some(p => typeof p.id !== 'string' || !p.id)) throw Error('Player IDs must be unique.');
  if (!Number.isInteger(settings.wolves) || settings.wolves < 1 || settings.wolves > 4 || settings.wolves * 2 >= players.length) throw Error('Choose 1–4 wolves, fewer than half the players.');
  if (!Object.hasOwn(MODE_DETAILS, settings.mode)) throw Error('Choose a supported game mode.');
  if (typeof settings.guard !== 'boolean') throw Error('Invalid role deck.');
  for (const duration of [settings.nightSeconds, settings.discussionSeconds, settings.voteSeconds]) {
    if (!Number.isInteger(duration) || duration < 1 || duration > 3600) throw Error('Timers must be whole seconds from 1 to 3600.');
  }
  const roles = roleDeck(settings, players.length);
  if (roles.length !== players.length) throw Error('The selected roles do not fit this player count.');
  const deckCounts = new Map<string, number>();
  for (const role of roles) deckCounts.set(role, (deckCounts.get(role) ?? 0) + 1);
  function randomIndex(length: number) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('Invalid random value.');
    return Math.floor(value * length);
  }
  for (let i = roles.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1); [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  let pact: [string, string] | null = null;
  if (settings.mode === 'secret-pact') {
    const pool = players.map(p => p.id);
    const first = pool.splice(randomIndex(pool.length), 1)[0];
    pact = [first, pool[randomIndex(pool.length)]];
  }
  const game: GameState = {
    phase: 'reveal', round: 1, players: players.map((p, i) => ({ ...p, role: roles[i], alive: true })),
    settings: { ...settings }, deadline: null, winner: null, events: [], acknowledged: [], nightActions: {}, votes: {},
    investigations: {}, lastGuardTarget: null, runoffCandidates: null, voteTally: null, lastEliminated: [],
    wolfActions: {}, pendingAttack: null, infectionAvailable: settings.mode === 'infected', infectedIds: [],
    witchPotions: { heal: true, kill: true }, witchChoice: null, pact,
  };
  const deckDescription = [...deckCounts].map(([role, count]) => {
    const label = count === 1 ? role : role === 'werewolf' ? 'werewolves' : role === 'witch' ? 'witches' : `${role}s`;
    return `${count} ${label}`;
  }).join(', ');
  log(game, `Roles dealt: ${deckDescription}.`);
  return game;
}

export function acknowledgeRole(game: GameState, playerId: string, now = Date.now()): void {
  player(game, playerId);
  if (game.phase !== 'reveal') throw Error('Roles can only be acknowledged during reveal.');
  if (!game.acknowledged.includes(playerId)) game.acknowledged.push(playerId);
  if (game.acknowledged.length === game.players.length) enterNight(game, now, false);
}

export function submitNightAction(game: GameState, playerId: string, targetId: string, kind: WolfAction = 'kill'): void {
  if (game.phase !== 'night') throw Error('Night actions are only available at night.');
  const actor = alive(game, playerId); const target = alive(game, targetId);
  if (actor.id === target.id) throw Error('Choose another player.');
  if (!['kill', 'infect'].includes(kind)) throw Error('Invalid wolf action.');
  if (!['werewolf', 'seer', 'guard'].includes(actor.role)) throw Error('Your role has no action during this stage of the night.');
  if (kind === 'infect' && (actor.role !== 'werewolf' || game.settings.mode !== 'infected' || !game.infectionAvailable)) throw Error('Infection is not available.');
  if (actor.role === 'werewolf' && target.role === 'werewolf') throw Error('Werewolves cannot target a teammate.');
  if (actor.role === 'guard' && game.lastGuardTarget === targetId) throw Error('The guard cannot protect the same player on consecutive nights.');
  game.nightActions[playerId] = targetId;
  if (actor.role === 'werewolf') game.wolfActions[playerId] = kind;
}

export function submitWitchAction(game: GameState, playerId: string, choice: WitchChoice): void {
  if (game.phase !== 'witch') throw Error('The Witch acts during the second night stage.');
  const actor = alive(game, playerId);
  if (actor.role !== 'witch') throw Error('Only the Witch can choose potions.');
  if (!choice || typeof choice !== 'object' || Array.isArray(choice) || typeof choice.heal !== 'boolean' || !(choice.poisonTargetId === null || typeof choice.poisonTargetId === 'string')) throw Error('Invalid potion choice.');
  if (choice.heal && (!game.witchPotions.heal || !game.pendingAttack || game.pendingAttack.kind !== 'kill')) throw Error('Healing is not available.');
  if (choice.poisonTargetId !== null) {
    if (!game.witchPotions.kill) throw Error('The poison potion has already been spent.');
    alive(game, choice.poisonTargetId);
    if (choice.poisonTargetId === playerId) throw Error('The Witch cannot poison herself.');
  }
  game.witchChoice = { heal: choice.heal, poisonTargetId: choice.poisonTargetId };
}

function lockNightAttack(game: GameState, now: number) {
  const wolves = game.players.filter(p => p.alive && p.role === 'werewolf');
  const targetId = game.nightActions[wolves[0].id];
  const kind = game.wolfActions[wolves[0].id];
  game.pendingAttack = targetId && kind && wolves.every(p => game.nightActions[p.id] === targetId && game.wolfActions[p.id] === kind) ? { targetId, kind } : null;
  if (game.settings.mode === 'no-seer') {
    game.phase = 'witch'; game.deadline = now + game.settings.nightSeconds * 1000;
  } else resolveNight(game, now);
}

function resolveNight(game: GameState, now: number) {
  const living = game.players.filter(p => p.alive);
  const guard = living.find(p => p.role === 'guard');
  const protectedId = guard ? game.nightActions[guard.id] : undefined;
  // Investigations happen before eliminations, including the victim's final check.
  for (const seer of living.filter(p => p.role === 'seer')) {
    const target = game.nightActions[seer.id];
    if (target) (game.investigations[seer.id] ??= []).push({ round: game.round, targetId: target, isWolf: player(game, target).role === 'werewolf' });
  }
  game.lastGuardTarget = protectedId ?? null;
  const witch = living.find(p => p.role === 'witch');
  const choice = witch ? game.witchChoice : null;
  const attack = game.pendingAttack;
  if (choice?.heal) game.witchPotions.heal = false;
  if (choice?.poisonTargetId) game.witchPotions.kill = false;
  if (attack?.kind === 'kill' && attack.targetId !== protectedId && !choice?.heal) eliminate(game, attack.targetId);
  if (choice?.poisonTargetId) eliminate(game, choice.poisonTargetId);
  if (attack?.kind === 'infect') {
    game.infectionAvailable = false;
    const target = player(game, attack.targetId);
    if (target.alive && target.role === 'villager' && target.id !== protectedId) {
      target.role = 'werewolf'; game.infectedIds.push(target.id);
    }
  }
  if (!game.lastEliminated.length) log(game, 'Nobody was eliminated during the night.');
  game.nightActions = {}; game.wolfActions = {}; game.pendingAttack = null; game.witchChoice = null;
  if (checkWinner(game)) return;
  game.phase = 'morning'; game.deadline = now + 8000;
}

function resolveVote(game: GameState, now: number) {
  const tally: Record<string, number> = {};
  for (const target of Object.values(game.votes)) tally[target] = (tally[target] ?? 0) + 1;
  game.voteTally = tally;
  const max = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(id => tally[id] === max);
  if (leaders.length > 1 && game.runoffCandidates === null) {
    game.runoffCandidates = leaders; game.votes = {};
    game.deadline = now + game.settings.voteSeconds * 1000;
    log(game, 'The vote tied. A runoff begins between the tied candidates.');
    return;
  }
  if (leaders.length === 1) eliminate(game, leaders[0]);
  else log(game, leaders.length ? 'The runoff tied. Nobody was eliminated.' : 'No votes were cast. Nobody was eliminated.');
  game.votes = {}; game.runoffCandidates = null;
  if (!checkWinner(game)) enterNight(game, now);
}

export function submitVote(game: GameState, playerId: string, targetId: string, now = Date.now()): void {
  if (game.phase !== 'vote') throw Error('Voting is not open.');
  alive(game, playerId); alive(game, targetId);
  if (playerId === targetId) throw Error('You cannot vote for yourself.');
  if (game.runoffCandidates && !game.runoffCandidates.includes(targetId)) throw Error('Choose a runoff candidate.');
  game.votes[playerId] = targetId;
  if (game.players.filter(p => p.alive).every(p => Object.hasOwn(game.votes, p.id))) resolveVote(game, now);
}

export function advance(game: GameState, now = Date.now()): void {
  if (game.phase === 'night' || game.phase === 'witch' || game.phase === 'vote') {
    if (game.deadline === null || now < game.deadline) throw Error('Wait for the phase timer.');
    if (game.phase === 'night') lockNightAttack(game, now);
    else if (game.phase === 'witch') resolveNight(game, now);
    else resolveVote(game, now);
  } else if (game.phase === 'morning') {
    game.phase = 'discussion'; game.deadline = now + game.settings.discussionSeconds * 1000;
    log(game, 'The village discussion begins.');
  } else if (game.phase === 'discussion') {
    game.phase = 'vote'; game.deadline = now + game.settings.voteSeconds * 1000;
    game.votes = {}; game.runoffCandidates = null;
    log(game, 'Voting is open.');
  } else throw Error('This phase cannot be advanced.');
}

export function viewForPlayer(game: GameState, playerId: string): GameView {
  const own = player(game, playerId);
  const livingWolf = own.alive && own.role === 'werewolf';
  const view: GameView = {
    phase: game.phase, round: game.round,
    players: game.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, ready: p.ready, alive: p.alive,
      ...(p.id === playerId || !p.alive || game.phase === 'ended' || (livingWolf && p.role === 'werewolf') ? { role: p.role } : {}) })),
    settings: { ...game.settings }, deadline: game.deadline, winner: game.winner,
    events: game.events.map(e => ({ ...e })), ownRole: own.role,
    investigations: (game.investigations[playerId] ?? []).map(i => ({ ...i })),
    hasSubmitted: own.alive && (game.phase === 'night' ? Object.hasOwn(game.nightActions, playerId) : game.phase === 'vote' ? Object.hasOwn(game.votes, playerId) : game.phase === 'witch' && own.role === 'witch' ? game.witchChoice !== null : false),
    hasAcknowledged: game.acknowledged.includes(playerId),
    runoffCandidates: game.runoffCandidates ? [...game.runoffCandidates] : null,
    voteTally: game.voteTally ? { ...game.voteTally } : null, lastEliminated: [...game.lastEliminated],
  };
  const target = game.phase === 'night' ? game.nightActions[playerId] : game.phase === 'vote' ? game.votes[playerId] : undefined;
  if (target && own.alive) view.ownTarget = target;
  if (livingWolf) {
    view.wolfIds = game.players.filter(p => p.role === 'werewolf').map(p => p.id);
    if (game.settings.mode === 'infected') view.infectionAvailable = game.infectionAvailable;
    if (game.phase === 'night') {
      view.wolfSelections = Object.fromEntries(game.players.filter(p => p.alive && p.role === 'werewolf' && Object.hasOwn(game.nightActions, p.id)).map(p => [p.id, game.nightActions[p.id]]));
      view.wolfActionSelections = Object.fromEntries(game.players.filter(p => p.alive && p.role === 'werewolf' && Object.hasOwn(game.wolfActions, p.id)).map(p => [p.id, game.wolfActions[p.id]]));
      if (Object.hasOwn(game.wolfActions, playerId)) view.ownWolfAction = game.wolfActions[playerId];
    }
  }
  if (own.alive && own.role === 'witch') view.witch = {
    healAvailable: game.witchPotions.heal, killAvailable: game.witchPotions.kill,
    attackTargetId: game.phase === 'witch' ? game.pendingAttack?.targetId ?? null : null,
    choice: game.witchChoice ? { ...game.witchChoice } : null,
  };
  if (game.infectedIds.includes(playerId)) view.wasInfected = true;
  if (game.pact?.includes(playerId)) view.pactPartnerId = game.pact.find(id => id !== playerId);
  if (own.alive && own.role === 'guard' && game.lastGuardTarget) view.forbiddenGuardTarget = game.lastGuardTarget;
  return view;
}
