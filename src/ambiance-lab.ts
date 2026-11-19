/** Page de validation des sons (dev uniquement : `npm run dev` puis /ambiance.html) */
import { ambience, type LayerId, type SfxId } from './engine/ambience';

const LAYERS: [LayerId, string, string][] = [
  ['city', 'Rumeur de la ville', 'Fond permanent, plus discret la nuit. Une voiture passe de temps en temps.'],
  ['izakaya', 'Brouhaha de l’izakaya', 'La nuit, quand on s’approche de l’izakaya : conversations, rires, verres.'],
  ['station', 'Mélodie de la gare', 'Près de la gare : petite mélodie de départ (originale), toutes les ~30 s.'],
];

const SFX: [SfxId, string, string][] = [
  ['open', 'Ouverture d’un dialogue', 'Quand on parle à quelqu’un.'],
  ['chime', 'Carillon d’entrée', 'En entrant au konbini (pin-pon).'],
  ['good', 'Bonne réponse', 'Étape réussie.'],
  ['bad', 'Mauvaise réponse', 'Discret, pas punitif.'],
  ['success', 'Lieu réussi', 'Situation terminée.'],
];

const SCENES: [string, { night: boolean; solo: LayerId[] }][] = [
  ['☀️ Rue en journée', { night: false, solo: ['city'] }],
  ['🌙 Rue la nuit', { night: true, solo: ['city'] }],
  ['🏮 Devant l’izakaya', { night: true, solo: ['city', 'izakaya'] }],
];

const playing = new Set<LayerId>();
const buttons = new Map<LayerId, HTMLButtonElement>();

/** la page pilote directement le volume des nappes via des positions fictives */
function apply(start = true) {
  if (start) ambience.start();
  ambience.soloSet = new Set(playing);
  ambience.refreshNow();
  for (const [id, b] of buttons) {
    b.classList.toggle('on', playing.has(id));
    b.textContent = playing.has(id) ? '■ Stop' : '▶ Écouter';
  }
}

const row = (title: string, desc: string, btn: HTMLButtonElement) => {
  const r = document.createElement('div');
  r.className = 'row';
  r.innerHTML = `<div class="txt"><b>${title}</b><span>${desc}</span></div>`;
  r.append(btn);
  return r;
};

const layersEl = document.getElementById('layers')!;
for (const [id, title, desc] of LAYERS) {
  const b = document.createElement('button');
  b.className = 'play';
  b.onclick = () => {
    if (playing.has(id)) playing.delete(id);
    else playing.add(id);
    apply();
  };
  buttons.set(id, b);
  layersEl.append(row(title, desc, b));
}

const sfxEl = document.getElementById('sfx')!;
for (const [id, title, desc] of SFX) {
  const b = document.createElement('button');
  b.textContent = '▶ Jouer';
  b.onclick = () => {
    ambience.start();
    ambience.sfx(id);
  };
  sfxEl.append(row(title, desc, b));
}

const scenesEl = document.getElementById('scenes')!;
for (const [label, s] of SCENES) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    playing.clear();
    s.solo.forEach((id) => playing.add(id));
    apply();
  };
  scenesEl.append(b);
}
const stop = document.createElement('button');
stop.textContent = '■ Tout arrêter';
stop.onclick = () => {
  playing.clear();
  apply();
};
scenesEl.append(stop);
apply(false);
