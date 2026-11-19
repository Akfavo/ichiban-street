/**
 * Mini-jeu « Prix à l'oreille » : on entend un prix, on choisit parmi
 * des montants qui se ressemblent (1 800 / 1 080 / 8 100…).
 */

const DIGIT = ['', 'ichi', 'ni', 'san', 'yon', 'go', 'roku', 'nana', 'hachi', 'kyū'];

function under10000(n: number): string {
  const s = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (s) out.push(s === 1 ? 'sen' : s === 3 ? 'sanzen' : s === 8 ? 'hassen' : `${DIGIT[s]}sen`);
  if (h) out.push(h === 1 ? 'hyaku' : h === 3 ? 'sanbyaku' : h === 6 ? 'roppyaku' : h === 8 ? 'happyaku' : `${DIGIT[h]}hyaku`);
  if (t) out.push(t === 1 ? 'jū' : `${DIGIT[t]}jū`);
  if (u) out.push(DIGIT[u]);
  return out.join(' ');
}

/** lecture d'un prix en romaji : 1080 → « sen hachijū en » */
export function yenRomaji(n: number): string {
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  const parts: string[] = [];
  if (man) parts.push(`${under10000(man)}man`);
  if (rest) parts.push(under10000(rest));
  let r = parts.join(' ');
  // 4 et 9 en fin de prix : yo-en, kyū-en
  r = r.replace(/yon$/, 'yo');
  return `${r} en`;
}

export const yenFr = (n: number) => `${n.toLocaleString('fr-FR')} ¥`;

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** prix réalistes (konbini, ramen, électronique…) */
function randomPrice(level: number): number {
  const kinds = [
    () => rnd(1, 9) * 100 + (Math.random() < 0.4 ? rnd(1, 9) * 10 : 0), // 180, 450, 980
    () => rnd(1, 9) * 1000 + rnd(0, 9) * 100 + (Math.random() < 0.3 ? 80 : 0), // 1 800, 3 480
    () => rnd(1, 9) * 1000 + rnd(1, 9) * 10, // 1 080, 3 040
  ];
  if (level > 1) kinds.push(() => rnd(1, 9) * 10000 + rnd(0, 9) * 1000 + rnd(0, 9) * 100); // 12 800, 39 800
  return kinds[rnd(0, kinds.length - 1)]();
}

/** montants faciles à confondre avec n */
function confusables(n: number): number[] {
  const d = String(n).split('');
  const out = new Set<number>();
  // déplacer un chiffre (1800 ↔ 1080 ↔ 1008)
  for (let i = 1; i < d.length; i++) {
    for (let j = 1; j < d.length; j++) {
      if (i === j || d[i] === d[j]) continue;
      const c = [...d];
      [c[i], c[j]] = [c[j], c[i]];
      out.add(Number(c.join('')));
    }
  }
  // ×10 / ÷10
  out.add(n * 10);
  if (n % 10 === 0) out.add(n / 10);
  // inverser les deux premiers chiffres (1 800 ↔ 8 100)
  if (d.length > 1 && d[0] !== d[1] && d[1] !== '0') out.add(Number([d[1], d[0], ...d.slice(2)].join('')));
  // chiffre voisin à l'oreille : yon / nana, san / sen…
  const swap: Record<string, string> = { '4': '7', '7': '4', '1': '7', '6': '9', '9': '6', '3': '8', '8': '3' };
  const k = rnd(0, d.length - 1);
  if (swap[d[k]]) out.add(Number([...d.slice(0, k), swap[d[k]], ...d.slice(k + 1)].join('')));
  out.delete(n);
  return [...out].filter((x) => x >= 10 && x < 1000000);
}

export interface PriceRound {
  answer: number;
  options: number[];
}

export function makeRound(level = 1): PriceRound {
  const answer = randomPrice(level);
  const pool = confusables(answer).sort(() => Math.random() - 0.5);
  const options = [answer, ...pool.slice(0, 2)];
  while (options.length < 3) {
    const x = answer + rnd(1, 9) * 100;
    if (!options.includes(x)) options.push(x);
  }
  return { answer, options: options.sort(() => Math.random() - 0.5) };
}
