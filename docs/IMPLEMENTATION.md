# Implementation agreement

User approved a classic LAN Werewolf game; card reference is white cards, thin inset borders, angular copper line drawings, small uppercase names, black backs. Match this, with new SVG role illustrations. Design direction: achromatic-ledger, user palette retained. Physical card is the product's signature; one clear action per phase. Interface: white, paper grey, near-black, muted copper; no gradients or external font/CDN requirement.

## Work ownership

- Engine agent: src/game/**, tests/engine.test.ts on feature/game-engine.
- Network agent: src/server/**, tests/server.test.ts on feature/rooms-networking.
- UI agent: src/client/**, tests/client.test.ts if needed on feature/mobile-ui.
- Parent owns shared protocol, package/config, docs, integration. Coordinate protocol changes through parent. Never change another agent's files. Commit own work when ready.

## Engine API (mutable GameState)

Export from src/game/engine.ts:

createGame(players: PlayerIdentity[], settings: Settings, now?: number, random?: () => number): GameState
acknowledgeRole(game: GameState, playerId: string, now?: number): void
submitNightAction(game: GameState, playerId: string, targetId: string): void
submitVote(game: GameState, playerId: string, targetId: string, now?: number): void
advance(game: GameState, now?: number): void
viewForPlayer(game: GameState, playerId: string): GameView

Throw Error on invalid actions. Game starts reveal; all acknowledged => night. Night is fixed duration (never early on all actions), resolve via advance by server on deadline. Morning lasts 8s then discussion; host may advance morning/discussion. Votes resolve on all living votes or deadline. Allow changing votes/night selection until resolution. Day targets living other players; no abstention; absent vote is ignored. Plurality wins, tied leaders runoff, another tie no elimination. Wolves must unanimously select one living nonwolf victim, missing wolf action means no attack. Seer checks living others; result delivered only at morning. Guard no self, no consecutive same target; missing action means no protection. Resolve night simultaneously including dying seer's investigation. No wolf victim => no attack. Dead players never act. Roles revealed on elimination. Win after resolution: zero wolves village; wolves >= village wolves. Round starts 1, increments entering subsequent night. Reset lastEliminated at beginning night. VoteTally is LAST resolved tally, never current pending votes; public event history has no private actions. Seer history private. Return only permitted role fields. Village night screen must not reveal if power roles remain alive. Presets: 6–7 one wolf; 8–11 two; 12–16 three; seer always; optional guard replaces villager. Settings wolf range 1–4, wolves strictly < half player count, village power roles fit. Public role counts are announced at start.

## Server

Export createAppServer(options?: {port?: number; host?: string; dev?: boolean; lanUrls?: string[]}) from src/server/app.ts, returning {httpServer, io, listen(): Promise<number>, close(): Promise<void>} (port 0 usable in tests). index.ts runs it on PORT default 3000 / 0.0.0.0; --dev uses Vite middleware on same server. Production serves dist. GET /api/health public {ok:true}. GET /api/network returns {urls:string[]}. Emit personalized room:state to each attached socket. In-memory rooms. Socket event names/types in shared protocol. Reply ack always {ok:boolean,error?,session?}. Create/join/resume reply session including secret token; NEVER include tokens in public state or URLs. On each join/reconnect emit state. No cookie requirement. Host auto-transfers on disconnect to connected player; original host does not reclaim on reconnect. Last host disconnect leaves host until another reconnects. All connected and ready to start; 6 min/16 max. Lobby joining only. Unique case-insensitive names, 1–20 chars normalized whitespace, reject control chars. Preset wolf count updates on join/leave unless host settings selected? Simpler auto preset on membership change; allow settings thereafter. Handle multiple sockets for session safely (disconnect replaced socket, reject its further actions). resume only valid token/id/code. Restart invalidates sessions. Deadline tick 250ms; all events validated including malformed payloads. Rematch host-only from ended returns lobby preserving seats but resets ready. Leave during game disconnects player, seat reserved; host transfers. Lobby leave removes seat. Clean empty rooms after bounded idle lifetime and clear timer on close. Limit room creation/join attempts and active rooms to bound memory. Room code 6 unambiguous uppercase chars crypto generated. No permissive CORS needed same-origin app. Fixed timer for night; host advance forbidden during night/vote/reveal, allowed morning/discussion. Server should keep game players' connected status in sync for UI.

## UI

React socket.io-client typed. Use same-origin io() and persist Session in localStorage; resume on connect. Initial join code from ?room=CODE. Do not auto create. Distinct home create/join, lobby, reveal, night, morning, discussion, voting, ended. Handle connection state, ack errors, loading; 8s ack timeout and retry available. Hide role by default, explicit show/hide; ack role button. No secret role persist beyond server session. In-match view may show own role only on request. Host can play and never sees all roles. Host share QR uses actual current LAN origin or lanUrls if localhost; code stays separate from player token. Network endpoint supports home host LAN helper. Reset UI and session on leave; resume invalid session shows actionable error and clears it. Ready toggle, host settings, start disabled with explanation. Auto timers use server deadline. Host controls advance only morning/discussion. Night select only special roles, eligible targets, wolf teammates visible only wolves; allow revise; show no other wolves' selected victim (generic waiting? app must support agreement; see note below). Morning last eliminations. Discussion living players, vote then tally results (tally from resolved phase). Dead spectators see public information, not living roles or private actions. End role summary + rematch. Rules guide with full house rules, role deck preview on home. Thumb controls >=44px, 360px no horizontal scroll, keyboard and reduced motion. New local SVG line art for four roles and back. No need imagegen.

IMPORTANT wolf coordination: wolves need to agree privately. Add wolfSelections?: Record<string,string> to GameView, sent only to living wolves during night, with each wolf's selection. UI shows names and selections to wolves. All other clients receive no wolf selections. This is necessary for unanimity without speaking aloud.

## Validation

Use node:test + tsx, no test framework dependency. Read TDD skill. Write meaningful failing behavior test before implementation, then green. Parent runs full tests/build, browser QA at mobile/tablet/desktop, multi-client games, secrecy checks and LAN URL reachability. No deployment, public tunnel or cloud needed.
