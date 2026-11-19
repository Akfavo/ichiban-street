/**
 * Interface de dialogue (overlay HTML/CSS), selon la difficulté :
 *  - ecoute    : 1) on écoute et on devine ce que dit le PNJ (3 propositions en français)
 *                2) on choisit sa réponse (romaji + français). Aucun kana affiché.
 *  - facile    : répliques et réponses en romaji + traduction française
 *  - moyen     : kana + romaji, bouton « Traduction FR » (raccourci H)
 *  - difficile : audio seul ; réponses en romaji ; texte révélé après la bonne réponse
 *  - 🔊 réécouter, 🙏 « Mō ichido » : on le dit et le PNJ répète lentement
 *  - mauvaise réponse → explication + nouvel essai
 */
import type { LocationConfig } from '../data/cityConfig';
import { SCENARIOS, choiceVoiceId, fillQty, lineFor, qtyDefault, qtyId, replyId, speechText, type Choice, type Scenario } from '../data/scenarios';
import { audio, type AudioSource } from '../engine/audioManager';
import { ambience } from '../engine/ambience';
import { progress, type Difficulty } from '../engine/progress';
import { readsKana } from './difficulty';
import { clear, el, shuffle } from './dom';
import { kanaToRomaji } from './romaji';

export interface DialogueCallbacks {
  onClose: (completed: boolean) => void;
}

/** understand : (mode écoute) deviner le sens de la réplique */
type Phase = 'understand' | 'question' | 'answered' | 'outro';

interface Meaning {
  fr: string;
  correct: boolean;
}

/** toutes les répliques des PNJ (sert à fabriquer les fausses pistes du mode écoute) */
const ALL_NPC_LINES = Object.values(SCENARIOS).flatMap((sc) => sc.steps.map((s) => ({ scId: sc.id, id: s.id, fr: lineFor(sc, s, false, {}).fr })));

