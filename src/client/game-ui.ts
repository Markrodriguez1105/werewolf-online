import type { PlayerView, RoomView, Session } from '../shared/protocol.ts';

export function eligibleTargets(view: RoomView): PlayerView[] {
  if (!view.players.find(p => p.id === view.youId)?.alive) return [];
  if (view.phase !== 'vote' && view.phase !== 'night') return [];
  if (view.phase === 'night' && (!view.ownRole || view.ownRole === 'villager')) return [];
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
