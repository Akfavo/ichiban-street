/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CONFIGURATION DE LA VILLE
 *  Tout ce qui est visible (lieux, couleurs, enseignes, tenues des PNJ, décor)
 *  se règle ici. Aucun import de Three.js : ce fichier est de la donnée pure
 *  (il est aussi lu par scripts/generate-voices.ts).
 *
 *  Repère : x = ouest(-) / est(+), z = nord(-) / sud(+). L'avenue suit l'axe z.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Hex = string;

export type HairStyle = 'short' | 'long' | 'bun' | 'spiky' | 'bob';
export type HatStyle = 'none' | 'cap' | 'band' | 'beret';

export interface CharacterLook {
  skin: Hex;
  hair: Hex;
  hairStyle: HairStyle;
  top: Hex;
  bottom: Hex;
  shoes: Hex;
  apron?: Hex;
  tie?: Hex;
  hat?: HatStyle;
  hatColor?: Hex;
  glasses?: boolean;
  backpack?: Hex;
  /** mallette tenue à la main droite (salaryman) */
  briefcase?: Hex;
  /** échelle globale (1 = 1,85 m environ) */
  scale?: number;
}

export interface NpcConfig {
  name: string;
  nameKana: string;
  role: string;
  /** choisit la voix Cartesia : CARTESIA_VOICE_ID_HOMME ou CARTESIA_VOICE_ID_FEMME */
  gender: 'homme' | 'femme';
  look: CharacterLook;
  /** hauteur de voix pour la synthèse navigateur (0.5 → 2) */
  voicePitch?: number;
  /** voix Cartesia spécifique à ce PNJ (prioritaire sur la voix homme / femme) */
  cartesiaVoiceId?: string;
  /** position relative à la façade : along = le long de la façade, out = vers la rue */
  offset?: { along: number; out: number };
}

export type ShopStyle =
  | 'station'
  | 'konbini'
  | 'ramen'
  | 'bank'
  | 'telecom'
  | 'electronics'
  | 'games'
  | 'figures'
  | 'pharmacy'
  | 'izakaya'
  | 'bakery'
  | 'hotel'
  | 'shokudo'
  | 'koban'
  /** pas de bâtiment : un simple PNJ dans la rue (x, z, orientation `face`) */
  | 'street';

/** les deux quartiers, reliés en shinkansen */
export type DistrictId = 'ekimae' | 'fontaine';

export interface LocationConfig {
  id: string;
  /** quartier (par défaut : ekimae, le quartier de la gare) */
  district?: DistrictId;
  /** point de départ du shinkansen : quartier de destination */
  travel?: DistrictId;
  scenarioId: string;
  icon: string;
  nameFr: string;
  nameJp: string;
  reading: string;
  style: ShopStyle;
  /** left = côté ouest de l'avenue, right = côté est, south = la gare */
  side: 'left' | 'right' | 'south';
  /** centre le long de l'avenue */
  z: number;
  /** centre en x (gare, PNJ de rue) ou position de la façade (kōban sur la place) */
  x?: number;
  /** PNJ de rue : orientation (radians, 0 = regarde vers le sud) */
  face?: number;
  /** largeur de la façade */
  width: number;
  /** profondeur du bâtiment */
  depth: number;
  height: number;
  colors: {
    wall: Hex;
    trim: Hex;
    roof: Hex;
    window: Hex;
    awning: [Hex, Hex];
  };
  sign: { text: string; sub?: string; bg: Hex; fg: Hex; accent?: Hex };
  npc: NpcConfig;
  /**
   * horaires : 'day' = ouvert seulement le jour (fermé la nuit),
   * 'night' = ouvert seulement la nuit. Absent = toujours ouvert.
   */
  open?: 'day' | 'night';
  /** pancarte affichée quand le lieu est fermé */
  closedSign?: { kana: string; fr: string };
  /** message (HTML) affiché si l'on tente d'interagir pendant la fermeture */
  closedMessage?: string;
}

/* ─────────────────────────────── Disposition ─────────────────────────────── */