function pickOne<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class DialogueUI {
  private root: HTMLDivElement;
  private open_ = false;
  private loc!: LocationConfig;
  private sc!: Scenario;
  private cb!: DialogueCallbacks;
  private stepIdx = 0;
  private phase: Phase = 'question';
  private shownPrefs = '';
  private choicesOrder: Choice[] = [];
  private wrong = new Set<Choice>();
  private chosen: Choice | null = null;
  /** mode écoute */
  private meanings: Meaning[] = [];
  private wrongMeanings = new Set<Meaning>();
  private understood = false;
  /** score « du premier coup » (mode écoute) */
  private firstTry = 0;
  private attempts = 0;
  private lastAudio: { id: string; text: string; pitch: number } | null = null;
  private source: AudioSource = 'none';
  private playing = false;
  private completedNow = false;
  private startTimer = 0;
  /** quantité affichée par le sélecteur « Combien ? » de l'étape */
  private qty = 1;
  /** quantités validées (id d'étape → nombre), reprises par les répliques suivantes */
  private chosenQty: Record<string, number> = {};
  /** formulation tirée au hasard pour l'étape (0 = phrase de base) */
  private variant = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'dialogue', role: 'dialog', 'aria-live': 'polite', 'aria-hidden': 'true' });
    parent.append(this.root);
    audio.onSource = (s) => {
      this.source = s;
      this.refreshAudioBar();
    };
    audio.onPlayingChange = (p) => {
      this.playing = p;
      this.refreshAudioBar();
    };
    window.addEventListener('keydown', this.onKey);
    // re-rendu si la difficulté ou l'affichage FR change pendant un dialogue
    progress.onChange(() => {
      if (this.open_ && this.prefsKey() !== this.shownPrefs) {
        // quitter le mode écoute pendant la phase « comprendre » : on passe directement aux réponses
        if (this.phase === 'understand' && this.mode !== 'ecoute') this.phase = 'question';
        this.render();
      }
    });
  }

  private prefsKey() {
    return `${progress.prefs.difficulty}|${progress.prefs.showFr}`;
  }

  private get mode(): Difficulty {
    return progress.prefs.difficulty;
  }

  get isOpen() {
    return this.open_;
  }

  open(loc: LocationConfig, sc: Scenario, cb: DialogueCallbacks) {
    this.loc = loc;
    this.sc = sc;
    this.cb = cb;
    this.stepIdx = 0;
    this.chosenQty = {};
    this.firstTry = 0;
    this.attempts = 0;
    this.completedNow = false;
    this.open_ = true;
    this.root.setAttribute('aria-hidden', 'false');
    this.root.classList.add('open');
    this.enterStep();
    // on laisse le temps au salut (ojigi) avant la première réplique
    window.clearTimeout(this.startTimer);
    this.startTimer = window.setTimeout(() => this.playNpc(), 650);
  }

  close() {
    if (!this.open_) return;
    window.clearTimeout(this.startTimer);
    audio.stop();
    this.open_ = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.cb.onClose(this.completedNow);
  }

  /* ───────────────────────── logique ───────────────────────── */

  /** étape courante, adaptée à l'heure (こんばんは le soir) */
  private get step() {
    return lineFor(this.sc, this.rawStep, progress.prefs.night, this.chosenQty, this.variant);
  }

  private get rawStep() {
    return this.sc.steps[this.stepIdx];
  }

  private get outro() {
    return lineFor(this.sc, this.sc.outro, progress.prefs.night, this.chosenQty);
  }

  /** réponse affichée (avec la quantité choisie) */
  private view(c: Choice): Choice {
    return this.rawStep.qty ? fillQty(c, this.qty) : c;
  }

  /** id audio de la bonne réponse avec la quantité choisie */
  private choiceVoice(c: Choice) {
    return qtyId(choiceVoiceId(this.rawStep, c), this.rawStep.qty ? this.qty : null);
  }

  private setQty(n: number) {
    const q = this.rawStep.qty;
    if (!q || this.phase !== 'question') return;
    const v = Math.min(q.max, Math.max(q.min, n));
    if (v === this.qty) return;
    this.qty = v;
    // un nouveau nombre = une nouvelle tentative
    this.wrong.clear();
    this.chosen = null;
    this.render();
  }

  private enterStep() {
    const nv = this.rawStep.vars?.length ?? 0;
    this.variant = nv ? Math.floor(Math.random() * (nv + 1)) : 0;
    this.phase = this.mode === 'ecoute' ? 'understand' : 'question';
    this.wrong.clear();
    this.wrongMeanings.clear();
    this.understood = false;
    this.chosen = null;
    if (this.rawStep.qty) this.qty = qtyDefault(this.sc, this.rawStep, this.chosenQty);
    this.choicesOrder = shuffle(this.rawStep.choices);
    this.meanings = this.buildMeanings();
    this.lastAudio = { id: this.step.voice, text: speechText(this.step), pitch: this.loc.npc.voicePitch ?? 1 };
    this.render();
  }

  /** bonne traduction + 2 fausses pistes (une du même lieu, une d'ailleurs) */
  private buildMeanings(): Meaning[] {
    const s = this.step;
    const others = ALL_NPC_LINES.filter((l) => l.id !== s.id && l.fr !== s.fr);
    const same = pickOne(others.filter((l) => l.scId === this.sc.id));
    const far = pickOne(others.filter((l) => l.scId !== this.sc.id && l.fr !== same?.fr));
    const decoys = [same, far].filter((x): x is (typeof ALL_NPC_LINES)[number] => !!x).map((l) => ({ fr: l.fr, correct: false }));
    while (decoys.length < 2) decoys.push({ fr: pickOne(others)!.fr, correct: false });
    return shuffle([{ fr: s.fr, correct: true }, ...decoys]);
  }

  private rate() {
    return progress.prefs.slow ? 0.75 : 1;
  }

  private playNpc(rate = this.rate()) {
    if (!this.lastAudio || !this.open_) return;
    void audio.play(this.lastAudio.id, { text: this.lastAudio.text, rate, pitch: this.lastAudio.pitch });
  }

  private pickMeaning(m: Meaning) {
    if (this.phase !== 'understand' || this.wrongMeanings.has(m)) return;
    if (m.correct) {
      if (this.wrongMeanings.size === 0) this.firstTry++;
      this.attempts++;
      this.understood = true;
      this.phase = 'question';
    } else {
      this.wrongMeanings.add(m);
      ambience.sfx('bad');
      // on réécoute automatiquement, plus lentement
      window.setTimeout(() => this.playNpc(0.75), 350);
    }
    this.render();
  }

  private pick(c: Choice) {
    if (this.phase !== 'question' || this.wrong.has(c)) return;
    if (c.correct) {
      if (this.wrong.size === 0) this.firstTry++;
      this.attempts++;
      this.chosen = c;
      progress.setMissed(this.rawStep.id, this.wrong.size > 0 || this.wrongMeanings.size > 0);
      this.phase = 'answered';
      if (this.rawStep.qty) this.chosenQty[this.rawStep.id] = this.qty;
      progress.unlock(this.step.id, replyId(this.step.id));
      ambience.sfx('good');
      // le joueur « prononce » la bonne réponse
      void audio.play(this.choiceVoice(c), { text: speechText(this.view(c)), rate: this.rate(), pitch: 1.05 });
    } else {
      this.wrong.add(c);
      this.chosen = c;
      ambience.sfx('bad');
    }
    this.render();
  }

  private next() {
    if (this.phase === 'answered') {
      if (this.stepIdx < this.sc.steps.length - 1) {
        this.stepIdx++;
        this.enterStep();
        window.setTimeout(() => this.playNpc(), 150);
      } else {
        this.phase = 'outro';
        this.completedNow = !progress.isCompleted(this.sc.id);
        progress.unlock(this.sc.outro.id);
        progress.complete(this.sc.id);
        ambience.sfx('success');
        const o = this.outro;
        this.lastAudio = { id: o.voice, text: speechText(o), pitch: this.loc.npc.voicePitch ?? 1 };
        this.render();
        window.setTimeout(() => this.playNpc(), 150);
      }
    } else if (this.phase === 'outro') {
      this.close();
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.open_) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.repeat) return;
    const digit = /^(Digit|Numpad)([1-3])$/.exec(e.code);
    if (digit && (this.phase === 'question' || this.phase === 'understand')) {
      e.preventDefault();
      const i = Number(digit[2]) - 1;
      if (this.phase === 'understand') {
        const m = this.meanings[i];
        if (m) this.pickMeaning(m);
      } else {
        const c = this.choicesOrder[i];
        if (c) this.pick(c);
      }
      return;
    }
    if (this.phase === 'question' && this.rawStep.qty && /^(ArrowLeft|ArrowRight|Minus|Equal|NumpadSubtract|NumpadAdd)$/.test(e.code)) {
      e.preventDefault();
      this.setQty(this.qty + (/Left|Minus|Subtract/.test(e.code) ? -1 : 1));
      return;
    }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && (this.phase === 'answered' || this.phase === 'outro')) {
      e.preventDefault();
      this.next();
      return;
    }
    if (e.code === 'KeyH' || e.code === 'KeyF') {
      this.toggleFr();
    } else if (e.code === 'KeyR') {
      this.playNpc();
    } else if (e.code === 'KeyV') {
      this.toggleSpeed();
    }
  };

  /** mode moyen : affiche / masque la traduction française */
  private toggleFr() {
    if (this.mode !== 'moyen') return;
    progress.setPref('showFr', !progress.prefs.showFr);
  }

  private toggleSpeed() {
    progress.setPref('slow', !progress.prefs.slow);
    this.refreshAudioBar();
    this.playNpc();
  }

  /** explications : sans kana pour les modes destinés aux non-lecteurs */
  private explain(text: string) {
    return readsKana(this.mode) ? text : kanaToRomaji(text);
  }

  /* ───────────────────────── rendu ───────────────────────── */

  private audioBar!: HTMLDivElement;

  private refreshAudioBar() {
    if (!this.audioBar) return;
    const speed = this.audioBar.querySelector<HTMLButtonElement>('.speed');
    if (speed) {
      speed.textContent = progress.prefs.slow ? '🐢 Lent' : '🐇 Normal';
      speed.classList.toggle('on', progress.prefs.slow);
      speed.setAttribute('aria-pressed', String(progress.prefs.slow));
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('.replay, .listen')) b.classList.toggle('playing', this.playing);
    const src = this.audioBar.querySelector<HTMLSpanElement>('.src');
    if (src) {
      // on ne signale la source que si les voix naturelles manquent
      src.textContent = this.source === 'tts' ? 'Synthèse navigateur' : '';
      src.title = this.source === 'tts' ? 'Fichier MP3 absent : lecture par la synthèse vocale du navigateur. Lancez « npm run generate-voices » pour des voix naturelles.' : '';
      src.dataset.src = this.source;
    }
  }

  private render() {
    const r = this.root;
    clear(r);
    const { loc, sc } = this;
    const mode = this.mode;
    const isOutro = this.phase === 'outro';
    const line = isOutro ? this.outro : this.step;
    r.dataset.mode = mode;

    // en-tête
    const dots = el('div', { class: 'dots', 'aria-label': `Étape ${this.stepIdx + 1} sur ${sc.steps.length}` });
    sc.steps.forEach((_, i) => {
      const cls = i < this.stepIdx || isOutro || (i === this.stepIdx && this.phase === 'answered') ? 'dot done' : i === this.stepIdx ? 'dot cur' : 'dot';
      dots.append(el('span', { class: cls }));
    });
    const head = el(
      'div',
      { class: 'd-head' },
      el(
        'div',
        { class: 'd-place' },
        el('span', { class: 'd-icon', text: loc.icon }),
        // l'objectif n'est rappelé qu'au premier échange
        el('div', {}, el('div', { class: 'd-title', text: sc.title }), this.stepIdx === 0 && !isOutro ? el('div', { class: 'd-goal', text: sc.goal }) : null),
      ),
      dots,
      el('button', { class: 'icon-btn d-close', title: 'Quitter (Échap)', 'aria-label': 'Quitter le dialogue', text: '✕' }),
    );
    head.querySelector('.d-close')!.addEventListener('click', () => this.close());
    r.append(head);

    // bulle du PNJ
    const showFr = progress.prefs.showFr;
    const speaker = el('div', { class: 'speaker' }, el('span', { class: 'sp-name', text: mode === 'moyen' ? loc.npc.nameKana : loc.npc.name }), el('span', { class: 'sp-role', text: mode === 'moyen' ? `${loc.npc.name} · ${loc.npc.role}` : loc.npc.role }));
    const bubble = el('div', { class: `bubble mode-${mode}` }, speaker);
    const hidden = (mode === 'ecoute' && this.phase === 'understand') || (mode === 'difficile' && this.phase === 'question');
    if (hidden) {
      bubble.append(this.listenCard());
    } else if (mode === 'moyen') {
      bubble.append(el('p', { class: 'kana', lang: 'ja', text: line.kana }), el('div', { class: 'romaji', text: line.romaji }));
      if (showFr) bubble.append(el('div', { class: 'fr', text: line.fr }));
    } else {
      // écoute (une fois compris), facile, difficile (révélé) : romaji + français
      if (mode === 'ecoute' && this.understood && this.phase !== 'outro') bubble.append(el('div', { class: 'got-it', text: '✓ Compris ! On vous a dit :' }));
      const say = el('button', { class: 'say', title: 'Réécouter (R)', 'aria-label': 'Réécouter' }, '🔊');
      say.addEventListener('click', () => this.playNpc());
      bubble.append(
        el('div', { class: `said${mode === 'difficile' ? ' reveal' : ''}` }, say, el('div', {}, el('p', { class: 'romaji-main', text: line.romaji }), el('div', { class: 'fr fr-main', text: line.fr }))),
      );
    }
    r.append(bubble);

    // barre outils (le mode se change dans la barre du haut)
    const tools: (HTMLElement | null)[] = [];
    if (mode === 'moyen') {
      const frBtn = el('button', { class: `tool fr-btn${showFr ? ' on' : ''}`, 'aria-pressed': String(showFr), title: 'Raccourci : H' }, showFr ? '🇫🇷 Masquer le français' : '🇫🇷 Afficher le français');
      frBtn.addEventListener('click', () => this.toggleFr());
      tools.push(frBtn);
    }
    const replay = el('button', { class: 'tool replay', title: 'Réécouter (R)', 'aria-label': 'Réécouter' }, '🔊');
    replay.addEventListener('click', () => this.playNpc());
    this.audioBar = el('div', { class: 'toolbar' }, ...tools, el('div', { class: 'spacer' }), el('span', { class: 'src' }), hidden ? null : replay, hidden ? null : this.moIchidoBtn());
    r.append(this.audioBar);
    this.shownPrefs = this.prefsKey();

    // conclusion
    if (isOutro) {
      const total = this.sc.steps.length * (mode === 'ecoute' ? 2 : 1);
      const score = Math.min(this.firstTry, total);
      const stars = mode === 'ecoute' || this.attempts > 0 ? el('div', { class: 'score', text: `${'⭐'.repeat(score >= total ? 3 : score >= total * 0.6 ? 2 : 1)}  ${score} / ${total} du premier coup` }) : null;
      r.append(
        el('div', { class: 'feedback good outro' }, el('strong', { text: '🎉 Lieu réussi !' }), stars, el('p', { text: this.explain(sc.tip) })),
        el('div', { class: 'actions' }, this.mkNext('Terminer ✓')),
      );
      this.refreshAudioBar();
      return;
    }

    if (this.phase === 'understand') {
      this.renderUnderstand();
    } else {
      this.renderAnswers();
    }
    this.refreshAudioBar();
  }

  /** gros bouton « écoutez » quand le texte est caché */
  private listenCard() {
    const ecoute = this.mode === 'ecoute';
    const who = this.loc.npc.gender === 'femme' ? 'elle' : 'il';
    const wave = el('span', { class: 'wave', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, () => el('i')));
    const listen = el(
      'button',
      { class: 'listen', title: 'Réécouter (R)' },
      el('span', { class: 'listen-ico', text: '🎧' }),
      el('span', { class: 'listen-txt' }, el('strong', { text: ecoute ? `Écoutez bien… que vous dit-${who} ?` : 'Écoutez attentivement…' }), el('small', { text: 'Touchez ici (ou R) pour réécouter, autant de fois que vous voulez.' })),
      wave,
    );
    listen.addEventListener('click', () => this.playNpc());
    const box = el('div', { class: 'listen-box' }, listen, this.moIchidoBtn());
    // indice après une erreur : la phrase en romaji
    if (ecoute && this.wrongMeanings.size > 0) {
      box.append(el('div', { class: 'clue' }, el('span', { text: '💡 Indice — voici ce que vous entendez :' }), el('p', { class: 'romaji-main', text: this.step.romaji })));
    }
    return box;
  }

  /** mode écoute, étape 1 : deviner le sens */
  private renderUnderstand() {
    const r = this.root;
    r.append(el('div', { class: 'q-title' }, el('span', { class: 'q-num', text: '1' }), 'Qu’est-ce qu’on vous dit ?'));
    const list = el('div', { class: 'choices', role: 'group', 'aria-label': 'Que vous dit-on ?' });
    this.meanings.forEach((m, i) => {
      const wrong = this.wrongMeanings.has(m);
      const b = el('button', { class: `choice meaning${wrong ? ' wrong' : ''}`, disabled: wrong }, el('span', { class: 'key', text: String(i + 1) }), el('span', { class: 'c-body' }, el('span', { class: 'c-fr', text: m.fr })));
      b.addEventListener('click', () => this.pickMeaning(m));
      list.append(b);
    });
    r.append(list);
    if (this.wrongMeanings.size) {
      r.append(el('div', { class: 'feedback bad' }, el('strong', { text: '✗ Pas tout à fait…' }), el('p', { text: 'Je vous le répète plus lentement 🐢. Aidez-vous de l’indice !' })));
    }
  }

  /** choix de la réponse (tous modes) */
  private renderAnswers() {
    const r = this.root;
    const mode = this.mode;
    if (mode === 'ecoute') r.append(el('div', { class: 'q-title' }, el('span', { class: 'q-num', text: '2' }), 'Que répondez-vous ?'));
    const q = this.rawStep.qty;
    if (q) r.append(this.qtyPicker(q.what, q.min, q.max));
    const list = el('div', { class: 'choices', role: 'group', 'aria-label': 'Vos réponses' });
    this.choicesOrder.forEach((c, i) => {
      // une fois la bonne réponse trouvée, on ne garde qu'elle
      if (this.phase === 'answered' && !c.correct) return;
      const state = this.phase === 'answered' ? 'correct' : this.wrong.has(c) ? 'wrong' : '';
      const b = el(
        'button',
        { class: `choice ${state}`, disabled: this.phase === 'answered' || this.wrong.has(c), lang: mode === 'moyen' ? 'ja' : 'ja-Latn' },
        el('span', { class: 'key', text: String(i + 1) }),
        this.choiceBody(this.view(c)),
      );
      b.addEventListener('click', () => this.pick(c));
      list.append(b);
    });
    r.append(list);

    if (this.chosen) {
      const good = this.chosen.correct;
      const shown = this.view(this.chosen);
      // « Parfait ! » est déjà dans le titre : on l'enlève du texte
      const text = this.explain(shown.feedback).replace(/^(Parfait|Excellent|Super|Très bien|Exact|Bien)\s*[!.:]\s*/, '');
      const fb = el('div', { class: `feedback ${good ? 'good' : 'bad'}` }, el('strong', { text: good ? '✓ Parfait !' : '✗ Pas tout à fait… choisissez une autre réponse' }), el('p', { text }));
      r.append(fb);
      if (good) {
        const correct = this.chosen;
        const replayMe = el('button', { class: 'tool', title: 'Réécoutez et répétez à voix haute' }, '🔊 Ma réponse');
        replayMe.addEventListener('click', () => void audio.play(this.choiceVoice(correct), { text: speechText(this.view(correct)), rate: this.rate(), pitch: 1.05 }));
        const last = this.stepIdx === this.sc.steps.length - 1;
        r.append(el('div', { class: 'actions' }, replayMe, this.mkNext(last ? 'Conclure →' : 'Continuer →')));
      }
    }
  }

  /** sélecteur de quantité : on choisit le nombre, les réponses se mettent à jour */
  private qtyPicker(what: [string, string], min: number, max: number) {
    const locked = this.phase !== 'question';
    const n = this.qty;
    const minus = el('button', { class: 'qty-btn', 'aria-label': 'Moins', title: 'Moins (←)', disabled: locked || n <= min, text: '−' });
    const plus = el('button', { class: 'qty-btn', 'aria-label': 'Plus', title: 'Plus (→)', disabled: locked || n >= max, text: '+' });
    minus.addEventListener('click', () => this.setQty(n - 1));
    plus.addEventListener('click', () => this.setQty(n + 1));
    const dots = el('span', { class: 'qty-dots', 'aria-hidden': 'true' }, ...Array.from({ length: max }, (_, i) => el('i', { class: i < n ? 'on' : '' })));
    return el(
      'div',
      { class: `qty-pick${locked ? ' locked' : ''}`, role: 'group', 'aria-label': 'Choisissez la quantité' },
      el('span', { class: 'qty-lbl', text: locked ? '🔢 Vous avez demandé' : '🔢 Combien en voulez-vous ?' }),
      el('div', { class: 'qty-ctl' }, minus, el('span', { class: 'qty-val' }, el('strong', { text: String(n) }), ` ${what[n > 1 ? 1 : 0]}`), plus),
      dots,
    );
  }

  /** contenu d'une réponse selon la difficulté */
  private choiceBody(c: Choice) {
    const mode = this.mode;
    // une réponse déjà tentée (fausse) ou la bonne réponse trouvée : tout est dévoilé
    const known = this.wrong.has(c) || (this.phase === 'answered' && c.correct);
    if (mode === 'ecoute' || mode === 'facile') {
      return el('span', { class: 'c-body' }, el('span', { class: 'c-romaji', text: c.romaji }), el('span', { class: 'c-sub', text: c.fr }));
    }
    if (mode === 'difficile') {
      return el('span', { class: 'c-body' }, el('span', { class: 'c-romaji', text: c.romaji }), known ? el('span', { class: 'c-sub', text: c.fr }) : null);
    }
    const sub = progress.prefs.showFr || known ? `${c.romaji} — ${c.fr}` : c.romaji;
    return el('span', { class: 'c-body' }, el('span', { class: 'c-kana', text: c.kana }), el('span', { class: 'c-sub', text: sub }));
  }

  /** « Mō ichido onegai shimasu » : on le dit, le PNJ répète lentement */
  private moIchidoBtn() {
    const b = el(
      'button',
      { class: 'tool moichido', title: 'Dites « Mō ichido onegai shimasu » (encore une fois, s’il vous plaît) : on vous répète lentement. Raccourci : R' },
      el('span', { lang: 'ja', text: '🙏 ' }),
      readsKana(this.mode) ? 'もう いちど' : 'Mō ichido',
    );
    b.addEventListener('click', () => void this.moIchido());
    return b;
  }

  private async moIchido() {
    if (!this.lastAudio || !this.open_) return;
    const done = await audio.playAndWait('pb_moichido', { text: 'もう いちど おねがいします', rate: 1, pitch: 1.05 });
    if (done && this.open_) window.setTimeout(() => this.playNpc(0.75), 250);
  }

  private mkNext(label: string) {
    const b = el('button', { class: 'primary next', title: 'Entrée' }, label);
    b.addEventListener('click', () => this.next());
    return b;
  }
}
