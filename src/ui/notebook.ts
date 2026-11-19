/**
 * « Carnet de survie » : fiches d'aide.
 *  - ✨ L'essentiel : phrases passe-partout à dire + mots à reconnaître à l'oreille
 *  - 💴 Prix à l'oreille : mini-jeu (1 800 ou 1 080 ?)
 *  - 🔁 À revoir : les échanges ratés au moins une fois
 *  - une fiche par lieu : pour chaque échange, ce qu'on vous dit, quoi répondre,
 *    pourquoi, et les pièges à éviter (avec audio).
 * Les explications sont en romaji (sauf en mode moyen, où les kana restent).
 */
import { LOCATIONS } from '../data/cityConfig';
import { EAR_WORDS, MAGIC_PHRASES, hasAudio, type PhraseCard } from '../data/phrasebook';
import { makeRound, yenFr, yenRomaji, type PriceRound } from '../data/prices';
import { SCENARIOS, choiceVoiceId, fillQty, getCorrectChoice, lineFor, qtyDefault, qtyId, speechText, type Choice, type Scenario, type Step } from '../data/scenarios';
import { ambience } from '../engine/ambience';
import { audio } from '../engine/audioManager';
import { progress } from '../engine/progress';
import { readsKana } from './difficulty';
import { clear, el } from './dom';
import { kanaToRomaji } from './romaji';

const TAB_KEY = 'ichiban-notebook-tab';

export class NotebookUI {
  private root: HTMLDivElement;
  private open_ = false;
  private tab = 'essentiel';
  private scrollTop = 0;
  /** quantités choisies dans les fiches (id d'étape → nombre) */
  private nbQty: Record<string, number> = {};
  /** mini-jeu des prix */
  private round: PriceRound | null = null;
  private priceWrong = new Set<number>();
  private priceFound = false;
  private streak = 0;
  private best = 0;
  onToggle: ((open: boolean) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', { class: 'modal notebook', role: 'dialog', 'aria-label': 'Carnet de survie', 'aria-hidden': 'true' });
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.append(this.root);
    try {
      this.tab = localStorage.getItem(TAB_KEY) || 'essentiel';
    } catch {
      /* stockage indisponible */
    }
    progress.onChange(() => {
      if (this.open_) this.render(true);
    });
  }

  get isOpen() {
    return this.open_;
  }

  toggle() {
    if (this.open_) this.close();
    else this.open();
  }

  /** ouvre le carnet, éventuellement directement sur la fiche d'un lieu */
  open(scenarioId?: string) {
    if (scenarioId) this.setTab(scenarioId, false);
    this.open_ = true;
    this.render();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.onToggle?.(true);
  }

  close() {
    if (!this.open_) return;
    this.open_ = false;
    audio.stop();
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.onToggle?.(false);
  }

  /** présélectionne la fiche d'un lieu pour la prochaine ouverture */
  select(scenarioId: string) {
    if (SCENARIOS[scenarioId]) this.setTab(scenarioId, this.open_);
  }