export const LAYOUT = {
  avenueHalfWidth: 5,
  sidewalkWidth: 4.5,
  sidewalkHeight: 0.12,
  avenueStartZ: -41.5,
  avenueEndZ: 6,
  plaza: { minX: -17, maxX: 17, minZ: 6, maxZ: 17 },
  /** limites jouables */
  bounds: { minX: -25, maxX: 25, minZ: -40.9, maxZ: 26 },
  /** socle du diorama */
  plinth: { minX: -26, maxX: 26, minZ: -41.5, maxZ: 34, thickness: 2.2 },
  crosswalksZ: [-33.5, -20.5, -7.5, 4.3],
  get frontX() {
    return this.avenueHalfWidth + this.sidewalkWidth;
  },
};

/**
 * Second quartier : la place à la fontaine (噴水広場), piétonne.
 * Gare du shinkansen au sud, 3 boutiques à l'ouest, 3 à l'est, fontaine au centre.
 */
export const FOUNTAIN = {
  /** ligne des façades (ouest = -frontX, est = +frontX) */
  frontX: 13,
  /** limites jouables */
  bounds: { minX: -12.6, maxX: 12.6, minZ: -23.2, maxZ: 16.6 },
  /** socle du diorama */
  plinth: { minX: -26, maxX: 26, minZ: -28, maxZ: 33, thickness: 2.2 },
  fountain: { x: 0, z: -3, r: 3.4 },
  /** façade de la gare (côté place) */
  stationZ: 17.4,
  start: { x: 0, z: 14.6 },
  passersby: [
    {
      x: -8.6, zFrom: -20, zTo: 13, speed: 1.5,
      look: { skin: '#f5d2b5', hair: '#2a1a12', hairStyle: 'bob', top: '#9fc6e0', bottom: '#f4f1ea', shoes: '#c44d58', scale: 0.9 },
    },
    {
      x: 8.4, zFrom: -21, zTo: 12, speed: 1.8,
      look: { skin: '#efc6a0', hair: '#1a1a1a', hairStyle: 'short', top: '#3b4252', bottom: '#2a2f3a', shoes: '#111111', tie: '#2d6a9f', briefcase: '#4a3222' },
    },
    {
      x: -5.6, zFrom: -21, zTo: -9, speed: 1.2,
      look: { skin: '#e6b48a', hair: '#d9d9d9', hairStyle: 'bun', top: '#b56576', bottom: '#4a4a52', shoes: '#5a4030', scale: 0.88 },
    },
  ] as { x: number; zFrom: number; zTo: number; speed: number; look: CharacterLook }[],
};

export const PLAYER = {
  start: { x: 0, z: 9.5 },
  speed: 5.2,
  runMultiplier: 1.7,
  halfSize: 0.3,
  look: {
    skin: '#f1c9a5',
    hair: '#2b1d14',
    hairStyle: 'short',
    top: '#e35d3a',
    bottom: '#2f3e5c',
    shoes: '#f4f4f4',
    backpack: '#3d7a5a',
  } satisfies CharacterLook,
};

export const CAMERA = {
  /** hauteur visible (unités monde) à zoom 1 */
  viewHeight: 21,
  distance: 60,
  /** angle horizontal : 45° = isométrique classique */
  azimuthDeg: 45,
  /** élévation : 35.264° = isométrique « vrai » */
  elevationDeg: 35.264,
  followLerp: 4.5,
  dialogueZoom: 1.6,
};

export const GAMEPLAY = {
  /** déclenche le dialogue en entrant dans le halo (sinon Espace/Entrée) */
  autoTalk: true,
  interactRadius: 1.25,
};

