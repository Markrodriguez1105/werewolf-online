import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import type { Action, ClientToServerEvents, GameMode, JoinPayload, Reply, Role, RoomView, ServerToClientEvents, Session, Settings, WolfAction } from '../shared/protocol.ts';
import { MODE_DETAILS, roleDeck } from '../shared/modes.ts';
import { eligibleTargets, inviteUrl, parseSession, moderatorNarration } from './game-ui.ts';
import { Moon, ROLES, RoleArt, RoleCard } from './cards.tsx';

const SESSION_KEY = 'werewolf.session';
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type RequestEvent = 'room:create' | 'room:join' | 'room:resume' | 'room:action';
type ModalName = 'rules' | 'share' | 'role' | null;
class ServerReplyError extends Error {}

function storedSession() {
  try { return parseSession(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* The current socket still works when browser storage is unavailable. */ }
}

function ask(socket: GameSocket, event: RequestEvent, payload: JoinPayload | Action | Session): Promise<Reply> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new Error('Connection lost. Reconnect before trying again.')); return; }
    const done = (error: Error | null, reply: Reply) => {
      if (error) reject(new Error('The server did not respond. Check your connection and try again.'));
      else if (!reply?.ok) reject(new ServerReplyError(reply?.error || 'That action could not be completed.'));
      else resolve(reply);
    };
    switch (event) {
      case 'room:create': socket.timeout(8000).emit(event, payload as JoinPayload, done); break;
      case 'room:join': socket.timeout(8000).emit(event, payload as JoinPayload, done); break;
      case 'room:resume': socket.timeout(8000).emit(event, payload as Session, done); break;
      case 'room:action': socket.timeout(8000).emit(event, payload as Action, done); break;
    }
  });
}

