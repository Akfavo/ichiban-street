/**
 * Trajet en shinkansen entre les deux quartiers :
 *  1. fenêtre « billet » (mini-leçon : 〜ゆき = « à destination de ») ;
 *  2. cinématique plein écran avec la musique du trajet (passable : Échap / Entrée / Espace) ;
 *  3. arrivée : changement de quartier pendant l'écran noir (aucun saut visible).
 */
import { DISTRICTS, type DistrictId } from '../data/cityConfig';
import { ambience } from '../engine/ambience';
import { audio } from '../engine/audioManager';
import { createShinkansenCinematic } from '../engine/cinematic';
import type { Game } from '../engine/game';
import { el } from './dom';

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** fenêtre de confirmation : résout true si on monte dans le train */
export function askTravel(dest: DistrictId): Promise<boolean> {
  const d = DISTRICTS[dest];
  return new Promise((resolve) => {
    const go = el('button', { class: 'primary big', text: 'Monter  のる' });
    const stay = el('button', { class: 'travel-stay', text: 'Rester ici' });
    const ov = el(
      'div',
      { class: 'modal travel open', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prendre le shinkansen' },
      el(
        'div',
        { class: 'modal-card travel-card' },
        el('h2', { class: 'travel-q', text: `Partir pour ${d.icon} ${d.nameFr} ?` }),
        el(
          'div',
          { class: 'ticket' },
          el('div', { class: 'ticket-top' }, el('span', { text: '🎫 Billet de shinkansen' }), el('span', { lang: 'ja', text: '新幹線' })),
          el('div', { class: 'ticket-dest', lang: 'ja' }, el('ruby', {}, d.nameJp, el('rt', { text: d.reading })), el('span', { class: 'yuki', text: ' ゆき' })),
          el('div', { class: 'ticket-fr', text: `→ ${d.nameFr}` }),
        ),
        el(
          'div',
          { class: 'travel-lesson' },
          el('div', { class: 'tl-word' }, el('span', { lang: 'ja', text: 'ゆき' }), el('em', { text: 'yuki' }), el('span', { class: 'tl-eq', text: '= « à destination de »' })),
          el('p', {}, 'Vous le lirez sur les quais et à l’avant des trains : ', el('strong', { lang: 'ja', text: `${d.nameJp}ゆき` }), ` = le train pour ${d.nameFr}.`),
        ),
        el('div', { class: 'travel-actions' }, stay, go),
      ),
    );
    let done = false;
    const close = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      ov.classList.remove('open');
      window.setTimeout(() => ov.remove(), 300);
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    go.addEventListener('click', () => close(true));
    stay.addEventListener('click', () => close(false));
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close(false);
    });
    window.addEventListener('keydown', onKey, true);
    document.body.append(ov);
    window.setTimeout(() => go.focus(), 50);
  });
}

/** joue la cinématique puis change de quartier ; résout une fois revenu en jeu */
export async function rideShinkansen(game: Game, dest: DistrictId, maxMs = 14000): Promise<void> {
  const d = DISTRICTS[dest];
  const skip = el('button', { class: 'cine-skip', type: 'button', text: 'Passer ⏭' });
  const fade = el('div', { class: 'cine-fade' });
  const title = el(
    'div',
    { class: 'cine-title' },
    el('div', { class: 'cine-jp', lang: 'ja', text: `新幹線 · ${d.nameJp}ゆき` }),
    el('div', { class: 'cine-fr', text: `Shinkansen à destination de : ${d.nameFr}` }),
  );
  const ov = el('div', { class: 'cine', 'aria-hidden': 'false' }, el('div', { class: 'cine-bar top' }), el('div', { class: 'cine-bar bottom' }), title, skip, fade);
  document.body.append(ov);

  // 1. fondu au noir
  await nextFrame();
  fade.classList.add('on');
  await wait(480);

  // 2. la scène est construite et compilée pendant le noir (pas d'à-coup visible)
  const canvas = game.renderer.domElement;
  const night = game.night;
  const cine = createShinkansenCinematic(canvas, game.renderer.capabilities.getMaxAnisotropy(), night);
  game.renderer.compile(cine.scene, cine.camera);
  game.setCinematic(cine);
  document.body.classList.add('in-cinematic');
  audio.playShinkansen(night);
  ambience.setSuspended(true);
  await nextFrame();
  await nextFrame();
  ov.classList.add('show');
  fade.classList.remove('on');

  // 3. attente : fin automatique ou « passer »
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
      resolve();
    };
    // le geste qui a lancé le trajet ne doit pas le passer aussitôt
    const canSkip = () => performance.now() - t0 > 900;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (canSkip()) end();
      }
    };
    const timer = window.setTimeout(end, maxMs);
    window.addEventListener('keydown', onKey, true);
    skip.addEventListener('click', () => canSkip() && end());
  });

  // 4. fondu au noir, changement de quartier, retour au jeu
  ov.classList.remove('show');
  fade.classList.add('on');
  await wait(520);
  game.travelTo(dest);
  game.setCinematic(null);
  cine.dispose();
  audio.stopShinkansen();
  ambience.setSuspended(false);
  document.body.classList.remove('in-cinematic');
  await nextFrame();
  await nextFrame();
  fade.classList.remove('on');
  await wait(650);
  ov.remove();
}