export const LIGHTING = {
  sky: '#ffe8cc',
  ground: '#8f7c66',
  hemiIntensity: 1.25,
  sun: '#ffd7a6',
  sunIntensity: 2.4,
  /** direction du soleil relative au joueur */
  sunOffset: { x: 20, y: 32, z: -9 },
  exposure: 1.05,
  /** ambiance nocturne (bouton ☀️ Jour / 🌙 Nuit) */
  night: {
    sky: '#6a7cb0',
    ground: '#5a4a44',
    /** éclairage d'ambiance homogène (pas de lumières qui s'allument au passage) */
    hemiIntensity: 2.2,
    sun: '#8a9cd0',
    sunIntensity: 1.4,
    exposure: 1.12,
    /**
     * PointLights dynamiques réattribuées aux sources proches du joueur.
     * 0 = désactivé : la nuit reste éclairée de façon uniforme, les enseignes
     * et vitrines brillent par elles-mêmes (émissif), sans « pop » en marchant.
     */
    pointLights: 0,
    pointColor: '#ffc27a',
  },
  /** durée de la transition jour ↔ nuit (secondes) */
  transition: 1.2,
};

export const DECOR = {
  /** lampadaires (des deux côtés) */
  lampsZ: [-38, -28, -20, -14, -8, -2],
  /** arbres d'alignement */
  /** entre les boutiques : jamais devant un PNJ ni sur son halo */
  treesZ: [-29.6, -18.3, -5.3],
  /** poteaux électriques (côté ouest) */
  polesZ: [-38, -31, -17.5, -4.5],
  /** ruelles où l'on place des distributeurs de boissons */
  vendingGapsZ: [-33.5, -20.5, -7.5],
  vendingColors: ['#d9232e', '#1f5fbf', '#f2f2f2', '#2e9d58', '#f28c1e', '#1f5fbf'],
  cars: [
    { x: 3.4, z: -3, yaw: 0, color: '#1d2b24', taxi: true },
    { x: -3.4, z: -38, yaw: Math.PI, color: '#f4f1ea', taxi: false },
    { x: 3.4, z: -24, yaw: 0, color: '#7fb3d5', taxi: false },
  ],
  /**
   * passants : ils font des allers-retours sur un trottoir (x fixe) entre zFrom
   * et zTo, s'arrêtent parfois aux distributeurs et aux passages piétons.
   */
  passersby: [
    {
      x: 7.4, zFrom: -37, zTo: 3, speed: 1.9,
      look: { skin: '#efc6a0', hair: '#1a1a1a', hairStyle: 'short', top: '#2e3440', bottom: '#2a2f3a', shoes: '#111111', tie: '#8a1c2b', briefcase: '#4a3222' },
    },
    {
      x: -7.6, zFrom: -37, zTo: 2, speed: 1.6,
      look: { skin: '#f5d2b5', hair: '#6b3f22', hairStyle: 'long', top: '#f2a7b8', bottom: '#f4f1ea', shoes: '#c44d58', backpack: '#ffffff', scale: 0.92 },
    },
    {
      x: 6.9, zFrom: -30, zTo: 4, speed: 1.4,
      look: { skin: '#e6b48a', hair: '#bfbfbf', hairStyle: 'bob', top: '#7a8f5c', bottom: '#4a4a52', shoes: '#5a4030', hat: 'beret', hatColor: '#7d2f3a', scale: 0.9 },
    },
    {
      x: -6.9, zFrom: -36, zTo: 4, speed: 2.1,
      look: { skin: '#f1c9a5', hair: '#2b1d14', hairStyle: 'spiky', top: '#2a6fdb', bottom: '#1f2533', shoes: '#f4f4f4', backpack: '#e8a317', scale: 0.88 },
    },
    {
      x: 7.8, zFrom: -36, zTo: -8, speed: 1.7,
      look: { skin: '#f3cfb0', hair: '#3a2416', hairStyle: 'bun', top: '#f4f1ea', bottom: '#1f2a44', shoes: '#151515', glasses: true, briefcase: '#1f1f22' },
    },
  ] as { x: number; zFrom: number; zTo: number; speed: number; look: CharacterLook }[],
  streetBanner: 'いちばんどおり',
};

/* ─────────────────────────────── Les 15 lieux ─────────────────────────────── */

