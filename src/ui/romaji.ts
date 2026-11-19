/**
 * Translittération kana → romaji (Hepburn simplifié) pour les explications :
 * dans les modes pensés pour les non-lecteurs, les petits bouts de japonais
 * cités dans les feedbacks (« すみません ») deviennent lisibles (« sumimasen »).
 * Les phrases connues (répliques, réponses, carnet) reprennent le romaji soigné
 * des données ; le reste est translittéré. Les kanji éventuels restent tels quels.
 */
import { MAGIC_PHRASES, EAR_WORDS } from '../data/phrasebook';
import { SCENARIOS, allVariants } from '../data/scenarios';

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n', ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};
const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SMALL_V: Record<string, string> = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };

/** katakana → hiragana (même table) */
const toHira = (ch: string) => {
  const c = ch.charCodeAt(0);
  return c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch;
};

const isKana = (ch: string) => /[ぁ-ゖァ-ヺー]/.test(ch);

function wordToRomaji(word: string): string {
  const chars = [...word].map(toHira);
  let out = '';
  let geminate = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const nx = chars[i + 1];
    if (ch === 'っ') {
      geminate = true;
      continue;
    }
    if (ch === 'ー') {
      const v = out.match(/[aeiou]$/)?.[0];
      if (v) out = out.slice(0, -1) + ({ a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū' } as Record<string, string>)[v];
      continue;
    }
    let syl = BASE[ch] ?? ch;
    if (nx && SMALL_Y[nx] && syl.endsWith('i') && syl.length > 1) {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja
      const stem = syl.slice(0, -1);
      syl = (/(sh|ch|j)$/.test(stem) ? stem : `${stem}y`) + SMALL_Y[nx];
      i++;
    } else if (nx && SMALL_V[nx] && /[uv]$/.test(syl) && syl.length > 1) {
      // ファ → fa, ヴィ → vi, ティ (approx.)
      syl = syl.slice(0, -1) + SMALL_V[nx];
      i++;
    } else if (nx && SMALL_V[nx] && /^(te|de)$/.test(syl)) {
      syl = syl[0] + SMALL_V[nx];
      i++;
    }
    if (ch === 'を' && out) {
      out += ' o ';
      continue;
    }
    if (geminate) {
      out += syl.startsWith('ch') ? 't' : syl[0];
      geminate = false;
    }
    // ん devant voyelle / y : n'
    if (out.endsWith('n') && chars[i - 1] === 'ん' && /^[aeiouy]/.test(syl)) out += "'";
    out += syl;
  }
  // particules en fin de groupe : は → wa, へ → e
  return out;
}

/** dictionnaire kana → romaji tiré des données (phrases entières + morceaux séparés par 、) */
let dict: { re: RegExp; romaji: string }[] | null = null;
function getDict() {
  if (dict) return dict;
  const map = new Map<string, string>();
  const add = (kana: string, romaji: string) => {
    const k = kana.replace(/\s+/g, '').replace(/[。．]$/, '');
    const r = romaji.trim().replace(/\.$/, '');
    if ([...k].length >= 2 && !map.has(k) && /[ぁ-ヺ]/.test(k)) map.set(k, r);
  };
  const lines: { kana: string; romaji: string }[] = [...MAGIC_PHRASES, ...EAR_WORDS];
  for (const sc of Object.values(SCENARIOS)) {
    lines.push(...allVariants(sc.outro));
    for (const st of sc.steps) lines.push(...allVariants(st), ...(st.vars ?? []), ...st.choices.flatMap((c) => allVariants(c)));
  }
  for (const l of lines) {
    add(l.kana, l.romaji);
    const kp = l.kana.split(/[、。]/).map((x) => x.trim()).filter(Boolean);
    const rp = l.romaji.split(/[,.]\s*/).map((x) => x.trim()).filter(Boolean);
    if (kp.length > 1 && kp.length === rp.length) kp.forEach((k, i) => add(k, rp[i]));
  }
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  dict = [...map.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([k, r]) => ({ re: new RegExp([...k].map(esc).join('\\s*'), 'g'), romaji: r }));
  return dict;
}

const ENDINGS = /([a-zō])(desu|deshita|masu|masen|mashita|kudasai|shimasu|imasu|imasen)(ka|ga|ne|yo)?(?=$|[\s,.!?…»)])/g;

/** Transforme chaque suite de kana d'un texte en romaji (le reste est conservé) */
export function kanaToRomaji(text: string): string {
  // 1) phrases connues : romaji des données
  let src = text;
  const known: string[] = [];
  for (const { re, romaji } of getDict()) {
    re.lastIndex = 0;
    if (!re.test(src)) continue;
    src = src.replace(re, () => `\u0000${known.push(romaji) - 1}\u0001`);
  }
  // 2) le reste : translittération
  let res = '';
  let buf = '';
  const flush = (nextCh: string) => {
    if (!buf) return;
    let r = wordToRomaji(buf);
    // は / へ en fin de groupe suivi d'un séparateur = particule (こんにちは, ふくろは …)
    const endsGroup = !nextCh || /[\s、。,.!?！？」』»)]/.test(nextCh);
    if (endsGroup && buf.length > 1 && /[はハ]$/.test(buf)) r = `${r.slice(0, -2)}wa`;
    else if (endsGroup && buf.length > 1 && /[へヘ]$/.test(buf)) r = `${r.slice(0, -2)}e`;
    r = r
      .replace(/ou/g, 'ō')
      .replace(/uu/g, 'ū')
      .replace(ENDINGS, (_m, a: string, b: string, c?: string) => `${a} ${b}${c ? ` ${c}` : ''}`)
      .replace(/(tai|nai)n desu/g, '$1 n desu')
      .replace(/onegaishimasu/g, 'onegai shimasu')
      .replace(/\s+$/, '');
    res += r;
    buf = '';
  };
  for (const ch of src) {
    if (isKana(ch)) {
      buf += ch;
    } else {
      flush(ch);
      res += ch === '、' ? ', ' : ch === '。' ? '. ' : ch === '？' ? '?' : ch === '！' ? '!' : ch === '〜' ? '…' : ch;
    }
  }
  flush('');
  return res
    .replace(/\u0000(\d+)\u0001/g, (_m, i: string) => known[Number(i)])
    .replace(/ {2,}/g, ' ')
    .replace(/ ([,.])/g, '$1');
}
