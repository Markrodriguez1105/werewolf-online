import type { Role } from '../shared/protocol.ts';

export const ROLES: Record<Role, { name: string; line: string; ability: string; team: string }> = {
  werewolf: { name: 'Werewolf', line: 'A familiar face. A darker secret.', ability: 'Each night, agree with the other wolves on one living villager to eliminate. Stay undiscovered during the day.', team: 'Werewolf team' },
  villager: { name: 'Villager', line: 'Trust your instincts. Not your friends.', ability: 'Listen, question, and vote. You have no night action; your strongest weapon is figuring out who is lying.', team: 'Village team' },
  seer: { name: 'Seer', line: 'Some secrets cannot stay hidden.', ability: 'Each night, investigate one other living player. At dawn, learn privately whether they are a werewolf.', team: 'Village team' },
  guard: { name: 'Guard', line: 'Keep the darkness at the door.', ability: 'Each night, protect one other living player from the wolves. You cannot protect yourself or the same person on consecutive nights.', team: 'Village team' },
};

export function RoleArt({ role, className = '' }: { role: Role | 'back'; className?: string }) {
  return <svg viewBox="0 0 160 160" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="miter" strokeLinecap="square" className={`role-art ${className}`} aria-hidden="true">
    {(role === 'werewolf' || role === 'back') && <>
      <path d="M40 57 31 21 63 39 80 34 98 39 130 21 120 59 128 98 105 112 101 137 59 137 55 112 32 98Z" />
      <path d="M44 54 40 36 59 48M103 48 121 36 115 55M53 62 64 53 74 57M87 56 98 53 109 62M50 70 66 77 72 70M90 70 96 77 112 70M53 91 68 86 80 94 92 86 108 91M80 94 80 112M68 105 80 112 93 105M61 118 66 130M98 118 93 130M41 92 48 97M119 92 112 97" />
      <path d="m73 83 7 3 7-3M76 43 80 47 84 43M76 51 80 55 84 51M58 66l9 4M94 70l10-4M55 111l-9-10M105 111l9-10" />
    </>}
    {role === 'villager' && <>
      <path d="M39 53 52 47 57 28 86 28 93 47 111 53 108 59 40 59ZM57 45h32M62 36h14M49 59l5 29 15 12 18-5 14-22-1-14M57 66l10 2M83 68l10-2M75 67l-2 14 9 1M64 89l14 3 10-5M55 95l-20 14-3 31M90 96l19 13 9 31M53 100l16 22 17-22M47 111l-3 29M103 116l4 24M49 140l3-14 18 10 20-10 8 14M72 125v8M121 42v97M114 42v24l7 9 7-9V42M121 31v35M115 79h13M31 110l-10-15-10 5 14 25 10-5M14 99l-3-7 6-3 9 17M20 94l-2-8 6-2 9 23" />
    </>}
    {role === 'seer' && <>
      <path d="M39 97 44 58 80 20 116 58 121 97M44 58l36 12 36-12M56 63l5 28 19 15 19-15 5-28M65 77l8 3M88 80l8-3M80 80l-3 11h8M72 96l8 3 8-3M59 99l-22 18-8 24h102l-8-24-22-18M59 109l21 16 21-16M80 125v16" />
      <path d="M59 44c9-11 18-16 29-10-14 1-17 11-9 18-8 4-14 1-20-8ZM80 53v7M25 57v12M19 63h12M133 82v12M127 88h12M121 25v8M117 29h8M28 86l3 5-3 5-3-5ZM110 119l-7 14M50 119l7 14" />
    </>}
    {role === 'guard' && <>
      <path d="M48 66V47l12-19h40l12 19v19M57 45h46M64 35h32M48 55h64M57 57l5 32 18 13 18-13 5-32M65 67l10 3M86 70l10-3M80 69v14M70 89l10 4 10-4M58 95l-25 15-5 31M101 96l24 15 7 30M43 106l10 14M117 106l-10 14" />
      <path d="M80 104 112 117 107 144 80 154 53 144 48 117ZM80 114v30M68 128h24M25 43v60M20 36h10l5 8-10 7-10-7ZM18 60h14M125 60v39M121 54h8M41 124l-8 13M119 125l8 13" />
    </>}
  </svg>;
}

export function RoleCard({ role, hidden = false, compact = false }: { role?: Role; hidden?: boolean; compact?: boolean }) {
  const back = hidden || !role;
  return <div className={`playing-card ${back ? 'card-back' : 'card-front'} ${compact ? 'card-compact' : ''}`}>
    <div className="card-inner">
      <span className="card-corner" aria-hidden="true">{back ? 'W' : '◇'}</span>
      <RoleArt role={back ? 'back' : role} />
      {back ? <><span className="card-name">Werewolf</span><span className="card-line">A game of hidden intentions</span></> : <><span className="card-name">{ROLES[role].name}</span><span className="card-line">{ROLES[role].line}</span></>}
      <span className="card-bottom" aria-hidden="true">{back ? 'W' : '◇'}</span>
    </div>
  </div>;
}

export function Moon({ sun = false }: { sun?: boolean }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="phase-symbol">{sun ? <><circle cx="24" cy="24" r="9" /><path d="M24 3v6M24 39v6M3 24h6M39 24h6M9 9l5 5M34 34l5 5M9 39l5-5M34 14l5-5" /></> : <><path d="M33 7a18 18 0 1 0 8 29A20 20 0 0 1 33 7Z" /><path d="M15 7v6M12 10h6M41 16v6M38 19h6" /></>}</svg>;
}