export const LOCATIONS: LocationConfig[] = [
  {
    id: 'eki',
    scenarioId: 'eki',
    icon: '🚉',
    nameFr: 'Gare',
    nameJp: '駅',
    reading: 'えき',
    style: 'station',
    side: 'south',
    x: 0,
    z: 22,
    width: 34,
    depth: 10,
    height: 6.5,
    colors: { wall: '#e9e1d2', trim: '#7d8a96', roof: '#5d6670', window: '#9fc6e0', awning: ['#2d6a9f', '#ffffff'] },
    sign: { text: 'ちゅうおう駅', sub: 'CHŪŌ STATION · えき', bg: '#1f5a8c', fg: '#ffffff', accent: '#3fae5a' },
    npc: {
      name: 'Agent de gare',
      nameKana: 'えきいん',
      role: 'Guichet & portiques',
      gender: 'homme',
      voicePitch: 0.95,
      offset: { along: 7, out: 2.9 },
      look: { skin: '#efc6a0', hair: '#1c1c1c', hairStyle: 'short', top: '#1f2f57', bottom: '#1f2f57', shoes: '#111111', tie: '#c22b2b', hat: 'cap', hatColor: '#1f2f57' },
    },
  },
  // ───────── Sur la place, devant la gare ─────────
  {
    id: 'koban',
    scenarioId: 'koban',
    icon: '👮',
    nameFr: 'Kōban (police)',
    nameJp: '交番',
    reading: 'こうばん',
    style: 'koban',
    side: 'left',
    x: -18,
    z: 11.5,
    width: 6,
    depth: 5,
    height: 4.4,
    colors: { wall: '#ece6da', trim: '#24365e', roof: '#7d7a74', window: '#cfe2ee', awning: ['#24365e', '#ffffff'] },
    sign: { text: '交番', sub: 'KOBAN · POLICE', bg: '#24365e', fg: '#ffffff', accent: '#d7261e' },
    npc: {
      name: 'Policière du kōban',
      nameKana: 'おまわりさん',
      role: 'Objets perdus',
      gender: 'femme',
      voicePitch: 1.0,
      offset: { along: 1.6, out: 1.3 },
      look: { skin: '#f0c9a6', hair: '#1f1a17', hairStyle: 'bun', top: '#2a3d66', bottom: '#1f2a44', shoes: '#111111', hat: 'cap', hatColor: '#1f2a44' },
    },
  },
  {
    id: 'michi',
    scenarioId: 'michi',
    icon: '🧭',
    nameFr: 'Demander son chemin',
    nameJp: '道',
    reading: 'みち',
    style: 'street',
    district: 'fontaine',
    side: 'left',
    x: 4.6,
    z: 12.4,
    face: -Math.PI / 2,
    width: 1,
    depth: 1,
    height: 0,
    colors: { wall: '#ffffff', trim: '#ffffff', roof: '#ffffff', window: '#ffffff', awning: ['#ffffff', '#ffffff'] },
    sign: { text: '', bg: '#ffffff', fg: '#000000' },
    npc: {
      name: 'Passante',
      nameKana: 'つうこうにん',
      role: 'Habitante du quartier',
      gender: 'femme',
      voicePitch: 1.1,
      look: { skin: '#f3cfb0', hair: '#4a2f1f', hairStyle: 'long', top: '#e9d8a6', bottom: '#5b6b7a', shoes: '#7a4b2a', scale: 0.93 },
    },
  },
  // ───────── Côté ouest (gauche en remontant l'avenue) ─────────
  {
    id: 'konbini',
    scenarioId: 'konbini',
    icon: '🏪',
    nameFr: 'Konbini',
    nameJp: 'コンビニ',
    reading: 'こんびに',
    style: 'konbini',
    side: 'left',
    z: -1,
    width: 10,
    depth: 9,
    height: 6.6,
    colors: { wall: '#f6f4ef', trim: '#2f8f4e', roof: '#9aa1a6', window: '#bfe3f2', awning: ['#2f8f4e', '#2a6fdb'] },
    sign: { text: 'コンビニ', sub: 'いちばんマート 24H', bg: '#ffffff', fg: '#1d7a46', accent: '#2a6fdb' },
    npc: {
      name: 'Vendeuse du konbini',
      nameKana: 'てんいん',
      role: 'Caisse',
      gender: 'femme',
      voicePitch: 1.25,
      look: { skin: '#f3cfb0', hair: '#3a2416', hairStyle: 'bob', top: '#7cc6ee', bottom: '#2b2f3a', shoes: '#ffffff', apron: '#2f8f4e' },
    },
  },
  {
    id: 'ramen',
    scenarioId: 'ramen',
    icon: '🍜',
    nameFr: 'Restaurant Ramen',
    nameJp: 'ラーメン',
    reading: 'らーめん',
    style: 'ramen',
    side: 'left',
    z: -14,
    width: 10,
    depth: 9,
    height: 7.4,
    colors: { wall: '#6b4630', trim: '#2a1a12', roof: '#3b2a20', window: '#ffcf8a', awning: ['#b3261e', '#1e1a18'] },
    sign: { text: 'ラーメン', sub: 'めんや ことぶき', bg: '#b3261e', fg: '#fff3d6', accent: '#1e1a18' },
    npc: {
      name: 'Chef ramen',
      nameKana: 'てんちょう',
      role: 'Accueil & cuisine',
      gender: 'homme',
      voicePitch: 0.8,
      look: { skin: '#e6b48a', hair: '#151515', hairStyle: 'spiky', top: '#f5f1e6', bottom: '#2a2a2a', shoes: '#1a1a1a', apron: '#1f2a44', hat: 'band', hatColor: '#ffffff' },
    },
  },
  {
    id: 'bank',
    scenarioId: 'bank',
    icon: '🏦',
    nameFr: 'Banque / Poste',
    nameJp: '銀行・郵便局',
    reading: 'ぎんこう・ゆうびんきょく',
    style: 'bank',
    side: 'left',
    z: -27,
    width: 10,
    depth: 9,
    height: 8.8,
    colors: { wall: '#dcd6cb', trim: '#0f3d7a', roof: '#8c8a86', window: '#a9cde6', awning: ['#0f3d7a', '#d7261e'] },
    sign: { text: '銀行・郵便局', sub: 'BANK · POST · ATM', bg: '#0f3d7a', fg: '#ffffff', accent: '#d7261e' },
    npc: {
      name: 'Employé de banque',
      nameKana: 'ぎんこういん',
      role: 'Accueil clientèle',
      gender: 'homme',
      voicePitch: 0.9,
      look: { skin: '#f0c8a6', hair: '#232323', hairStyle: 'short', top: '#3d4350', bottom: '#2d323c', shoes: '#151515', tie: '#0f3d7a', glasses: true },
    },
    open: 'day',
    closedSign: { kana: '営業時間外', fr: 'Fermé' },
    closedMessage: '🏦 <b>Fermé · 営業時間外</b> <i>(eigyō jikan-gai)</i><br>La banque ferme le soir. Repassez en mode <b>☀️ Jour</b> pour y entrer.',
  },
  {
    id: 'telecom',
    scenarioId: 'telecom',
    icon: '📱',
    nameFr: 'Boutique Télécom',
    nameJp: '携帯ショップ',
    reading: 'けいたいしょっぷ',
    style: 'telecom',
    side: 'right',
    z: -14,
    width: 10,
    depth: 9,
    height: 7.2,
    colors: { wall: '#fbf7f2', trim: '#ff7a00', roof: '#a7a39d', window: '#cfe9f7', awning: ['#ff7a00', '#ffffff'] },
    sign: { text: '携帯ショップ', sub: 'MOBILE · SIM · eSIM', bg: '#ff7a00', fg: '#ffffff', accent: '#ffffff' },
    npc: {
      name: 'Conseillère mobile',
      nameKana: 'すたっふ',
      role: 'Forfaits & SIM',
      gender: 'femme',
      voicePitch: 1.2,
      look: { skin: '#f5d2b5', hair: '#5a3a26', hairStyle: 'long', top: '#ff8a1f', bottom: '#2b2b33', shoes: '#ffffff' },
    },
  },
  // ───────── Extrémité nord : ouvert la nuit seulement ─────────
  {
    id: 'izakaya',
    scenarioId: 'izakaya',
    icon: '🏮',
    nameFr: 'Izakaya',
    nameJp: '居酒屋',
    reading: 'いざかや',
    style: 'izakaya',
    district: 'fontaine',
    x: -13,
    side: 'left',
    z: -4,
    width: 10,
    depth: 9,
    height: 6.2,
    colors: { wall: '#4a3324', trim: '#22160f', roof: '#2b2622', window: '#ffb35c', awning: ['#2b1a12', '#5a3a26'] },
    sign: { text: '居酒屋', sub: 'いざかや · とりきち', bg: '#2a1a12', fg: '#ffe2b0', accent: '#c0392b' },
    npc: {
      name: 'Patron de l’izakaya',
      nameKana: 'たいしょう',
      role: 'Accueil & comptoir',
      gender: 'homme',
      voicePitch: 0.85,
      look: { skin: '#e2ae84', hair: '#2a2a2a', hairStyle: 'short', top: '#1f2a44', bottom: '#22252c', shoes: '#1a1a1a', apron: '#2a1a12', hat: 'band', hatColor: '#c0392b' },
    },
    open: 'night',
    closedSign: { kana: '準備中', fr: 'En préparation · Ouvre la nuit' },
    closedMessage: '🏮 <b>準備中 · Junbi-chū</b> (en préparation)<br>L’izakaya n’ouvre que le soir. Passez en mode <b>🌙 Nuit</b> (bouton en haut ou touche <kbd>N</kbd>) pour entrer.',
  },
  // ───────── Tout au nord, côté ouest : l'hôtel ─────────
  {
    id: 'hotel',
    scenarioId: 'hotel',
    icon: '🏨',
    nameFr: 'Hôtel',
    nameJp: 'ホテル',
    reading: 'ほてる',
    style: 'hotel',
    district: 'fontaine',
    x: -13,
    side: 'left',
    z: -17,
    width: 10,
    depth: 9,
    height: 12,
    colors: { wall: '#e8e2d6', trim: '#7a5c3a', roof: '#8d8780', window: '#b9d6ea', awning: ['#7a5c3a', '#f2e6cf'] },
    sign: { text: 'ホテル', sub: 'HOTEL ICHIBAN', bg: '#3b2f25', fg: '#f2d9a6', accent: '#c9a25b' },
    npc: {
      name: 'Réceptionniste',
      nameKana: 'ふろんと',
      role: 'Réception',
      gender: 'homme',
      voicePitch: 1.0,
      look: { skin: '#f0c8a6', hair: '#222222', hairStyle: 'short', top: '#2e2a33', bottom: '#2a2a30', shoes: '#111111', tie: '#7a5c3a' },
    },
  },
  // ───────── Côté est (droite en remontant l'avenue) ─────────
  {
    id: 'electronics',
    scenarioId: 'electronics',
    icon: '🔌',
    nameFr: 'Électronique',
    nameJp: '家電量販店',
    reading: 'かでんりょうはんてん',
    style: 'electronics',
    district: 'fontaine',
    x: 13,
    side: 'right',
    z: -4,
    width: 10,
    depth: 9,
    height: 6.2,
    colors: { wall: '#f2f2f2', trim: '#e60012', roof: '#9b9b9b', window: '#bfe0ff', awning: ['#e60012', '#ffd400'] },
    sign: { text: '家電量販店', sub: 'ELECTRONICS · TAX FREE', bg: '#e60012', fg: '#ffffff', accent: '#ffd400' },
    npc: {
      name: 'Vendeur électronique',
      nameKana: 'てんいん',
      role: 'Rayon accessoires',
      gender: 'homme',
      voicePitch: 1.0,
      look: { skin: '#eec09a', hair: '#1e1e1e', hairStyle: 'short', top: '#d81e2c', bottom: '#222831', shoes: '#111111' },
    },
  },
  {
    id: 'games',
    scenarioId: 'games',
    icon: '🎮',
    nameFr: 'Jeux Vidéo',
    nameJp: 'ゲーム',
    reading: 'げーむ',
    style: 'games',
    district: 'fontaine',
    x: 13,
    side: 'right',
    z: 9,
    width: 10,
    depth: 9,
    height: 5.6,
    colors: { wall: '#2a2340', trim: '#00e5ff', roof: '#1b1730', window: '#d6b8ff', awning: ['#6a1bd1', '#00e5ff'] },
    sign: { text: 'ゲーム', sub: 'GAMES · しんぴん / ちゅうこ', bg: '#6a1bd1', fg: '#ffffff', accent: '#00e5ff' },
    npc: {
      name: 'Vendeur jeux vidéo',
      nameKana: 'てんいん',
      role: 'Comptoir occasion',
      gender: 'homme',
      voicePitch: 1.1,
      look: { skin: '#f2cba9', hair: '#2a2a2a', hairStyle: 'spiky', top: '#6a1bd1', bottom: '#1f2533', shoes: '#ff3b6b', hat: 'cap', hatColor: '#00b8d4' },
    },
  },
  {
    id: 'figures',
    scenarioId: 'figures',
    icon: '🧸',
    nameFr: 'Figurines',
    nameJp: 'フィギュア',
    reading: 'ふぃぎゅあ',
    style: 'figures',
    district: 'fontaine',
    x: 13,
    side: 'right',
    z: -17,
    width: 10,
    depth: 9,
    height: 6.0,
    colors: { wall: '#fff0f6', trim: '#ff4fa3', roof: '#b38aa0', window: '#ffd6ea', awning: ['#ff4fa3', '#ffffff'] },
    sign: { text: 'フィギュア', sub: 'FIGURES · HOBBY', bg: '#ff4fa3', fg: '#ffffff', accent: '#7a2a8c' },
    npc: {
      name: 'Vendeuse figurines',
      nameKana: 'てんいん',
      role: 'Vitrines',
      gender: 'femme',
      voicePitch: 1.3,
      look: { skin: '#f6d6bd', hair: '#6b3fa0', hairStyle: 'long', top: '#232323', bottom: '#3a2a4a', shoes: '#ff4fa3', apron: '#ff4fa3' },
    },
  },
  {
    id: 'pharmacy',
    scenarioId: 'pharmacy',
    icon: '💊',
    nameFr: 'Pharmacie',
    nameJp: '薬局',
    reading: 'やっきょく',
    style: 'pharmacy',
    side: 'right',
    z: -1,
    width: 10,
    depth: 9,
    height: 5.8,
    colors: { wall: '#f4f8f5', trim: '#0a6b3d', roof: '#9aa59f', window: '#d9f2e3', awning: ['#0a6b3d', '#ffe600'] },
    sign: { text: '薬局', sub: 'くすり · DRUG STORE', bg: '#ffe600', fg: '#0a6b3d', accent: '#0a6b3d' },
    npc: {
      name: 'Pharmacienne',
      nameKana: 'やくざいし',
      role: 'Conseil santé',
      gender: 'femme',
      voicePitch: 1.05,
      look: { skin: '#efc9a8', hair: '#2b1b12', hairStyle: 'bun', top: '#f4f7f6', bottom: '#3c4a55', shoes: '#ffffff', glasses: true },
    },
  },
  // ───────── Extrémité nord-est : en face de l'izakaya ─────────
  {
    id: 'bakery',
    scenarioId: 'bakery',
    icon: '🥐',
    nameFr: 'Boulangerie',
    nameJp: 'パン屋',
    reading: 'ぱんや',
    style: 'bakery',
    side: 'right',
    z: -27,
    width: 10,
    depth: 9,
    height: 6,
    colors: { wall: '#f6e7cf', trim: '#8a5a2b', roof: '#9b6b43', window: '#ffe2b3', awning: ['#8a5a2b', '#f6e7cf'] },
    sign: { text: 'パン屋', sub: 'BOULANGERIE · やきたて', bg: '#8a5a2b', fg: '#fff4de', accent: '#e8b04a' },
    npc: {
      name: 'Boulangère',
      nameKana: 'てんいん',
      role: 'Comptoir & caisse',
      gender: 'femme',
      voicePitch: 1.15,
      look: { skin: '#f3cfae', hair: '#3a2416', hairStyle: 'bun', top: '#fff8ec', bottom: '#5a4636', shoes: '#3a2a1e', apron: '#c98b4e', hat: 'band', hatColor: '#ffffff' },
    },
  },
  // ───────── Tout au nord, côté est : le restaurant à tickets ─────────
  {
    id: 'shokudo',
    scenarioId: 'shokudo',
    icon: '🎫',
    nameFr: 'Restaurant à tickets',
    nameJp: '定食屋',
    reading: 'ていしょくや',
    style: 'shokudo',
    district: 'fontaine',
    x: -13,
    side: 'left',
    z: 9,
    width: 10,
    depth: 9,
    height: 6.4,
    colors: { wall: '#efe4cf', trim: '#2f4a3a', roof: '#6f6a60', window: '#ffe0a8', awning: ['#2f4a3a', '#efe4cf'] },
    sign: { text: '定食屋', sub: 'ていしょく · しょっけんき', bg: '#2f4a3a', fg: '#fff4dc', accent: '#e0a33b' },
    npc: {
      name: 'Serveuse',
      nameKana: 'てんいん',
      role: 'Salle & tickets',
      gender: 'femme',
      voicePitch: 1.2,
      look: { skin: '#f3d0b2', hair: '#2b1b12', hairStyle: 'bob', top: '#ffffff', bottom: '#2f3540', shoes: '#ffffff', apron: '#2f4a3a', hat: 'band', hatColor: '#2f4a3a' },
    },
  },
];

