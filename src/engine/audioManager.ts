/**
 * Gestionnaire audio :
 *  1. tente de lire public/audio/{lineId}.mp3 (généré via `npm run generate-voices`)
 *  2. sinon, repli sur la synthèse vocale du navigateur (speechSynthesis, ja-JP).
 * Vitesse 1.0x ou 0.75x (sans changer la hauteur de la voix).
 * Gère aussi la musique d'ambiance, dont le volume baisse pendant les voix :
 *  - le jour : public/music/day-N.mp3 enchaînés dans un ordre aléatoire (retiré à chaque chargement) ;
 *  - la nuit : public/music/night.mp3 en boucle ;
 *  - fondu enchaîné entre les deux au passage jour ↔ nuit.
 */
/** musiques du trajet (jour / nuit) et leur début réel en secondes : saute le blanc d'intro du fichier */
const TRAIN_TRACKS = {
  day: { file: 'shinkansen.mp3', start: 1.5 },
  night: { file: 'shinkansen-night.mp3', start: 0.75 },
} as const;

export type AudioSource = 'mp3' | 'tts' | 'none';

export interface PlayOptions {
  /** texte japonais lu par la synthèse vocale si le MP3 est absent */
  text: string;
  /** 0.75 ou 1 */
  rate?: number;
  /** hauteur de voix pour la synthèse (0.5 → 2) */
  pitch?: number;
}

const DAY_TRACKS = ['day-1.mp3', 'day-2.mp3', 'day-3.mp3'];
const NIGHT_TRACK = 'night.mp3';

export class AudioManager {
  private exists = new Map<string, Promise<boolean>>();
  private audio: HTMLAudioElement | null = null;
  private token = 0;
  private jaVoice: SpeechSynthesisVoice | null = null;
  private base = import.meta.env.BASE_URL ?? './';
  private _muted = false;

  /* ── musique d'ambiance ── */
  private day: HTMLAudioElement | null = null;
  private night: HTMLAudioElement | null = null;
  private playlist: string[] = [];
  private plIndex = 0;
  private musicOn = true;
  private ducked = false;
  private nightOn = false;
  /** volume général (fondus marche / arrêt / voix) et part de la piste de nuit (0 = jour, 1 = nuit) */
  private level = 0;
  private mix = 0;
  private anims: Partial<Record<'level' | 'mix', { from: number; to: number; t0: number; ms: number; done?: () => void }>> = {};
  private animTimer = 0;
  /** volume normal / volume pendant une voix */
  musicVolume = 0.32;
  musicDuckVolume = 0.07;
  /** volume des voix (0 → 1), réglé dans ⚙️ Paramètres */
  voiceVolume = 1;
  /** durée du fondu enchaîné jour ↔ nuit */
  nightFadeMs = 3500;
  /** appelé à chaque lecture avec la source effectivement utilisée */
  onSource: ((s: AudioSource) => void) | null = null;
  onPlayingChange: ((playing: boolean) => void) | null = null;

