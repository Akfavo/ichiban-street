/**
 * Génère les voix japonaises de toutes les répliques via l'API Cartesia.
 *
 *   npm run generate-voices                 → génère les MP3 manquants
 *   npm run generate-voices -- --force      → régénère tout
 *   npm run generate-voices -- --dry-run    → liste ce qui serait généré
 *   npm run generate-voices -- --only=eki   → un seul scénario (ou un id de réplique)
 *
 * Lit CARTESIA_API_KEY (obligatoire) dans .env, ainsi que les options
 * CARTESIA_VOICE_ID_HOMME, CARTESIA_VOICE_ID_FEMME (voix des PNJ selon leur genre),
 * CARTESIA_PLAYER_VOICE_ID (voix du joueur, sinon la voix homme),
 * CARTESIA_MODEL, CARTESIA_VERSION.
 * Les fichiers sont écrits dans public/audio/{id}.mp3 ; les fichiers existants sont ignorés.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCATIONS } from '../src/data/cityConfig';
import { getPhrasebookVoiceLines } from '../src/data/phrasebook';
import { getAllVoiceLines, type VoiceLine } from '../src/data/scenarios';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/audio');
const API = 'https://api.cartesia.ai';

/* ───────── .env (lecture simple, sans dépendance) ───────── */
function loadEnv() {
  const p = resolve(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env) || process.env[k] === '') process.env[k] = v;
  }
}
loadEnv();

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7);

const KEY = process.env.CARTESIA_API_KEY ?? '';
const MODEL = process.env.CARTESIA_MODEL || 'sonic-3.6';
const VERSION = process.env.CARTESIA_VERSION || '2025-04-16';

