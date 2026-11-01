import type { GameMode, Role, Settings } from './protocol.ts';

export const MODE_DETAILS: Record<GameMode, { name: string; description: string }> = {
  classic: { name: 'Classic', description: 'A Seer searches for the wolves. The village discusses and votes.' },
  'no-seer': { name: 'No Seer', description: 'No investigations. A Witch has two potions; a Drunk plays their part.' },
  infected: { name: 'The Infected Village', description: 'Once per game, the wolves can turn an ordinary Villager into a wolf instead of killing.' },
  'secret-pact': { name: 'The Secret Pact', description: 'Two players share a secret bond. If either is eliminated, both die.' },
};

export function roleDeck(settings: Settings, playerCount: number): Role[] {
  const roles: Role[] = Array<Role>(settings.wolves).fill('werewolf');
  roles.push(...(settings.mode === 'no-seer' ? ['witch', 'drunk'] as const : ['seer'] as const));
  if (settings.guard) roles.push('guard');
  while (roles.length < playerCount) roles.push('villager');
  return roles;
}