  constructor() {
    if ('speechSynthesis' in window) {
      const pick = () => {
        const voices = window.speechSynthesis.getVoices();
        const ja = voices.filter((v) => v.lang?.toLowerCase().startsWith('ja'));
        // privilégie les voix « naturelles » / Google / Kyoko si présentes
        this.jaVoice =
          ja.find((v) => /natural|online|google/i.test(v.name)) ?? ja.find((v) => /kyoko|o-ren|haruka|nanami/i.test(v.name)) ?? ja[0] ?? null;
      };
      pick();
      window.speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  get muted() {
    return this._muted;
  }
  set muted(m: boolean) {
    this._muted = m;
    if (m) this.stop();
    this.refreshMusic();
  }

  get musicEnabled() {
    return this.musicOn;
  }
  set musicEnabled(on: boolean) {
    this.musicOn = on;
    this.refreshMusic();
  }

  private musicUrl(file: string) {
    const b = this.base.endsWith('/') ? this.base : `${this.base}/`;
    return `${b}music/${file}`;
  }

  /** nouvel ordre aléatoire des pistes de jour (sans rejouer la dernière en premier) */
  private reshuffle() {
    const last = this.playlist[this.playlist.length - 1];
    const list = [...DAY_TRACKS];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (list.length > 1 && list[0] === last) [list[0], list[1]] = [list[1], list[0]];
    this.playlist = list;
    this.plIndex = 0;
  }

  private nextDayTrack() {
    const d = this.day;
    if (!d) return;
    this.plIndex++;
    if (this.plIndex >= this.playlist.length) this.reshuffle();
    d.src = this.musicUrl(this.playlist[this.plIndex]);
    this.syncPlayback();
  }

  /** Lance la musique : à appeler après un geste utilisateur */
  startMusic() {
    if (!this.day) {
      this.reshuffle();
      const d = new Audio(this.musicUrl(this.playlist[0]));
      d.preload = 'auto';
      d.volume = 0;
      d.addEventListener('ended', () => this.nextDayTrack());
      const n = new Audio(this.musicUrl(NIGHT_TRACK));
      n.loop = true;
      n.preload = 'auto';
      n.volume = 0;
      this.day = d;
      this.night = n;
      this.mix = this.nightOn ? 1 : 0;
      document.addEventListener('visibilitychange', () => this.refreshMusic());
    }
    this.refreshMusic();
  }

  /** Passage jour / nuit : fondu enchaîné entre la playlist de jour et le thème de nuit */
  setNight(on: boolean, instant = false) {
    this.nightOn = on;
    const to = on ? 1 : 0;
    if (instant || !this.day) {
      delete this.anims.mix;
      this.mix = to;
      this.applyVolumes();
      this.syncPlayback();
    } else {
      this.animate('mix', to, this.nightFadeMs, () => this.syncPlayback());
      this.syncPlayback();
    }
  }

  private get shouldPlay() {
    return this.musicOn && !this._muted && !this.suspended && document.visibilityState === 'visible';
  }

  /* ── musique de la cinématique du shinkansen (remplace la musique du quartier) ── */
  private suspended = false;
  private train: HTMLAudioElement | null = null;
  private trains: Partial<Record<keyof typeof TRAIN_TRACKS, HTMLAudioElement>> = {};
  private trainFade = 0;

  private fadeTrain(to: number, ms: number, done?: () => void) {
    const el = this.train;
    if (!el) return;
    window.clearInterval(this.trainFade);
    const from = el.volume;
    const t0 = performance.now();
    this.trainFade = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        window.clearInterval(this.trainFade);
        done?.();
      }
    }, 30);
  }

  /** lance la musique du trajet (version jour ou nuit) en boucle (fondu), la musique du quartier s'efface */
  playShinkansen(night = false) {
    const key = night ? 'night' : 'day';
    const track = TRAIN_TRACKS[key];
    // l'autre version a pu rester en fondu de sortie : on la coupe net
    window.clearInterval(this.trainFade);
    if (this.train && this.train !== this.trains[key]) this.train.pause();
    let el = this.trains[key];
    if (!el) {
      el = new Audio(this.musicUrl(track.file));
      el.loop = true;
      el.preload = 'auto';
      this.trains[key] = el;
    }
    this.train = el;
    // le morceau commence par un court blanc : on démarre directement sur la musique
    if (el.readyState >= 1) el.currentTime = track.start;
    else el.addEventListener('loadedmetadata', () => (el.currentTime = track.start), { once: true });
    el.volume = 0;
    if (!this._muted && this.musicOn) {
      void el.play().catch(() => undefined);
      this.fadeTrain(Math.min(1, this.musicVolume * 1.6), 200);
    }
    this.suspended = true;
    this.refreshMusic();
  }

  /** arrête la musique du trajet et rend la main à la musique du quartier */
  stopShinkansen() {
    this.suspended = false;
    this.fadeTrain(0, 700, () => this.train?.pause());
    this.refreshMusic();
  }

  /** réglage utilisateur de la musique (0 → 1 ; 1 = volume d'origine) */
  setMusicScale(k: number) {
    k = Math.max(0, Math.min(1, k));
    this.musicVolume = 0.32 * k;
    this.musicDuckVolume = 0.07 * k;
    if (this.train && this.suspended && !this.train.paused) this.fadeTrain(Math.min(1, this.musicVolume * 1.6), 150);
    if (this.day && this.shouldPlay) this.animate('level', this.targetVolume(), 150);
  }

  setVoiceVolume(v: number) {
    this.voiceVolume = Math.max(0, Math.min(1, v));
    if (this.audio) this.audio.volume = this.voiceVolume;
  }

  private targetVolume() {
    return this.ducked ? this.musicDuckVolume : this.musicVolume;
  }

  /** lit les pistes audibles (ou en train d'arriver dans le fondu), met en pause les autres */
  private syncPlayback() {
    const mixTo = this.anims.mix?.to ?? this.mix;
    const want = (el: HTMLAudioElement | null, weight: number, weightTo: number) => {
      if (!el) return;
      const on = this.shouldPlay && (weight > 0.001 || weightTo > 0.001);
      if (on && el.paused) void el.play().catch(() => undefined);
      else if (!on && !el.paused && !this.anims.level) el.pause();
    };
    want(this.day, 1 - this.mix, 1 - mixTo);
    want(this.night, this.mix, mixTo);
  }

  private refreshMusic() {
    // musique du trajet : suit la coupure du son / de la musique
    const tr = this.train;
    if (tr && this.suspended) {
      const on = this.musicOn && !this._muted && document.visibilityState === 'visible';
      if (!on && !tr.paused) tr.pause();
      else if (on && tr.paused) {
        tr.volume = 0;
        void tr.play().catch(() => undefined);
        this.fadeTrain(Math.min(1, this.musicVolume * 1.6), 600);
      }
    }
    if (!this.day) return;
    if (this.shouldPlay) {
      this.syncPlayback();
      this.animate('level', this.targetVolume(), 900);
    } else {
      this.animate('level', 0, 400, () => {
        this.day?.pause();
        this.night?.pause();
      });
    }
  }

  private applyVolumes() {
    const v = (x: number) => Math.max(0, Math.min(1, x));
    if (this.day) this.day.volume = v(this.level * (1 - this.mix));
    if (this.night) this.night.volume = v(this.level * this.mix);
  }

  private animate(key: 'level' | 'mix', to: number, ms: number, done?: () => void) {
    this.anims[key] = { from: this[key], to, t0: performance.now(), ms, done };
    if (this.animTimer) return;
    // minuteur (et non requestAnimationFrame) : le fondu reste fluide même si le rendu ralentit
    this.animTimer = window.setInterval(() => {
      const now = performance.now();
      const finished: (() => void)[] = [];
      for (const k of ['level', 'mix'] as const) {
        const a = this.anims[k];
        if (!a) continue;
        const t = Math.min(1, (now - a.t0) / a.ms);
        // courbe douce (ease in-out) pour le fondu enchaîné
        const e = k === 'mix' ? t * t * (3 - 2 * t) : t;
        this[k] = a.from + (a.to - a.from) * e;
        if (t >= 1) {
          delete this.anims[k];
          if (a.done) finished.push(a.done);
        }
      }
      this.applyVolumes();
      finished.forEach((f) => f());
      if (!this.anims.level && !this.anims.mix) {
        window.clearInterval(this.animTimer);
        this.animTimer = 0;
      }
    }, 30);
  }

  /** baisse la musique pendant qu'une voix parle */
  private emitPlaying(playing: boolean) {
    if (this.ducked !== playing) {
      this.ducked = playing;
      if (this.day && this.shouldPlay) this.animate('level', this.targetVolume(), playing ? 250 : 900);
    }
    this.onPlayingChange?.(playing);
  }

  get hasJapaneseVoice() {
    return !!this.jaVoice;
  }

  /** À appeler dans un geste utilisateur pour débloquer l'audio (Safari/iOS) */
  unlock() {
    try {
      const a = new Audio();
      a.muted = true;
      void a.play().catch(() => undefined);
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {
      /* ignore */
    }
  }

  private url(id: string) {
    const b = this.base.endsWith('/') ? this.base : `${this.base}/`;
    return `${b}audio/${encodeURIComponent(id)}.mp3`;
  }

  /** Vérifie l'existence du MP3 (Vite renvoie index.html pour un fichier manquant → on teste le content-type) */
  private hasFile(id: string): Promise<boolean> {
    let p = this.exists.get(id);
    if (!p) {
      p = fetch(this.url(id), { method: 'HEAD', cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) return false;
          const ct = (r.headers.get('content-type') ?? '').toLowerCase();
          return ct.includes('audio') || ct.includes('mpeg') || ct.includes('octet-stream');
        })
        .catch(() => false);
      this.exists.set(id, p);
    }
    return p;
  }

  stop() {
    this.token++;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.emitPlaying(false);
  }

  async play(id: string, opts: PlayOptions): Promise<AudioSource> {
    this.stop();
    const tk = ++this.token;
    if (this._muted) return 'none';
    const rate = opts.rate ?? 1;
    if (await this.hasFile(id)) {
      if (tk !== this.token) return 'none';
      const ok = await this.playFile(id, rate, tk);
      if (ok) {
        this.onSource?.('mp3');
        return 'mp3';
      }
    }
    if (tk !== this.token) return 'none';
    const src = await this.speak(opts.text, rate, opts.pitch ?? 1, tk);
    this.onSource?.(src);
    return src;
  }

  /** joue puis attend la fin ; false si une autre lecture l'a interrompue */
  async playAndWait(id: string, opts: PlayOptions): Promise<boolean> {
    await this.play(id, opts);
    const tk = this.token;
    await new Promise<void>((res) => {
      const iv = window.setInterval(() => {
        if (tk !== this.token || !this.ducked) {
          window.clearInterval(iv);
          res();
        }
      }, 80);
    });
    return tk === this.token;
  }

  private playFile(id: string, rate: number, tk: number): Promise<boolean> {
    return new Promise((resolve) => {
      const a = new Audio(this.url(id));
      a.playbackRate = rate;
      a.volume = this.voiceVolume;
      const anyA = a as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
      anyA.preservesPitch = true;
      anyA.webkitPreservesPitch = true;
      anyA.mozPreservesPitch = true;
      this.audio = a;
      a.onended = () => {
        if (tk === this.token) this.emitPlaying(false);
      };
      a.onerror = () => resolve(false);
      a.play()
        .then(() => {
          a.playbackRate = rate;
          this.emitPlaying(true);
          resolve(true);
        })
        .catch(() => resolve(false));
    });
  }

  private speak(text: string, rate: number, pitch: number, tk: number): Promise<AudioSource> {
    if (!('speechSynthesis' in window)) return Promise.resolve('none');
    const synth = window.speechSynthesis;
    synth.cancel();
    return new Promise((resolve) => {
      // petit délai : certains navigateurs ignorent speak() juste après cancel()
      window.setTimeout(() => {
        if (tk !== this.token) return resolve('none');
        const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, ''));
        u.lang = 'ja-JP';
        if (this.jaVoice) u.voice = this.jaVoice;
        u.rate = rate < 1 ? 0.7 : 0.95;
        u.pitch = pitch;
        u.volume = this.voiceVolume;
        u.onend = () => {
          if (tk === this.token) this.emitPlaying(false);
        };
        u.onerror = () => {
          if (tk === this.token) this.emitPlaying(false);
        };
        synth.speak(u);
        this.emitPlaying(true);
        resolve('tts');
      }, 40);
    });
  }
}

export const audio = new AudioManager();
