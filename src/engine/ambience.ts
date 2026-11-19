/**
 * Ambiance sonore 100 % synthétisée (Web Audio) : aucun fichier, aucune licence.
 *
 * Nappes (volume selon l'heure et la position du joueur) :
 *   ville      rumeur urbaine + voiture qui passe de temps en temps
 *   izakaya    brouhaha de conversations + verres, la nuit, près de l'izakaya
 *   gare       petite mélodie de départ, près de la gare
 * Effets : carillon d'entrée (konbini), bonne réponse, erreur, lieu réussi, ouverture.
 *
 * Tout est lancé après un geste utilisateur (politique autoplay des navigateurs).
 */

export type LayerId = 'city' | 'izakaya';
export type SfxId = 'chime' | 'good' | 'bad' | 'success' | 'open';

interface Layer {
  id: LayerId;
  gain: GainNode;
  /** volume cible (0 → 1), appliqué avec un léger lissage */
  level: number;
  /** boucle d'événements (chirps, voitures…) : renvoie le délai avant le prochain, en secondes */
  tick?: () => number;
  timer: number;
}

export interface AmbienceSpot {
  x: number;
  z: number;
}

export interface AmbienceScene {
  /** façade de l'izakaya */
  izakaya?: AmbienceSpot;
}

const LAYER_BASE: Record<LayerId, number> = {
  city: 0.11, // rumeur de la ville (le souffle « en vagues ») : moitié moins forte qu'au départ (0.22)
  izakaya: 0.32,
};

export class Ambience {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private layers = new Map<LayerId, Layer>();
  private noise: AudioBuffer | null = null;
  private enabled = true;
  /** coupée temporairement (cinématique du shinkansen) */
  private suspended = false;
  private night = false;
  private scene: AmbienceScene = {};
  private player = { x: 0, z: 9.5 };
  /** volume général de l'ambiance et des effets */
  volume = 0.9;
  /** page de test : seules ces nappes jouent, à fond */
  soloSet: Set<LayerId> | null = null;

  /** à appeler dans un geste utilisateur */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.fxGain;
    this.sfxBus.connect(ctx.destination);
    this.noise = makeNoise(ctx);
    this.buildCity();
    this.buildIzakaya();
    this.applyMaster(1.5);
    this.refresh();
    // onglet caché / fenêtre réduite : tout se tait, comme la musique
    document.addEventListener('visibilitychange', () => {
      this.applyMaster(document.hidden ? 0.15 : 0.8);
      if (!document.hidden && this.ctx?.state === 'suspended') void this.ctx.resume();
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyMaster(on ? 1.2 : 0.3);
  }

  /** coupe l'ambiance de rue le temps d'une cinématique */
  setSuspended(on: boolean) {
    this.suspended = on;
    this.applyMaster(on ? 0.6 : 1.5);
  }

  setNight(on: boolean) {
    this.night = on;
    this.refresh(3.5);
  }

  setScene(s: AmbienceScene) {
    this.scene = s;
    this.refresh();
  }

  /** position du joueur (appelée à chaque image : le calcul est léger) */
  setPlayer(x: number, z: number) {
    if (Math.abs(x - this.player.x) + Math.abs(z - this.player.z) < 0.25) return;
    this.player = { x, z };
    this.refresh(0.6);
  }

  /** réglage utilisateur (0 → 1) de l'ambiance et des effets */
  setVolume(v: number) {
    this.volume = 0.9 * Math.max(0, Math.min(1, v));
    this.fxGain = Math.max(0, Math.min(1, v));
    this.applyMaster(0.15);
  }
  private fxGain = 1;

  private applyMaster(ramp: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const on = this.enabled && !document.hidden;
    const v = on && !this.suspended ? this.volume : 0;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(v, t, ramp / 3);
    this.sfxBus!.gain.cancelScheduledValues(t);
    this.sfxBus!.gain.setTargetAtTime(on ? this.fxGain : 0, t, 0.05);
  }

  /** volume de chaque nappe selon l'heure et la distance */
  private target(id: LayerId): number {
    if (this.soloSet) return this.soloSet.has(id) ? 1 : 0;
    const p = this.player;
    const near = (s: AmbienceSpot | undefined, r0: number, r1: number) => {
      if (!s) return 0;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      return d <= r0 ? 1 : d >= r1 ? 0 : 1 - (d - r0) / (r1 - r0);
    };
    const day = this.night ? 0 : 1;
    switch (id) {
      case 'city':
        return this.night ? 0.6 : 1;
      case 'izakaya':
        return (1 - day) * near(this.scene.izakaya, 3, 16);
    }
  }

  refreshNow() {
    this.refresh(0.4);
  }

  private refresh(ramp = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const l of this.layers.values()) {
      const lv = this.target(l.id);
      if (Math.abs(lv - l.level) < 0.005) continue;
      l.level = lv;
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setTargetAtTime(lv * LAYER_BASE[l.id], t, ramp / 3);
    }
  }

