/**
 * HUD : barre du haut (progression, carnet, aide, son), invite « parler »,
 * écran d'introduction, toasts et mini-carte (orientée comme l'écran).
 */
import { DISTRICTS, FOUNTAIN, LAYOUT, LOCATIONS, districtOf } from '../data/cityConfig';
import type { Game } from '../engine/game';
import { audio } from '../engine/audioManager';
import { ambience } from '../engine/ambience';
import { progress } from '../engine/progress';
import type { NpcInstance } from '../engine/world';
import { el } from './dom';
import { DIFFICULTIES, difficultyInfo } from './difficulty';

export class HUD {
  private bar: HTMLDivElement;
  private count: HTMLSpanElement;
  private countPill!: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastBox: HTMLDivElement;
  /* invite : PNJ à portée prioritaire, sinon banc */
  private nearNpc: NpcInstance | null = null;
  private seatState: 'near' | 'seated' | null = null;
  /* repères des lieux en vue large (assis sur un banc) */
  private pinBox: HTMLDivElement;
  private pins: { el: HTMLDivElement; x: number; y: number; z: number; npc?: NpcInstance; w: number; h: number; sx: number; sy: number; on: boolean; oy: number }[] = [];
  private pinsFor: string | null = null;
  private pinsShown = false;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  onNotebook: (() => void) | null = null;
  onModal: ((open: boolean) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private game: Game,
  ) {
    // barre du haut
    this.count = el('span', { class: 'count' });
    const nb = el('button', { class: 'pill primary-pill', title: 'Carnet de survie (C)' }, '📒 Carnet de survie');
    nb.addEventListener('click', () => this.onNotebook?.());
    const toggleMusic = () => {
      audio.musicEnabled = !audio.musicEnabled;
      progress.setPref('music', audio.musicEnabled);
    };
    audio.musicEnabled = progress.prefs.music;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      toggleMusic();
    });
    // jour / nuit
    const dayNight = el('button', { class: 'pill daynight', title: 'Jour / Nuit (N)' });
    const syncNight = () => {
      const n = progress.prefs.night;
      dayNight.textContent = n ? '🌙 Nuit' : '☀️ Jour';
      dayNight.classList.toggle('on', n);
      dayNight.setAttribute('aria-pressed', String(n));
    };
    const toggleNight = () => {
      const n = !progress.prefs.night;
      progress.setPref('night', n);
      this.game.setNight(n);
      audio.setNight(n);
      ambience.setNight(n);
      syncNight();
      this.toast(n ? '<strong>🌙 こんばんは · Konbanwa</strong> · la nuit tombe : l’izakaya 🏮 ouvre, la banque ferme.' : '<strong>☀️ こんにちは · Konnichiwa</strong> · le jour se lève : la banque rouvre, l’izakaya se prépare.');
    };
    this.game.setNight(progress.prefs.night, true);
    audio.setNight(progress.prefs.night, true);
    ambience.setNight(progress.prefs.night);
    syncNight();
    dayNight.addEventListener('click', toggleNight);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyN' || e.repeat || this.game.inDialogue) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      toggleNight();
    });
    // difficulté (réglée dans ⚙️ Paramètres) : petit rappel quand elle change
    let lastMode = progress.prefs.difficulty;
    progress.onChange(() => {
      if (progress.prefs.difficulty === lastMode) return;
      lastMode = progress.prefs.difficulty;
      const info = difficultyInfo(lastMode);
      this.toast(`<strong>${info.icon} Mode ${info.label}</strong> · ${info.desc}`);
    });
    // paramètres (volumes, difficulté, qualité graphique)
    const gear = el('button', { class: 'pill icon', title: 'Paramètres · son, difficulté, commandes', 'aria-label': 'Paramètres', text: '⚙️' });
    gear.addEventListener('click', () => this.openSettings());
    this.applySettings();
    this.bar = el(
      'div',
      { class: 'topbar' },
      el('div', { class: 'brand' }, el('span', { class: 'brand-jp', lang: 'ja', text: 'いちばん通り' }), el('span', { class: 'brand-fr', text: 'Survie au Japon' })),
      (this.countPill = el('div', { class: 'progress-pill', title: 'Lieux réussis' }, el('span', { text: '🏮' }), this.count)),
      el('div', { class: 'spacer' }),
      dayNight,
      nb,
      gear,
    );
    parent.append(this.bar);

    this.prompt = el('div', { class: 'near-prompt', 'aria-live': 'polite' });
    // écrans tactiles : toucher l'invite du banc = Espace
    this.prompt.addEventListener('click', () => {
      if (this.prompt.classList.contains('tap')) this.game.interact();
    });
    this.pinBox = el('div', { class: 'pins', 'aria-hidden': 'true' });
    parent.append(this.pinBox, this.prompt);

    this.toastBox = el('div', { class: 'toasts' });
    parent.append(this.toastBox);

    this.map = el('canvas', { class: 'minimap', width: '360', height: '360', 'aria-hidden': 'true' });
    parent.append(this.map);
    this.mapCtx = this.map.getContext('2d')!;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyC' && !this.game.inDialogue && !this.settingsOpen) this.onNotebook?.();
    });

    progress.onChange(() => this.refresh());
    this.refresh();
  }

  refresh() {
    this.count.textContent = `${progress.completed.length} / ${LOCATIONS.length} lieux`;
    // détail par quartier au survol
    const per = (Object.keys(DISTRICTS) as (keyof typeof DISTRICTS)[]).map((d) => {
      const ls = LOCATIONS.filter((l) => districtOf(l) === d);
      const done = ls.filter((l) => progress.isCompleted(l.scenarioId)).length;
      return `${DISTRICTS[d].icon} ${DISTRICTS[d].nameFr} : ${done} / ${ls.length}`;
    });
    this.countPill.title = `Lieux réussis\n${per.join('\n')}`;
  }

  setNear(npc: NpcInstance | null) {
    this.nearNpc = npc;
    this.renderPrompt();
  }

  setSeat(state: 'near' | 'seated' | null) {
    this.seatState = state;
    this.renderPrompt();
  }

  private renderPrompt() {
    const npc = this.nearNpc;
    this.prompt.classList.remove('tap');
    if (!npc && this.seatState && !this.game.inDialogue) {
      const seated = this.seatState === 'seated';
      this.prompt.replaceChildren(
        el('kbd', { text: 'Espace' }),
        el('span', { text: seated ? ' se lever' : ' s’asseoir sur le banc' }),
        el('span', { class: 'prompt-sub', text: seated ? ' · ou une touche de déplacement' : ' · contempler le quartier' }),
      );
      this.prompt.classList.add('show', 'tap');
      return;
    }
    if (!npc || this.game.inDialogue) {
      this.prompt.classList.remove('show');
      return;
    }
    if (npc.loc.travel) {
      const d = DISTRICTS[npc.loc.travel];
      this.prompt.replaceChildren(
        el('kbd', { text: 'Espace' }),
        el('span', {}, ' prendre le shinkansen 🚄 → ', el('strong', { lang: 'ja', text: d.nameJp }), ` ${d.nameFr}`),
      );
    } else if (npc.closed) {
      const cs = npc.loc.closedSign;
      this.prompt.replaceChildren(el('span', {}, `🔒 ${npc.loc.icon} ${npc.loc.nameFr} · `, el('strong', { lang: 'ja', text: cs?.kana ?? '' }), ` ${cs?.fr ?? 'Fermé'}`));
    } else
      this.prompt.replaceChildren(
        el('kbd', { text: 'Espace' }),
        el('span', {}, ' parler à ', el('strong', { lang: 'ja', text: npc.loc.npc.nameKana }), ` · ${npc.loc.icon} ${npc.loc.nameFr}`),
      );
    this.prompt.classList.add('show');
  }

  /** repères au-dessus des lieux, visibles quand la caméra a reculé (appelé à chaque image) */
  updatePins() {
    const k = this.game.wideK;
    const show = k > 0.55;
    if (show !== this.pinsShown) {
      this.pinsShown = show;
      this.pinBox.classList.toggle('show', show);
    }
    if (k <= 0.01) return;
    const w = this.game.world;
    const key = `${this.game.district}|${progress.completed.length}|${w.npcs.map((n) => +n.closed).join('')}`;
    if (key !== this.pinsFor) this.buildPins();
    for (const p of this.pins) {
      const y = p.npc ? p.npc.character.root.position.y + p.y : p.y;
      const s = this.game.project(p.x, y, p.z);
      p.on = !!s;
      if (!s) continue;
      p.sx = s.x;
      p.sy = s.y;
    }
    // repères qui se chevauchent : les plus hauts à l'écran remontent un peu (glissement doux, sans saut)
    const order = this.pins.filter((p) => p.on).sort((a, b) => b.sy - a.sy);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const p of order) {
      const l = p.sx - p.w / 2 - 3;
      const r = p.sx + p.w / 2 + 3;
      let b = p.sy;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((q) => l < q.r && r > q.l && b > q.t && b - p.h < q.b);
        if (!hit) break;
        b = hit.t - 2;
      }
      placed.push({ l, r, t: b - p.h, b });
      const want = b - p.sy;
      p.oy += (want - p.oy) * 0.18;
      if (Math.abs(want - p.oy) < 0.05) p.oy = want;
    }
    for (const p of this.pins) {
      p.el.style.visibility = p.on ? '' : 'hidden';
      if (p.on) p.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${(p.sy + p.oy).toFixed(1)}px)`;
    }
  }

  private buildPins() {
    const w = this.game.world;
    this.pinsFor = `${this.game.district}|${progress.completed.length}|${w.npcs.map((n) => +n.closed).join('')}`;
    this.pinBox.replaceChildren();
    this.pins = [];
    const add = (icon: string, name: string, x: number, y: number, z: number, cls = '', npc?: NpcInstance) => {
      const pin = el('div', { class: `pin ${cls}` }, el('span', { class: 'pin-ico', text: icon }), el('span', { class: 'pin-name', text: name }));
      this.pinBox.append(pin);
      this.pins.push({ el: pin, x, y, z, npc, w: 0, h: 0, sx: 0, sy: 0, on: false, oy: 0 });
    };
    for (const n of w.npcs) {
      const l = n.loc;
      if (l.travel) add('🚄', `Shinkansen → ${DISTRICTS[l.travel].nameFr}`, n.pos.x, 2.75, n.pos.z, 'travel', n);
      else if (n.closed) add('🔒', `${l.nameFr} · fermé`, n.pos.x, 2.75, n.pos.z, 'closed', n);
      else if (progress.isCompleted(l.scenarioId)) add(l.icon, `${l.nameFr} ✓`, n.pos.x, 2.75, n.pos.z, 'done', n);
      else add(l.icon, l.nameFr, n.pos.x, 2.75, n.pos.z, '', n);
    }
    if (this.game.district === 'fontaine') add('⛲', 'Fontaine', FOUNTAIN.fountain.x, LAYOUT.sidewalkHeight + 3.2, FOUNTAIN.fountain.z, 'landmark');
    // tailles mesurées une fois (pointe du repère + marge)
    for (const p of this.pins) {
      p.w = p.el.offsetWidth;
      p.h = p.el.offsetHeight + 8;
    }
  }

  toast(html: string, ms = 3800) {
    const t = el('div', { class: 'toast', html });
    this.toastBox.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    window.setTimeout(() => {
      t.classList.remove('show');
      window.setTimeout(() => t.remove(), 400);
    }, ms);
  }

  /** cartes de choix de la difficulté (accueil et paramètres) */
  private modePicker() {
    const root = el('div', { class: 'mode-picker', role: 'radiogroup', 'aria-label': 'Difficulté' });
    // une seule description, celle du niveau choisi (au lieu d'un pavé par carte)
    const desc = el('p', { class: 'mode-desc' });
    const sync = () => {
      for (const b of root.querySelectorAll<HTMLButtonElement>('button')) {
        const on = b.dataset.mode === progress.prefs.difficulty;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
      desc.textContent = difficultyInfo(progress.prefs.difficulty).desc;
    };
    for (const d of DIFFICULTIES) {
      const b = el(
        'button',
        { class: 'mode-card', role: 'radio', 'data-mode': d.id, title: d.desc },
        el('span', { class: 'mc-icon', text: d.icon }),
        el('strong', { text: d.label }),
        el('span', { class: 'mc-short', text: d.short }),
      );
      b.addEventListener('click', () => {
        progress.setPref('difficulty', d.id);
        sync();
      });
      root.append(b);
    }
    sync();
    return { root, desc };
  }

  /** applique les réglages enregistrés (volumes, qualité) */
  private applySettings() {
    const p = progress.prefs;
    audio.setMusicScale(p.musicVol);
    audio.setVoiceVolume(p.voiceVol);
    ambience.setVolume(p.fxVol);
    this.game.setQuality(p.quality);
  }

  private settingsOpen = false;

  /** fenêtre ⚙️ Paramètres */
  openSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this.onModal?.(true);
    const slider = (
      icon: string,
      label: string,
      key: 'musicVol' | 'voiceVol' | 'fxVol',
      apply: (v: number) => void,
      test?: () => void,
      read: () => number = () => progress.prefs[key],
      save: (v: number) => void = (v) => progress.setPref(key, v),
    ) => {
      const out = el('span', { class: 'set-val' });
      const input = el('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': label }) as HTMLInputElement;
      const sync = () => {
        const v = Number(input.value);
        out.textContent = v === 0 ? 'coupé' : `${v} %`;
        input.style.setProperty('--fill', `${v}%`);
      };
      input.value = String(Math.round(read() * 100));
      sync();
      input.addEventListener('input', () => {
        sync();
        apply(Number(input.value) / 100);
      });
      input.addEventListener('change', () => {
        save(Number(input.value) / 100);
        test?.();
      });
      return el('label', { class: 'set-row' }, el('span', { class: 'set-label', text: `${icon} ${label}` }), input, out);
    };
    const quality = el('div', { class: 'set-seg', role: 'radiogroup', 'aria-label': 'Qualité graphique' });
    const qOpts: { id: 'high' | 'eco'; label: string; hint: string }[] = [
      { id: 'high', label: '✨ Haute', hint: 'ombres douces, image nette' },
      { id: 'eco', label: '🍃 Économie', hint: 'plus fluide sur les petits ordinateurs' },
    ];
    const syncQ = () => {
      for (const b of quality.querySelectorAll<HTMLButtonElement>('button')) {
        const on = b.dataset.q === progress.prefs.quality;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
    };
    for (const q of qOpts) {
      const b = el('button', { type: 'button', role: 'radio', 'data-q': q.id }, el('strong', { text: q.label }), el('small', { text: q.hint }));
      b.addEventListener('click', () => {
        progress.setPref('quality', q.id);
        this.game.setQuality(q.id);
        syncQ();
      });
      quality.append(b);
    }
    syncQ();
    // couper tout le son (musique, voix, ambiance)
    const muteBtn = el('button', { type: 'button', class: 'set-mute', role: 'switch' });
    const syncMute = () => {
      muteBtn.textContent = audio.muted ? '🔇 Son coupé' : '🔊 Son activé';
      muteBtn.classList.toggle('off', audio.muted);
      muteBtn.setAttribute('aria-checked', String(!audio.muted));
    };
    syncMute();
    muteBtn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      ambience.setEnabled(!audio.muted);
      syncMute();
    });
    const muteRow = el('div', { class: 'set-row set-row-mute' }, el('span', { class: 'set-label', text: 'Tout le son' }), muteBtn);
    const { root: modes, desc } = this.modePicker();
    const done = el('button', { class: 'primary', type: 'button', text: 'OK' });
    const ov = el(
      'div',
      { class: 'modal settings', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paramètres' },
      el(
        'div',
        { class: 'modal-card settings-card' },
        el('h2', {}, '⚙️ Paramètres ', el('span', { class: 'set-jp', lang: 'ja', text: 'せってい' })),
        el('h3', { text: 'Volume' }),
        muteRow,
        slider(
          '🎵',
          'Musique',
          'musicVol',
          (v) => {
            // 0 = musique coupée (comme la touche M), sans perdre le volume choisi
            audio.musicEnabled = v > 0;
            if (v > 0) audio.setMusicScale(v);
          },
          undefined,
          () => (audio.musicEnabled ? progress.prefs.musicVol : 0),
          (v) => {
            progress.setPref('music', v > 0);
            if (v > 0) progress.setPref('musicVol', v);
          },
        ),
        slider('🗣️', 'Voix', 'voiceVol', (v) => audio.setVoiceVolume(v)),
        slider('🔔', 'Ambiance & effets', 'fxVol', (v) => ambience.setVolume(v), () => ambience.sfx('good')),
        el('h3', { text: 'Difficulté' }),
        modes,
        desc,
        el('h3', { text: 'Qualité graphique' }),
        quality,
        el('h3', { text: 'Commandes' }),
        el(
          'ul',
          { class: 'set-keys' },
          el('li', {}, el('kbd', { text: '↑ ↓ ← →' }), ' / ', el('kbd', { text: 'ZQSD' }), ' / ', el('kbd', { text: 'WASD' }), ' se déplacer · ', el('kbd', { text: 'Maj' }), ' courir'),
          el('li', {}, el('kbd', { text: 'clic gauche maintenu' }), ' le perso suit la souris'),
          el('li', {}, el('kbd', { text: 'Espace' }), ' / ', el('kbd', { text: 'Entrée' }), ' parler · ', el('kbd', { text: '1 2 3' }), ' choisir une réponse'),
          el('li', {}, el('kbd', { text: 'H' }), ' français (mode moyen) · ', el('kbd', { text: 'R' }), ' réécouter · ', el('kbd', { text: 'V' }), ' vitesse'),
          el('li', {}, el('kbd', { text: 'C' }), ' carnet · ', el('kbd', { text: 'M' }), ' musique · ', el('kbd', { text: 'N' }), ' jour / nuit · ', el('kbd', { text: 'Échap' }), ' fermer'),
        ),
        el('p', { class: 'muted small', text: 'Entrez dans un halo doré devant une personne pour lancer la conversation.' }),
        el('div', { class: 'set-actions' }, done),
      ),
    );
    const close = () => {
      if (!this.settingsOpen) return;
      this.settingsOpen = false;
      window.removeEventListener('keydown', onKey, true);
      ov.classList.remove('open');
      window.setTimeout(() => ov.remove(), 300);
      this.onModal?.(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    done.addEventListener('click', close);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close();
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    window.setTimeout(() => done.focus({ preventScroll: true }), 50);
  }

  /** Écran d'introduction : nécessaire pour débloquer l'audio du navigateur */
  showIntro(onStart: () => void) {
    this.onModal?.(true);
    const start = el('button', { class: 'primary big', text: 'Commencer  はじめる' });
    const { root: modes, desc: modeDesc } = this.modePicker();
    const key = (icon: string, title: string, text: string) => el('div', {}, el('strong', { text: `${icon} ${title}` }), el('span', { text }));
    const ov = el(
      'div',
      { class: 'modal intro open' },
      el(
        'div',
        { class: 'modal-card intro-card' },
        el('div', { class: 'intro-jp', lang: 'ja', text: 'ようこそ！' }),
        el('h1', { text: 'Bienvenue dans le quartier d’Ichiban' }),
        el('p', {
          text: `Vous venez d’arriver au Japon : parlez aux habitants pour réussir ${LOCATIONS.length} situations du quotidien (gare, konbini, ramen, hôtel, kōban, pharmacie… et l’izakaya, la nuit 🌙), réparties dans deux quartiers reliés par le shinkansen 🚄.`,
        }),
        el(
          'div',
          { class: 'intro-grid' },
          key('🕹️', 'Bouger', 'Flèches / ZQSD · ou clic maintenu : le perso suit la souris'),
          key('💬', 'Parler', 'Halo doré ou Espace'),
          key('🈂️', 'Répondre', '1, 2, 3 · nombre : − / +'),
          key('🔊', 'Réécouter', 'R · voix lente : V'),
        ),
        el('div', { class: 'intro-label', text: 'Votre niveau (modifiable à tout moment)' }),
        modes,
        modeDesc,
        start,
      ),
    );
    start.addEventListener('click', () => {
      audio.unlock();
      audio.startMusic();
      ambience.start();
      progress.markIntroSeen();
      ov.classList.remove('open');
      window.setTimeout(() => ov.remove(), 400);
      this.onModal?.(false);
      onStart();
    });
    document.body.append(ov);
    window.setTimeout(() => start.focus(), 50);
  }

  /* ───────────────────────── mini-carte ───────────────────────── */

  drawMap() {
    const c = this.mapCtx;
    const W = this.map.width;
    const H = this.map.height;
    c.clearRect(0, 0, W, H);
    const g = this.game;
    const fontaine = g.district === 'fontaine';
    // échelle : la diagonale du plateau tient dans la carte
    const P = fontaine ? FOUNTAIN.plinth : LAYOUT.plinth;
    const corners = [
      [P.minX, P.minZ],
      [P.maxX, P.minZ],
      [P.maxX, P.maxZ],
      [P.minX, P.maxZ],
    ].map(([x, z]) => g.toScreenPlane(x, z));
    const us = corners.map((p) => p.u);
    const vs = corners.map((p) => p.v);
    const cu = (Math.min(...us) + Math.max(...us)) / 2;
    const cv = (Math.min(...vs) + Math.max(...vs)) / 2;
    const s = (Math.min(W, H) * 0.9) / Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
    const tp = (x: number, z: number) => {
      const p = g.toScreenPlane(x, z);
      return [W / 2 + (p.u - cu) * s, H / 2 - (p.v - cv) * s] as const;
    };
    const poly = (pts: [number, number][], fill: string, stroke?: string) => {
      c.beginPath();
      pts.forEach(([x, z], i) => {
        const [px, py] = tp(x, z);
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = 2;
        c.stroke();
      }
    };
    const rect = (minX: number, maxX: number, minZ: number, maxZ: number, fill: string, stroke?: string) =>
      poly(
        [
          [minX, minZ],
          [maxX, minZ],
          [maxX, maxZ],
          [minX, maxZ],
        ],
        fill,
        stroke,
      );

    rect(P.minX, P.maxX, P.minZ, P.maxZ, 'rgba(255,248,236,0.82)', 'rgba(120,90,60,0.35)');
    if (fontaine) {
      // gare du shinkansen (sud) et fontaine (centre)
      rect(-22, 22, FOUNTAIN.stationZ, FOUNTAIN.stationZ + 7.6, 'rgba(150,170,200,0.75)');
      const f = FOUNTAIN.fountain;
      const ring: [number, number][] = [];
      for (let i = 0; i < 24; i++) ring.push([f.x + Math.cos((i / 24) * Math.PI * 2) * f.r, f.z + Math.sin((i / 24) * Math.PI * 2) * f.r]);
      poly(ring, 'rgba(90,170,235,0.85)', 'rgba(255,255,255,0.9)');
    } else {
      rect(-LAYOUT.avenueHalfWidth, LAYOUT.avenueHalfWidth, LAYOUT.avenueStartZ, LAYOUT.avenueEndZ, 'rgba(90,92,100,0.55)');
    }
    for (const loc of LOCATIONS) {
      if (districtOf(loc) !== g.district) continue;
      const done = progress.isCompleted(loc.scenarioId);
      const fill = done ? 'rgba(91,200,130,0.75)' : 'rgba(214,160,110,0.8)';
      if (loc.side === 'south') {
        const x = loc.x ?? 0;
        rect(x - loc.width / 2, x + loc.width / 2, loc.z - loc.depth / 2, loc.z + loc.depth / 2, fill);
      } else if (loc.style !== 'street') {
        const fx = loc.x != null ? Math.abs(loc.x) : LAYOUT.frontX;
        const [a, b] = loc.side === 'left' ? [-fx - loc.depth, -fx] : [fx, fx + loc.depth];
        rect(a, b, loc.z - loc.width / 2, loc.z + loc.width / 2, fill);
      }
    }
    // PNJ
    for (const n of g.world.npcs) {
      const [px, py] = tp(n.haloPos.x, n.haloPos.z);
      c.beginPath();
      c.arc(px, py, 7, 0, Math.PI * 2);
      c.fillStyle = n.loc.travel ? '#3d9bff' : n.done ? '#3cc47a' : '#ffbf3c';
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 2.5;
      c.stroke();
    }
    // nom du quartier
    const d = DISTRICTS[g.district];
    c.font = `600 ${Math.round(W * 0.075)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    const label = `${d.icon} ${d.nameJp}`;
    c.strokeText(label, W / 2, H * 0.03);
    c.fillStyle = '#5a4030';
    c.fillText(label, W / 2, H * 0.03);
    // joueur (flèche orientée)
    const pp = g.playerPos;
    const [px, py] = tp(pp.x, pp.z);
    const yaw = g.playerYaw;
    const [hx, hy] = tp(pp.x + Math.sin(yaw), pp.z + Math.cos(yaw));
    const ang = Math.atan2(hy - py, hx - px);
    c.save();
    c.translate(px, py);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(13, 0);
    c.lineTo(-8, -8);
    c.lineTo(-4, 0);
    c.lineTo(-8, 8);
    c.closePath();
    c.fillStyle = '#e35d3a';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 2.5;
    c.stroke();
    c.restore();
  }
}