export function App() {
  const [socket] = useState<GameSocket>(() => io({ autoConnect: false }));
  const sessionRef = useRef<Session | null>(storedSession());
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalName>(null);
  const [revealed, setRevealed] = useState(false);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState('');
  const [wolfKind, setWolfKind] = useState<WolfAction>('kill');

  useEffect(() => {
    let active = true;
    const connect = async () => {
      setConnected(true);
      setError('');
      if (!sessionRef.current) return;
      setPending('Rejoining your village…');
      try { await ask(socket, 'room:resume', sessionRef.current); }
      catch (e) {
        if (!active) return;
        if (e instanceof ServerReplyError && /^(Invalid session|Session expired)/i.test(e.message)) {
          sessionRef.current = null;
          saveSession(null);
          setRoom(null);
          setError(`${e.message} You can create a room or join again below.`);
        } else {
          setError(`${(e as Error).message} Your saved seat is kept. Retry joining when the connection returns.`);
        }
      } finally { if (active) setPending(''); }
    };
    const state = (view: RoomView) => { if (active) { setRoom(view); setLanUrls(view.lanUrls); } };
    const disconnect = () => { if (active) { setConnected(false); setRevealed(false); setModal(null); } };
    const connectError = () => { if (active) { setConnected(false); setError('Cannot reach the game server. Make sure the host is running and you are on the same Wi-Fi.'); } };
    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    socket.on('connect_error', connectError);
    socket.on('room:state', state);
    socket.connect();
    fetch('/api/network').then(r => r.ok ? r.json() : null).then(data => {
      if (active && Array.isArray(data?.urls)) setLanUrls(data.urls.filter((url: unknown) => typeof url === 'string'));
    }).catch(() => {});
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    const hide = () => { setRevealed(false); setModal(current => current === 'role' ? null : current); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.off('connect_error', connectError);
      socket.off('room:state', state);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => { setRevealed(false); setModal(current => current === 'role' ? null : current); }, [room?.phase, room?.round]);
  useEffect(() => { setSelected(room?.ownTarget || ''); }, [room?.phase, room?.round, room?.ownTarget, room?.runoffCandidates?.join(',')]);
  useEffect(() => { setWolfKind(room?.ownWolfAction || 'kill'); }, [room?.phase, room?.round, room?.ownWolfAction]);

  async function request(event: RequestEvent, payload: JoinPayload | Action | Session, label: string) {
    if (pending) return false;
    setPending(label);
    setError('');
    try {
      const reply = await ask(socket, event, payload);
      if (reply.session) { sessionRef.current = reply.session; saveSession(reply.session); }
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setPending(''); }
  }
  const action = (payload: Action, label = 'Saving…') => request('room:action', payload, label);
  const disabled = !!pending || !connected;
  const host = room?.hostId === room?.youId;
  const self = room?.players.find(p => p.id === room.youId);
  const isPlaying = !!room && room.phase !== 'lobby';
  const seconds = room?.deadline ? Math.max(0, Math.ceil((room.deadline - now) / 1000)) : null;
  const time = seconds === null ? '' : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const shareUrl = room ? inviteUrl(window.location.origin, room.lanUrls, room.code) : '';

  async function leave() {
    if (!await action({ type: 'leave' }, 'Leaving…')) return;
    sessionRef.current = null;
    saveSession(null);
    setRoom(null);
    setModal(null);
    setSelected('');
    setError('');
    window.history.replaceState({}, '', window.location.pathname);
  }

  return <div className={`app ${room?.phase === 'night' || room?.phase === 'witch' ? 'night-app' : ''}`}>
    <a className="skip-link" href="#main">Skip to game</a>
    <header className="app-header">
      <div className="brand"><RoleArt role="werewolf" /><span>Werewolf<span className="brand-dot">.</span></span></div>
      <nav aria-label="Game navigation">
        {isPlaying && room.ownRole && <button className="text-button" onClick={() => setModal('role')}>Your card</button>}
        <button className="text-button" onClick={() => setModal('rules')}>How to play <span aria-hidden="true">↗</span></button>
      </nav>
    </header>

    <main id="main" className={room ? 'room-main' : 'home-main'}>
      {!connected && <div className="connection-notice" role="status"><span className="connection-dot" />Connecting to the village… <button className="text-button" onClick={() => socket.connect()}>Retry</button></div>}
      {error && <div className="notice error-notice" role="alert"><p>{error}</p><button aria-label="Dismiss error" className="close-button" onClick={() => setError('')}>×</button></div>}
      {pending && <p className="request-status" role="status">{pending}</p>}
      {sessionRef.current && connected && !room && !pending && <button className="secondary resume-button" onClick={() => { socket.disconnect(); socket.connect(); }}>Rejoin saved seat <Arrow /></button>}

      {!room ? <Home disabled={disabled} lanUrls={lanUrls} onRules={() => setModal('rules')} onJoin={(payload, create) => request(create ? 'room:create' : 'room:join', payload, create ? 'Creating your village…' : 'Joining the village…')} /> : <>
        <div className="room-title-row">
          <div><p className="eyebrow">{room.phase === 'lobby' ? 'The gathering' : `Round ${room.round} · ${room.phase === 'ended' ? 'The reveal' : room.phase === 'reveal' ? 'Your secret' : room.phase === 'vote' ? 'The verdict' : room.phase === 'night' ? 'After dark' : 'In the village'}`}</p><h1>{room.phase === 'lobby' ? 'A village is forming.' : phaseTitle(room)}</h1></div>
          <button className="room-code-button" onClick={() => setModal('share')} aria-label={`Share room ${room.code}`}><span>Room code</span><strong>{room.code}</strong></button>
        </div>
        <div className="room-grid">
          <section className="game-panel" aria-label="Current game phase">
            <details className="moderator-narration" key={`${room.phase}-${room.round}`} open={room.phase === 'morning' || room.phase === 'ended'}><summary><strong>Moderator</strong><span>Read the story aloud</span></summary><p>{moderatorNarration(room)}</p></details>
            {room.phase === 'lobby' ? <Lobby room={room} disabled={disabled} action={action} onShare={() => setModal('share')} /> : <>
              {room.phase !== 'reveal' && room.phase !== 'ended' && <div className="phase-bar"><span><Moon sun={room.phase !== 'night' && room.phase !== 'witch'} />{room.phase === 'night' || room.phase === 'witch' ? 'Night' : room.phase === 'vote' ? (room.runoffCandidates ? 'Runoff vote' : 'Village vote') : room.phase === 'morning' ? 'Dawn' : 'Day'} {room.round}{room.phase === 'witch' ? ' · continues' : ''}</span>{time && <time className={`countdown ${seconds !== null && seconds <= 10 ? 'time-low' : ''}`} aria-label={`${seconds} seconds remaining`}>{time}</time>}</div>}
              <PrivateNotices room={room} />

              {room.phase === 'reveal' && <div className="reveal-stage">
                <p className="muted">Make sure only you can see your screen.</p>
                <button className="card-reveal-button" onClick={() => setRevealed(!revealed)} aria-label={revealed ? 'Hide your role' : 'Reveal your role'} aria-pressed={revealed}><RoleCard role={room.ownRole} hidden={!revealed} /></button>
                {revealed && room.ownRole ? <div className="role-explanation"><span className="team-caption">{ROLES[room.ownRole].team}</span><p>{ROLES[room.ownRole].ability}</p></div> : <p className="muted reveal-hint">Tap the card to discover your role.</p>}
                <button className="primary full" disabled={disabled || room.hasAcknowledged} onClick={() => { setRevealed(false); void action({ type: 'acknowledge' }, 'Sealing your secret…'); }}>{room.hasAcknowledged ? 'Waiting for the village…' : 'I know my role'}</button>
                <p className="footnote">{room.settings.mode === 'infected' ? 'An ordinary Villager may become a Werewolf during this game.' : 'Everyone keeps the same role for the whole game.'}</p>
              </div>}

              {room.phase === 'night' && <>
                <div className="phase-intro"><Moon /><h2>{!self?.alive ? 'Watch the night unfold.' : room.ownRole === 'werewolf' ? 'Choose your prey.' : room.ownRole === 'seer' ? 'Look beyond appearances.' : room.ownRole === 'guard' ? 'Stand watch.' : room.ownRole === 'witch' ? 'Keep your potions close.' : 'The village is sleeping.'}</h2><p>{!self?.alive ? 'Your story has ended, but the village plays on. Keep what you know to yourself.' : room.ownRole === 'werewolf' ? 'All living wolves must agree on the same person and the same action. Your pack can see your choice.' : room.ownRole === 'seer' ? 'Choose one living player. Your investigation will arrive privately at dawn.' : room.ownRole === 'guard' ? 'Protect someone from the wolves. You cannot choose yourself or last night’s target.' : room.ownRole === 'witch' ? 'Wait for the wolves’ choices to lock. Your private potion stage comes next, before dawn.' : 'No action is needed. Keep your screen private and wait for dawn.'}</p></div>
                {self?.alive && room.ownRole === 'werewolf' && room.settings.mode === 'infected' && <fieldset className="wolf-action-kind"><legend>Pack action</legend><label><input type="radio" name="wolf-kind" value="kill" checked={wolfKind === 'kill'} onChange={() => setWolfKind('kill')} disabled={disabled} /><span>Kill<span>A normal wolf attack</span></span></label><label><input type="radio" name="wolf-kind" value="infect" checked={wolfKind === 'infect'} onChange={() => setWolfKind('infect')} disabled={disabled || !room.infectionAvailable} /><span>Infect<span>{room.infectionAvailable ? 'One attempt for the whole pack, instead of a kill' : 'The pack’s infection attempt has been spent'}</span></span></label><p>Only an unprotected ordinary Villager who survives the night can turn. You may attempt any living non-wolf; an ineligible target makes the attempt fail.</p></fieldset>}
                {self?.alive && room.wolfSelections && <div className="pack-note"><h3>Your pack’s choices</h3>{room.players.filter(p => p.alive && room.wolfIds?.includes(p.id)).map(p => <p key={p.id}><span>{p.name}{p.id === room.youId ? ' (you)' : ''}</span><strong>{room.wolfSelections?.[p.id] ? `${room.wolfActionSelections?.[p.id] === 'infect' ? 'Infect' : 'Kill'} · ${room.players.find(target => target.id === room.wolfSelections?.[p.id])?.name || 'Selected player'}` : 'Choosing…'}</strong></p>)}</div>}
                {self?.alive && ['werewolf', 'seer', 'guard'].includes(room.ownRole || '') && <TargetPicker room={room} selected={selected} setSelected={setSelected} disabled={disabled} onSubmit={() => action({ type: 'night', targetId: selected, ...(room.ownRole === 'werewolf' ? { kind: wolfKind } : {}) }, 'Sending your choice…')} />}
                <p className="footnote">{room.settings.mode === 'no-seer' ? 'The potion stage follows this timer. Both night stages always run their full length.' : 'Night ends together when the timer runs out.'}</p>
              </>}

              {room.phase === 'witch' && (self?.alive && room.ownRole === 'witch' && room.witch ? <WitchActions room={room} disabled={disabled} action={action} /> : <><div className="phase-intro"><Moon /><h2>The night lingers.</h2><p>Keep your screen private and wait quietly. No action is needed from you during this stage.</p></div><p className="footnote">This stage always runs for the full timer, regardless of which roles are still alive.</p></>)}

              {room.phase === 'morning' && <>
                <div className="phase-intro"><Moon sun /><h2>{room.lastEliminated.length ? 'An empty seat at dawn.' : 'Everyone made it to dawn.'}</h2><p>{room.lastEliminated.length ? room.lastEliminated.map(id => room.players.find(p => p.id === id)?.name).join(', ') + ' did not survive the night.' : 'No one was eliminated during the night. The reason stays a secret.'}</p></div>
                {room.lastEliminated.map(id => { const player = room.players.find(p => p.id === id); return player && <div className="elimination" key={id}>{player.role && <RoleArt role={player.role} />}<div><strong>{player.name}</strong><span>{player.role ? ROLES[player.role].name : 'Eliminated'}</span></div></div>; })}
                <Investigations room={room} />
                {host && <button className="primary full" disabled={disabled} onClick={() => action({ type: 'advance' })}>Gather the village <Arrow /></button>}
                <p className="footnote">Discussion begins automatically after the dawn announcement.</p>
              </>}

              {room.phase === 'discussion' && <>
                <div className="phase-intro"><Moon sun /><h2>Someone here is lying.</h2><p>{self?.alive ? 'Talk together. Ask questions, compare stories, and decide who you trust. Voting starts when the time is up.' : 'Listen to the discussion, but keep your discoveries to yourself. Eliminated players cannot speak or vote.'}</p></div>
                <div className="discussion-prompt"><span>Start with a question</span><p>“Who do you suspect — and why?”</p></div>
                {self?.alive && room.ownRole === 'drunk' && <div className="private-note"><strong>Your part: the Drunk</strong><p>Play a little tipsy in the conversation. You have no special power, and your vote counts just like everyone else’s.</p></div>}
                <Investigations room={room} />
                {host ? <button className="primary full" disabled={disabled} onClick={() => action({ type: 'advance' })}>Bring it to a vote <Arrow /></button> : <p className="waiting-note">The host can begin voting early.</p>}
              </>}

              {room.phase === 'vote' && <>
                <div className="phase-intro"><h2>{room.runoffCandidates ? 'One more chance to decide.' : 'Who leaves the village?'}</h2><p>{!self?.alive ? 'The living players are deciding. Votes will be revealed after everyone has voted or time expires.' : room.runoffCandidates ? 'The vote was tied. Choose among the tied players below. Another tie means no elimination.' : 'Choose one other living player to eliminate. Votes stay private until the verdict.'}</p></div>
                {self?.alive && <TargetPicker room={room} selected={selected} setSelected={setSelected} disabled={disabled} onSubmit={() => action({ type: 'vote', targetId: selected }, 'Casting your vote…')} />}
              </>}

              {room.phase === 'ended' && <div className="results-stage"><RoleArt role={room.winner === 'wolves' ? 'werewolf' : 'villager'} /><span className="team-caption">The secret is out</span><h2>{room.winner === 'wolves' ? 'The wolves take the village.' : 'The village is safe.'}</h2><p>{room.winner === 'wolves' ? 'The wolves reached equal or greater numbers than the village team.' : 'Every werewolf has been eliminated.'}</p><div className="final-roles">{room.players.map(p => <div key={p.id}>{p.role && <RoleArt role={p.role} />}<span>{p.name}{p.id === room.youId ? ' (you)' : ''}</span><strong>{p.role ? ROLES[p.role].name : 'Unknown'}</strong></div>)}</div>{host ? <button className="primary full" disabled={disabled} onClick={() => action({ type: 'rematch' }, 'Preparing the next game…')}>Play another round <Arrow /></button> : <p className="waiting-note">Waiting for the host to start another game.</p>}</div>}
            </>}
          </section>
          <aside className="village-side">
            <Roster room={room} disabled={disabled} action={action} />
            {room.phase === 'lobby' && <div className="table-note"><RoleArt role="back" /><h3>One room. Many secrets.</h3><p>Keep this tab open. Each player needs their own phone, on the same Wi-Fi.</p><button className="text-button" onClick={() => setModal('share')}>Invite the others <Arrow /></button></div>}
            {room.phase !== 'lobby' && room.events.length > 0 && <details className="village-history" open><summary>Village chronicle</summary><ol>{room.events.slice(-8).map(event => <li key={event.id}><span>Round {event.round}</span><p>{event.text}</p></li>)}</ol></details>}
            {room.phase !== 'lobby' && room.voteTally && Object.keys(room.voteTally).length > 0 && <details className="tally"><summary>Last vote tally</summary>{Object.entries(room.voteTally).map(([id, count]) => <p key={id}><span>{room.players.find(p => p.id === id)?.name || 'Unknown player'}</span><strong>{count} {count === 1 ? 'vote' : 'votes'}</strong></p>)}</details>}
            <button className="text-button leave-button" disabled={disabled} onClick={() => void leave()}>Leave {room.phase === 'lobby' ? 'room' : 'game'} <span aria-hidden="true">↗</span></button>
            {isPlaying && <p className="footnote left">Leaving reserves your seat until this match ends.</p>}
            {host && isPlaying && room.phase !== 'ended' && <div className="host-reset"><button className="text-button" disabled={disabled} onClick={() => { if (window.confirm('End this match and return everyone to the lobby? Current roles and progress will be discarded.')) void action({ type: 'reset' }, 'Returning to the lobby…'); }}>End match</button><p className="footnote left">Return to the lobby if someone cannot continue.</p></div>}
          </aside>
        </div>
      </>}
    </main>

    <footer className="app-footer"><span>A game of hidden intentions.</span><span>{room ? `${room.players.length} players · ${room.code}` : 'Together, on your Wi-Fi.'}</span></footer>

    {modal && <Modal title={modal === 'rules' ? 'The rules of the village' : modal === 'share' ? 'Gather your people' : 'For your eyes only'} onClose={() => setModal(null)}>
      {modal === 'rules' && <Rules />}
      {modal === 'share' && room && <ShareRoom url={shareUrl} urls={room.lanUrls} code={room.code} />}
      {modal === 'role' && room?.ownRole && <div className="private-card"><RoleCard role={room.ownRole} /><span className="team-caption">{ROLES[room.ownRole].team}</span><p>{ROLES[room.ownRole].ability}</p><PrivateNotices room={room} />{room.witch && <p className="potion-status">Heal: {room.witch.healAvailable ? 'available' : 'spent'} · Poison: {room.witch.killAvailable ? 'available' : 'spent'}</p>}<Investigations room={room} /><button className="primary full" onClick={() => setModal(null)}>Hide my card</button></div>}
    </Modal>}
  </div>;
}

function Arrow() { return <span className="arrow" aria-hidden="true">→</span>; }

function phaseTitle(room: RoomView) {
  switch (room.phase) {
    case 'reveal': return 'Keep this to yourself.';
    case 'night': return 'The village falls silent.';
    case 'witch': return 'The night holds its breath.';
    case 'morning': return 'A new day breaks.';
    case 'discussion': return 'Trust is a dangerous thing.';
    case 'vote': return room.runoffCandidates ? 'The village is divided.' : 'Time to choose.';
    case 'ended': return 'Every story has an ending.';
    default: return 'Welcome to the village.';
  }
}

function Home({ disabled, lanUrls, onRules, onJoin }: { disabled: boolean; lanUrls: string[]; onRules: () => void; onJoin: (payload: JoinPayload, create: boolean) => Promise<boolean> }) {
  const initialCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '';
  const [mode, setMode] = useState<'create' | 'join'>(initialCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<Role | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    void onJoin({ name: name.trim(), ...(mode === 'join' ? { code: code.toUpperCase().trim() } : {}) }, mode === 'create');
  }
  return <>
    <div className={`home-grid ${mode === 'join' ? 'home-join' : ''}`}>
      <section className="home-story">
        <p className="eyebrow">A party game for devious people</p>
        <h1>Good people.<br />Very good liars.</h1>
        <p className="home-description">A quiet village. A few hidden wolves.<br />Your friends have a secret. Find it.</p>
        <div className="card-fan" aria-hidden="true"><div className="fan-card fan-left"><RoleCard role="villager" compact /></div><div className="fan-card fan-right"><RoleCard hidden compact /></div><div className="fan-card fan-center"><RoleCard role="werewolf" compact /></div></div>
        <p className="deck-caption">New night. Same familiar faces.</p>
      </section>
      <section className="join-panel" aria-label="Create or join a game">
        <div className="form-tabs" role="tablist" aria-label="How to join"><button role="tab" aria-selected={mode === 'create'} aria-controls="join-form-panel" id="create-tab" onClick={() => setMode('create')}>Host a game</button><button role="tab" aria-selected={mode === 'join'} aria-controls="join-form-panel" id="join-tab" onClick={() => setMode('join')}>Join a game</button></div>
        <div id="join-form-panel" role="tabpanel" aria-labelledby={mode === 'create' ? 'create-tab' : 'join-tab'}>
          <h2>{mode === 'create' ? 'Your village starts here.' : 'There’s a seat for you.'}</h2>
          <p className="muted">{mode === 'create' ? 'Gather 6–16 people. The app tells the story, so everyone gets to play.' : 'Join your host’s Wi-Fi and enter the room code they shared.'}</p>
          <form onSubmit={submit}>
            <label htmlFor="player-name">What should we call you?</label><input id="player-name" name="name" value={name} onChange={e => setName(e.target.value)} maxLength={20} minLength={1} autoComplete="nickname" placeholder="Your name" required />
            {mode === 'join' && <><label htmlFor="room-code">Room code</label><input id="room-code" name="room" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={6} minLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="code-input" placeholder="ABCDEF" required /></>}
            <button className="primary full" disabled={disabled || !name.trim() || (mode === 'join' && code.length !== 6)} type="submit">{mode === 'create' ? 'Create a village' : 'Enter the village'} <Arrow /></button>
          </form>
          <div className="no-account-note"><span aria-hidden="true">◇</span><p>No accounts. No downloads.<br /> Just your phones and a little suspicion.</p></div>
        </div>
      </section>
    </div>
    <div className="home-facts"><span><strong>6–16</strong> players</span><span>One phone each</span><span>Same Wi-Fi</span><button className="text-button" onClick={onRules}>Learn the game <Arrow /></button></div>
    <section className="meet-roles"><div className="section-heading"><div><h2>Everyone has a part to play.</h2><p>Some roles are less innocent than others.</p></div><span className="muted">Meet the deck</span></div><div className="role-strip">{(Object.keys(ROLES) as Role[]).map(role => <button key={role} className={`role-preview ${preview === role ? 'role-preview-active' : ''}`} onClick={() => setPreview(preview === role ? null : role)} aria-expanded={preview === role}><RoleArt role={role} /><span><strong>{ROLES[role].name}</strong><small>{role === 'werewolf' ? 'Deceive the village' : role === 'seer' ? 'Discover the truth' : role === 'guard' ? 'Protect a life' : role === 'witch' ? 'Choose their fate' : role === 'drunk' ? 'Play your part' : 'Find the wolves'}</small></span><span className="preview-plus" aria-hidden="true">{preview === role ? '−' : '+'}</span></button>)}</div>{preview && <div className="role-description"><span className="team-caption">{ROLES[preview].team}{preview === 'guard' ? ' · Optional role' : preview === 'witch' || preview === 'drunk' ? ' · No Seer mode' : ''}</span><p>{ROLES[preview].ability}</p></div>}</section>
    <details className="network-help"><summary>Hosting from this computer?</summary><p>Keep the server running and share its local network address with everyone on the same Wi-Fi.</p>{lanUrls.length ? lanUrls.map(url => <a key={url} href={url}>{url}</a>) : <p>The host’s LAN address appears here when available. On the host computer, check the terminal used to start the game.</p>}<p>Guest Wi-Fi or device isolation can prevent phones from reaching the host.</p></details>
  </>;
}

function Lobby({ room, disabled, action, onShare }: { room: RoomView; disabled: boolean; action: (action: Action, label?: string) => Promise<boolean>; onShare: () => void }) {
  const self = room.players.find(p => p.id === room.youId)!;
  const host = room.hostId === room.youId;
  const ready = room.players.filter(p => p.ready && p.connected).length;
  const canStart = room.players.length >= 6 && ready === room.players.length;
  const set = (settings: Partial<Settings>) => void action({ type: 'settings', settings });
  const deckSize = Math.max(6, room.players.length);
  const deck = roleDeck(room.settings, deckSize);
  const deckRoles = (Object.keys(ROLES) as Role[]).filter(role => deck.includes(role));
  return <>
    <div className="lobby-invitation"><RoleArt role="back" /><div><h2>Pull up a chair.</h2><p>{room.players.length < 6 ? `${6 - room.players.length} more ${6 - room.players.length === 1 ? 'person' : 'people'} needed before the story begins.` : 'The village is big enough. Get everyone ready.'}</p></div></div>
    <button className="secondary full" onClick={onShare}>Share room link or QR code <Arrow /></button>
    <div className="mode-picker"><label htmlFor="game-mode">Game mode</label><select id="game-mode" value={room.settings.mode || 'classic'} disabled={!host || disabled} onChange={e => set({ mode: e.target.value as GameMode })}>{(Object.keys(MODE_DETAILS) as GameMode[]).map(mode => <option key={mode} value={mode}>{MODE_DETAILS[mode].name}</option>)}</select><p>{MODE_DETAILS[room.settings.mode || 'classic'].description}</p>{!host && <p className="footnote left">The host chooses the mode before dealing.</p>}</div>
    <div className="deck-composition"><h3>Initial deck · {deckSize} players</h3><div>{deckRoles.map(role => { const count = deck.filter(card => card === role).length; return <span key={role}>{count} {count === 1 ? ROLES[role].name : role === 'werewolf' ? 'Werewolves' : `${ROLES[role].name}s`}</span>; })}</div><p className="footnote left">{room.players.length < 6 ? 'Preview for the minimum village. Counts grow as players join. ' : ''}Roles are shuffled privately when the game starts.{room.settings.mode === 'infected' ? ' These are starting counts; a conversion can grow the pack later.' : ''}</p></div>
    <details className="game-settings"><summary>{host ? 'Game settings' : 'View game settings'}<span>Discussion {room.settings.discussionSeconds / 60} min</span></summary><div className="settings-fields"><label>Werewolves<select value={room.settings.wolves} disabled={!host || disabled} onChange={e => set({ wolves: Number(e.target.value) })}>{[1, 2, 3, 4].map(n => <option key={n} value={n} disabled={n >= room.players.length / 2}>{n}</option>)}</select></label><label>Discussion<select value={room.settings.discussionSeconds} disabled={!host || disabled} onChange={e => set({ discussionSeconds: Number(e.target.value) })}>{[60, 120, 180, 300, 600].map(n => <option key={n} value={n}>{n / 60} {n === 60 ? 'minute' : 'minutes'}</option>)}</select></label><label>Night actions<select value={room.settings.nightSeconds} disabled={!host || disabled} onChange={e => set({ nightSeconds: Number(e.target.value) })}>{[15, 30, 45, 60, 90].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label>Voting<select value={room.settings.voteSeconds} disabled={!host || disabled} onChange={e => set({ voteSeconds: Number(e.target.value) })}>{[15, 30, 45, 60, 90].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label className="checkbox-label"><span><strong>Include the Guard</strong><small>A protective role, replacing one Villager.</small></span><input type="checkbox" checked={room.settings.guard} disabled={!host || disabled} onChange={e => set({ guard: e.target.checked })} /></label></div></details>
    <div className="ready-area"><div className="ready-caption"><span>{ready} of {room.players.length} ready</span><span>{self.ready ? 'You’re ready' : 'Your seat is waiting'}</span></div><button className={self.ready ? 'secondary full ready-button' : 'primary full'} disabled={disabled} onClick={() => action({ type: 'ready', ready: !self.ready })}>{self.ready ? 'Ready — tap to undo' : 'I’m ready'}{self.ready ? <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg> : <Arrow />}</button>{host && <button className="primary full" disabled={disabled || !canStart} onClick={() => action({ type: 'start' }, 'Shuffling the deck…')}>Deal the cards <Arrow /></button>}<p className="footnote">{room.players.length < 6 ? 'At least 6 players are needed to start.' : !canStart ? 'Everyone must be connected and ready.' : host ? 'All seats are ready. Time to deal.' : 'Waiting for the host to deal the cards.'}</p></div>
  </>;
}

function TargetPicker({ room, selected, setSelected, disabled, onSubmit }: { room: RoomView; selected: string; setSelected: (id: string) => void; disabled: boolean; onSubmit: () => Promise<boolean> }) {
  const targets = eligibleTargets(room);
  return <div className="target-picker"><div className="target-list" role="radiogroup" aria-label={room.phase === 'vote' ? 'Choose your vote' : 'Choose your night target'}>{targets.map(player => <button key={player.id} role="radio" aria-checked={selected === player.id} className={`target-option ${selected === player.id ? 'target-selected' : ''}`} onClick={() => setSelected(player.id)} disabled={disabled}><span className="player-initial">{player.name.slice(0, 1).toUpperCase()}</span><span>{player.name}</span><span className="radio-indicator" aria-hidden="true">{selected === player.id ? '●' : ''}</span></button>)}</div>{targets.length ? <button className="primary full" disabled={disabled || !targets.some(p => p.id === selected)} onClick={() => void onSubmit()}>{room.hasSubmitted ? 'Update your choice' : room.phase === 'vote' ? 'Cast my vote' : 'Confirm my choice'} <Arrow /></button> : <p className="waiting-note">No eligible players to choose. Wait for the phase to finish.</p>}{room.hasSubmitted && <p className="selection-saved" role="status">Choice saved{room.ownTarget ? `: ${room.players.find(p => p.id === room.ownTarget)?.name || 'selected player'}` : ''}. You can change it before the phase ends.</p>}</div>;
}

function WitchActions({ room, disabled, action }: { room: RoomView; disabled: boolean; action: (action: Action, label?: string) => Promise<boolean> }) {
  const witch = room.witch!;
  const [heal, setHeal] = useState(witch.choice?.heal || false);
  const [poisonTargetId, setPoisonTargetId] = useState(witch.choice?.poisonTargetId || '');
  const victim = room.players.find(player => player.id === witch.attackTargetId);
  const targets = eligibleTargets(room);
  const canHeal = witch.healAvailable && !!witch.attackTargetId;
  return <div className="witch-actions"><div className="phase-intro"><RoleArt role="witch" /><h2>Two potions. Your decision.</h2><p>Only you can see these choices. Each potion can be spent once this game. You may use both tonight, or keep them for later.</p></div><div className="raw-victim"><span>The wolves’ chosen victim</span><strong>{victim ? `${victim.name}${victim.id === room.youId ? ' (you)' : ''}` : 'No victim tonight'}</strong><p>You cannot see whether the Guard is protecting this person.</p></div><label className="potion-choice"><span><strong>Healing potion <small>{witch.healAvailable ? 'Available' : 'Spent'}</small></strong><span>{!witch.healAvailable ? 'Your healing potion has already been used.' : !victim ? 'No wolf victim to save tonight.' : 'Cancel the wolf attack on this person. You may save yourself.'}</span></span><input type="checkbox" checked={canHeal && heal} onChange={e => setHeal(e.target.checked)} disabled={disabled || !canHeal} /></label><div className="poison-choice"><label htmlFor="poison-target">Poison <span>{witch.killAvailable ? 'Available' : 'Spent'}</span></label><select id="poison-target" value={poisonTargetId} disabled={disabled || !witch.killAvailable} onChange={e => setPoisonTargetId(e.target.value)}><option value="">Keep the poison</option>{targets.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select><p>{witch.killAvailable ? 'Choose another living player to eliminate. Poison bypasses Guard protection and healing.' : 'Your poison has already been used.'}</p></div><button className="primary full" disabled={disabled} onClick={() => action({ type: 'witch', choice: { heal: canHeal && heal, poisonTargetId: witch.killAvailable && poisonTargetId ? poisonTargetId : null } }, 'Saving your potion choices…')}>{witch.choice ? 'Update potion choices' : !heal && !poisonTargetId ? 'Keep my potions tonight' : 'Confirm potion choices'} <Arrow /></button>{witch.choice && <p className="selection-saved" role="status">Choices saved. Potions are spent only when the night resolves; you may change your mind until then.</p>}<p className="footnote">Healing only cancels the wolf attack. A player who is healed and poisoned still dies from poison.</p></div>;
}

function PrivateNotices({ room }: { room: RoomView }) {
  const partner = room.players.find(player => player.id === room.pactPartnerId);
  if (!room.wasInfected && !partner) return null;
  return <div className="private-notices">{room.wasInfected && <div className="private-note" role="status"><span>Only you can see this</span><strong>You are now a Werewolf.</strong><p>You win with the wolves. Your living pack appears during the night; keep your new allegiance secret.</p></div>}{partner && <div className="private-note"><span>Your secret pact</span><strong>Your partner is {partner.name}.</strong><p>If either of you is eliminated, the other dies too. Your original teams and victory conditions stay the same. Your partner’s role remains secret.</p></div>}</div>;
}

function Roster({ room, disabled, action }: { room: RoomView; disabled: boolean; action: (action: Action, label?: string) => Promise<boolean> }) {
  return <section className="roster"><div className="section-heading"><h2>{room.phase === 'lobby' ? 'At the table' : 'The village'}</h2><span>{room.phase === 'lobby' ? `${room.players.length} / 16` : `${room.players.filter(p => p.alive).length} alive`}</span></div><ul>{room.players.map((player, index) => <li key={player.id} className={!player.alive && room.phase !== 'lobby' ? 'player-eliminated' : ''}><span className="seat-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{player.name}{player.id === room.youId && <small> you</small>}</strong><span>{room.phase === 'lobby' ? player.id === room.hostId ? 'Host' : 'Villager-to-be' : !player.alive ? player.role ? `Eliminated · ${ROLES[player.role].name}` : 'Eliminated' : player.id === room.hostId ? 'Host · Alive' : 'Alive'}</span></div><span className={`player-status ${!player.connected ? 'status-offline' : room.phase === 'lobby' && player.ready ? 'status-ready' : ''}`}>{!player.connected ? 'Offline' : room.phase === 'lobby' ? player.ready ? 'Ready' : 'Not ready' : !player.alive ? 'Out' : 'In'}</span>{room.phase === 'lobby' && !player.connected && room.hostId === room.youId && <button className="text-button remove-seat" disabled={disabled} onClick={() => action({ type: 'remove', playerId: player.id })} aria-label={`Remove ${player.name}`}>Remove</button>}</li>)}</ul></section>;
}

function Investigations({ room }: { room: RoomView }) {
  if (!room.investigations.length) return null;
  return <div className="investigations"><h3>Only you know this</h3>{room.investigations.map(result => <p key={`${result.round}-${result.targetId}`}><span>Night {result.round}</span><strong>{room.players.find(p => p.id === result.targetId)?.name || 'A player'} {result.isWolf ? 'is a Werewolf.' : 'is not a Werewolf.'}</strong></p>)}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="close-button" aria-label="Close dialog" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></dialog>;
}

function ShareRoom({ url, urls, code }: { url: string; urls: string[]; code: string }) {
  const [image, setImage] = useState('');
  const [message, setMessage] = useState('');
  const [selectedUrl, setSelectedUrl] = useState(url);
  const addresses = [...new Set([url, ...urls.map(origin => inviteUrl(origin, [], code))])];
  useEffect(() => { let active = true; QRCode.toDataURL(selectedUrl, { width: 240, margin: 2, color: { dark: '#191817', light: '#ffffff' } }).then(image => { if (active) setImage(image); }).catch(() => { if (active) setMessage('QR code unavailable. Share the link below.'); }); return () => { active = false; }; }, [selectedUrl]);
  async function copy() {
    try { await navigator.clipboard.writeText(selectedUrl); setMessage('Room link copied.'); }
    catch { setMessage('Select and copy the room link below.'); }
  }
  return <div className="share-room"><p>Everyone joins the same Wi-Fi, then scans this code with their phone’s camera.</p>{image ? <img className="qr-image" src={image} alt={`Join room ${code} by scanning this QR code`} width="240" height="240" /> : <div className="qr-loading">Preparing QR code…</div>}<p className="share-code">{code}</p><p className="muted">Or enter this room code on the home screen.</p>{addresses.length > 1 && <div className="share-address"><label htmlFor="share-address">Host network address</label><select id="share-address" value={selectedUrl} onChange={e => { setSelectedUrl(e.target.value); setMessage(''); }}>{addresses.map(address => <option key={address} value={address}>{new URL(address).origin}</option>)}</select><p className="footnote left">Choose the address on your Wi-Fi network if a VPN address does not work.</p></div>}<label htmlFor="share-link">Room link</label><div className="copy-link"><input id="share-link" readOnly value={selectedUrl} onFocus={e => e.target.select()} /><button className="secondary" onClick={() => void copy()}>Copy</button></div><p role="status" className="footnote">{message || 'The host computer must stay on while you play.'}</p></div>;
}

function Rules() {
  return <div className="rules-content">
    <p className="rule-lead">Most of you want to save the village.<br />A few of you have other plans.</p>
    <p>Gather 6–16 people in one room, each with a phone on the host’s Wi-Fi. The app is the Moderator and displays a story for each phase; the host can read it aloud while still playing. Choose a mode before the cards are dealt.</p>
    <h3>Four ways to play</h3>
    <div className="rule-modes">{(Object.keys(MODE_DETAILS) as GameMode[]).map(mode => <div key={mode}><h4>{MODE_DETAILS[mode].name}</h4><p>{MODE_DETAILS[mode].description}</p></div>)}</div>
    <ol className="rule-steps">
      <li><strong>Keep your role a secret.</strong><p>The app shuffles the starting deck. Check your card privately, then hide it and confirm. Wolves know their living pack. In Secret Pact, two players privately learn each other’s names, but not roles.</p></li>
      <li><strong>Make your move at night.</strong><p>Living wolves must agree on the same living non-wolf and action. The Seer investigates another living player. If enabled, the Guard protects one other living player. Ordinary Villagers and the Drunk have no night action.</p></li>
      <li><strong>In No Seer, the night continues.</strong><p>The wolves’ choices lock, then a second fixed-length night stage begins. Only the living Witch sees the raw wolf victim and may choose potions. No deaths resolve before this stage ends.</p></li>
      <li><strong>Listen at dawn.</strong><p>All night effects resolve together. Eliminated players’ roles are revealed. Seer results are private and arrive at dawn, even if the Seer died that night. A conversion is announced only on the affected player’s phone.</p></li>
      <li><strong>Talk, then vote.</strong><p>Discuss suspicions aloud. Bluffing and claiming roles are allowed. Each living player votes for one other living player; the Drunk’s vote counts normally. Votes remain hidden until everyone votes or time expires. The most votes means elimination.</p></li>
    </ol>
    <h3>The roles</h3><div className="rule-roles">{(Object.keys(ROLES) as Role[]).map(role => <div key={role}><RoleArt role={role} /><div><h4>{ROLES[role].name}{role === 'guard' ? ' (optional)' : role === 'witch' || role === 'drunk' ? ' (No Seer)' : ''}</h4><p>{ROLES[role].ability}</p></div></div>)}</div>
    <h3>No Seer: the Witch and the Drunk</h3>
    <p>The Witch replaces the Seer; the Drunk replaces one ordinary Villager, keeping the same player count. There is no Seer investigation. The Drunk belongs to the village, role-plays being tipsy during discussion, and has no special power.</p>
    <ul className="house-rules">
      <li>The Witch has one healing potion and one poison for the entire game, and may use both in the same night.</li>
      <li>The Witch sees the wolves’ raw chosen victim, even if the Guard protects that person. The Witch may heal herself if she is that victim.</li>
      <li>Healing cancels only the wolf attack. A chosen healing potion is spent even if the Guard also protects the victim.</li>
      <li>Poison can target any other living player, including a wolf, but never the Witch herself. Guard protection does not stop poison. A healed and poisoned player still dies from poison.</li>
      <li>Choices may be revised until the stage ends; potions are consumed only at resolution. Skipping uses no potions. A Witch attacked by wolves can still act before the night resolves.</li>
      <li>Both night stages always run their full timer, even after the Witch dies or spends both potions. The second stage never announces whether the Witch acted.</li>
    </ul>
    <h3>The Infected Village</h3>
    <p>This mode uses the Classic starting deck. Once per game, living wolves may all agree to infect the same player instead of killing. They may attempt any living non-wolf; the target’s hidden eligibility is not disclosed.</p>
    <ul className="house-rules">
      <li>Only an ordinary Villager who survives all night effects may become a Werewolf. Seer and Guard are ineligible. Guard protection blocks conversion.</li>
      <li>A unanimous infection attempt is spent even when protection or ineligibility makes it fail. Disagreement on action or target, or a missing wolf choice, means no attack and no spent attempt.</li>
      <li>A converted player privately sees “You are now a Werewolf.” They win with the wolves, learn their living pack, and may act with them starting next night. The pack learns its new member.</li>
      <li>The village receives no conversion announcement. Public deck counts describe the initial deal and do not increase when someone turns.</li>
    </ul>
    <h3>The Secret Pact</h3>
    <p>This mode also uses the Classic deck. Two distinct players are linked randomly, independently of their roles. Each privately learns the other’s name. Their teams and victory conditions remain unchanged; this is not a new team.</p>
    <p>If either partner dies during the night or by day vote, their living partner dies too before the victory check. Guard protection may prevent a direct wolf attack, but cannot prevent death through the bond. The partner’s secret role is not revealed by the pact itself.</p>
    <h3>How a team wins</h3>
    <p><strong>Village:</strong> eliminate every werewolf. <strong>Werewolves:</strong> equal or outnumber all other living players. All village roles count toward the village. Eliminated players still share their team’s victory. Infection changes the converted player’s team; a pact does not.</p>
    <h3>Rules at every table</h3>
    <ul className="house-rules">
      <li>A tied day vote gets one runoff among tied players. A second tie, or no votes, means no elimination.</li>
      <li>Wolves see their pack’s choices privately. They must agree on both action and target. Missing or disagreeing choices mean no attack.</li>
      <li>The optional Guard replaces an ordinary Villager in every mode. The Guard cannot protect themselves or the same player on consecutive nights.</li>
      <li>Missing an action means that ability is unused. Missing a vote means it is not counted. Choices can be changed until the phase closes.</li>
      <li>Night stages always last their full timer. The host can end daytime discussion early, but cannot skip night actions.</li>
      <li>Eliminated players cannot act, vote, or share information. They can watch the public game. Keep private notices and your role card off other people’s screens.</li>
      <li>A refresh or brief disconnection keeps your seat in the same browser. Restarting the host server ends active matches. If the host disconnects, another connected player becomes host.</li>
    </ul>
    <h3>A good starting deck</h3>
    <p>For 8 players, Classic, Infected Village, and Secret Pact start with 2 Werewolves, 1 Seer, and 5 Villagers. No Seer starts with 2 Werewolves, 1 Witch, 1 Drunk, and 4 Villagers. Adding a Guard replaces one Villager. The lobby always shows the exact starting composition for its settings.</p>
    <p className="footnote left">These are our app’s house rules, inspired by classic Werewolf. Editions differ. <a href="https://beziergames.com/products/ultimate-werewolf" target="_blank" rel="noreferrer">Read the publisher’s game overview ↗</a></p>
  </div>;
}