  /* ───────────────────────── outils ───────────────────────── */

  private addLayer(id: LayerId, tick?: () => number): Layer {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const l: Layer = { id, gain, level: 0, tick, timer: 0 };
    this.layers.set(id, l);
    if (tick) {
      const loop = () => {
        // on ne génère des événements que si la nappe est audible
        const next = l.level > 0.02 ? tick() : 0.8;
        l.timer = window.setTimeout(loop, next * 1000);
      };
      l.timer = window.setTimeout(loop, 400 + Math.random() * 800);
    }
    return l;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** note brève (enveloppe percussive) */
  private blip(out: AudioNode, opts: { freq: number; to?: number; type?: OscillatorType; dur: number; vol: number; at?: number; attack?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  /** cloche douce (fondamentale + partiels inharmoniques) */
  private bell(out: AudioNode, freq: number, at: number, vol: number, dur = 1.6) {
    this.blip(out, { freq, dur, vol, at, attack: 0.004 });
    this.blip(out, { freq: freq * 2.01, dur: dur * 0.5, vol: vol * 0.35, at, attack: 0.004 });
    this.blip(out, { freq: freq * 3.02, dur: dur * 0.25, vol: vol * 0.12, at, attack: 0.004 });
  }

  /* ───────────────────────── nappes ───────────────────────── */

  /** rumeur urbaine : bruit grave filtré, qui « respire » + voitures */
  private buildCity() {
    const ctx = this.ctx!;
    const l = this.addLayer('city', () => {
      this.carPass(l.gain);
      return 7 + Math.random() * 12;
    });
    const n = this.noiseSrc();
    const lp = this.filter('lowpass', 380);
    const hp = this.filter('highpass', 70);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.15;
    lfo.connect(lfoG).connect(g.gain);
    n.connect(lp).connect(hp).connect(g).connect(l.gain);
    n.start();
    lfo.start();
  }

  private carPass(out: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 3.5 + Math.random() * 2;
    const n = this.noiseSrc();
    const bp = this.filter('bandpass', 250, 1.2);
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.linearRampToValueAtTime(520 + Math.random() * 200, t + dur * 0.5);
    bp.frequency.linearRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const pan = ctx.createStereoPanner();
    const dir = Math.random() < 0.5 ? -1 : 1;
    pan.pan.setValueAtTime(-0.7 * dir, t);
    pan.pan.linearRampToValueAtTime(0.7 * dir, t + dur);
    n.connect(bp).connect(g).connect(pan).connect(out);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  /** izakaya : voix étouffées (formants), rires et verres qui trinquent */
  private buildIzakaya() {
    const ctx = this.ctx!;
    const room = this.filter('lowpass', 1600);
    const l = this.addLayer('izakaya', () => {
      // verres
      if (Math.random() < 0.55) {
        const f = 2400 + Math.random() * 900;
        this.blip(room, { freq: f, dur: 0.35, vol: 0.08, attack: 0.002 });
        this.blip(room, { freq: f * 1.48, dur: 0.25, vol: 0.05, at: 0.01, attack: 0.002 });
        if (Math.random() < 0.5) this.blip(room, { freq: f * 1.1, dur: 0.3, vol: 0.06, at: 0.09, attack: 0.002 });
      }
      // éclat de rire
      if (Math.random() < 0.3) this.laugh(room);
      return 1.5 + Math.random() * 3;
    });
    room.connect(l.gain);
    const voice = (pitch: number, pan: number) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = pitch;
      const f1 = this.filter('bandpass', 600, 4);
      const f2 = this.filter('bandpass', 1400, 5);
      const mix = ctx.createGain();
      mix.gain.value = 0;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(f1).connect(mix);
      o.connect(f2).connect(mix);
      mix.connect(p).connect(room);
      o.start();
      // syllabes : on change de voyelle, de hauteur et de volume ~5 fois / s, avec des pauses
      const talk = () => {
        const t = ctx.currentTime;
        const n = 4 + Math.floor(Math.random() * 10);
        let s = t;
        for (let i = 0; i < n; i++) {
          const d = 0.12 + Math.random() * 0.14;
          f1.frequency.setTargetAtTime(350 + Math.random() * 500, s, 0.03);
          f2.frequency.setTargetAtTime(1000 + Math.random() * 1300, s, 0.03);
          o.frequency.setTargetAtTime(pitch * (0.85 + Math.random() * 0.35), s, 0.05);
          mix.gain.setTargetAtTime(0.12 + Math.random() * 0.12, s, 0.02);
          mix.gain.setTargetAtTime(0.02, s + d * 0.8, 0.02);
          s += d;
        }
        mix.gain.setTargetAtTime(0, s, 0.05);
        window.setTimeout(talk, (s - t + 0.3 + Math.random() * 1.8) * 1000);
      };
      window.setTimeout(talk, Math.random() * 1500);
    };
    [110, 135, 165, 210, 240, 125].forEach((p, i) => voice(p, -0.7 + i * 0.28));
    // fond de salle
    const n = this.noiseSrc();
    const bp = this.filter('bandpass', 700, 0.8);
    const g = ctx.createGain();
    g.gain.value = 0.18;
    n.connect(bp).connect(g).connect(room);
    n.start();
  }

  private laugh(out: AudioNode) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 180 + Math.random() * 120;
    const f = this.filter('bandpass', 900, 3);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(f).connect(g).connect(out);
    const k = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      const s = t0 + i * 0.16;
      o.frequency.setValueAtTime(base * (1.15 - i * 0.04), s);
      g.gain.setTargetAtTime(0.16, s, 0.01);
      g.gain.setTargetAtTime(0, s + 0.08, 0.02);
    }
    o.start(t0);
    o.stop(t0 + k * 0.16 + 0.3);
  }

  /* ───────────────────────── effets ───────────────────────── */

  sfx(id: SfxId) {
    if (!this.ctx || !this.sfxBus || !this.enabled || document.hidden || this.fxGain < 0.01) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const out = this.sfxBus;
    switch (id) {
      case 'chime':
        // « pin-pon » d'entrée de magasin
        this.bell(out, 1318.5, 0, 0.16, 1.4);
        this.bell(out, 1046.5, 0.42, 0.16, 1.8);
        break;
      case 'good':
        this.blip(out, { freq: 880, dur: 0.18, vol: 0.12, type: 'triangle' });
        this.blip(out, { freq: 1318.5, dur: 0.35, vol: 0.12, at: 0.09, type: 'triangle' });
        break;
      case 'bad':
        this.blip(out, { freq: 260, to: 190, dur: 0.28, vol: 0.14, type: 'triangle' });
        break;
      case 'success':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip(out, { freq: f, dur: i === 3 ? 0.9 : 0.25, vol: 0.12, at: i * 0.11, type: 'triangle' }));
        this.bell(out, 2093, 0.44, 0.05, 1.4);
        break;
      case 'open':
        this.blip(out, { freq: 620, to: 930, dur: 0.12, vol: 0.08 });
        break;
    }
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export const ambience = new Ambience();