const headers = (json = true): Record<string, string> => ({
  'Cartesia-Version': VERSION,
  'X-API-Key': KEY,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Voice {
  id: string;
  name?: string;
  language?: string;
  gender?: string;
}

type Gender = 'homme' | 'femme';

/** 'homme' / 'femme' d'après le champ gender renvoyé par Cartesia (s'il existe) */
function voiceGender(v: Voice): Gender | null {
  const g = (v.gender ?? '').toLowerCase();
  if (/^(masc|male|man)/.test(g)) return 'homme';
  if (/^(fem|female|woman)/.test(g)) return 'femme';
  return null;
}

let voiceCache: Voice[] | null = null;
async function japaneseVoices(): Promise<Voice[]> {
  if (voiceCache) return voiceCache;
  const tryList = async (q: string): Promise<Voice[]> => {
    const r = await fetch(`${API}/voices${q}`, { headers: headers(false) });
    if (!r.ok) throw new Error(`GET /voices → HTTP ${r.status} ${await r.text()}`);
    const j = (await r.json()) as Voice[] | { data?: Voice[] };
    return Array.isArray(j) ? j : (j.data ?? []);
  };
  let voices = await tryList('?language=ja&limit=100').catch(() => [] as Voice[]);
  voices = voices.filter((v) => (v.language ?? 'ja').toLowerCase().startsWith('ja'));
  if (!voices.length) voices = (await tryList('?limit=100')).filter((v) => (v.language ?? '').toLowerCase().startsWith('ja'));
  if (!voices.length) throw new Error('Aucune voix japonaise trouvée : renseignez CARTESIA_VOICE_ID_HOMME et CARTESIA_VOICE_ID_FEMME dans .env');
  voiceCache = voices;
  return voices;
}

/** Choisit automatiquement une voix japonaise du bon genre si aucune n'est configurée */
async function pickJapaneseVoice(gender: Gender): Promise<string> {
  const voices = await japaneseVoices();
  const match = voices.find((v) => voiceGender(v) === gender);
  const v = match ?? voices[0];
  console.log(`→ Voix ${gender} choisie automatiquement : ${v.name ?? '?'} (${v.id})${match ? '' : ' — genre inconnu, à vérifier'}`);
  return v.id;
}

async function tts(text: string, voiceId: string): Promise<Buffer> {
  const body = {
    model_id: MODEL,
    transcript: text,
    voice: { mode: 'id', id: voiceId },
    output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    language: 'ja',
  };
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${API}/tts/bytes`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const msg = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const wait = 1500 * attempt;
      console.warn(`  … HTTP ${r.status}, nouvel essai dans ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    let extra = '';
    if (r.status === 400 && /model/i.test(msg)) extra = `\n  (Astuce : essayez CARTESIA_MODEL=sonic-3 dans .env)`;
    throw new Error(`POST /tts/bytes → HTTP ${r.status} ${msg}${extra}`);
  }
}

async function main() {
  let lines: VoiceLine[] = [...getAllVoiceLines(), ...getPhrasebookVoiceLines()];
  if (ONLY) lines = lines.filter((l) => l.scenarioId === ONLY || l.id === ONLY);
  mkdirSync(OUT, { recursive: true });

  const todo = lines.filter((l) => {
    const f = resolve(OUT, `${l.id}.mp3`);
    return FORCE || !existsSync(f) || statSync(f).size === 0;
  });
  console.log(`🎙  ${lines.length} répliques · ${todo.length} à générer · modèle ${MODEL}`);
  if (DRY) {
    for (const l of todo) {
      const who = l.speaker === 'player' ? 'joueur' : (LOCATIONS.find((loc) => loc.scenarioId === l.scenarioId)?.npc.gender ?? '?');
      console.log(`  ${l.id.padEnd(12)} [${who}] ${l.text}`);
    }
    return;
  }
  if (!todo.length) {
    console.log('✓ Tout est déjà généré (utilisez --force pour régénérer).');
    return;
  }
  if (!KEY) {
    console.error('✗ CARTESIA_API_KEY manquante. Copiez .env.example en .env et renseignez votre clé.');
    process.exit(1);
  }

  const env = process.env;
  const legacy = env.CARTESIA_VOICE_ID || '';
  const genderOf = (l: VoiceLine): Gender => LOCATIONS.find((loc) => loc.scenarioId === l.scenarioId)?.npc.gender ?? 'homme';
  const customOf = (l: VoiceLine) => LOCATIONS.find((loc) => loc.scenarioId === l.scenarioId)?.npc.cartesiaVoiceId;

  // genres réellement nécessaires pour les répliques à générer
  const needed = new Set<Gender>();
  for (const l of todo) {
    if (l.speaker === 'player') {
      if (!env.CARTESIA_PLAYER_VOICE_ID) needed.add('homme');
    } else if (!customOf(l)) needed.add(genderOf(l));
  }
  const voices: Record<Gender, string> = {
    homme: env.CARTESIA_VOICE_ID_HOMME || legacy,
    femme: env.CARTESIA_VOICE_ID_FEMME || legacy,
  };
  for (const g of needed) if (!voices[g]) voices[g] = await pickJapaneseVoice(g);
  const playerVoice = env.CARTESIA_PLAYER_VOICE_ID || voices.homme;
  console.log(`   voix homme : ${voices.homme || '—'} · voix femme : ${voices.femme || '—'} · joueur : ${playerVoice || '—'}`);

  let ok = 0;
  let fail = 0;
  for (const [i, l] of todo.entries()) {
    const voice = l.speaker === 'player' ? playerVoice : customOf(l) || voices[genderOf(l)];
    const tag = `[${String(i + 1).padStart(3)}/${todo.length}] ${l.id}`;
    try {
      const buf = await tts(l.text, voice);
      writeFileSync(resolve(OUT, `${l.id}.mp3`), buf);
      ok++;
      console.log(`✓ ${tag}  ${l.text}`);
    } catch (e) {
      fail++;
      console.error(`✗ ${tag}  ${(e as Error).message}`);
      if (/HTTP 401|HTTP 403/.test((e as Error).message)) {
        console.error('Clé API refusée : arrêt.');
        break;
      }
    }
    await sleep(120);
  }
  console.log(`\nTerminé : ${ok} fichier(s) créé(s), ${fail} échec(s). Dossier : public/audio/`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error('✗', (e as Error).message);
  process.exit(1);
});
