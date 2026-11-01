export type Role = 'werewolf' | 'villager' | 'seer' | 'guard';
export type Phase = 'lobby' | 'reveal' | 'night' | 'morning' | 'discussion' | 'vote' | 'ended';
export type Winner = 'village' | 'wolves';
export interface Settings {
  wolves: number;
  guard: boolean;
  discussionSeconds: number;
  nightSeconds: number;
  voteSeconds: number;
}
export const DEFAULT_SETTINGS: Settings = {
  wolves: 2, guard: false, discussionSeconds: 180, nightSeconds: 45, voteSeconds: 45,
};
export interface PlayerIdentity { id: string; name: string; connected: boolean; ready: boolean }
export interface GamePlayer extends PlayerIdentity { role: Role; alive: boolean }
export interface PlayerView extends PlayerIdentity { alive: boolean; role?: Role }
export interface Investigation { round: number; targetId: string; isWolf: boolean }
export interface GameEvent { id: number; round: number; text: string }
export interface GameState {
  phase: Exclude<Phase, 'lobby'>;
  round: number;
  players: GamePlayer[];
  settings: Settings;
  deadline: number | null;
  winner: Winner | null;
  events: GameEvent[];
  acknowledged: string[];
  nightActions: Record<string, string>;
  votes: Record<string, string>;
  investigations: Record<string, Investigation[]>;
  lastGuardTarget: string | null;
  runoffCandidates: string[] | null;
  voteTally: Record<string, number> | null;
  lastEliminated: string[];
}
export interface GameView {
  phase: Phase;
  round: number;
  players: PlayerView[];
  settings: Settings;
  deadline: number | null;
  winner: Winner | null;
  events: GameEvent[];
  ownRole?: Role;
  wolfIds?: string[];
  wolfSelections?: Record<string, string>;
  investigations: Investigation[];
  hasSubmitted: boolean;
  hasAcknowledged: boolean;
  ownTarget?: string;
  forbiddenGuardTarget?: string;
  runoffCandidates: string[] | null;
  voteTally: Record<string, number> | null;
  lastEliminated: string[];
}
export interface RoomView extends GameView {
  code: string;
  hostId: string;
  youId: string;
  lanUrls: string[];
}
export interface Session { code: string; playerId: string; token: string }
export interface JoinPayload { name: string; code?: string }
export type Action =
  | { type: 'ready'; ready: boolean }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'start' }
  | { type: 'acknowledge' }
  | { type: 'night'; targetId: string }
  | { type: 'vote'; targetId: string }
  | { type: 'advance' }
  | { type: 'rematch' }
  | { type: 'leave' };
export interface Reply { ok: boolean; error?: string; session?: Session }
export type Ack = (reply: Reply) => void;
export interface ClientToServerEvents {
  'room:create': (payload: JoinPayload, ack: Ack) => void;
  'room:join': (payload: JoinPayload, ack: Ack) => void;
  'room:resume': (payload: Session, ack: Ack) => void;
  'room:action': (action: Action, ack: Ack) => void;
}
export interface ServerToClientEvents { 'room:state': (state: RoomView) => void }