  private setTab(t: string, rerender = true) {
    this.tab = t;
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* stockage indisponible */
    }
    if (rerender) this.render();
  }

  private get kana() {
    return readsKana(progress.prefs.difficulty);
  }

  private txt(s: string) {
    return this.kana ? s : kanaToRomaji(s);
  }

  private rate() {
    return progress.prefs.slow ? 0.75 : 1;
  }

  private playBtn(id: string, text: string, pitch: number, label: string) {
    const b = el('button', { class: 'icon-btn play', 'aria-label': `Écouter : ${label}`, title: 'Écouter', text: '🔊' });
    b.addEventListener('click', () => void audio.play(id, { text, rate: this.rate(), pitch }));
    return b;
  }

  /** une phrase : 🔊 + romaji (+ kana en mode moyen) + français */
  private phrase(id: string | null, p: { kana: string; romaji: string; fr: string; text?: string }, pitch = 1) {
    return el(
      'div',
      { class: 'fp' },
      id ? this.playBtn(id, p.text ?? p.kana.replace(/\s+/g, ''), pitch, p.romaji) : el('span', { class: 'icon-btn ghost', text: '·' }),
      el(
        'div',
        { class: 'fp-txt' },
        el('div', { class: 'fp-romaji', text: p.romaji }),
        this.kana ? el('div', { class: 'fp-kana', lang: 'ja', text: p.kana }) : null,
        el('div', { class: 'fp-fr', text: p.fr }),
      ),
    );
  }

  private render(keepScroll = false) {
    const r = this.root;
    const prevBody = r.querySelector('.modal-body');
    this.scrollTop = keepScroll && prevBody ? prevBody.scrollTop : 0;
    clear(r);
    const card = el('div', { class: 'modal-card nb-card' });
    const closeBtn = el('button', { class: 'icon-btn', 'aria-label': 'Fermer', title: 'Fermer (Échap)', text: '✕' });
    closeBtn.addEventListener('click', () => this.close());
    card.append(
      el(
        'div',
        { class: 'modal-head' },
        el('div', {}, el('h2', {}, '📒 Carnet de survie'), el('p', { class: 'muted', text: `Fiches d’aide · ${progress.completed.length} / ${LOCATIONS.length} lieux réussis` })),
        closeBtn,
      ),
    );

    // onglets
    const tabs = el('div', { class: 'nb-tabs', role: 'tablist' });
    const mkTab = (id: string, label: string, done = false) => {
      const b = el('button', { class: `nb-tab${this.tab === id ? ' on' : ''}${done ? ' done' : ''}`, role: 'tab', 'aria-selected': String(this.tab === id) }, label);
      b.addEventListener('click', () => this.setTab(id));
      tabs.append(b);
    };
    mkTab('essentiel', '✨ L’essentiel');
    mkTab('prix', '💴 Prix à l’oreille');
    const nMissed = this.missedSteps().length;
    if (nMissed) mkTab('revoir', `🔁 À revoir (${nMissed})`);
    for (const loc of LOCATIONS) mkTab(loc.scenarioId, `${loc.icon} ${loc.nameFr}`, progress.isCompleted(loc.scenarioId));
    card.append(tabs);

    const body = el('div', { class: 'modal-body' });
    if (SCENARIOS[this.tab]) this.renderPlace(body, this.tab);
    else if (this.tab === 'prix') this.renderPrices(body);
    else if (this.tab === 'revoir' && nMissed) this.renderReview(body);
    else this.renderEssentials(body);
    card.append(body);

    const foot = el('div', { class: 'modal-foot' });
    const speed = el('button', { class: `tool${progress.prefs.slow ? ' on' : ''}`, text: progress.prefs.slow ? '🐢 Voix lente' : '🐇 Voix normale' });
    speed.addEventListener('click', () => progress.setPref('slow', !progress.prefs.slow));
    const reset = el('button', { class: 'tool danger', text: 'Réinitialiser la progression' });
    reset.addEventListener('click', () => {
      if (window.confirm('Effacer toute la progression (lieux réussis) ?')) progress.reset();
    });
    foot.append(speed, el('div', { class: 'spacer' }), reset);
    card.append(foot);
    r.append(card);
    body.scrollTop = this.scrollTop;
    tabs.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private renderEssentials(body: HTMLElement) {
    const list = (cards: PhraseCard[], cls: string) => {
      const ul = el('div', { class: `fiche-list ${cls}` });
      for (const p of cards) {
        ul.append(el('div', { class: 'fiche-row' }, this.phrase(hasAudio(p) ? p.id : null, p), el('p', { class: 'fp-when', text: p.when })));
      }
      return ul;
    };
    body.append(
      el('div', { class: 'nb-intro', text: 'Pas besoin de lire le japonais : écoutez chaque phrase (🔊), répétez-la à voix haute, et revenez ici avant d’entrer dans un magasin.' }),
      el('h3', { class: 'nb-h' }, '🗣️ À savoir dire', el('small', { text: 'ces phrases sauvent dans toutes les situations' })),
      list(MAGIC_PHRASES, 'fl-say'),
      el('h3', { class: 'nb-h' }, '👂 À reconnaître à l’oreille', el('small', { text: 'ce que les vendeurs disent tout le temps' })),
      list(EAR_WORDS, 'fl-hear'),
    );
  }

  /** petit sélecteur « combien ? » d'une fiche */
  private qtyStepper(stepId: string, what: [string, string], min: number, max: number, n: number) {
    const set = (v: number) => {
      this.nbQty[stepId] = Math.min(max, Math.max(min, v));
      this.render(true);
    };
    const minus = el('button', { class: 'qty-btn', 'aria-label': 'Moins', disabled: n <= min, text: '−' });
    const plus = el('button', { class: 'qty-btn', 'aria-label': 'Plus', disabled: n >= max, text: '+' });
    minus.addEventListener('click', () => set(n - 1));
    plus.addEventListener('click', () => set(n + 1));
    return el(
      'div',
      { class: 'qty-pick small', role: 'group', 'aria-label': 'Quantité' },
      el('span', { class: 'qty-lbl', text: '🔢 Essayez un autre nombre' }),
      el('div', { class: 'qty-ctl' }, minus, el('span', { class: 'qty-val' }, el('strong', { text: String(n) }), ` ${what[n > 1 ? 1 : 0]}`), plus),
    );
  }

  private renderPlace(body: HTMLElement, scId: string) {
    const sc = SCENARIOS[scId];
    const loc = LOCATIONS.find((l) => l.scenarioId === scId)!;
    const pitch = loc.npc.voicePitch ?? 1;
    const done = progress.isCompleted(scId);
    body.append(
      el(
        'div',
        { class: 'nb-place' },
        el('div', { class: 'nb-place-title' }, el('strong', { text: `${loc.icon} ${loc.nameFr}` }), done ? el('span', { class: 'badge', text: '✓ réussi' }) : el('span', { class: 'badge todo', text: 'à découvrir' })),
        el('p', { class: 'muted', text: sc.goal }),
      ),
    );
    sc.steps.forEach((raw, i) => body.append(this.stepCard(sc, raw, pitch, `Échange ${i + 1}`)));
    const outro = lineFor(sc, sc.outro, false, this.nbQty);
    body.append(
      el('div', { class: 'fiche end' }, el('div', { class: 'fiche-lbl', text: '👋 Pour finir, on vous dit' }), this.phrase(outro.voice, { ...outro, text: speechText(outro) }, pitch)),
      el('div', { class: 'fiche-tip' }, el('strong', { text: '🎌 Bon à savoir · ' }), this.txt(sc.tip)),
    );
  }

  /** fiche d'un échange : on vous dit / vous répondez / pourquoi / pièges */
  private stepCard(sc: Scenario, raw: Step, pitch: number, title: string) {
    {
      const s = lineFor(sc, raw, false, this.nbQty);
      const n = raw.qty ? (this.nbQty[raw.id] ?? qtyDefault(sc, raw, this.nbQty)) : null;
      const v = (x: Choice) => (n == null ? x : fillQty(x, n));
      const vid = (x: Choice) => qtyId(choiceVoiceId(raw, x), n);
      const rc = getCorrectChoice(raw);
      const c = v(rc);
      const traps = raw.choices.filter((x) => !x.correct).map(v);
      const card = el(
        'div',
        { class: 'fiche' },
        el('div', { class: 'fiche-n', text: title }),
        el('div', { class: 'fiche-part p-hear' }, el('div', { class: 'fiche-lbl', text: '👂 On vous dit' }), this.phrase(s.voice, { ...s, text: speechText(s) }, pitch)),
        raw.qty && n != null ? this.qtyStepper(raw.id, raw.qty.what, raw.qty.min, raw.qty.max, n) : null,
        el('div', { class: 'fiche-part p-say' }, el('div', { class: 'fiche-lbl', text: '💬 Vous répondez' }), this.phrase(vid(rc), { ...c, text: speechText(c) }, 1.05)),
        el('div', { class: 'fiche-why' }, el('strong', { text: '💡 Pourquoi ? ' }), this.txt(c.feedback)),
      );
      // autres bonnes réponses possibles (ex. « Futari desu » / « Hitori desu »)
      for (const ra of raw.choices.filter((x) => x.correct && x !== rc)) {
        const alt = v(ra);
        card.append(
          el('div', { class: 'fiche-part p-say alt' }, el('div', { class: 'fiche-lbl', text: '✅ Ou aussi' }), this.phrase(vid(ra), { ...alt, text: speechText(alt) }, 1.05)),
          el('div', { class: 'fiche-why' }, el('strong', { text: '💡 ' }), this.txt(alt.feedback)),
        );
      }
      if (traps.length) {
        const det = el('details', { class: 'fiche-traps' }, el('summary', { text: `⚠️ Les pièges à éviter (${traps.length})` }));
        for (const t of traps) {
          det.append(el('div', { class: 'trap' }, el('div', {}, el('span', { class: 'trap-romaji', text: t.romaji }), el('span', { class: 'trap-fr', text: ` — ${t.fr}` })), el('p', { text: this.txt(t.feedback) })));
        }
        card.append(det);
      }
      return card;
    }
  }

  /* ───────────── 🔁 À revoir ───────────── */

  private missedSteps() {
    const out: { sc: Scenario; raw: Step }[] = [];
    for (const id of progress.missed) {
      for (const sc of Object.values(SCENARIOS)) {
        const raw = sc.steps.find((s) => s.id === id);
        if (raw) out.push({ sc, raw });
      }
    }
    return out;
  }

  private renderReview(body: HTMLElement) {
    body.append(el('div', { class: 'nb-intro', text: 'Les échanges où vous avez hésité. Réécoutez, répétez à voix haute, puis cochez « Retenu ». Réussis du premier coup en jeu, ils disparaissent tout seuls.' }));
    for (const { sc, raw } of this.missedSteps()) {
      const loc = LOCATIONS.find((l) => l.scenarioId === sc.id);
      if (!loc) continue;
      const card = this.stepCard(sc, raw, loc.npc.voicePitch ?? 1, `${loc.icon} ${loc.nameFr}`);
      const done = el('button', { class: 'tool review-done', text: '✓ Retenu' });
      done.addEventListener('click', () => progress.setMissed(raw.id, false));
      card.append(done);
      body.append(card);
    }
  }

  /* ───────────── 💴 Prix à l'oreille ───────────── */

  private playPrice() {
    if (!this.round) return;
    void audio.play('tts-price', { text: `${this.round.answer}円`, rate: this.rate(), pitch: 1 });
  }

  private newRound(play = true) {
    this.round = makeRound(this.streak >= 5 ? 2 : 1);
    this.priceWrong.clear();
    this.priceFound = false;
    if (play) this.playPrice();
  }

  private renderPrices(body: HTMLElement) {
    if (!this.round) this.newRound(false);
    const r = this.round!;
    const listen = el('button', { class: 'listen price-listen' }, el('span', { class: 'listen-ico', text: '🎧' }), el('span', { class: 'listen-txt' }, el('strong', { text: 'Écoutez le prix' }), el('small', { text: 'Touchez pour (ré)écouter. Puis choisissez le bon montant.' })));
    listen.addEventListener('click', () => this.playPrice());
    const opts = el('div', { class: 'choices price-opts' });
    for (const n of r.options) {
      const state = this.priceFound ? (n === r.answer ? 'correct' : 'faded') : this.priceWrong.has(n) ? 'wrong' : '';
      const b = el('button', { class: `choice ${state}`, disabled: this.priceFound || this.priceWrong.has(n) }, el('span', { class: 'c-body' }, el('span', { class: 'c-romaji', text: yenFr(n) }), this.priceWrong.has(n) || this.priceFound ? el('span', { class: 'c-sub', text: yenRomaji(n) }) : null));
      b.addEventListener('click', () => {
        if (n === r.answer) {
          if (this.priceWrong.size === 0) this.streak++;
          else this.streak = 0;
          this.best = Math.max(this.best, this.streak);
          this.priceFound = true;
          ambience.sfx('good');
        } else {
          this.priceWrong.add(n);
          this.streak = 0;
          ambience.sfx('bad');
        }
        this.render(true);
      });
      opts.append(b);
    }
    body.append(
      el('div', { class: 'nb-intro', text: 'À la caisse, le prix est souvent dit très vite. Entraînez votre oreille aux montants qui se ressemblent : 1 800 (sen happyaku) ou 1 080 (sen hachijū) ?' }),
      el('div', { class: 'price-score' }, el('span', { text: `🔥 Série : ${this.streak}` }), el('span', { class: 'muted', text: `record ${this.best}` })),
      listen,
      opts,
    );
    if (this.priceFound) {
      const next = el('button', { class: 'primary next', text: 'Prix suivant →' });
      next.addEventListener('click', () => {
        this.newRound();
        this.render(true);
      });
      body.append(
        el('div', { class: 'feedback good' }, el('strong', { text: `✓ ${yenFr(r.answer)}` }), el('p', { text: `On dit « ${yenRomaji(r.answer)} ». Repères : hyaku = 100, sen = 1 000, man = 10 000.` })),
        el('div', { class: 'actions' }, next),
      );
    }
  }
}
