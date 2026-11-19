import type { Difficulty } from '../engine/progress';

export interface DifficultyInfo {
  id: Difficulty;
  icon: string;
  label: string;
  short: string;
  desc: string;
}

export const DIFFICULTIES: DifficultyInfo[] = [
  { id: 'ecoute', icon: '🎧', label: 'Écoute', short: 'Comprendre à l’oreille', desc: 'Écoutez, devinez ce qu’on vous dit, puis répondez. Aucun japonais à lire. Recommandé.' },
  { id: 'facile', icon: '🌱', label: 'Facile', short: 'Romaji + français', desc: 'Tout est écrit en romaji avec la traduction française.' },
  { id: 'moyen', icon: '🎋', label: 'Moyen', short: 'Kana + romaji', desc: 'Kana et romaji ; la traduction française s’affiche à la demande.' },
  { id: 'difficile', icon: '🏯', label: 'Difficile', short: 'Audio seul', desc: 'Vous n’avez que la voix : écoutez, puis choisissez la réponse en romaji, sans traduction.' },
];

export const difficultyInfo = (d: Difficulty) => DIFFICULTIES.find((x) => x.id === d) ?? DIFFICULTIES[0];

export function nextDifficulty(d: Difficulty): Difficulty {
  const i = DIFFICULTIES.findIndex((x) => x.id === d);
  return DIFFICULTIES[(i + 1) % DIFFICULTIES.length].id;
}

/** modes destinés aux personnes qui ne lisent pas le japonais : explications sans kana */
export const readsKana = (d: Difficulty) => d === 'moyen';
