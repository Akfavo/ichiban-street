import './style.css';
import { DISTRICTS, FOUNTAIN, LAYOUT, LOCATIONS, districtOf, type DistrictId } from './data/cityConfig';
import { ambience } from './engine/ambience';
import { SCENARIOS } from './data/scenarios';
import { Game } from './engine/game';
import { progress } from './engine/progress';
import { DialogueUI } from './ui/dialogue';
import { HUD } from './ui/hud';
import { NotebookUI } from './ui/notebook';
import { askTravel, rideShinkansen } from './ui/travel';

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;

let game: Game;
try {
  game = new Game(stage);
} catch (err) {
  console.error(err);
  ui.innerHTML =
    '<div class="fatal"><h2>WebGL indisponible</h2><p>Votre navigateur ne peut pas afficher la scène 3D. Essayez un navigateur récent (Chrome, Edge, Firefox, Safari) avec l’accélération matérielle activée.</p></div>';
  throw err;
}

// accès console en développement uniquement (tests rapides)
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;

const hud = new HUD(ui, game);
const dialogue = new DialogueUI(ui);
const notebook = new NotebookUI(ui);

// synchronise les lieux réussis (étiquettes vertes, halos verts)
const syncCompleted = () => {
  for (const w of Object.values(game.worlds)) for (const loc of LOCATIONS) w.setCompleted(loc.id, progress.isCompleted(loc.scenarioId));
};
syncCompleted();
progress.onChange(syncCompleted);

let modals = 0;
const updatePause = () => game.setPaused(modals > 0 || notebook.isOpen);
hud.onModal = (open) => {
  modals = Math.max(0, modals + (open ? 1 : -1));
  updatePause();
};
notebook.onToggle = () => updatePause();
hud.onNotebook = () => {
  if (!dialogue.isOpen) notebook.toggle();
};

game.onNearChange = (npc) => hud.setNear(npc);
game.onSeatChange = (state) => hud.setSeat(state);
game.onFrame = () => hud.updatePins();

/* ── second quartier : visite + incitation ── */
const VISITED_KEY = 'ichiban.visited-fontaine';
let visitedFontaine = false;
try {
  visitedFontaine = localStorage.getItem(VISITED_KEY) === '1';
} catch {
  /* stockage indisponible : simple rappel à chaque session */
}
const markVisited = () => {
  visitedFontaine = true;
  try {
    localStorage.setItem(VISITED_KEY, '1');
  } catch {
    /* ignoré */
  }
};
const fontaineLeft = () => LOCATIONS.filter((l) => districtOf(l) === 'fontaine' && !progress.isCompleted(l.scenarioId)).length;
const nudgeFontaine = () => {
  if (visitedFontaine || game.district !== 'ekimae') return;
  hud.toast(
    `<strong>🚄 Un autre quartier vous attend !</strong> ${fontaineLeft()} lieux autour de la ${DISTRICTS.fontaine.nameFr.toLowerCase()} <span lang="ja">${DISTRICTS.fontaine.nameJp}</span>. Le guichet du shinkansen (halo <strong>bleu</strong>) est devant la gare.`,
    6500,
  );
};

let traveling = false;
async function travel(dest: DistrictId) {
  if (traveling) return;
  traveling = true;
  hud.setNear(null);
  hud.onModal?.(true);
  ambience.sfx('open');
  const ok = await askTravel(dest);
  if (ok) await rideShinkansen(game, dest);
  hud.onModal?.(false);
  traveling = false;
  if (!ok) return;
  setAmbience(dest);
  const d = DISTRICTS[dest];
  if (dest === 'fontaine') {
    const first = !visitedFontaine;
    markVisited();
    hud.toast(
      `<strong>${d.icon} <span lang="ja">${d.nameJp}</span> · ${d.nameFr}</strong> ${first ? `${fontaineLeft()} nouveaux lieux autour de la fontaine.` : 'Bon retour sur la place !'} Le guichet 🚄 près de la gare vous ramène à ${DISTRICTS.ekimae.nameFr}.`,
      6000,
    );
  } else {
    hud.toast(`<strong>${d.icon} <span lang="ja">${d.nameJp}</span> · ${d.nameFr}</strong> Retour devant la gare.`, 4200);
  }
}

game.onTalk = (npc) => {
  if (dialogue.isOpen || notebook.isOpen || modals > 0 || traveling) return;
  if (npc.loc.travel) {
    void travel(npc.loc.travel);
    return;
  }
  if (npc.closed) {
    // lieu fermé à cette heure-ci (banque la nuit, izakaya le jour)
    if (npc.loc.closedMessage) hud.toast(npc.loc.closedMessage, 5200);
    return;
  }
  const sc = SCENARIOS[npc.loc.scenarioId];
  if (!sc) return;
  hud.setNear(null);
  ambience.sfx(npc.loc.style === 'konbini' ? 'chime' : 'open');
  game.beginDialogue(npc);
  document.body.classList.add('in-dialogue');
  dialogue.open(npc.loc, sc, {
    onClose: (completedNow) => {
      game.endDialogue();
      notebook.select(npc.loc.scenarioId);
      document.body.classList.remove('in-dialogue');
      if (completedNow) {
        const n = progress.completed.length;
        if (n === LOCATIONS.length) {
          hud.toast(`<strong>🎊 おめでとう！</strong> Les ${n} lieux sont réussis. Vous êtes prêt·e pour le Japon !`, 6000);
        } else {
          hud.toast(`<strong>${npc.loc.icon} ${npc.loc.nameFr} : lieu réussi !</strong> ${n} / ${LOCATIONS.length} · fiche d’aide dans le carnet 📒`);
          // incite à découvrir la place à la fontaine (1er lieu réussi, puis tous les 3)
          if (n === 1 || n % 3 === 0) window.setTimeout(nudgeFontaine, 4600);
        }
      }
    },
  });
};

game.controls.onEscape = () => {
  if (notebook.isOpen) notebook.close();
  else game.standUp();
};

// ambiance sonore : points d'intérêt du quartier affiché (izakaya, gare)
function setAmbience(d: DistrictId) {
  const front = (id: string) => {
    const l = LOCATIONS.find((x) => x.id === id && districtOf(x) === d);
    if (!l) return undefined;
    const fx = d === 'fontaine' ? FOUNTAIN.frontX : LAYOUT.frontX;
    const x = l.side === 'south' ? (l.x ?? 0) : l.side === 'left' ? -fx : fx;
    return { x, z: l.side === 'south' ? l.z - 5 : l.z };
  };
  ambience.setScene({ izakaya: front('izakaya') });
}
setAmbience(game.district);

// mini-carte (≈ 15 i/s suffit)
let last = 0;
const mapLoop = (t: number) => {
  // ≈15 i/s en balade, 2 i/s quand le monde est figé
  if (t - last > (game.idle ? 500 : 66)) {
    last = t;
    hud.drawMap();
    ambience.setPlayer(game.playerPos.x, game.playerPos.z);
  }
  requestAnimationFrame(mapLoop);
};
requestAnimationFrame(mapLoop);

hud.showIntro(() => {
  if (progress.completed.length === 0) hud.toast('Dirigez-vous vers un <strong>halo doré</strong> : l’agent de la gare 駅 vous attend juste à côté, sous l’auvent.', 5200);
  else window.setTimeout(nudgeFontaine, 1500);
});
