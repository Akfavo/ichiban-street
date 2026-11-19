/**
 * Progression persistée dans localStorage (protégé par try/catch :
 * navigation privée ou stockage bloqué → la progression reste en mémoire).
 */
/** ecoute : compréhension orale guidée · facile : romaji + français · moyen : kana + romaji (FR à la demande) · difficile : audio seul */
export type Difficulty = 'ecoute' | 'facile' | 'moyen' | 'difficile';

export interface Prefs {
  slow: boolean;
  difficulty: Difficulty;
  /** mode moyen : afficher la traduction française */
  showFr: boolean;
  /** musique d'ambiance activée */
  music: boolean;
  /** ambiance de nuit (bouton ☀️ / 🌙) */
  night: boolean;
  /** volumes (0 → 1) réglés dans ⚙️ Paramètres */
  musicVol: number;
  voiceVol: number;
  fxVol: number;
  /** qualité graphique : haute ou économie (ordinateurs modestes) */
  quality: 'high' | 'eco';
}

interface SaveData {
  version: 1;
  completed: string[];
  /** ids des répliques débloquées (carnet de survie) */
  phrases: string[];
  prefs: Prefs;
  introSeen: boolean;
  /** étapes ratées au moins une fois (onglet « À revoir » du carnet) */
  missed: string[];
}

const KEY = 'ichiban-japan-trainer:v1';

function sanitizePrefs(p: Prefs): Prefs {
  if (!['ecoute', 'facile', 'moyen', 'difficile'].includes(p.difficulty)) p.difficulty = 'ecoute';
  p.night = p.night === true;
  const vol = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 1);
  p.musicVol = vol(p.musicVol);
  p.voiceVol = vol(p.voiceVol);
  p.fxVol = vol(p.fxVol);
  if (p.quality !== 'eco') p.quality = 'high';
  delete (p as Partial<Prefs> & { alwaysHint?: boolean }).alwaysHint;
  return p;
}

function load(): SaveData {
  const empty: SaveData = { version: 1, completed: [], phrases: [], prefs: { slow: false, difficulty: 'ecoute', showFr: false, music: true, night: false, musicVol: 1, voiceVol: 1, fxVol: 1, quality: 'high' }, introSeen: false, missed: [] };
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      version: 1,
      completed: strings(d.completed),
      phrases: strings(d.phrases),
      prefs: sanitizePrefs({ ...empty.prefs, ...(d.prefs ?? {}) }),
      introSeen: !!d.introSeen,
      missed: strings(d.missed),
    };
  } catch {
    return empty;
  }
}

class Progress {
  private d = load();
  private listeners = new Set<() => void>();

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch {
      /* stockage indisponible */
    }
    this.listeners.forEach((l) => l());
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get completed(): readonly string[] {
    return this.d.completed;
  }
  isCompleted(id: string) {
    return this.d.completed.includes(id);
  }
  complete(id: string) {
    if (!this.isCompleted(id)) {
      this.d.completed.push(id);
      this.save();
    }
  }

  get phrases(): readonly string[] {
    return this.d.phrases;
  }
  hasPhrase(id: string) {
    return this.d.phrases.includes(id);
  }
  unlock(...ids: string[]) {
    let changed = false;
    for (const id of ids) {
      if (!this.d.phrases.includes(id)) {
        this.d.phrases.push(id);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  get missed(): readonly string[] {
    return this.d.missed;
  }
  /** une étape ratée part en révision ; réussie du premier coup, elle en sort */
  setMissed(stepId: string, missed: boolean) {
    const has = this.d.missed.includes(stepId);
    if (missed === has) return;
    this.d.missed = missed ? [...this.d.missed, stepId] : this.d.missed.filter((x) => x !== stepId);
    this.save();
  }

  get prefs(): Readonly<Prefs> {
    return this.d.prefs;
  }
  setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    this.d.prefs[k] = v;
    this.save();
  }

  get introSeen() {
    return this.d.introSeen;
  }
  markIntroSeen() {
    this.d.introSeen = true;
    this.save();
  }

  reset() {
    this.d = { version: 1, completed: [], phrases: [], prefs: this.d.prefs, introSeen: true, missed: [] };
    this.save();
  }
}

export const progress = new Progress();