/** quartier d'un lieu */
export const districtOf = (l: LocationConfig): DistrictId => l.district ?? 'ekimae';

export const DISTRICTS: Record<DistrictId, { nameFr: string; nameJp: string; reading: string; icon: string }> = {
  ekimae: { nameFr: 'Ekimae', nameJp: '駅前', reading: 'えきまえ', icon: '🚉' },
  fontaine: { nameFr: 'Place de la fontaine', nameJp: '噴水広場', reading: 'ふんすいひろば', icon: '⛲' },
};

/** guichets du shinkansen (un par quartier) : pas des « lieux » à réussir */
const shinkansenAgent = (district: DistrictId, travel: DistrictId, x: number, z: number, face: number): LocationConfig => ({
  id: `shinkansen-${district}`,
  scenarioId: '',
  icon: '🚄',
  nameFr: `Shinkansen → ${DISTRICTS[travel].nameFr}`,
  nameJp: '新幹線',
  reading: 'しんかんせん',
  style: 'street',
  side: 'south',
  district,
  travel,
  x,
  z,
  face,
  width: 1,
  depth: 1,
  height: 0,
  colors: { wall: '#ffffff', trim: '#ffffff', roof: '#ffffff', window: '#ffffff', awning: ['#ffffff', '#ffffff'] },
  sign: { text: '', bg: '#ffffff', fg: '#000000' },
  npc: {
    name: 'Agent du shinkansen',
    nameKana: 'えきいん',
    role: 'Quai du shinkansen',
    gender: 'homme',
    look: { skin: '#efc6a0', hair: '#1a1a1a', hairStyle: 'short', top: '#f4f6f8', bottom: '#1f3a6b', shoes: '#111111', tie: '#1f5fbf', hat: 'cap', hatColor: '#1f3a6b' },
  },
});

export const TRAVEL_POINTS: LocationConfig[] = [
  shinkansenAgent('ekimae', 'fontaine', 14.2, 15.4, Math.PI),
  shinkansenAgent('fontaine', 'ekimae', -6.2, 15.8, Math.PI),
];

export function getLocation(id: string): LocationConfig | undefined {
  return LOCATIONS.find((l) => l.id === id);
}
