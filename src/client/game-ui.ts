import type { PlayerView, RoomView, Session } from '../shared/protocol.ts';
import { MODE_DETAILS } from '../shared/modes.ts';

export function eligibleTargets(view: RoomView): PlayerView[] {
  if (!view.players.find(p => p.id === view.youId)?.alive) return [];
  if (!['vote', 'night', 'witch'].includes(view.phase)) return [];
  if (view.phase === 'night' && !['werewolf', 'seer', 'guard'].includes(view.ownRole || '')) return [];
  if (view.phase === 'witch' && (view.ownRole !== 'witch' || !view.witch?.killAvailable)) return [];
  return view.players.filter(p => {
    if (!p.alive || p.id === view.youId) return false;
    if (view.phase === 'vote') return !view.runoffCandidates || view.runoffCandidates.includes(p.id);
    if (view.ownRole === 'werewolf') return !view.wolfIds?.includes(p.id);
    if (view.ownRole === 'guard') return p.id !== view.forbiddenGuardTarget;
    return true;
  });
}

export function inviteUrl(origin: string, lanUrls: string[], code: string): string {
  const current = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(current.hostname);
  const url = new URL('/', local && lanUrls.length ? lanUrls[0] : origin);
  url.searchParams.set('room', code);
  return url.toString();
}

export function parseSession(raw: string | null): Session | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || !['code', 'playerId', 'token'].every(key => typeof value[key] === 'string' && value[key].length > 0)) return null;
    return { code: value.code, playerId: value.playerId, token: value.token };
  } catch { return null; }
}

// Read public fields only: every phone must get the same story, even when its private view differs.
export function moderatorNarration(view: RoomView): string {
  const later = view.round % 2 === 0;
  switch (view.phase) {
    case 'lobby': return `Welcome to ${MODE_DETAILS[view.settings.mode || 'classic'].name}. Gather your village and mark yourselves ready. No one knows yet what the night will bring.`;
    case 'reveal': return 'The cards are dealt. Look at your role in private, then hide it. When every player is ready, the village will fall asleep.';
    case 'night': {
      const opening = later ? 'Darkness returns to the village. Keep your secrets close.' : 'The village closes its eyes. Beyond the windows, the wolves begin to stir.';
      return `${opening} ${view.settings.mode === 'no-seer' ? 'Wolves, make your choice. The night will continue for another stage before dawn.' : 'Wolves and village night roles, make your choices privately. Everyone else, wait quietly for dawn.'}`;
    }
    case 'witch': return 'The night is not over. Keep your eyes closed and your screens private. The village must wait a little longer before the sun can rise.';
    case 'morning': {
      const names = view.lastEliminated.map(id => view.players.find(player => player.id === id)?.name).filter(Boolean).join(', ');
      return names ? `Dawn breaks over a quieter village. ${names} will no longer join the discussion. Those still living must decide what to do next.` : 'Dawn breaks, and every seat is still filled. The village survived this night. What happened in the darkness remains a mystery.';
    }
    case 'discussion': return later ? 'Another day, another story. Speak together, question what you hear, and decide whose account holds up. The village will soon have to vote.' : 'The village gathers. Tell your stories, ask your questions, and listen carefully. One of these familiar voices may be hiding something.';
    case 'vote': return view.runoffCandidates ? 'The village is divided. Vote once more among the tied players. Another tie means the village sends no one away.' : 'The talking is over. Each living player must choose who leaves the village. Keep your vote private until the verdict.';
    case 'ended': return view.winner === 'wolves' ? 'The last doubts arrive too late. The wolves have taken the village. Turn over the cards and discover who was telling the truth.' : 'The village has found every wolf. Morning belongs to the villagers again. Turn over the cards and let every secret be told.';
  }
}
