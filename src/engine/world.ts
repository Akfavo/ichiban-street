/**
 * Construction procédurale du diorama : socle, avenue, trottoirs, boutiques,
 * gare, mobilier urbain, PNJ et halos d'interaction.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DECOR, DISTRICTS, FOUNTAIN, LAYOUT, LIGHTING, LOCATIONS, TRAVEL_POINTS, districtOf, type CharacterLook, type DistrictId, type LocationConfig } from '../data/cityConfig';
import { Character } from './character';
import { CollisionWorld, type Rect } from './collisions';
import { makeShinkansen } from './shinkansen';
import {
  asphaltTexture,
  clockTexture,
  departureBoardTexture,
  facadeTexture,
  glowTexture,
  labelTexture,
  lanternTexture,
  mulberry,
  norenTexture,
  departureTexture,
  panelTexture,
  screenTexture,
  shade,
  signTexture,
  storefrontTexture,
  stripeTexture,
  tactileTexture,
  tileTexture,
  vendingTexture,
  verticalSignTexture,
} from './textures';

export interface NpcInstance {
  loc: LocationConfig;
  character: Character;
  pos: { x: number; z: number };
  haloPos: { x: number; z: number };
  homeYaw: number;
  halo: THREE.Group;
  haloRing: THREE.Mesh;
  haloGlow: THREE.Mesh;
  /** onde qui s'élargit autour du halo */
  haloRipple: THREE.Mesh;
  /** colonne de lumière qui monte du halo quand le joueur passe devant */
  haloBeam: THREE.Mesh;
  beamK: number;
  label: THREE.Sprite;
  done: boolean;
  /** collision du PNJ (désactivée quand il est absent) */
  rect: Rect;
  /** lieu fermé à cette heure (banque la nuit, izakaya le jour) */
  closed: boolean;
}

/** passant qui fait des allers-retours sur un trottoir */
interface Walker {
  ch: Character;
  x: number;
  z: number;
  from: number;
  to: number;
  dir: number;
  speed: number;
  wait: number;
  lastStop: number;
  faceYaw: number | null;
  rnd: () => number;
  /** petits obstacles sur sa ligne (PNJ, lampadaires, arbres) contournés d'un pas de côté */
  obs: Rect[];
  off: number;
}

/** matériau dont une propriété varie entre le jour et la nuit */
interface NightMat {
  m: THREE.Material;
  key: 'emissiveIntensity' | 'opacity';
  day: number;
  night: number;
}

/** source de lumière chaude, éclairée la nuit par le pool de PointLights */
interface LightSpot {
  p: THREE.Vector3;
  i: number;
  color: THREE.Color;
}

export interface Occluder {
  box: THREE.Box3;
  mats: THREE.Material[];
  opacity: number;
}

/* ───────────────────────── petits utilitaires ───────────────────────── */

/** Matériaux propres à un bâtiment (pour pouvoir le rendre translucide seul) */
class MatSet {
  readonly list: THREE.Material[] = [];
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  std(color: string, rough = 0.8, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const k = `${color}:${rough}:${Object.keys(extra).length ? Math.random() : ''}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
    this.cache.set(k, m);
    this.list.push(m);
    return m;
  }
  tex(map: THREE.Texture, rough = 0.8, emissive = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      map,
      roughness: rough,
      metalness: 0,
      emissive: emissive > 0 ? new THREE.Color('#ffffff') : new THREE.Color('#000000'),
      emissiveMap: emissive > 0 ? map : null,
      emissiveIntensity: emissive,
    });
    this.list.push(m);
    return m;
  }
  glow(color: string, intensity = 1.2): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    this.list.push(m);
    return m;
  }
}

const shared = new MatSet();

/**
 * Toit en croupe (4 pans, faîtage le long du grand côté) posé à y = 0,
 * emprise w × d centrée. Faces à plat, sans dessous (vu d'en haut).
 */
/** colonne de lumière (cylindre ouvert, s'efface vers le haut) */
const BEAM_GEO = new THREE.CylinderGeometry(0.62, 0.72, 3.4, 40, 1, true).translate(0, 1.7, 0);
let beamTex: THREE.CanvasTexture | null = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}

function hipRoofGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const a = Math.max(w, d) / 2;
  const b = Math.min(w, d) / 2;
  const r = a - b; // demi-longueur du faîtage
  const P = (x: number, y: number, z: number) => [x, y, z];
  const tris: number[][] = [];
  // pans longs (z+ puis z-)
  tris.push(P(-a, 0, b), P(a, 0, b), P(r, h, 0));
  tris.push(P(a, 0, -b), P(-a, 0, -b), P(-r, h, 0));
  if (r > 1e-3) {
    tris.push(P(-a, 0, b), P(r, h, 0), P(-r, h, 0));
    tris.push(P(a, 0, -b), P(-r, h, 0), P(r, h, 0));
  }
  // croupes (x+ puis x-)
  tris.push(P(a, 0, b), P(a, 0, -b), P(r, h, 0));
  tris.push(P(-a, 0, -b), P(-a, 0, b), P(-r, h, 0));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  if (d > w) geo.rotateY(Math.PI / 2);
  return geo;
}

/** Boîte posée : y = base */
function boxAt(parent: THREE.Object3D, mat: THREE.Material | THREE.Material[], w: number, h: number, d: number, x: number, y: number, z: number, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

function cylAt(parent: THREE.Object3D, mat: THREE.Material, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 12, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function planeAt(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

/** Boîte arrondie (style « designer toy ») posée : y = base */
const rboxCache = new Map<string, THREE.BufferGeometry>();
function rboxAt(parent: THREE.Object3D, mat: THREE.Material | THREE.Material[], w: number, h: number, d: number, x: number, y: number, z: number, r = 0.08, cast = true): THREE.Mesh {
  const rr = Math.max(0.005, Math.min(r, Math.min(w, h, d) / 2 - 0.002));
  const k = `${w}:${h}:${d}:${rr}`;
  let geo = rboxCache.get(k);
  if (!geo) {
    geo = new RoundedBoxGeometry(w, h, d, 3, rr);
    rboxCache.set(k, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Matériaux d'une boîte avec une texture sur une seule face (+z par défaut) */
function faceMats(base: THREE.Material, face: THREE.Material, faces: number[] = [4]): THREE.Material[] {
  return [0, 1, 2, 3, 4, 5].map((i) => (faces.includes(i) ? face : base));
}

/** Repère local d'un bâtiment : origine sur la ligne de façade, +z vers la rue */
class Frame {
  readonly group = new THREE.Group();
  private c: number;
  private s: number;
  constructor(
    public x: number,
    public z: number,
    public rot: number,
    y = LAYOUT.sidewalkHeight,
  ) {
    this.group.position.set(x, y, z);
    this.group.rotation.y = rot;
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  toWorld(lx: number, lz: number) {
    return { x: this.x + lx * this.c + lz * this.s, z: this.z - lx * this.s + lz * this.c };
  }
  /** rectangle local (centre, taille) → collider monde */
  collider(world: CollisionWorld, lx: number, lz: number, sx: number, sz: number, tag?: string) {
    const p = this.toWorld(lx, lz);
    const swap = Math.abs(this.s) > 0.7;
    world.addRect(p.x, p.z, swap ? sz : sx, swap ? sx : sz, tag);
  }
  /** boîte d'occultation (monde) d'un volume local */
  box3(lx: number, lz: number, sx: number, sz: number, y0: number, y1: number): THREE.Box3 {
    const p = this.toWorld(lx, lz);
    const swap = Math.abs(this.s) > 0.7;
    const hx = (swap ? sz : sx) / 2;
    const hz = (swap ? sx : sz) / 2;
    const gy = this.group.position.y;
    return new THREE.Box3(new THREE.Vector3(p.x - hx, gy + y0, p.z - hz), new THREE.Vector3(p.x + hx, gy + y1, p.z + hz));
  }
}

/* ─────────────────────────────── Monde ─────────────────────────────── */

/** banc où l'on peut s'asseoir : centre, orientation (l'assis regarde vers +z local), hauteur du sol */
export interface Bench {
  x: number;
  z: number;
  yaw: number;
  y: number;
}

export class World {
  readonly root = new THREE.Group();
  readonly collision: CollisionWorld;
  readonly npcs: NpcInstance[] = [];
  readonly occluders: Occluder[] = [];
  /** bancs (s'asseoir pour contempler le quartier) */
  readonly benches: Bench[] = [];
  /** 0 = étiquettes 3D visibles, 1 = effacées (vue large : remplacées par des repères à l'écran) */
  labelFade = 0;
  private matBase = new Map<THREE.Material, { opacity: number; transparent: boolean }>();
  private animated: ((t: number, dt: number) => void)[] = [];
  private ray = new THREE.Ray();

  /* jour / nuit */
  private nightMats: NightMat[] = [];
  private dayOnly: THREE.Object3D[] = [];
  private nightOnly: THREE.Object3D[] = [];
  private spots: LightSpot[] = [];
  private pool: { light: THREE.PointLight; spot: LightSpot | null }[] = [];
  private lightTimer = 0;
  private vending: { face: THREE.MeshStandardMaterial; glow: THREE.SpriteMaterial; phase: number }[] = [];
  private walkers: Walker[] = [];
  /** 0 = plein jour, 1 = pleine nuit (transition progressive) */
  nightF = 0;
  private isNight = false;

  constructor(
    scene: THREE.Scene,
    readonly district: DistrictId = 'ekimae',
  ) {
    const fontaine = district === 'fontaine';
    const b = fontaine ? FOUNTAIN.bounds : LAYOUT.bounds;
    this.collision = new CollisionWorld({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
    scene.add(this.root);
    if (fontaine) this.buildFountainGround();
    else {
      this.buildGround();
      this.buildRoadMarkings();
    }
    const locs = [...LOCATIONS, ...TRAVEL_POINTS].filter((l) => districtOf(l) === district);
    for (const loc of locs) {
      if (loc.style === 'station') this.buildStation(loc);
      else if (loc.style === 'street') this.buildStreetNpc(loc);
      else this.buildShop(loc);
    }
    if (fontaine) {
      this.buildFountain();
      this.buildFountainProps();
      this.buildFountainStation();
      this.buildFountainFillers();
      this.buildPassersby(FOUNTAIN.passersby, []);
    } else {
      this.buildStreetProps();
      this.buildFillers();
      this.buildPlaza();
      this.buildShinkansenGate();
      this.buildPassersby(DECOR.passersby, [...LAYOUT.crosswalksZ.map((z) => ({ z, kind: 'cross' as const })), ...DECOR.vendingGapsZ.map((z) => ({ z, kind: 'vend' as const }))]);
    }
    this.buildLightPool();
    this.applyNight(0);
    this.refreshOpen(true);
  }

  /* ───────────────────────── jour / nuit ───────────────────────── */

  /** enregistre un matériau qui s'illumine la nuit */
  private nightMat<T extends THREE.Material>(m: T, day: number, night: number, key: NightMat['key'] = 'emissiveIntensity'): T {
    this.nightMats.push({ m, key, day, night });
    return m;
  }

  /** point lumineux chaud (allumé la nuit si proche de la caméra) */
  private addSpot(x: number, y: number, z: number, intensity = 1, color = LIGHTING.night.pointColor) {
    this.spots.push({ p: new THREE.Vector3(x, y, z), i: intensity, color: new THREE.Color(color) });
  }

  private glowMats = new Map<string, THREE.Material>();
  /** halos / nappes : masqués en plein jour (opacité nulle), fondu progressif sinon */
  private glows: THREE.Object3D[] = [];
  /** nappe de lumière douce au sol, allumée la nuit (coordonnées locales du parent) */
  private lightPool(parent: THREE.Object3D, x: number, z: number, w: number, d: number, color: string, night = 0.3, ry = 0) {
    const key = `pool:${color}:${night}`;
    let mat = this.glowMats.get(key);
    if (!mat) {
      mat = this.nightMat(new THREE.MeshBasicMaterial({ map: glowTexture(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, night, 'opacity');
      this.glowMats.set(key, mat);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, 0.06, z);
    m.renderOrder = 1;
    m.raycast = () => {};
    parent.add(m);
    this.glows.push(m);
    return m;
  }

  /** halo lumineux (sprite) autour d'une source, allumé la nuit */
  private lightHalo(parent: THREE.Object3D, x: number, y: number, z: number, size: number, color: string, night = 0.85) {
    const key = `halo:${color}:${night}`;
    let mat = this.glowMats.get(key);
    if (!mat) {
      mat = this.nightMat(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, night, 'opacity');
      this.glowMats.set(key, mat);
    }
    const sp = new THREE.Sprite(mat as THREE.SpriteMaterial);
    sp.position.set(x, y, z);
    sp.scale.set(size, size, 1);
    sp.raycast = () => {};
    parent.add(sp);
    this.glows.push(sp);
    return sp;
  }

  /** volutes de vapeur qui montent doucement (cuisine), plus visibles la nuit */
  private addSteam(parent: THREE.Object3D, x: number, y: number, z: number, day = 0.18, spread = 0.6) {
    const tex = glowTexture('#ffffff');
    const N = 7;
    const puffs: { sp: THREE.Sprite; mat: THREE.SpriteMaterial; ph: number; dx: number }[] = [];
    for (let i = 0; i < N; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: '#f4efe8' });
      const sp = new THREE.Sprite(mat);
      sp.raycast = () => {};
      parent.add(sp);
      puffs.push({ sp, mat, ph: i / N, dx: (i % 3 - 1) * spread * 0.4 });
    }
    this.animated.push((t) => {
      const vis = day + (0.42 - day) * this.nightF;
      for (const p of puffs) {
        const k = (t * 0.22 + p.ph) % 1;
        p.sp.position.set(x + p.dx + Math.sin(t * 0.8 + p.ph * 6) * 0.15 * k, y + k * 2.2, z + k * 0.35);
        const s = 0.5 + k * 1.4;
        p.sp.scale.set(s, s, 1);
        // fondu d'entrée et de sortie : aucune volute n'apparaît ni ne disparaît d'un coup
        p.mat.opacity = vis * Math.sin(Math.PI * k) ** 1.5;
      }
    });
  }

  private buildLightPool() {
    for (let i = 0; i < LIGHTING.night.pointLights; i++) {
      const light = new THREE.PointLight(LIGHTING.night.pointColor, 0, 11, 1.6);
      light.castShadow = false;
      this.root.add(light);
      this.pool.push({ light, spot: null });
    }
  }

  /** f : 0 = jour → 1 = nuit */
  applyNight(f: number) {
    this.nightF = f;
    for (const e of this.nightMats) (e.m as unknown as Record<string, number>)[e.key] = e.day + (e.night - e.day) * f;
    const nightNow = f > 0.5;
    for (const o of this.nightOnly) o.visible = nightNow;
    for (const o of this.dayOnly) o.visible = !nightNow;
    for (const o of this.glows) o.visible = f > 0.002;
    if (nightNow !== this.isNight) {
      this.isNight = nightNow;
      this.refreshOpen();
    }
  }

  get night() {
    return this.isNight;
  }

  /** le lieu est-il ouvert à cette heure ? */
  isOpen(loc: LocationConfig) {
    return !loc.open || (loc.open === 'night') === this.isNight;
  }

  private refreshOpen(force = false) {
    for (const n of this.npcs) {
      const closed = !this.isOpen(n.loc);
      if (!force && closed === n.closed) continue;
      n.closed = closed;
      n.character.root.visible = !closed;
      n.rect.off = closed;
      this.refreshNpcLook(n);
    }
  }

  /** allume les PointLights du pool sur les sources les plus proches du point suivi */
  updateLights(focus: THREE.Vector3, dt: number) {
    const f = this.nightF;
    if (!this.pool.length) return;
    if (f <= 0.001) {
      for (const p of this.pool) p.light.intensity = 0;
      return;
    }
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.35;
      const best = this.spots
        .map((sp) => ({ sp, d: (sp.p.x - focus.x) ** 2 + (sp.p.z - focus.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length)
        .map((x) => x.sp);
      // les lumières déjà bien placées ne bougent pas (pas de clignotement)
      const free = this.pool.filter((p) => !p.spot || !best.includes(p.spot));
      const todo = best.filter((sp) => !this.pool.some((p) => p.spot === sp));
      free.forEach((p, i) => {
        p.spot = todo[i] ?? null;
        if (p.spot) {
          p.light.position.copy(p.spot.p);
          p.light.color.copy(p.spot.color);
        }
      });
    }
    for (const p of this.pool) p.light.intensity = p.spot ? p.spot.i * 9 * f : 0;
  }

  groundHeight(x: number, z: number): number {
    if (this.district === 'fontaine') return LAYOUT.sidewalkHeight;
    if (Math.abs(x) < LAYOUT.avenueHalfWidth && z < LAYOUT.avenueEndZ) return 0;
    return LAYOUT.sidewalkHeight;
  }

  /* ───────────────────────── sol & socle ───────────────────────── */

  private buildGround() {
    const P = LAYOUT.plinth;
    const H = LAYOUT.sidewalkHeight;
    const A = LAYOUT.avenueHalfWidth;
    // socle (terre + liseré)
    const plinthMat = shared.std('#7b6552', 0.95);
    const sx = P.maxX - P.minX;
    const sz = P.maxZ - P.minZ;
    boxAt(this.root, plinthMat, sx, P.thickness, sz, (P.minX + P.maxX) / 2, -P.thickness, (P.minZ + P.maxZ) / 2, false, true);
    boxAt(this.root, shared.std('#5d4b3d', 0.95), sx + 0.3, 0.35, sz + 0.3, (P.minX + P.maxX) / 2, -P.thickness - 0.1, (P.minZ + P.maxZ) / 2, false, false);

    // avenue
    const asphalt = asphaltTexture().clone();
    asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    const len = LAYOUT.avenueEndZ - LAYOUT.avenueStartZ;
    asphalt.repeat.set(2, len / 5);
    asphalt.needsUpdate = true;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(A * 2, len), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.004, (LAYOUT.avenueStartZ + LAYOUT.avenueEndZ) / 2);
    road.receiveShadow = true;
    this.root.add(road);

    // dalles de trottoir
    const slab = (minX: number, maxX: number, minZ: number, maxZ: number, base: string) => {
      const t = tileTexture(base, shade(base, -0.12), 4).clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set((maxX - minX) / 3, (maxZ - minZ) / 3);
      t.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      boxAt(this.root, m, maxX - minX, H, maxZ - minZ, (minX + maxX) / 2, 0, (minZ + maxZ) / 2, false, true);
    };
    slab(P.minX, -A, P.minZ, LAYOUT.avenueEndZ, '#cfc6b8');
    slab(A, P.maxX, P.minZ, LAYOUT.avenueEndZ, '#cfc6b8');
    slab(P.minX, P.maxX, LAYOUT.avenueEndZ, P.maxZ, '#d8cdbb');

    // bordures
    const curb = shared.std('#a9a39a', 0.85);
    // la face côté route dépasse de 2 cm devant le bord des dalles : deux faces
    // confondues au même endroit « se battaient » et scintillaient au moindre mouvement
    for (const s of [-1, 1]) boxAt(this.root, curb, 0.24, H + 0.04, len - 0.02, s * (A + 0.1), 0, (LAYOUT.avenueStartZ + LAYOUT.avenueEndZ) / 2, false, true);
    boxAt(this.root, curb, A * 2 - 0.06, H + 0.04, 0.24, 0, 0, LAYOUT.avenueEndZ + 0.1, false, true);

    // bande podotactile le long des trottoirs
    const tact = tactileTexture().clone();
    tact.wrapS = tact.wrapT = THREE.RepeatWrapping;
    tact.repeat.set(1, len / 0.5);
    tact.needsUpdate = true;
    const tactMat = new THREE.MeshStandardMaterial({ map: tact, roughness: 0.8 });
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.4, len - 1), tactMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(s * (A + 1.6), H + 0.004, (LAYOUT.avenueStartZ + LAYOUT.avenueEndZ) / 2 - 0.5);
      strip.receiveShadow = true;
      this.root.add(strip);
    }
  }

  private buildRoadMarkings() {
    const A = LAYOUT.avenueHalfWidth;
    const white = new THREE.MeshStandardMaterial({ color: '#f4f1e8', roughness: 0.7 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#f0b429', roughness: 0.7 });
    const flat = (mat: THREE.Material, w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      m.receiveShadow = true;
      this.root.add(m);
    };
    const cross = LAYOUT.crosswalksZ;
    // ligne centrale pointillée (interrompue aux passages piétons)
    for (let z = LAYOUT.avenueStartZ + 1; z < LAYOUT.avenueEndZ - 1; z += 3) {
      if (cross.some((c) => Math.abs(z + 0.9 - c) < 2.8)) continue;
      flat(yellow, 0.16, 1.8, 0, z + 0.9);
    }
    // lignes de rive
    for (const s of [-1, 1]) flat(white, 0.12, LAYOUT.avenueEndZ - LAYOUT.avenueStartZ - 0.6, s * (A - 0.4), (LAYOUT.avenueStartZ + LAYOUT.avenueEndZ) / 2);
    // passages piétons « à la japonaise » (barres parallèles à la route)
    for (const cz of cross) {
      for (let x = -A + 0.55; x <= A - 0.4; x += 0.9) flat(white, 0.45, 2.8, x + 0.2, cz);
      // lignes d'arrêt
      flat(white, A - 0.5, 0.25, A / 2, cz - 2.2);
      flat(white, A - 0.5, 0.25, -A / 2, cz + 2.2);
      // dalles podotactiles aux extrémités
      const pad = new THREE.MeshStandardMaterial({ map: tactileTexture(), roughness: 0.8 });
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.2), pad);
        m.rotation.x = -Math.PI / 2;
        m.position.set(s * (A + 0.75), LAYOUT.sidewalkHeight + 0.005, cz);
        this.root.add(m);
      }
    }
    // « とまれ » (stop) peint au sol
    const tomare = new THREE.MeshBasicMaterial({ map: panelTexture(['とまれ'], 'rgba(0,0,0,0)', '#f4f1e8', 512, 256, 190), transparent: true, depthWrite: false });
    const t1 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), tomare);
    t1.rotation.x = -Math.PI / 2;
    t1.position.set(2.5, 0.016, cross[1] - 4.2);
    t1.rotation.z = Math.PI;
    this.root.add(t1);
  }

  /* ───────────────────────── boutiques ───────────────────────── */

  private buildShop(loc: LocationConfig) {
    const left = loc.side === 'left';
    const fx = loc.x ?? LAYOUT.frontX * (left ? -1 : 1);
    const F = new Frame(fx, loc.z, left ? Math.PI / 2 : -Math.PI / 2);
    this.root.add(F.group);
    const g = F.group;
    const M = new MatSet();
    const { width: W, depth: D, height: Hh, colors: C } = loc;
    const seed = Math.abs(Math.round(loc.z * 13 + (left ? 3 : 7)));
    const rnd = mulberry(seed);
    const gf = 3.2; // rez-de-chaussée
    const upperH = Hh - gf;
    const floors = Math.max(1, Math.round(upperH / 2.3));

    // ── volumes
    const wall = M.std(C.wall, 0.85);
    const roof = M.std(C.roof, 0.9);
    const trim = M.std(C.trim, 0.6);
    boxAt(g, [wall, wall, roof, roof, wall, wall], W, gf, D, 0, 0, -D / 2);
    const front = M.tex(facadeTexture(C.wall, C.window, C.trim, Math.round(W / 2.4), floors, 0.35, seed));
    const side = M.tex(facadeTexture(C.wall, C.window, C.trim, Math.round(D / 2.4), floors, 0.3, seed + 1));
    boxAt(g, [side, side, roof, roof, front, front], W, upperH, D, 0, gf, -D / 2);
    // bandeau + acrotère
    boxAt(g, trim, W + 0.1, 0.35, D + 0.1, 0, gf - 0.05, -D / 2);
    const par = M.std(shade(C.wall, -0.15), 0.85);
    boxAt(g, par, W, 0.45, 0.25, 0, Hh, -0.125);
    boxAt(g, par, W, 0.45, 0.25, 0, Hh, -D + 0.125);
    boxAt(g, par, 0.25, 0.45, D, -W / 2 + 0.125, Hh, -D / 2);
    boxAt(g, par, 0.25, 0.45, D, W / 2 - 0.125, Hh, -D / 2);
    // équipements de toit
    const unit = M.std('#c9c7c2', 0.7);
    for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
      boxAt(g, unit, 1 + rnd() * 0.6, 0.7, 0.8, -W / 2 + 1.5 + rnd() * (W - 3), Hh, -D * 0.25 - rnd() * D * 0.5);
    }
    if (rnd() < 0.6) cylAt(g, M.std('#8fa3ad', 0.6), 0.6, 0.6, 1.1, W / 2 - 1.5, Hh + 0.3, -D + 1.6, 14);
    // climatiseur extérieur sur le mur latéral visible (côté nord)
    const sideS = left ? 1 : -1;
    this.addAirCon(g, M, sideS * (W / 2 + 0.2), gf + 0.7 + rnd() * 0.9, -D * 0.3 - rnd() * 1.5, sideS * (Math.PI / 2));
    if (upperH > 3.4) this.addAirCon(g, M, sideS * (W / 2 + 0.2), gf + 2.9, -D * 0.62, sideS * (Math.PI / 2));

    // ── devanture
    const sf = M.tex(storefrontTexture(loc.style, C.window, C.trim), 0.3, 0.55);
    this.nightMat(sf, loc.open === 'night' ? 0.12 : 0.55, loc.open === 'day' ? 0.18 : 1.25);
    planeAt(g, sf, W - 1.4, 2.5, 0, 1.35, 0.02);
    if (loc.open !== 'day') {
      const sp = F.toWorld(0, 1.6);
      this.addSpot(sp.x, 2.3, sp.z, 0.9, shade(C.window, 0.25));
      // lumière de la vitrine qui déborde sur le trottoir
      this.lightPool(g, 0, 1.5, W - 1.2, 3.2, shade(C.window, 0.25), 0.42);
    }
    const door = M.std(shade(C.trim, -0.2), 0.5);
    boxAt(g, door, 0.12, 2.6, 0.12, -1.1, 0, 0.06);
    boxAt(g, door, 0.12, 2.6, 0.12, 1.1, 0, 0.06);
    // auvent rayé
    const aw = M.tex(stripeTexture(C.awning[0], C.awning[1], 10));
    const awning = boxAt(g, [trim, trim, aw, trim, trim, trim], W - 0.4, 0.08, 1.4, 0, 0, 0.62);
    awning.position.y = 2.95;
    awning.rotation.x = 0.32;
    const val = planeAt(g, aw, W - 0.4, 0.3, 0, 2.6, 1.3);
    val.castShadow = true;

    // ── enseigne de façade
    const signMat = this.nightMat(M.tex(signTexture(loc.sign.text, loc.sign.sub, loc.sign.bg, loc.sign.fg, loc.sign.accent, (W - 1.2) / 1.4), 0.5, 0.35), 0.35, loc.open === 'day' ? 0.5 : 1.05);
    boxAt(g, faceMats(trim, signMat, [4]), W - 1.2, 1.4, 0.22, 0, gf + 0.2, 0.12);

    // ── enseigne verticale (tategaki), côté nord pour rester visible
    const vx = left ? W / 2 - 0.35 : -W / 2 + 0.35;
    const vh = Math.min(3.6, upperH - 0.5);
    if (vh > 1.2) {
      const vs = this.nightMat(M.tex(verticalSignTexture(loc.nameJp, loc.sign.bg, loc.sign.fg, loc.sign.accent), 0.5, 0.4), 0.4, 1.2);
      boxAt(g, [vs, vs, trim, trim, trim, trim], 0.14, vh, 1.0, vx, gf + 0.35, 0.6);
      boxAt(g, trim, 0.08, 0.08, 0.5, vx, gf + 0.35 + vh - 0.3, 0.25);
    }

    // ── côté est : panneau de toit double face, tourné vers la caméra
    if (!left) {
      const rs = this.nightMat(M.tex(signTexture(loc.sign.text, loc.sign.sub, loc.sign.bg, loc.sign.fg, loc.sign.accent, 3.6), 0.5, 0.4), 0.4, 1.1);
      boxAt(g, faceMats(trim, rs, [4, 5]), W * 0.72, 2.0, 0.18, 0, Hh + 0.55, -D * 0.55);
      boxAt(g, trim, 0.15, 0.6, 0.15, -W * 0.25, Hh, -D * 0.55);
      boxAt(g, trim, 0.15, 0.6, 0.15, W * 0.25, Hh, -D * 0.55);
    }

    this.buildShopExtras(loc, F, M, rnd);

    // ── pancarte de fermeture (banque la nuit, izakaya le jour)
    if (loc.open && loc.closedSign) {
      const cs = new THREE.Group();
      const tex = panelTexture([loc.closedSign.kana, loc.closedSign.fr], '#f6ecd9', '#3a2414', 768, 288, 110);
      const plate = planeAt(cs, M.tex(tex, 0.6, 0.3), 1.7, 0.64, 0, 1.5, 0.12);
      plate.castShadow = true;
      const cord = M.std('#3a2414', 0.6);
      boxAt(cs, cord, 0.02, 0.5, 0.02, -0.6, 1.8, 0.11, false);
      boxAt(cs, cord, 0.02, 0.5, 0.02, 0.6, 1.8, 0.11, false);
      g.add(cs);
      (loc.open === 'day' ? this.nightOnly : this.dayOnly).push(cs);
    }

    // ── collisions & occultation
    F.collider(this.collision, 0, -D / 2, W, D, loc.id);
    this.occluders.push({ box: F.box3(0, -D / 2, W, D, 0, Hh + 2.6), mats: M.list, opacity: 1 });

    // ── PNJ
    const off = loc.npc.offset ?? { along: left ? -2.2 : 2.2, out: 1.3 };
    this.addNpc(loc, F, off.along, off.out);
  }

  private buildShopExtras(loc: LocationConfig, F: Frame, M: MatSet, rnd: () => number) {
    const g = F.group;
    const W = loc.width;
    const D = loc.depth;
    const left = loc.side === 'left';
    const ex = left ? 3.4 : -3.4; // côté opposé au PNJ
    // plante en pot entre la porte et l'équipement de devanture
    if (['bank', 'telecom', 'pharmacy', 'shokudo', 'figures', 'electronics'].includes(loc.style)) this.doorPlant(F, Math.sign(ex) * 1.75, 0.38, M, Math.round(Math.abs(loc.z)));
    switch (loc.style) {
      case 'konbini': {
        const cols = ['#2f8f4e', '#2a6fdb', '#e8a317'];
        cols.forEach((c, i) => {
          boxAt(g, M.std(c, 0.6), 0.5, 0.9, 0.5, ex - 0.6 + i * 0.6, 0, 0.45);
          boxAt(g, M.std('#333', 0.5), 0.3, 0.02, 0.2, ex - 0.6 + i * 0.6, 0.9, 0.45);
        });
        F.collider(this.collision, ex, 0.45, 1.9, 0.6);
        // bande colorée du konbini
        boxAt(g, M.std('#2a6fdb', 0.5), W, 0.18, 0.06, 0, 2.75, 0.03);
        break;
      }
      case 'ramen': {
        const noren = M.tex(norenTexture('#1f2a44', 'らーめん'));
        noren.side = THREE.DoubleSide;
        this.swayNoren(planeAt(g, noren, 2.4, 0.9, 0, 2.15, 0.35), 0.9, loc.z);
        const lmat = this.nightMat(M.tex(lanternTexture('ら'), 0.6, 0.9), 0.9, 1.9);
        const cap = M.std('#1a1a1a');
        for (const s of [-1.9, 1.9]) {
          cylAt(g, lmat, 0.32, 0.32, 0.8, s, 1.85, 0.5, 14, true);
          cylAt(g, cap, 0.2, 0.2, 0.08, s, 2.65, 0.5);
        }
        const lp = F.toWorld(0, 0.9);
        this.addSpot(lp.x, 2.2, lp.z, 0.8, '#ff7a4a');
        for (const s of [-1.9, 1.9]) this.lightHalo(g, s, 2.25, 0.75, 1.7, '#ff7a4a', 0.75);
        this.lightPool(g, 0, 1.3, 5.2, 3.0, '#ff8a55', 0.42);
        // vapeur des bouillons qui s'échappe au-dessus du noren
        this.addSteam(g, 0, 2.75, 1.5);
        // distributeur de tickets
        boxAt(g, M.std('#e9e4da', 0.5), 0.8, 1.6, 0.6, ex, 0, 0.4);
        planeAt(g, M.tex(panelTexture(['しょっけん', '¥ 900〜'], '#c0392b', '#ffffff', 256, 256, 60), 0.5, 0.5), 0.6, 0.6, ex, 1.2, 0.71);
        F.collider(this.collision, ex, 0.4, 0.9, 0.7);
        break;
      }
      case 'bank': {
        // boîte aux lettres rouge
        const red = M.std('#d7261e', 0.45);
        cylAt(g, red, 0.32, 0.32, 1.2, ex, 0, 1.0, 16);
        cylAt(g, red, 0.36, 0.36, 0.12, ex, 1.2, 1.0, 16);
        boxAt(g, M.std('#222'), 0.32, 0.05, 0.05, ex, 0.95, 1.31);
        planeAt(g, M.tex(panelTexture(['〒'], '#d7261e', '#ffffff', 128, 128, 100), 0.5, 0.3), 0.3, 0.3, ex, 0.65, 1.33);
        F.collider(this.collision, ex, 1.0, 0.8, 0.8);
        // panneau ATM
        planeAt(g, M.tex(panelTexture(['ATM', '24じかん'], '#0f3d7a', '#ffffff', 256, 192, 70), 0.5, 0.6), 1.3, 0.9, ex, 3.85, 0.25);
        break;
      }
      case 'telecom': {
        boxAt(g, M.std('#222', 0.4), 0.6, 1.7, 0.12, ex, 0, 0.6);
        planeAt(g, M.tex(screenTexture(['eSIM', 'SIM フリー OK'], '#ff7a00', '#ffffff', '#ffffff'), 0.4, 0.9), 0.5, 0.9, ex, 1.15, 0.67);
        boxAt(g, M.std('#555'), 0.7, 0.08, 0.5, ex, 0, 0.6);
        F.collider(this.collision, ex, 0.6, 0.8, 0.5);
        break;
      }
      case 'electronics': {
        // grand écran LED sur la face arrière (tournée vers la caméra) + vitrine
        const scr = M.tex(screenTexture(['TAX FREE', 'めんぜい OK', 'カメラ・PC・ゲーム'], '#e60012', '#ffffff', '#ffd400'), 0.4, 1.0);
        planeAt(g, scr, 5.4, 3, 0, loc.height - 1.9, -D - 0.03, Math.PI);
        boxAt(g, M.std('#222'), 1.4, 0.9, 0.7, ex, 0, 0.6);
        planeAt(g, M.tex(panelTexture(['ケーブル', 'USB-C'], '#ffd400', '#e60012', 256, 128, 60), 0.5, 0.5), 1.2, 0.6, ex, 1.25, 0.96);
        F.collider(this.collision, ex, 0.6, 1.5, 0.8);
        break;
      }
      case 'games': {
        const neonA = this.nightMat(M.glow('#00e5ff', 2.2), 2.2, 3.4);
        const neonB = this.nightMat(M.glow('#ff3bd4', 2.2), 2.2, 3.4);
        boxAt(g, neonA, W, 0.1, 0.1, 0, loc.height + 0.4, 0.05, false);
        boxAt(g, neonB, W, 0.1, 0.1, 0, 2.7, 0.06, false);
        boxAt(g, neonA, 0.1, 0.1, D, -W / 2 - 0.05, loc.height + 0.4, -D / 2, false);
        const scr = M.tex(screenTexture(['ゲーム', 'しんぴん・ちゅうこ'], '#6a1bd1', '#ffffff', '#00e5ff'), 0.4, 1.0);
        planeAt(g, scr, 5, 2.6, 0, loc.height - 1.7, -D - 0.03, Math.PI);
        // machine à pince (UFO catcher)
        const cg = new THREE.Group();
        cg.position.set(ex, 0, 0.75);
        g.add(cg);
        boxAt(cg, M.std('#ff3b6b', 0.4), 1.0, 0.7, 1.0, 0, 0, 0);
        const glass = M.std('#bfefff', 0.1, { transparent: true, opacity: 0.35 });
        boxAt(cg, glass, 0.95, 1.0, 0.95, 0, 0.7, 0, false);
        boxAt(cg, M.glow('#ffe14d', 1.6), 1.0, 0.25, 1.0, 0, 1.7, 0);
        for (let i = 0; i < 5; i++) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M.std(['#ffd1dc', '#c2f0ff', '#fff3a6', '#d6c6ff', '#b8ffcf'][i], 0.6));
          ball.position.set(-0.25 + (i % 3) * 0.25, 0.82, -0.2 + Math.floor(i / 3) * 0.3);
          cg.add(ball);
        }
        F.collider(this.collision, ex, 0.75, 1.1, 1.1);
        break;
      }
      case 'figures': {
        // gachapon
        const cols = ['#ff4fa3', '#4fc3ff', '#ffd54f'];
        cols.forEach((c, i) => {
          const x = ex - 0.7 + i * 0.7;
          boxAt(g, M.std(c, 0.5), 0.6, 0.6, 0.55, x, 0, 0.5);
          const gl = M.std('#ffffff', 0.1, { transparent: true, opacity: 0.45 });
          boxAt(g, gl, 0.56, 0.55, 0.5, x, 0.6, 0.5, false);
          boxAt(g, M.std(c, 0.5), 0.6, 0.12, 0.55, x, 1.15, 0.5);
          for (let k = 0; k < 3; k++) {
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.std(['#ff8a80', '#80d8ff', '#ccff90'][(k + i) % 3], 0.5));
            b.position.set(x - 0.12 + k * 0.12, 0.72 + (k % 2) * 0.1, 0.5);
            g.add(b);
          }
        });
        F.collider(this.collision, ex, 0.5, 2.2, 0.7);
        const scr = M.tex(screenTexture(['フィギュア', 'みかいふう・せいきひん'], '#ff4fa3', '#ffffff', '#7a2a8c'), 0.4, 0.8);
        planeAt(g, scr, 5, 2.4, 0, loc.height - 1.6, -D - 0.03, Math.PI);
        break;
      }
      case 'pharmacy': {
        const green = this.nightMat(M.glow('#19c26b', 1.6), 1.6, 2.8);
        const cross = new THREE.Group();
        boxAt(cross, green, 1.2, 0.4, 0.15, 0, -0.2, 0);
        boxAt(cross, green, 0.4, 1.2, 0.15, 0, -0.6, 0);
        cross.position.set(left ? -W / 2 + 0.9 : W / 2 - 0.9, loc.height - 0.9, 0.12);
        g.add(cross);
        const back = cross.clone();
        back.position.set(0, loc.height - 1.6, -D - 0.1);
        g.add(back);
        // wagons de promotion
        for (let i = 0; i < 2; i++) {
          const x = ex - 0.6 + i * 1.2;
          boxAt(g, M.std('#ffe600', 0.6), 1.0, 0.8, 0.6, x, 0, 0.55);
          for (let k = 0; k < 4; k++) boxAt(g, M.std(['#ffffff', '#ff8a8a', '#7fd3ff', '#9be29b'][k], 0.6), 0.2, 0.25, 0.2, x - 0.33 + k * 0.22, 0.8, 0.55);
        }
        F.collider(this.collision, ex, 0.55, 2.3, 0.7);
        planeAt(g, M.tex(panelTexture(['くすり', 'ずつう・いたみ'], '#ffe600', '#0a6b3d', 256, 192, 60), 0.5, 0.5), 1.4, 1.0, ex, 1.6, 0.4);
        break;
      }
      case 'izakaya':
        this.buildIzakayaExtras(loc, F, M);
        break;
      case 'hotel': {
        // marquise d'entrée + plantes en pot
        const dark = M.std('#3b2f25', 0.5);
        boxAt(g, dark, 3.4, 0.14, 1.9, 0, 2.75, 0.95);
        for (const sx of [-1.55, 1.55]) cylAt(g, dark, 0.05, 0.05, 2.75, sx, 0, 1.75, 8);
        const pot = M.std('#d9d2c4', 0.8);
        const leaf = M.std('#4f8a46', 0.85);
        for (const sx of [-2.6, 2.6]) {
          cylAt(g, pot, 0.32, 0.26, 0.6, sx, 0, 0.5, 12);
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), leaf);
          b.position.set(sx, 0.95, 0.5);
          b.castShadow = true;
          g.add(b);
          F.collider(this.collision, sx, 0.5, 0.7, 0.7);
        }
        break;
      }
      case 'shokudo': {
        // distributeur de tickets (しょっけんき) à côté de la porte
        const body = M.std('#e8e4dc', 0.5);
        boxAt(g, body, 1.0, 1.75, 0.6, ex, 0, 0.45);
        const ft = this.nightMat(M.tex(panelTexture(['しょっけんき', '▢ ▢ ▢', '▢ ▢ ▢', '¥1000'], '#2f4a3a', '#fff4dc', 256, 384, 46), 0.4, 0.6), 0.5, 1.2);
        planeAt(g, ft, 0.85, 1.2, ex, 0.5, 0.76);
        F.collider(this.collision, ex, 0.45, 1.1, 0.7);
        // noren
        const noren = M.tex(stripeTexture('#2f4a3a', '#26402f', 4));
        this.swayNoren(planeAt(g, noren, 2.0, 0.7, 0, 2.15, 0.12), 0.7, loc.z);
        break;
      }
      case 'koban': {
        // lanterne rouge ronde au-dessus de la porte + panneau
        const lamp = this.nightMat(M.std('#d7261e', 0.4, { emissive: '#ff3a2a', emissiveIntensity: 0.4 }), 0.4, 2.2);
        const sph = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), lamp);
        sph.position.set(0, 3.55, 0.35);
        g.add(sph);
        const pp = F.toWorld(0, 0.8);
        this.addSpot(pp.x, 3.4, pp.z, 0.8, '#ff6a50');
        this.lightHalo(g, 0, 3.66, 0.5, 1.4, '#ff5a40', 0.8);
        this.lightPool(g, 0, 1.1, 3.2, 2.6, '#ff6a50', 0.32);
        planeAt(g, M.tex(panelTexture(['KOBAN', 'POLICE BOX'], '#ffffff', '#24365e', 256, 160, 52), 0.5, 0.3), 1.1, 0.7, ex * 0.7, 1.5, 0.05);
        break;
      }
      case 'bakery':
        this.buildBakeryExtras(loc, F, M);
        break;
    }
    void rnd;
  }

  /** PNJ « de rue » : pas de bâtiment, juste quelqu'un à qui parler */
  private buildStreetNpc(loc: LocationConfig) {
    const F = new Frame(loc.x ?? 0, loc.z, loc.face ?? 0);
    this.root.add(F.group);
    this.addNpc(loc, F, 0, 0);
  }

  /* ───────────────────────── gare ───────────────────────── */

  private buildStation(loc: LocationConfig) {
    const facadeZ = loc.z - loc.depth / 2;
    const F = new Frame(loc.x ?? 0, facadeZ, Math.PI);
    this.root.add(F.group);
    const g = F.group;
    const M = new MatSet();
    const { width: W, depth: D, height: Hh, colors: C } = loc;

    const wall = M.std(C.wall, 0.85);
    const roof = M.std(C.roof, 0.85);
    const trim = M.std(C.trim, 0.6);
    const front = M.tex(facadeTexture(C.wall, C.window, C.trim, 12, 2, 0.25, 77));
    boxAt(g, [wall, wall, roof, roof, front, wall], W, Hh, D, 0, 0, -D / 2);
    boxAt(g, trim, W + 0.2, 0.4, D + 0.2, 0, Hh, -D / 2);
    // tour de l'horloge
    const tw = 6;
    const towerH = 11;
    const tf = M.tex(facadeTexture(shade(C.wall, -0.05), C.window, C.trim, 2, 3, 0.3, 78));
    boxAt(g, [tf, tf, roof, roof, tf, tf], tw, towerH, 5, 0, 0, -3.2);
    boxAt(g, trim, tw + 0.4, 0.5, 5.4, 0, towerH, -3.2);
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 4), M.std('#4b6f8a', 0.6));
    pyr.position.set(0, towerH + 0.5 + 1.1, -3.2);
    pyr.rotation.y = Math.PI / 4;
    pyr.castShadow = true;
    g.add(pyr);
    // boîtier en saillie (enfoncé dans la façade, z -0.70 : aucune face coplanaire),
    // cadran 0.06 devant le boîtier + polygonOffset → aucun scintillement
    const clockMat = M.tex(clockTexture(), 0.5, 0.3).clone();
    clockMat.polygonOffset = true;
    clockMat.polygonOffsetFactor = -1;
    clockMat.polygonOffsetUnits = -2;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), clockMat);
    clock.position.set(0, towerH - 1.95, -0.39);
    g.add(clock);
    cylAt(g, trim, 1.38, 1.38, 0.5, 0, towerH - 2.2, -0.7, 48).rotation.x = Math.PI / 2;

    // grande enseigne
    const sm = this.nightMat(M.tex(signTexture(loc.sign.text, loc.sign.sub, loc.sign.bg, loc.sign.fg, loc.sign.accent, 5), 0.5, 0.45), 0.45, 1.15);
    boxAt(g, faceMats(trim, sm, [4]), 10, 2, 0.25, 0, Hh - 2.4, 0.15);
    // ligne de couleur JR-like
    boxAt(g, M.std(loc.sign.accent ?? '#3fae5a', 0.5), W, 0.25, 0.05, 0, 3.75, 0.03);

    // entrée vitrée
    const sf = this.nightMat(M.tex(storefrontTexture('station', C.window, C.trim), 0.3, 0.5), 0.5, 1.2);
    planeAt(g, sf, 16, 3.2, 0, 1.7, 0.02);
    planeAt(g, M.tex(departureBoardTexture(), 0.4, 1.0), 3.4, 1.3, 11, 2.3, 0.03);
    planeAt(g, M.tex(departureBoardTexture(), 0.4, 1.0), 3.4, 1.3, -11, 2.3, 0.03);

    // marquise + colonnes
    const canopyD = 4.6;
    const cm = M.std('#e8e8e8', 0.5);
    boxAt(g, cm, 20, 0.28, canopyD, 0, 3.55, canopyD / 2);
    boxAt(g, M.std(C.awning[0], 0.5), 20.04, 0.18, 0.08, 0, 3.6, canopyD);
    for (const x of [-8.6, 8.6]) {
      cylAt(g, M.std('#9aa4ad', 0.4), 0.18, 0.18, 3.55, x, 0, canopyD - 0.5);
      F.collider(this.collision, x, canopyD - 0.5, 0.45, 0.45);
    }
    // lumières sous la marquise
    for (let x = -8; x <= 8; x += 4) {
      boxAt(g, this.nightMat(M.glow('#fff4d6', 1.4), 1.4, 3.2), 2, 0.05, 0.25, x, 3.5, canopyD / 2, false);
      if (x % 8 === 0) {
        const p = F.toWorld(x, canopyD / 2);
        this.addSpot(p.x, 3.1, p.z, 1.1, '#fff1d0');
      }
      this.lightPool(g, x, canopyD / 2, 3.6, 3.4, '#fff1d0', 0.29);
    }
    this.occluders.push({ box: F.box3(0, canopyD / 2, 20, canopyD, 3.4, 3.9), mats: [cm], opacity: 1 });

    // portiques (かいさつ)
    const gateBody = M.std('#d9dde2', 0.4);
    const gateTop = M.std('#5d6670', 0.4);
    for (let x = -5; x <= 5; x += 2) {
      boxAt(g, gateBody, 0.38, 1.0, 1.6, x, 0, 1.8);
      boxAt(g, gateTop, 0.42, 0.06, 1.64, x, 1.0, 1.8);
      boxAt(g, M.glow('#2a9df4', 1.5), 0.3, 0.02, 0.3, x, 1.06, 2.25, false);
      boxAt(g, M.glow('#3fdc7a', 1.8), 0.3, 0.12, 0.03, x, 0.75, 2.61, false);
      const flap = boxAt(g, M.std('#ff7b54', 0.5), 0.8, 0.35, 0.04, x + 0.6, 0.55, 1.8);
      flap.castShadow = false;
      F.collider(this.collision, x, 1.8, 0.4, 1.6);
    }
    // barrières de part et d'autre des portiques
    const fence = M.std('#b8c0c8', 0.4);
    for (const s of [-1, 1]) {
      boxAt(g, fence, 1.3, 0.9, 0.08, s * 6.25, 0, 1.8);
      F.collider(this.collision, s * 6.25, 1.8, 1.3, 0.3);
    }
    planeAt(g, M.tex(panelTexture(['かいさつ', 'TICKET GATES'], '#1f5a8c', '#ffffff', 512, 192, 70), 0.5, 0.6), 3.2, 0.9, 0, 3.0, 3.9);
    // panneaux de sortie (vus depuis la place : l'est est à gauche)
    planeAt(g, M.tex(panelTexture(['← 東口 ひがしぐち'], '#f2c230', '#1b1b1b', 512, 128, 64), 0.5, 0.6), 2.8, 0.7, -5.8, 3.05, 3.9);
    planeAt(g, M.tex(panelTexture(['西口 にしぐち →'], '#f2c230', '#1b1b1b', 512, 128, 64), 0.5, 0.6), 2.8, 0.7, 5.8, 3.05, 3.9);

    // distributeurs de billets (côté ouest de la place, local -x → monde +x)
    for (let i = 0; i < 3; i++) {
      const x = -7.2 + (i - 1) * 1.0;
      boxAt(g, M.std('#e3e6ea', 0.4), 0.9, 1.7, 0.7, x, 0, 0.45);
      planeAt(g, M.tex(screenTexture(['きっぷ', 'Suica'], '#1f5a8c', '#ffffff', '#3fae5a'), 0.4, 0.8), 0.6, 0.45, x, 1.25, 0.81);
    }
    F.collider(this.collision, -7.2, 0.45, 3.0, 0.8);
    planeAt(g, M.tex(panelTexture(['きっぷうりば', 'TICKETS · Suica'], '#ffffff', '#1f5a8c', 512, 192, 70), 0.5, 0.5), 3.0, 0.8, -7.2, 2.6, 0.06);

    // guichet d'information (devant lequel se tient l'agent)
    const off = loc.npc.offset ?? { along: 7, out: 2.9 };
    boxAt(g, M.std('#1f5a8c', 0.5), 2.6, 1.05, 0.8, off.along, 0, off.out - 1.1);
    boxAt(g, M.std('#f4f4f4', 0.4), 2.7, 0.06, 0.9, off.along, 1.05, off.out - 1.1);
    planeAt(g, M.tex(panelTexture(['あんない', 'INFORMATION'], '#3fae5a', '#ffffff', 512, 192, 70), 0.5, 0.6), 2.4, 0.7, off.along, 2.5, off.out - 1.5);
    F.collider(this.collision, off.along, off.out - 1.1, 2.7, 0.9);

    F.collider(this.collision, 0, -D / 2, W, D, loc.id);
    this.occluders.push({ box: F.box3(0, -D / 2, W, D, 0, towerH + 2), mats: M.list.filter((m) => m !== cm), opacity: 1 });
    this.addNpc(loc, F, off.along, off.out);
  }

  /* ───────────────────────── PNJ & halos ───────────────────────── */

  private addNpc(loc: LocationConfig, F: Frame, along: number, out: number) {
    const ch = new Character(loc.npc.look);
    const p = F.toWorld(along, out);
    const gy = this.groundHeight(p.x, p.z);
    ch.root.position.set(p.x, gy, p.z);
    ch.setYaw(F.rot, true);
    this.root.add(ch.root);
    const rect = this.collision.addRect(p.x, p.z, 0.6, 0.6, `npc:${loc.id}`);

    const hp = F.toWorld(along, out + 1.5);
    const halo = new THREE.Group();
    halo.position.set(hp.x, this.groundHeight(hp.x, hp.z) + 0.04, hp.z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    halo.add(ring);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: glowTexture('#ffcc55'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    halo.add(glow);
    const ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.74, 0.8, 48),
      new THREE.MeshBasicMaterial({ color: '#ffe39a', transparent: true, opacity: 0, depthWrite: false }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.015;
    halo.add(ripple);
    // dessiné avant les bâtiments rendus translucides : sinon leur profondeur
    // masquait complètement le halo derrière une façade « effacée »
    halo.renderOrder = -1;
    this.root.add(halo);
    const beam = new THREE.Mesh(
      BEAM_GEO,
      new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffd36b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    beam.position.copy(halo.position);
    beam.renderOrder = -1;
    beam.visible = false;
    this.root.add(beam);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(loc.icon, loc.reading, false), depthTest: false, depthWrite: false, transparent: true }));
    label.scale.set(3.2, 0.8, 1);
    label.position.set(p.x, gy + 2.75, p.z);
    label.renderOrder = 20;
    this.root.add(label);

    this.npcs.push({ loc, character: ch, pos: p, haloPos: hp, homeYaw: F.rot, halo, haloRing: ring, haloGlow: glow, haloRipple: ripple, haloBeam: beam, beamK: 0, label, done: false, rect, closed: false });
  }

  setCompleted(id: string, done: boolean) {
    const n = this.npcs.find((x) => x.loc.id === id);
    if (!n || n.done === done) return;
    n.done = done;
    this.refreshNpcLook(n);
  }

  /** étiquette + couleur du halo : doré (à faire), vert (réussi), gris (fermé) */
  private refreshNpcLook(n: NpcInstance) {
    const m = n.label.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = n.closed && n.loc.closedSign ? labelTexture('🔒', n.loc.closedSign.kana, false) : labelTexture(n.loc.icon, n.loc.reading, n.done);
    m.needsUpdate = true;
    // halo bleu pour le shinkansen (trajet, pas une situation à réussir)
    const travel = !!n.loc.travel;
    const col = n.closed ? '#a9b1bb' : travel ? '#5ab4ff' : n.done ? '#5be08f' : '#ffd36b';
    (n.haloRing.material as THREE.MeshBasicMaterial).color.set(col);
    (n.haloRipple.material as THREE.MeshBasicMaterial).color.set(n.closed ? '#c9cfd6' : travel ? '#a8d8ff' : n.done ? '#a6f2c4' : '#ffe39a');
    const gm = n.haloGlow.material as THREE.MeshBasicMaterial;
    gm.map = glowTexture(n.closed ? '#9aa3ad' : travel ? '#4aa8ff' : n.done ? '#5be08f' : '#ffcc55');
    (n.haloBeam.material as THREE.MeshBasicMaterial).color.set(travel ? '#5ab4ff' : n.done ? '#5be08f' : '#ffc94d');
    gm.needsUpdate = true;
  }

  /* ───────────────────────── mobilier urbain ───────────────────────── */

  private buildStreetProps() {
    const H = LAYOUT.sidewalkHeight;
    const A = LAYOUT.avenueHalfWidth;
    const pole = shared.std('#5e646b', 0.5);
    const bannerTex = verticalSignTexture(DECOR.streetBanner, '#c0392b', '#ffffff', '#f2c230');
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7, side: THREE.DoubleSide });
    const bulb = this.nightMat(shared.glow('#fff1c9', 2.5), 0.6, 3.6);
    const glowMat = this.nightMat(new THREE.SpriteMaterial({ map: glowTexture('#ffd28a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }), 0.3, 1, 'opacity');

    const poolMat = this.nightMat(new THREE.MeshBasicMaterial({ map: glowTexture('#ffcf8a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.5, 'opacity');
    // lampadaires
    for (const z of DECOR.lampsZ) {
      for (const s of [-1, 1]) {
        const x = s * (A + 0.55);
        const lamp = new THREE.Group();
        lamp.position.set(x, H, z);
        this.root.add(lamp);
        cylAt(lamp, pole, 0.08, 0.11, 4.6, 0, 0, 0, 10);
        const arm = boxAt(lamp, pole, 1.1, 0.08, 0.08, -s * 0.5, 4.5, 0);
        arm.castShadow = true;
        boxAt(lamp, pole, 0.5, 0.14, 0.3, -s * 1.0, 4.38, 0);
        boxAt(lamp, bulb, 0.42, 0.05, 0.22, -s * 1.0, 4.34, 0, false);
        const sp = new THREE.Sprite(glowMat);
        sp.position.set(-s * 1.0, 4.2, 0);
        sp.scale.set(1.8, 1.8, 1);
        lamp.add(sp);
        // nappe de lumière au sol (nuit) : large et douce, elle chevauche celles
        // des lampadaires voisins pour éclairer toute la rue de façon continue
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 13), poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(-s * 2.2, 0.05, 0);
        pool.renderOrder = 1;
        lamp.add(pool);
        // et une plus petite côté trottoir / vitrines
        const side = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), poolMat);
        side.rotation.x = -Math.PI / 2;
        side.position.set(s * 2.4, 0.055, 0);
        side.renderOrder = 1;
        lamp.add(side);
        this.addSpot(x - s * 1.0, H + 3.9, z, 1.2, '#ffd9a0');
        // bannière verticale
        const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.0), bannerMat);
        ban.position.set(s * 0.32, 3.0, 0);
        ban.rotation.y = Math.PI / 2;
        ban.castShadow = true;
        lamp.add(ban);
        this.collision.addRect(x, z, 0.35, 0.35);
      }
    }

    // arbres d'alignement
    const trunk = shared.std('#6b4a32', 0.9);
    const leafA = shared.std('#5f9a4a', 0.85);
    const leafB = shared.std('#7bb35a', 0.85);
    const grate = shared.std('#4a4a48', 0.6);
    const rnd = mulberry(5);
    for (const z of DECOR.treesZ) {
      for (const s of [-1, 1]) {
        const x = s * (A + 1.05);
        const tr = new THREE.Group();
        tr.position.set(x, H, z);
        this.root.add(tr);
        boxAt(tr, grate, 1.0, 0.03, 1.0, 0, 0, 0, false);
        cylAt(tr, trunk, 0.12, 0.16, 2.2, 0, 0, 0, 8);
        for (let k = 0; k < 3; k++) {
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 - k * 0.15, 0), k % 2 ? leafB : leafA);
          f.position.set((rnd() - 0.5) * 0.6, 2.4 + k * 0.55, (rnd() - 0.5) * 0.6);
          f.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          f.castShadow = true;
          tr.add(f);
        }
        this.collision.addRect(x, z, 0.5, 0.5);
      }
    }

    // poteaux électriques + câbles (côté ouest)
    const concrete = shared.std('#a7a49d', 0.85);
    const tops: THREE.Vector3[] = [];
    for (const z of DECOR.polesZ) {
      const x = -(A + 0.5);
      const p = new THREE.Group();
      p.position.set(x, H, z);
      this.root.add(p);
      cylAt(p, concrete, 0.11, 0.16, 7.6, 0, 0, 0, 10);
      boxAt(p, concrete, 1.6, 0.1, 0.1, 0, 6.9, 0);
      boxAt(p, concrete, 1.2, 0.1, 0.1, 0, 6.3, 0);
      cylAt(p, shared.std('#8a9096', 0.5), 0.22, 0.22, 0.6, 0.35, 5.3, 0.2, 10);
      boxAt(p, shared.std('#f2c230', 0.6), 0.25, 1.2, 0.03, 0, 1.2, 0.17, false);
      tops.push(new THREE.Vector3(x, H + 6.95, z));
      this.collision.addRect(x, z, 0.35, 0.35);
    }
    const wireMat = new THREE.LineBasicMaterial({ color: '#2a2a2a' });
    for (let i = 0; i < tops.length - 1; i++) {
      for (const off of [-0.7, 0, 0.7]) {
        const a = tops[i].clone().add(new THREE.Vector3(off, 0, 0));
        const b = tops[i + 1].clone().add(new THREE.Vector3(off, 0, 0));
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const p = a.clone().lerp(b, t);
          p.y -= Math.sin(t * Math.PI) * 0.6;
          pts.push(p);
        }
        this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }

    // distributeurs de boissons dans les ruelles
    let vi = 0;
    for (const z of DECOR.vendingGapsZ) {
      for (const s of [-1, 1]) {
        for (const dz of [-0.55, 0.55]) this.buildVending(s * (LAYOUT.frontX + 0.45), z + dz, s < 0 ? Math.PI / 2 : -Math.PI / 2, vi++);
        this.collision.addRect(s * (LAYOUT.frontX + 0.45), z, 0.8, 2.1);
        this.addSpot(s * (LAYOUT.frontX - 0.6), H + 1.3, z, 0.7, '#dff4ff');
        this.lightPool(this.root, s * (LAYOUT.frontX - 0.4), z, 3.0, 3.8, '#cfeaff', 0.32).position.y += H;
      }
    }

    // voitures
    for (const c of DECOR.cars) this.buildCar(c.x, c.z, c.yaw, c.color, c.taxi);

    // portique d'entrée de la rue commerçante (nord)
    const gz = LAYOUT.avenueStartZ + 3;
    const gateG = new THREE.Group();
    gateG.position.set(0, 0, gz);
    this.root.add(gateG);
    const gm = new MatSet();
    const red = gm.std('#b3261e', 0.5);
    for (const s of [-1, 1]) {
      cylAt(gateG, red, 0.22, 0.25, 6.2, s * (A + 0.6), H, 0, 12);
      this.collision.addRect(s * (A + 0.6), gz, 0.5, 0.5);
    }
    const ban = this.nightMat(gm.tex(signTexture(DECOR.streetBanner, 'ICHIBAN STREET', '#b3261e', '#fff3d6', '#1e1a18', 5), 0.5, 0.4), 0.4, 1.2);
    boxAt(gateG, faceMats(red, ban, [4, 5]), A * 2 + 1.6, 1.4, 0.3, 0, 5.2, 0);
    boxAt(gateG, gm.std('#1e1a18', 0.5), A * 2 + 2.4, 0.25, 0.5, 0, 6.6, 0);
    this.occluders.push({ box: new THREE.Box3(new THREE.Vector3(-A - 1.2, 4.9, gz - 0.3), new THREE.Vector3(A + 1.2, 6.9, gz + 0.3)), mats: gm.list, opacity: 1 });
  }

  /** distributeur de boissons (face lumineuse qui « respire » doucement) */
  private buildVending(x: number, z: number, rotY: number, idx: number) {
    const H = LAYOUT.sidewalkHeight;
    const color = DECOR.vendingColors[idx % DECOR.vendingColors.length];
    const tex = vendingTexture(color, idx);
    const face = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.65, roughness: 0.4 });
    const body = shared.std(color, 0.5);
    const vm = new THREE.Group();
    vm.position.set(x, H, z);
    vm.rotation.y = rotY;
    this.root.add(vm);
    boxAt(vm, faceMats(body, face, [4]), 1.0, 1.9, 0.8, 0, 0, 0);
    boxAt(vm, shared.std(shade(color, -0.3), 0.5), 1.04, 0.12, 0.84, 0, 1.9, 0);
    const glow = new THREE.SpriteMaterial({ map: glowTexture('#d8f0ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
    const sp = new THREE.Sprite(glow);
    sp.position.set(0, 1.0, 0.7);
    sp.scale.set(1.6, 1.8, 1);
    vm.add(sp);
    this.vending.push({ face, glow, phase: idx * 1.7 });
  }

  /** voiture « jouet » : carrosserie arrondie, habitacle vitré, jantes claires */
  private buildCar(x: number, z: number, yaw: number, color: string, taxi: boolean) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.root.add(g);
    const body = shared.std(color, 0.32);
    const dark = shared.std('#23272d', 0.55);
    const tyre = shared.std('#1b1d21', 0.85);
    const rim = shared.std('#e4e7ea', 0.25);
    const glass = shared.std('#22384f', 0.08);
    const chrome = shared.std('#c9ced3', 0.25);
    // carrosserie + habitacle
    rboxAt(g, body, 1.84, 0.66, 4.0, 0, 0.2, 0, 0.2);
    rboxAt(g, glass, 1.6, 0.62, 2.15, 0, 0.78, -0.25, 0.16);
    rboxAt(g, body, 1.66, 0.12, 1.95, 0, 1.36, -0.25, 0.06);
    // montants (piliers) pour lire la forme de l'habitacle
    for (const sx of [-0.79, 0.79]) for (const sz of [-1.25, 0.75]) rboxAt(g, body, 0.08, 0.6, 0.1, sx, 0.8, sz, 0.03);
    // pare-chocs
    rboxAt(g, dark, 1.9, 0.2, 0.22, 0, 0.2, 2.0, 0.08);
    rboxAt(g, dark, 1.9, 0.2, 0.22, 0, 0.2, -2.0, 0.08);
    // calandre + plaques
    rboxAt(g, dark, 0.8, 0.14, 0.06, 0, 0.5, 2.0, 0.03, false);
    const plate = shared.std('#f4f4ec', 0.5);
    rboxAt(g, plate, 0.42, 0.14, 0.04, 0, 0.23, 2.12, 0.02, false);
    rboxAt(g, plate, 0.42, 0.14, 0.04, 0, 0.23, -2.12, 0.02, false);
    // rétroviseurs
    for (const s of [-1, 1]) {
      rboxAt(g, dark, 0.08, 0.05, 0.06, s * 0.9, 0.86, 0.72, 0.02, false);
      rboxAt(g, body, 0.12, 0.13, 0.17, s * 0.98, 0.84, 0.72, 0.05);
    }
    // roues : pneu + jante claire + moyeu
    for (const sx of [-0.84, 0.84])
      for (const sz of [-1.28, 1.28]) {
        const w = new THREE.Group();
        w.position.set(sx, 0.34, sz);
        w.rotation.z = Math.PI / 2;
        g.add(w);
        cylAt(w, tyre, 0.34, 0.34, 0.26, 0, -0.13, 0, 18);
        cylAt(w, rim, 0.2, 0.2, 0.28, 0, -0.14, 0, 14, false);
        cylAt(w, chrome, 0.07, 0.07, 0.3, 0, -0.15, 0, 8, false);
      }
    // phares (avant = +z) et feux arrière, plus vifs la nuit
    const head = this.nightMat(shared.glow('#fff6d8', 1.2), 0.7, 3.2);
    const tail = this.nightMat(shared.glow('#ff3030', 1.0), 0.6, 2.4);
    for (const s of [-1, 1]) {
      rboxAt(g, head, 0.4, 0.16, 0.08, s * 0.6, 0.58, 1.99, 0.04, false);
      rboxAt(g, tail, 0.36, 0.14, 0.08, s * 0.62, 0.58, -1.99, 0.04, false);
    }
    // faisceaux au sol, visibles la nuit
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2), this.carBeam());
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 0.02, 4.0);
    g.add(beam);
    const fp = g.localToWorld(new THREE.Vector3(0, 0.9, 3.0));
    this.addSpot(fp.x, fp.y, fp.z, taxi ? 0.9 : 0.6, '#fff1d6');
    if (taxi) {
      rboxAt(g, shared.std('#f2c230', 0.5), 1.86, 0.1, 4.02, 0, 0.55, 0, 0.04);
      const tt = panelTexture(['タクシー'], '#f2c230', '#1d2b24', 256, 96, 60);
      const t = this.nightMat(new THREE.MeshStandardMaterial({ map: tt, emissive: '#ffffff', emissiveMap: tt, emissiveIntensity: 0.6, roughness: 0.5 }), 0.6, 1.8);
      rboxAt(g, t, 0.26, 0.3, 0.72, 0, 1.46, -0.2, 0.06);
      // voyant « libre » (空車) rouge derrière le pare-brise
      rboxAt(g, this.nightMat(shared.glow('#ff2a2a', 1.2), 1.0, 2.6), 0.3, 0.12, 0.05, 0.45, 1.08, 0.82, 0.02, false);
    }
    this.collision.addRect(x, z, 2.0, 4.3);
  }

  private beamMat: THREE.MeshBasicMaterial | null = null;
  private carBeam() {
    if (!this.beamMat) {
      this.beamMat = this.nightMat(new THREE.MeshBasicMaterial({ map: glowTexture('#fff3d0'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.5, 'opacity');
    }
    return this.beamMat;
  }

  /** climatiseur extérieur avec ventilateur qui tourne lentement */
  private addAirCon(g: THREE.Object3D, M: MatSet, x: number, y: number, z: number, rotY: number) {
    const ac = new THREE.Group();
    ac.position.set(x, y, z);
    ac.rotation.y = rotY;
    g.add(ac);
    const shell = M.std('#e8e6e0', 0.6);
    rboxAt(ac, shell, 1.0, 0.68, 0.4, 0, 0, 0, 0.06);
    const grill = M.std('#4b4f55', 0.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 24), grill);
    ring.position.set(0.17, 0.34, 0.214);
    ac.add(ring);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), M.std('#2c2f33', 0.8));
    hub.position.set(0.17, 0.34, 0.207);
    ac.add(hub);
    const fan = new THREE.Group();
    fan.position.set(0.17, 0.34, 0.222);
    ac.add(fan);
    const blade = M.std('#9ba1a8', 0.5);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.01), blade);
      const a = (i * Math.PI * 2) / 3;
      b.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0);
      b.rotation.z = a;
      fan.add(b);
    }
    rboxAt(ac, M.std('#b8b6b0', 0.6), 0.28, 0.5, 0.02, -0.28, 0.09, 0.212, 0.008, false);
    // équerres + tuyau qui descend le long du mur
    for (const sx of [-0.35, 0.35]) boxAt(ac, grill, 0.05, 0.05, 0.38, sx, -0.06, 0.005);
    boxAt(ac, M.std('#f2f0ea', 0.7), 0.07, 1.4, 0.07, -0.42, -1.35, -0.16);
    const speed = 1.6 + Math.random() * 0.8;
    this.animated.push((_t, dt) => {
      fan.rotation.z -= dt * speed;
    });
  }

  /* ───────────────────────── place de la gare ───────────────────────── */

  private buildPlaza() {
    const H = LAYOUT.sidewalkHeight;
    // vélos garés le long du mur de la konbini, dans la ruelle (côté caméra)
    ['#e9e4d8', '#3d6b8f', '#b8323a'].forEach((c, i) => this.parkedBike(-11.6 - i * 1.75, -6.45, i % 2 ? 0.04 : -0.03, c));
    this.collision.addRect(-13.35, -6.45, 5.2, 0.8);
    const wood = shared.std('#a06a3c', 0.8);
    const metal = shared.std('#55595e', 0.5);
    const bench = (x: number, z: number, rot: number) => {
      const b = new THREE.Group();
      b.position.set(x, H, z);
      b.rotation.y = rot;
      this.root.add(b);
      boxAt(b, wood, 2.0, 0.1, 0.55, 0, 0.45, 0);
      boxAt(b, wood, 2.0, 0.45, 0.08, 0, 0.6, -0.26);
      for (const s of [-0.85, 0.85]) boxAt(b, metal, 0.08, 0.45, 0.5, s, 0, 0);
      this.collision.addRect(x, z, Math.abs(Math.sin(rot)) > 0.5 ? 0.6 : 2.0, Math.abs(Math.sin(rot)) > 0.5 ? 2.0 : 0.6);
      this.benches.push({ x, z, yaw: rot, y: H });
    };
    // côté est : la place reste libre jusqu'au quai du shinkansen
    bench(-12.5, 9.5, Math.PI / 2);
    bench(-12.5, 13, Math.PI / 2);

    const pot = shared.std('#bfb6a6', 0.8);
    const leaf = shared.std('#6fa85a', 0.85);
    const flower = [shared.std('#ff8fb1', 0.7), shared.std('#ffd166', 0.7), shared.std('#ffffff', 0.7)];
    const rnd = mulberry(11);
    for (const [x, z] of [
      [-7.5, 7.5],
      [7.5, 7.5],
      [-15.5, 7.5],
      [15.5, 7.5],
    ]) {
      boxAt(this.root, pot, 1.6, 0.6, 1.6, x, H, z);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), leaf);
      bush.position.set(x, H + 0.95, z);
      bush.scale.y = 0.7;
      bush.castShadow = true;
      this.root.add(bush);
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), flower[i % 3]);
        f.position.set(x + (rnd() - 0.5) * 1.1, H + 1.2 + rnd() * 0.2, z + (rnd() - 0.5) * 1.1);
        this.root.add(f);
      }
      this.collision.addRect(x, z, 1.6, 1.6);
    }
    // horloge sur pied
    const cp = new THREE.Group();
    cp.position.set(-3.2, H, 12.2);
    this.root.add(cp);
    cylAt(cp, metal, 0.08, 0.1, 3.2, 0, 0, 0);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 24), [metal, new THREE.MeshStandardMaterial({ map: clockTexture() }), new THREE.MeshStandardMaterial({ map: clockTexture() })]);
    face.position.y = 3.4;
    face.rotation.order = 'YXZ';
    face.rotation.set(Math.PI / 2, Math.PI * 0.75, 0);
    face.castShadow = true;
    cp.add(face);
    this.collision.addRect(-3.2, 12.2, 0.3, 0.3);

    // arrêt de bus
    const bs = new THREE.Group();
    bs.position.set(3.4, H, 7.4);
    this.root.add(bs);
    cylAt(bs, metal, 0.05, 0.05, 2.3, 0, 0, 0);
    const busSign = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshStandardMaterial({ map: panelTexture(['バス'], '#2d6a9f', '#ffffff', 128, 128, 52), side: THREE.DoubleSide }));
    busSign.position.y = 2.4;
    busSign.rotation.y = Math.PI / 4;
    bs.add(busSign);
    this.collision.addRect(3.4, 7.4, 0.25, 0.25);
  }

  /* ───────────────────────── quai du shinkansen (Ekimae) ───────────────────────── */

  /** flèches au sol qui « défilent » vers un point (animées par l'émissif, opaques) */
  private groundChevrons(x: number, z0: number, z1: number, n: number, rotY: number) {
    const H = LAYOUT.sidewalkHeight;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(118, 74);
    ctx.lineTo(118, 112);
    ctx.lineTo(64, 56);
    ctx.lineTo(10, 112);
    ctx.lineTo(10, 74);
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mats: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: '#3f8fe8',
        map: tex,
        alphaTest: 0.5,
        emissive: '#4aa8ff',
        emissiveMap: tex,
        emissiveIntensity: 0.2,
        roughness: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      mats.push(m);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), m);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(-Math.PI / 2, rotY, 0);
      mesh.position.set(x, H + 0.008, z0 + ((z1 - z0) * i) / Math.max(1, n - 1));
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    this.animated.push((t) => {
      mats.forEach((m, i) => {
        const k = (((t * 1.4 - i * 0.33) % 1) + 1) % 1;
        m.emissiveIntensity = 0.15 + 0.9 * Math.pow(1 - k, 3) + 0.5 * this.nightF;
      });
    });
  }

  /** portique bleu et blanc « 新幹線のりば » devant la gare d'Ekimae */
  private buildShinkansenGate() {
    const tp = TRAVEL_POINTS.find((t) => districtOf(t) === 'ekimae');
    if (!tp) return;
    const H = LAYOUT.sidewalkHeight;
    const ax = tp.x ?? 14.2;
    const gz = 16.55;
    const g = new THREE.Group();
    g.position.set(ax, H, gz);
    this.root.add(g);
    const M = new MatSet();
    const white = M.std('#f4f6f8', 0.45);
    const blue = M.std('#1f5fbf', 0.45);
    // poteaux + linteau
    for (const s of [-1, 1]) {
      boxAt(g, white, 0.34, 3.6, 0.34, s * 1.95, 0, 0);
      boxAt(g, blue, 0.36, 0.22, 0.36, s * 1.95, 0.0, 0);
      this.collision.addRect(ax + s * 1.95, gz, 0.4, 0.4);
    }
    const sign = this.nightMat(M.tex(signTexture('新幹線のりば', 'SHINKANSEN · しんかんせん', '#1f5fbf', '#ffffff', '#f2c230', 4.6 / 1.0), 0.5, 0.45), 0.45, 1.2);
    boxAt(g, faceMats(white, sign, [5]), 4.6, 1.0, 0.24, 0, 3.6, 0);
    boxAt(g, blue, 4.8, 0.12, 0.3, 0, 4.6, 0);
    const fo = DISTRICTS.fontaine;
    const board = this.nightMat(M.tex(departureTexture(fo.nameJp, fo.reading, fo.nameFr), 0.5, 1.0), 0.6, 1.4);
    boxAt(g, faceMats(white, board, [5]), 4.4, 1.72, 0.14, 0, 4.72, 0);
    // deux portiques automatiques bleus
    for (const dx of [-0.9, 0.9]) {
      boxAt(g, M.std('#dfe5ec', 0.4), 0.36, 1.0, 0.8, dx, 0, 0);
      boxAt(g, blue, 0.4, 0.06, 0.84, dx, 1.0, 0);
      boxAt(g, M.glow('#3fdc7a', 1.6), 0.26, 0.1, 0.02, dx, 0.75, -0.41, false);
    }
    this.collision.addRect(ax, gz, 2.2, 0.85);
    const sp = { x: ax, z: gz - 0.8 };
    this.addSpot(sp.x, H + 3.2, sp.z, 1, '#dff0ff');
    this.lightPool(this.root, sp.x, sp.z - 0.6, 4.6, 3.6, '#dff0ff', 0.32).position.y += H;
    this.occluders.push({ box: new THREE.Box3(new THREE.Vector3(ax - 2.4, H + 3.4, gz - 0.3), new THREE.Vector3(ax + 2.4, H + 6.5, gz + 0.3)), mats: M.list, opacity: 1 });
    this.groundChevrons(ax, 9.6, 12.6, 3, Math.PI);
  }

  /* ───────────────────────── place de la fontaine ───────────────────────── */

  private buildFountainGround() {
    const P = FOUNTAIN.plinth;
    const H = LAYOUT.sidewalkHeight;
    const sx = P.maxX - P.minX;
    const sz = P.maxZ - P.minZ;
    const cx = (P.minX + P.maxX) / 2;
    const cz = (P.minZ + P.maxZ) / 2;
    boxAt(this.root, shared.std('#7b6552', 0.95), sx, P.thickness, sz, cx, -P.thickness, cz, false, true);
    boxAt(this.root, shared.std('#5d4b3d', 0.95), sx + 0.3, 0.35, sz + 0.3, cx, -P.thickness - 0.1, cz, false, false);
    // pavés clairs, légèrement rosés (identité différente d'Ekimae)
    const t = tileTexture('#ddd2c2', shade('#ddd2c2', -0.1), 4).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(sx / 2.5, sz / 2.5);
    t.needsUpdate = true;
    boxAt(this.root, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), sx, H, sz, cx, 0, cz, false, true);
    const decal = (color: string, order: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 - order, polygonOffsetUnits: -1 - order });
    // allée centrale gare → torii
    const lane = decal('#c9b9a3', 0);
    const laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 41), lane);
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.position.set(0, H + 0.004, -4.5);
    laneMesh.receiveShadow = true;
    this.root.add(laneMesh);
    // grand cercle autour de la fontaine (deux anneaux)
    const { x: fx, z: fz } = FOUNTAIN.fountain;
    const ring = (r0: number, r1: number, color: string, y: number, order: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), decal(color, order));
      m.rotation.x = -Math.PI / 2;
      m.position.set(fx, H + y, fz);
      m.receiveShadow = true;
      this.root.add(m);
    };
    ring(3.4, 6.9, '#cdbfa9', 0.006, 1);
    ring(6.9, 7.25, '#a99880', 0.007, 2);
    ring(4.6, 4.8, '#b8a78f', 0.007, 2);
  }

  private buildFountain() {
    const H = LAYOUT.sidewalkHeight;
    const { x: fx, z: fz } = FOUNTAIN.fountain;
    const g = new THREE.Group();
    g.position.set(fx, H, fz);
    this.root.add(g);
    const M = new MatSet();
    const stone = M.std('#e2dccf', 0.7, { side: THREE.DoubleSide });
    const stoneD = M.std('#c7bfb0', 0.75, { side: THREE.DoubleSide });
    const lathe = (pts: [number, number][], mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 72), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // bassin : profil tourné (paroi extérieure, margelle, paroi intérieure, fond)
    lathe(
      [
        [3.62, 0],
        [3.55, 0.5],
        [3.6, 0.56],
        [3.6, 0.66],
        [3.48, 0.7],
        [3.12, 0.7],
        [3.02, 0.64],
        [3.0, 0.28],
        [2.9, 0.22],
        [0.01, 0.22],
      ],
      stone,
    );
    // fût central + vasque haute
    lathe(
      [
        [0.62, 0.22],
        [0.5, 0.4],
        [0.36, 0.55],
        [0.3, 1.2],
        [0.42, 1.55],
        [1.0, 1.72],
        [1.36, 1.96],
        [1.4, 2.03],
        [1.3, 2.05],
        [1.24, 1.92],
        [0.01, 1.9],
      ],
      stoneD,
    );
    lathe(
      [
        [0.2, 1.9],
        [0.16, 2.2],
        [0.24, 2.3],
        [0.12, 2.42],
        [0.01, 2.44],
      ],
      stoneD,
    );
    // eau : disques opaques, légèrement lumineux (pas de transparence → pas de tri qui clignote)
    const wc = document.createElement('canvas');
    wc.width = wc.height = 256;
    const wctx = wc.getContext('2d')!;
    wctx.fillStyle = '#4c9fc4';
    wctx.fillRect(0, 0, 256, 256);
    const wr = mulberry(9);
    for (let i = 0; i < 70; i++) {
      wctx.fillStyle = `rgba(200,240,255,${0.08 + wr() * 0.18})`;
      wctx.beginPath();
      wctx.ellipse(wr() * 256, wr() * 256, 6 + wr() * 18, 2 + wr() * 5, wr() * Math.PI, 0, Math.PI * 2);
      wctx.fill();
    }
    const wtex = new THREE.CanvasTexture(wc);
    wtex.colorSpace = THREE.SRGBColorSpace;
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping;
    wtex.repeat.set(2, 2);
    const water = this.nightMat(new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.15, metalness: 0.1, emissive: '#3aa0d0', emissiveIntensity: 0.12 }), 0.12, 0.7);
    const disc = (r: number, y: number) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), water);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.receiveShadow = true;
      g.add(m);
    };
    disc(3.01, 0.5);
    disc(1.25, 1.98);
    // ondes qui s'élargissent sur l'eau
    const ripples: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 64),
        new THREE.MeshBasicMaterial({ color: '#e6f7ff', transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.515;
      m.renderOrder = 1;
      g.add(m);
      ripples.push(m);
    }
    // jets d'eau : gouttelettes instanciées (opaques)
    type Jet = { ox: number; oy: number; oz: number; vx: number; vy: number; vz: number; life: number };
    const jets: Jet[] = [];
    const per: number[] = [];
    const add = (j: Jet, n: number) => {
      jets.push(j);
      per.push(n);
    };
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      add({ ox: 0, oy: 2.42, oz: 0, vx: c * 1.15, vy: 3.1, vz: s * 1.15, life: 0.74 }, 8); // gerbe centrale → vasque
      add({ ox: c * 2.95, oy: 0.7, oz: s * 2.95, vx: -c * 2.0, vy: 3.0, vz: -s * 2.0, life: 0.66 }, 10); // jets de la margelle
      const b = a + Math.PI / 8;
      add({ ox: Math.cos(b) * 1.36, oy: 2.0, oz: Math.sin(b) * 1.36, vx: Math.cos(b) * 0.45, vy: 0, vz: Math.sin(b) * 0.45, life: 0.55 }, 6); // filets de la vasque
    }
    const count = per.reduce((a, b) => a + b, 0);
    const dropMat = this.nightMat(new THREE.MeshStandardMaterial({ color: '#dff4ff', roughness: 0.2, emissive: '#bfe8ff', emissiveIntensity: 0.25 }), 0.25, 0.9);
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), dropMat, count);
    drops.castShadow = false;
    drops.frustumCulled = false;
    g.add(drops);
    const dummy = new THREE.Object3D();
    this.animated.push((t) => {
      let k = 0;
      jets.forEach((j, ji) => {
        const n = per[ji];
        for (let i = 0; i < n; i++) {
          const u = ((((t / j.life + i / n + ji * 0.137) % 1) + 1) % 1) * j.life;
          dummy.position.set(j.ox + j.vx * u, j.oy + j.vy * u - 4.9 * u * u, j.oz + j.vz * u);
          const sc = 0.75 + 0.5 * Math.sin((i / n) * Math.PI);
          dummy.scale.set(sc, sc * 1.5, sc);
          dummy.updateMatrix();
          drops.setMatrixAt(k++, dummy.matrix);
        }
      });
      drops.instanceMatrix.needsUpdate = true;
      ripples.forEach((m, i) => {
        const p = (((t * 0.45 + i / 3) % 1) + 1) % 1;
        m.scale.setScalar(0.8 + p * 1.9);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - p) * Math.min(1, p * 6);
      });
      wtex.offset.set(t * 0.012, t * 0.008);
    });
    this.addSpot(fx, H + 1.4, fz, 1.2, '#cfeeff');
    this.lightPool(this.root, fx, fz, 11, 11, '#cfeeff', 0.32).position.y += H;
    this.collision.addRect(fx, fz, 7.0, 4.6);
    this.collision.addRect(fx, fz, 4.6, 7.0);
    this.collision.addRect(fx, fz, 6.0, 6.0);
    this.occluders.push({ box: new THREE.Box3(new THREE.Vector3(fx - 1.45, H + 0.8, fz - 1.45), new THREE.Vector3(fx + 1.45, H + 2.5, fz + 1.45)), mats: [stoneD], opacity: 1 });
  }

  /** lampadaire à globe (style « place ») */
  private globeLamp(x: number, z: number, M: MatSet) {
    const H = LAYOUT.sidewalkHeight;
    const lamp = new THREE.Group();
    lamp.position.set(x, H, z);
    this.root.add(lamp);
    const iron = M.std('#2f3a3a', 0.5);
    cylAt(lamp, iron, 0.16, 0.2, 0.35, 0, 0, 0, 10);
    cylAt(lamp, iron, 0.06, 0.08, 3.3, 0, 0.35, 0, 10);
    cylAt(lamp, iron, 0.18, 0.1, 0.16, 0, 3.6, 0, 10);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), this.nightMat(M.glow('#fff4dc', 0.5), 0.5, 3.4));
    globe.position.y = 4.04;
    lamp.add(globe);
    const sp = new THREE.Sprite(this.nightMat(new THREE.SpriteMaterial({ map: glowTexture('#ffd28a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2 }), 0.15, 0.95, 'opacity'));
    sp.scale.set(1.9, 1.9, 1);
    sp.position.y = 4.04;
    lamp.add(sp);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      this.nightMat(new THREE.MeshBasicMaterial({ map: glowTexture('#ffcf8a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.42, 'opacity'),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    pool.renderOrder = 1;
    lamp.add(pool);
    this.addSpot(x, H + 3.8, z, 1.1, '#ffd9a0');
    this.collision.addRect(x, z, 0.4, 0.4);
  }

  private buildFountainProps() {
    const H = LAYOUT.sidewalkHeight;
    const { x: fx, z: fz } = FOUNTAIN.fountain;
    const M = new MatSet();
    // lampadaires : autour de la fontaine + dans les ruelles
    for (const [dx, dz] of [
      [6.6, 0],
      [-6.6, 0],
      [0, 6.6],
      [0, -6.6],
    ]) this.globeLamp(fx + dx, fz + dz, M);
    for (const s of [-1, 1]) for (const z of [-10.5, 2.5, 15.2]) this.globeLamp(s * 11.4, z, M);

    // bancs en diagonale, tournés vers la fontaine
    const wood = shared.std('#9a6a42', 0.8);
    const metal = shared.std('#3c4444', 0.5);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = fx + Math.cos(a) * 5.9;
      const z = fz + Math.sin(a) * 5.9;
      const b = new THREE.Group();
      b.position.set(x, H, z);
      b.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      this.root.add(b);
      boxAt(b, wood, 2.0, 0.1, 0.55, 0, 0.45, 0);
      boxAt(b, wood, 2.0, 0.45, 0.08, 0, 0.6, -0.26);
      for (const s of [-0.85, 0.85]) boxAt(b, metal, 0.08, 0.45, 0.5, s, 0, 0);
      this.collision.addRect(x, z, 1.5, 1.5);
      this.benches.push({ x, z, yaw: b.rotation.y, y: H });
    }

    // jardinières fleuries devant les boutiques (entre les vitrines)
    const pot = shared.std('#b9ab96', 0.8);
    const leaf = shared.std('#5f9a4a', 0.85);
    const flowers = [shared.std('#ff9ab8', 0.7), shared.std('#fff2a8', 0.7), shared.std('#ffffff', 0.7), shared.std('#c79bff', 0.7)];
    const fr = mulberry(77);
    const planter = (x: number, z: number) => {
      boxAt(this.root, pot, 1.0, 0.5, 2.2, x, H, z);
      for (let i = 0; i < 3; i++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), leaf);
        bush.position.set(x, H + 0.72, z - 0.7 + i * 0.7);
        bush.scale.y = 0.7;
        bush.castShadow = true;
        this.root.add(bush);
      }
      for (let i = 0; i < 9; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), flowers[i % 4]);
        f.position.set(x + (fr() - 0.5) * 0.7, H + 0.9 + fr() * 0.12, z + (fr() - 0.5) * 1.9);
        this.root.add(f);
      }
      this.collision.addRect(x, z, 1.0, 2.2);
    };
    planter(-12.0, -10.5);
    planter(12.0, 2.5);

    // distributeurs dans les deux autres ruelles + murets au fond
    let vi = 3;
    const vend = (s: number, z: number) => {
      for (const dz of [-0.55, 0.55]) this.buildVending(s * (FOUNTAIN.frontX + 0.45), z + dz, s < 0 ? Math.PI / 2 : -Math.PI / 2, vi++);
      this.collision.addRect(s * (FOUNTAIN.frontX + 0.45), z, 0.8, 2.1);
      this.addSpot(s * (FOUNTAIN.frontX - 0.6), H + 1.3, z, 0.7, '#dff4ff');
      this.lightPool(this.root, s * (FOUNTAIN.frontX - 0.4), z, 3.0, 3.8, '#cfeaff', 0.32).position.y += H;
    };
    vend(-1, 2.5);
    vend(1, -10.5);
    const wallM = shared.std('#b3aa9d', 0.9);
    for (const z of [-10.5, 2.5]) for (const s of [-1, 1]) boxAt(this.root, wallM, 0.3, 1.4, 2.9, s * 21.8, H, z);

    // nord : torii, lanternes de pierre et cerisiers (premier plan pour la caméra)
    const tz = -25.2;
    const tg = new THREE.Group();
    tg.position.set(0, H, tz);
    this.root.add(tg);
    const TM = new MatSet();
    const red = TM.std('#c8321e', 0.55);
    const black = TM.std('#1e1a18', 0.6);
    for (const s of [-1, 1]) {
      cylAt(tg, red, 0.17, 0.2, 3.7, s * 1.8, 0, 0, 14);
      cylAt(tg, black, 0.23, 0.23, 0.32, s * 1.8, 0, 0, 14);
    }
    boxAt(tg, red, 4.4, 0.2, 0.26, 0, 2.95, 0);
    boxAt(tg, red, 5.0, 0.26, 0.42, 0, 3.55, 0);
    boxAt(tg, black, 5.5, 0.18, 0.5, 0, 3.81, 0);
    boxAt(tg, red, 0.2, 0.55, 0.16, 0, 3.0, 0);
    this.occluders.push({ box: new THREE.Box3(new THREE.Vector3(-2.9, H, tz - 0.4), new THREE.Vector3(2.9, H + 4.1, tz + 0.4)), mats: TM.list, opacity: 1 });
    const LM = new MatSet();
    const grey = LM.std('#9d9a92', 0.9);
    for (const s of [-1, 1]) {
      const l = new THREE.Group();
      l.position.set(s * 3.4, H, tz + 0.4);
      this.root.add(l);
      boxAt(l, grey, 0.7, 0.18, 0.7, 0, 0, 0);
      cylAt(l, grey, 0.14, 0.17, 0.75, 0, 0.18, 0, 8);
      boxAt(l, grey, 0.6, 0.12, 0.6, 0, 0.93, 0);
      boxAt(l, this.nightMat(LM.glow('#ffd28a', 0.2), 0.2, 2.6), 0.36, 0.34, 0.36, 0, 1.05, 0, false);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.38, 4), grey);
      roof.position.y = 1.58;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      l.add(roof);
      this.addSpot(s * 3.4, H + 1.2, tz + 0.4, 0.6, '#ffcf8a');
      this.lightHalo(l, 0, 1.22, 0, 2.3, '#ffcf8a', 0.75);
      this.lightPool(l, 0, 0.6, 3.2, 3.2, '#ffcf8a', 0.42);
    }
    // muret bas au nord (ouvert devant le torii)
    const wall = shared.std('#c4bcae', 0.9);
    for (const s of [-1, 1]) boxAt(this.root, wall, 18.6, 0.6, 0.4, s * 12.7, H, -27.3);
    this.sleepingCat(-5.4, H + 0.6, -27.3, 0.1, '#3a3330', '#f1ece4');

    // cerisiers en fleurs + pétales qui tombent
    const trunkM = shared.std('#5b3f2e', 0.9);
    const pinkA = '#f7b6c8';
    const pinkB = '#ffd3df';
    const tr = mulberry(31);
    const treeSpots: [number, number][] = [
      [-19.5, -24.4],
      [-14.2, -25.8],
      [-8.6, -24.6],
      [8.6, -24.6],
      [14.2, -25.8],
      [19.5, -24.4],
    ];
    for (const [x, z] of treeSpots) {
      const TMs = new MatSet();
      const t = new THREE.Group();
      t.position.set(x, H, z);
      this.root.add(t);
      const trunk = cylAt(t, trunkM, 0.16, 0.24, 2.2, 0, 0, 0, 8);
      trunk.rotation.z = (tr() - 0.5) * 0.15;
      const pa = TMs.std(pinkA, 0.8);
      const pb = TMs.std(pinkB, 0.8);
      for (let k = 0; k < 5; k++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05 - k * 0.08, 1), k % 2 ? pb : pa);
        const a = (k / 5) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.8 * (k ? 1 : 0), 2.7 + (k ? tr() * 0.6 : 0.6), Math.sin(a) * 0.8 * (k ? 1 : 0));
        f.scale.y = 0.75;
        f.castShadow = true;
        t.add(f);
      }
      this.occluders.push({ box: new THREE.Box3(new THREE.Vector3(x - 2, H + 1.5, z - 2), new THREE.Vector3(x + 2, H + 4.4, z + 2)), mats: [...TMs.list, trunkM].filter((m) => m !== trunkM), opacity: 1 });
    }
    const N = 90;
    const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.1), new THREE.MeshStandardMaterial({ color: '#ffc2d4', roughness: 0.8, side: THREE.DoubleSide }), N);
    petals.castShadow = false;
    petals.frustumCulled = false;
    this.root.add(petals);
    const st = Array.from({ length: N }, (_, i) => {
      const src = treeSpots[i % treeSpots.length];
      return { sx: src[0], sz: src[1], x: 0, y: 0, z: 0, ph: tr() * 10, sp: 0.35 + tr() * 0.3, life: tr() };
    });
    const spawn = (p: (typeof st)[number]) => {
      p.x = p.sx + (tr() - 0.5) * 3;
      p.z = p.sz + (tr() - 0.5) * 3;
      p.y = H + 2.6 + tr() * 1.2;
    };
    st.forEach((p) => {
      spawn(p);
      p.y = H + 0.3 + tr() * 3.5;
    });
    const d = new THREE.Object3D();
    this.animated.push((t, dt) => {
      st.forEach((p, i) => {
        p.y -= p.sp * dt;
        p.x += (Math.sin(t * 1.3 + p.ph) * 0.35 + 0.25) * dt;
        p.z += (Math.cos(t * 0.9 + p.ph) * 0.3 + 0.45) * dt;
        if (p.y < H + 0.03) spawn(p);
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(t * 2 + p.ph, t * 1.3 + p.ph, t * 0.7);
        d.updateMatrix();
        petals.setMatrixAt(i, d.matrix);
      });
      petals.instanceMatrix.needsUpdate = true;
    });
  }

  /** gare du shinkansen au sud de la place, train à quai sur le viaduc */
  private buildFountainStation() {
    const tp = TRAVEL_POINTS.find((t) => districtOf(t) === 'fontaine');
    const F = new Frame(0, FOUNTAIN.stationZ, Math.PI);
    this.root.add(F.group);
    const g = F.group;
    const M = new MatSet();
    const W = 44;
    const D = 7.6;
    const Hh = 6;
    const wall = M.std('#eef1f4', 0.6);
    const roof = M.std('#9aa6b2', 0.8);
    const navy = M.std('#1f3a6b', 0.5);
    const blue = M.std('#1f5fbf', 0.5);
    const front = M.tex(facadeTexture('#eef1f4', '#9fc6e0', '#1f3a6b', 16, 2, 0.3, 91));
    boxAt(g, [wall, wall, roof, roof, front, wall], W, Hh, D, 0, 0, -D / 2);
    boxAt(g, blue, W + 0.1, 0.3, 0.06, 0, 4.0, 0.03);
    // viaduc sur le toit + train à quai
    const deckY = Hh;
    boxAt(g, M.std('#c9ced6', 0.8), 52, 0.7, 5.2, 0, deckY, -D / 2);
    for (const x of [-24, 24]) boxAt(g, M.std('#b5bcc6', 0.85), 1.4, deckY, 4.2, x, 0, -D / 2);
    boxAt(g, M.std('#dfe4ea', 0.5), 52, 0.8, 0.18, 0, deckY + 0.7, -D / 2 + 2.5);
    boxAt(g, M.std('#dfe4ea', 0.5), 52, 0.8, 0.18, 0, deckY + 0.7, -D / 2 - 2.5);
    // poteaux caténaires
    const pole = M.std('#7d8793', 0.5);
    for (let x = -22; x <= 22; x += 11) {
      boxAt(g, pole, 0.16, 3.4, 0.16, x, deckY + 0.7, -D / 2 - 2.3);
      boxAt(g, pole, 0.12, 0.12, 2.6, x, deckY + 3.8, -D / 2 - 1.1);
    }
    const train = makeShinkansen({ cars: 3 });
    train.group.position.set(0, deckY + 0.72, -D / 2);
    g.add(train.group);
    train.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (!M.list.includes(m)) M.list.push(m);
      }
    });

    // grande enseigne + nom de la gare
    const sm = this.nightMat(M.tex(signTexture('噴水広場駅', 'FUNSUI-HIROBA · ふんすいひろば', '#1f3a6b', '#ffffff', '#f2c230', 5), 0.5, 0.45), 0.45, 1.15);
    boxAt(g, faceMats(navy, sm, [4]), 10, 2, 0.25, 0, Hh - 2.0, 0.13);
    // entrée vitrée
    const sf = this.nightMat(M.tex(storefrontTexture('station', '#9fc6e0', '#1f3a6b'), 0.3, 0.5), 0.5, 1.2);
    planeAt(g, sf, 14, 3.0, -8, 1.6, 0.02);
    planeAt(g, sf, 10, 3.0, 12, 1.6, 0.02);

    // marquise
    const canopyD = 3.2;
    const cm = M.std('#f4f6f8', 0.5);
    boxAt(g, cm, 30, 0.26, canopyD, 0, 3.55, canopyD / 2);
    boxAt(g, blue, 30.04, 0.16, 0.08, 0, 3.6, canopyD);
    for (let x = -12; x <= 12; x += 6) {
      boxAt(g, this.nightMat(M.glow('#eef6ff', 1.2), 1.2, 3.0), 2, 0.05, 0.25, x, 3.5, canopyD / 2, false);
      const p = F.toWorld(x, canopyD / 2);
      if (x % 12 === 0) this.addSpot(p.x, 3.1, p.z, 1.0, '#eef6ff');
      this.lightPool(g, x, canopyD / 2, 3.6, 3.4, '#eef6ff', 0.26);
    }
    this.occluders.push({ box: F.box3(0, canopyD / 2, 30, canopyD, 3.4, 3.9), mats: [cm], opacity: 1 });

    // portiques du shinkansen derrière l'agent (bleus)
    const ax = -(tp?.x ?? -6.2);
    const gateBody = M.std('#dfe5ec', 0.4);
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      const x = ax + k * 1.3;
      boxAt(g, gateBody, 0.36, 1.0, 0.9, x, 0, 0.55);
      boxAt(g, blue, 0.4, 0.06, 0.94, x, 1.0, 0.55);
      boxAt(g, M.glow('#3fdc7a', 1.6), 0.26, 0.1, 0.02, x, 0.75, 1.01, false);
    }
    F.collider(this.collision, ax, 0.55, 6.0, 0.95);
    // panneau « 新幹線のりば » et tableau des départs (ゆき = à destination de)
    const ns = this.nightMat(M.tex(signTexture('新幹線のりば', 'SHINKANSEN · しんかんせん', '#1f5fbf', '#ffffff', '#f2c230', 4.6), 0.5, 0.45), 0.45, 1.2);
    boxAt(g, faceMats(navy, ns, [4]), 4.6, 1.0, 0.2, ax, 2.4, 0.1);
    const ek = DISTRICTS.ekimae;
    const board = this.nightMat(M.tex(departureTexture(ek.nameJp, ek.reading, ek.nameFr), 0.5, 1.0), 0.6, 1.4);
    boxAt(g, faceMats(navy, board, [4]), 4.4, 1.72, 0.14, ax, 3.82, canopyD - 0.5);

    F.collider(this.collision, 0, -D / 2, W, D);
    if (tp) this.groundChevrons(tp.x ?? -6.2, 9.8, 12.8, 3, Math.PI);
  }

  private buildFountainFillers() {
    const rnd = mulberry(4242);
    const block = this.blockMaker(rnd);
    const lr = mulberry(78);
    const P = FOUNTAIN.plinth;
    // les rangées latérales s'arrêtent avant la gare : au-delà, le viaduc et ses
    // piliers descendent sur un sol dégagé (sinon ils traversent les toits)
    const endZ = 17.2;
    const next = (z: number, d: number) => (endZ - (z + d) < 2.5 ? endZ : z + d);
    // ouest : immeubles hauts (arrière-plan)
    for (let z = P.minZ; z < endZ; ) {
      const z1 = next(z, 4 + rnd() * 3);
      const h = block(-26, -22.2, z + 0.1, z1 - 0.1, 9, 16);
      if (z1 - z > 3.4 && lr() < 0.6) this.laundryBalcony(-22.2, LAYOUT.sidewalkHeight + h - 2.6 - Math.floor(lr() * 2) * 2.6, (z + z1) / 2, lr);
      z = z1;
    }
    // est : maisons basses à deux pans (côté caméra)
    for (let z = P.minZ; z < endZ; ) {
      const z1 = next(z, 4 + rnd() * 2.5);
      block(22.3, 25.8, z + 0.25, z1 - 0.25, 1.8, 2.6, 'gable');
      z = z1;
    }
    // entre les boutiques sud et la gare
    block(-21.9, -13.2, 14.3, 17.2, 5, 7);
    block(13.2, 21.9, 14.3, 17.2, 2.2, 2.8, 'gable');
    // derrière la gare : skyline
    for (let x = -26; x < 26; ) {
      const w = 4 + rnd() * 4;
      block(x + 0.2, Math.min(26, x + w) - 0.2, 26.4, 32.6, 10, 20);
      x += w;
    }
  }

  /* ───────────────────────── petites scènes de vie ───────────────────────── */

  /** noren (rideau d'entrée) qui ondule doucement, accroché par le haut */
  private swayNoren(m: THREE.Mesh, h: number, ph = 0) {
    m.geometry.translate(0, -h / 2, 0);
    m.position.y += h / 2;
    this.animated.push((t) => {
      // ne balance que vers la rue : jamais à travers la façade
      m.rotation.x = -0.06 * (0.55 + 0.45 * Math.sin(t * 1.1 + ph) + 0.12 * Math.sin(t * 2.7 + ph * 2));
    });
  }

  /** chat roulé en boule qui dort (respiration lente, oreille qui frémit) */
  private sleepingCat(x: number, y: number, z: number, rotY: number, fur: string, head: string) {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.rotation.y = rotY;
    this.root.add(c);
    const furM = shared.std(fur, 0.95);
    const headM = shared.std(head, 0.95);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), furM);
    body.scale.set(1.25, 0.6, 0.85);
    body.position.y = 0.11;
    body.castShadow = true;
    c.add(body);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), headM);
    hd.position.set(0.17, 0.1, 0.07);
    hd.castShadow = true;
    c.add(hd);
    const ears: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), headM);
      e.position.set(0.19, 0.2, 0.07 + s * 0.05);
      e.rotation.z = -0.35;
      c.add(e);
      ears.push(e);
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 6, 16, Math.PI * 1.05), furM);
    tail.rotation.x = -Math.PI / 2;
    tail.rotation.z = Math.PI * 0.05;
    tail.position.y = 0.04;
    c.add(tail);
    this.animated.push((t) => {
      const b = Math.sin(t * 1.7 + x);
      body.scale.y = 0.6 * (1 + 0.05 * b);
      hd.position.y = 0.1 + 0.004 * b;
      // de temps en temps, une oreille frémit (mouvement doux, sans à-coup)
      ears[0].rotation.x = 0.35 * Math.pow(Math.max(0, Math.sin(t * 0.7 + z)), 24);
    });
  }

  /** vélo de ville (mamachari) garé, posé sur sa béquille */
  private parkedBike(x: number, z: number, rotY: number, frame: string) {
    const b = new THREE.Group();
    b.position.set(x, LAYOUT.sidewalkHeight, z);
    b.rotation.y = rotY;
    b.rotation.x = 0.04;
    this.root.add(b);
    const fm = shared.std(frame, 0.5);
    const tire = shared.std('#2a2a2a', 0.8);
    const chrome = shared.std('#b9bcc0', 0.35);
    for (const wx of [-0.5, 0.52]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 22), tire);
      w.position.set(wx, 0.33, 0);
      w.castShadow = true;
      b.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, 0.33, 0);
      b.add(hub);
    }
    const up = new THREE.Vector3(0, 1, 0);
    const rod = (ax: number, ay: number, bx: number, by: number, r: number, m: THREE.Material, az = 0, bz = 0) => {
      const a = new THREE.Vector3(ax, ay, az);
      const d = new THREE.Vector3(bx, by, bz).sub(a);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(up, d.normalize());
      mesh.castShadow = true;
      b.add(mesh);
    };
    // cadre bas (col de cygne), fourche, tige de selle, guidon
    rod(-0.5, 0.33, -0.18, 0.4, 0.028, fm);
    rod(-0.18, 0.4, 0.38, 0.62, 0.028, fm);
    rod(-0.18, 0.4, -0.24, 0.8, 0.025, fm);
    rod(-0.5, 0.33, -0.24, 0.72, 0.02, fm);
    rod(0.52, 0.33, 0.4, 0.92, 0.024, chrome);
    rod(0.4, 0.95, 0.4, 0.95, 0.018, chrome, -0.24, 0.24);
    boxAt(b, shared.std('#3a2f2a', 0.7), 0.24, 0.06, 0.12, -0.25, 0.8, 0);
    // panier avant + garde-boue
    boxAt(b, shared.std('#9aa0a6', 0.45), 0.26, 0.2, 0.32, 0.6, 0.78, 0);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 4, 12, Math.PI * 0.6), fm);
    guard.position.set(-0.5, 0.33, 0);
    guard.rotation.z = Math.PI * 0.25;
    b.add(guard);
  }

  private clothMats = new Map<string, THREE.MeshStandardMaterial>();
  /** petit balcon avec du linge qui sèche (façade orientée vers +x) */
  private laundryBalcony(x: number, y: number, z: number, rnd: () => number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.root.add(g);
    const concrete = shared.std('#d8d4cc', 0.85);
    boxAt(g, concrete, 0.8, 0.1, 2.6, 0.4, 0, 0);
    boxAt(g, concrete, 0.06, 0.8, 2.6, 0.77, 0.1, 0, true);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), shared.std('#9aa0a6', 0.4));
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0.5, 1.7, 0);
    g.add(pole);
    const cols = ['#ffffff', '#cfe3f2', '#f6c9d3', '#fbe7a8', '#bfe0c4', '#f2f2f2'];
    const pivots: THREE.Object3D[] = [];
    let cz = -1.0;
    while (cz < 1.0) {
      const w = 0.32 + rnd() * 0.25;
      const h = 0.4 + rnd() * 0.3;
      if (cz + w > 1.1) break;
      const pv = new THREE.Object3D();
      pv.position.set(0.5, 1.7, cz + w / 2);
      g.add(pv);
      const col = cols[Math.floor(rnd() * cols.length)];
      let mat = this.clothMats.get(col);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide });
        this.clothMats.set(col, mat);
      }
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      cloth.rotation.y = Math.PI / 2;
      cloth.position.y = -h / 2;
      cloth.castShadow = true;
      pv.add(cloth);
      pivots.push(pv);
      cz += w + 0.08;
    }
    this.animated.push((t) => {
      pivots.forEach((pv, i) => {
        pv.rotation.z = 0.05 * Math.sin(t * 1.3 + i * 0.9 + z) + 0.02 * Math.sin(t * 3.1 + i);
      });
    });
  }

  /** plante en pot près d'une porte (coordonnées locales de la boutique) */
  private doorPlant(F: Frame, lx: number, lz: number, M: MatSet, kind: number) {
    const g = F.group;
    cylAt(g, M.std(kind % 2 ? '#b8643e' : '#e7e1d6', 0.8), 0.24, 0.18, 0.42, lx, 0, lz, 12);
    // terre : son dessus dépasse nettement le bord du pot (sinon les deux faces se superposent et scintillent)
    cylAt(g, M.std('#4a3626', 0.95), 0.21, 0.21, 0.04, lx, 0.4, lz, 12, false);
    const leafA = shared.std('#5f9a4a', 0.85);
    const leafB = shared.std('#7bb35a', 0.85);
    if (kind % 2) {
      // petit arbuste rond
      for (let k = 0; k < 3; k++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24 - k * 0.04, 0), k % 2 ? leafB : leafA);
        f.position.set(lx + (k - 1) * 0.06, 0.62 + k * 0.17, lz + (k % 2) * 0.05);
        f.rotation.set(k, k * 2, k * 3);
        f.castShadow = true;
        g.add(f);
      }
    } else {
      // plante à longues feuilles
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const lf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 4), k % 2 ? leafB : leafA);
        lf.position.set(lx + Math.cos(a) * 0.08, 0.7, lz + Math.sin(a) * 0.08);
        lf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
        lf.castShadow = true;
        g.add(lf);
      }
    }
    F.collider(this.collision, lx, lz, 0.5, 0.5);
  }

  /* ───────────────────────── bâtiments de fond ───────────────────────── */

  private buildFillers() {
    const rnd = mulberry(2024);
    const block = this.blockMaker(rnd);
    this.fillerSides(rnd, block);
  }

  /** fabrique d'immeubles « de fond » (façade texturée, toit plat ou à deux pans) */
  private blockMaker(rnd: () => number) {
    const H = LAYOUT.sidewalkHeight;
    const palette = ['#d9cfc1', '#c7b9a6', '#e6dccb', '#b8b2a8', '#d4c3b4', '#cfd5d8', '#e2d2c0', '#bfae9b'];
    const winCols = ['#9fc6e0', '#b7d3e6', '#cfe0ea'];
    const block = (minX: number, maxX: number, minZ: number, maxZ: number, hMin: number, hMax: number, roofStyle: 'flat' | 'gable' = 'flat') => {
      const w = maxX - minX;
      const d = maxZ - minZ;
      const h = hMin + rnd() * (hMax - hMin);
      const wall = palette[Math.floor(rnd() * palette.length)];
      const ft = facadeTexture(wall, winCols[Math.floor(rnd() * winCols.length)], shade(wall, -0.3), Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(h / 2.6)), 0.3, Math.floor(rnd() * 999));
      const st = facadeTexture(wall, winCols[0], shade(wall, -0.3), Math.max(1, Math.round(d / 2.6)), Math.max(1, Math.round(h / 2.6)), 0.3, Math.floor(rnd() * 999));
      const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85 });
      const sm = new THREE.MeshStandardMaterial({ map: st, roughness: 0.85 });
      const roof = shared.std(shade(wall, -0.25), 0.9);
      boxAt(this.root, [sm, sm, roof, roof, fm, fm], w, h, d, (minX + maxX) / 2, H, (minZ + maxZ) / 2);
      if (roofStyle === 'gable') {
        // toit en croupe (tuiles kawara) qui déborde un peu des murs, posé sur une
        // fine planche de rive : aucune face coplanaire avec la maison
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const tones = ['#5d6875', '#7a5444', '#67544a', '#50606e'];
        const tone = tones[Math.abs(Math.round(minX * 7 + minZ * 13)) % tones.length];
        const ow = w + 0.4;
        const od = d + 0.4;
        boxAt(this.root, shared.std(shade(tone, -0.25), 0.85), ow, 0.16, od, cx, H + h - 0.06, cz);
        const r = new THREE.Mesh(hipRoofGeometry(ow, od, Math.min(ow, od) * 0.32), shared.std(tone, 0.75));
        r.position.set(cx, H + h + 0.1, cz);
        r.castShadow = true;
        r.receiveShadow = true;
        this.root.add(r);
      } else if (rnd() < 0.5) {
        boxAt(this.root, shared.std('#c9c7c2', 0.7), Math.min(1.4, w * 0.3), 0.6, Math.min(1.2, d * 0.3), (minX + maxX) / 2 + (rnd() - 0.5) * w * 0.4, H + h, (minZ + maxZ) / 2);
      }
      return h;
    };
    return block;
  }

  private fillerSides(rnd: () => number, block: ReturnType<World['blockMaker']>) {
    const H = LAYOUT.sidewalkHeight;
    const lr = mulberry(77); // détails de vie : tirage séparé (ne change pas les immeubles)
    // ouest : immeubles hauts derrière les boutiques
    for (let z = LAYOUT.plinth.minZ; z < LAYOUT.avenueEndZ; ) {
      const d = 4 + rnd() * 3;
      const mx = -19 + rnd() * 0.3;
      const z1 = Math.min(LAYOUT.avenueEndZ, z + d) - 0.1;
      const h = block(-26, mx, z + 0.1, z1, 9, 17);
      if (z1 - z > 3.4 && lr() < 0.6) this.laundryBalcony(mx, H + h - 2.6 - Math.floor(lr() * 2) * 2.6, (z + z1) / 2, lr);
      z += d;
    }
    this.collision.addRect(-22.4, (LAYOUT.plinth.minZ + LAYOUT.avenueEndZ) / 2, 7.2, LAYOUT.avenueEndZ - LAYOUT.plinth.minZ);
    // est : maisons basses (côté caméra)
    for (let z = LAYOUT.plinth.minZ; z < LAYOUT.avenueEndZ; ) {
      const d = 4 + rnd() * 2.5;
      if (rnd() < 0.25) {
        // petit jardin
        const tz = z + d / 2;
        const leaf = shared.std('#6aa356', 0.85);
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), leaf);
        bush.position.set(22, H + 1.1, tz);
        bush.castShadow = true;
        this.root.add(bush);
      } else {
        block(19.5, 25.5, z + 0.25, Math.min(LAYOUT.avenueEndZ, z + d) - 0.25, 1.8, 2.8, 'gable');
      }
      z += d;
    }
    this.collision.addRect(22.4, (LAYOUT.plinth.minZ + LAYOUT.avenueEndZ) / 2, 7.2, LAYOUT.avenueEndZ - LAYOUT.plinth.minZ);
    // extrémité nord : un immeuble de chaque côté ferme le bout de l'avenue
    // (ouest plus haut, est bas : la vue depuis la caméra reste dégagée)
    const nz0 = LAYOUT.plinth.minZ + 0.25;
    const nz1 = DECOR.vendingGapsZ[0] - 1.6;
    block(-18.6, -LAYOUT.frontX - 0.1, nz0, nz1, 8, 10.5);
    block(LAYOUT.frontX + 0.1, 18.6, nz0, nz1, 2.4, 3.2, 'gable');
    for (const s of [-1, 1]) this.collision.addRect(s * (LAYOUT.frontX + 18.6) / 2, (nz0 + nz1) / 2, 18.6 - LAYOUT.frontX, nz1 - nz0);
    // ruelles fermées par un muret au fond
    const wallM = shared.std('#b3aa9d', 0.9);
    for (const z of DECOR.vendingGapsZ.concat([5.5])) {
      for (const s of [-1, 1]) {
        boxAt(this.root, wallM, 0.3, 1.4, 2.9, s * 18.8, H, z);
        this.collision.addRect(s * 18.8, z, 0.3, 3);
      }
    }
    // un chat roux endormi sur un muret de ruelle (bout visible depuis la caméra)
    this.sleepingCat(18.8, H + 1.4, DECOR.vendingGapsZ[2] - 0.95, Math.PI / 2, '#e39a4e', '#eaa860');
    // côtés de la place
    // ouest : le kōban occupe la façade ; un seul immeuble, reculé derrière lui sur
    // toute la longueur de la place (pas de façades en escalier qui s'emboîtent)
    const koban = LOCATIONS.find((l) => l.style === 'koban');
    const backX = (koban?.x ?? -18) - (koban?.depth ?? 0) - 0.2;
    block(-26, backX, LAYOUT.avenueEndZ + 0.15, 17 - 0.15, 9, 11);
    for (let z = LAYOUT.avenueEndZ; z < 17; ) {
      const d = 3.5 + rnd() * 2;
      block(18.5, 26, z + 0.25, Math.min(17, z + d) - 0.25, 2, 3, 'gable');
      z += d;
    }
    this.collision.addRect(-22, 11.5, 8, 11);
    this.collision.addRect(22.25, 11.5, 7.5, 11);
    // derrière la gare : skyline
    for (let x = -26; x < 26; ) {
      const w = 4 + rnd() * 4;
      block(x + 0.2, Math.min(26, x + w) - 0.2, 27.5, 33.5, 10, 20);
      x += w;
    }
    // côtés de la gare
    block(-26, -17.5, 17.5, 27, 8, 11);
    block(17.5, 26, 17.5, 27, 3, 4.5);
  }

  /* ───────────────────────── izakaya (extrémité nord) ───────────────────────── */

  private lanternGeo: THREE.LatheGeometry | null = null;
  /** chōchin : lanterne en tonneau (profil tourné, pas de sphère) */
  private lantern() {
    if (!this.lanternGeo) {
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push(new THREE.Vector2(0.2 + 0.16 * Math.sin(Math.PI * t), -0.45 + 0.9 * t));
      }
      this.lanternGeo = new THREE.LatheGeometry(pts, 20);
    }
    return this.lanternGeo;
  }

  private buildIzakayaExtras(loc: LocationConfig, F: Frame, M: MatSet) {
    const g = F.group;
    const W = loc.width;
    const left = loc.side === 'left';
    const ex = left ? 3.4 : -3.4;
    const wood = M.std('#2e1d12', 0.85);
    const woodL = M.std('#7a5434', 0.75);

    // kōshi : lattis de bois devant la vitrine (la porte reste libre)
    for (let x = -W / 2 + 0.85; x <= W / 2 - 0.85; x += 0.24) {
      if (Math.abs(x) < 1.2) continue;
      boxAt(g, wood, 0.06, 2.45, 0.06, x, 0.12, 0.07, false);
    }
    boxAt(g, wood, W - 1.4, 0.1, 0.1, 0, 1.15, 0.08, false);
    boxAt(g, wood, W - 1.2, 0.14, 0.14, 0, 0, 0.08, false);
    // poutre de l'entrée
    boxAt(g, woodL, 2.9, 0.18, 0.42, 0, 2.62, 0.22);

    // noren : suspendu la nuit, roulé (rentré) le jour
    const noren = M.tex(norenTexture('#1f2a44', 'いざかや'));
    noren.side = THREE.DoubleSide;
    const hang = planeAt(g, noren, 2.4, 0.95, 0, 2.12, 0.38);
    hang.castShadow = true;
    this.swayNoren(hang, 0.95, loc.z);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.7, 8), woodL);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 2.6, 0.38);
    g.add(rod);
    const rolled = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.4, 14), M.std('#1f2a44', 0.85));
    rolled.rotation.z = Math.PI / 2;
    rolled.position.set(0, 2.47, 0.38);
    rolled.castShadow = true;
    g.add(rolled);
    this.nightOnly.push(hang);
    this.dayOnly.push(rolled);

    // deux akachōchin (lanternes rouges) : éteintes le jour, allumées la nuit
    const lmat = this.nightMat(M.tex(lanternTexture('酒'), 0.6, 0.05), 0.05, 2.1);
    const cap = M.std('#1a1a1a', 0.6);
    const halo = this.nightMat(new THREE.SpriteMaterial({ map: glowTexture('#ff6a3d'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.95, 'opacity');
    for (const s of [-1.95, 1.95]) {
      const l = new THREE.Mesh(this.lantern(), lmat);
      l.position.set(s, 1.95, 0.55);
      l.castShadow = true;
      g.add(l);
      cylAt(g, cap, 0.2, 0.2, 0.08, s, 2.4, 0.55);
      cylAt(g, cap, 0.2, 0.2, 0.08, s, 1.42, 0.55);
      boxAt(g, cap, 0.03, 0.2, 0.03, s, 2.48, 0.55, false);
      const sp = new THREE.Sprite(halo);
      sp.position.set(s, 1.95, 0.75);
      sp.scale.set(2.3, 2.3, 1);
      g.add(sp);
      const wp = F.toWorld(s, 1.0);
      this.addSpot(wp.x, 2.0, wp.z, 1.1, '#ff7a45');
    }
    this.lightPool(g, 0, 1.4, W - 0.6, 3.4, '#ff8a55', 0.3);
    this.addSteam(g, 0, 2.75, 1.5, 0); // ouvert la nuit seulement
    // guirlande de petites lanternes sous l'auvent
    const mini = this.nightMat(M.glow('#ffe2a8', 0.1), 0.1, 1.7);
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 1.2 + (i * (W - 2.4)) / 8;
      if (Math.abs(Math.abs(x) - 1.95) < 0.5) continue;
      const l = new THREE.Mesh(this.lantern(), i % 2 ? lmat : mini);
      l.scale.setScalar(0.42);
      l.position.set(x, 2.3, 1.22);
      g.add(l);
    }
    // lueur chaude au sol devant l'entrée (nuit)
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 3.6),
      this.nightMat(new THREE.MeshBasicMaterial({ map: glowTexture('#ffb060'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 0, 0.5, 'opacity'),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.045, 1.7);
    g.add(pool);

    // tonneaux de saké empilés
    const barrel = M.std('#cfae78', 0.7);
    const hoop = M.std('#2e1d12', 0.6);
    for (const [bx, by] of [
      [ex - 0.38, 0],
      [ex + 0.38, 0],
      [ex, 0.7],
    ]) {
      cylAt(g, barrel, 0.34, 0.34, 0.7, bx, by, 0.55, 16);
      cylAt(g, hoop, 0.355, 0.355, 0.06, bx, by + 0.1, 0.55, 16, false);
      cylAt(g, hoop, 0.355, 0.355, 0.06, bx, by + 0.54, 0.55, 16, false);
    }
    planeAt(g, M.tex(panelTexture(['酒'], '#f4ead8', '#b3261e', 128, 128, 100), 0.6), 0.32, 0.32, ex, 1.05, 0.9);
    F.collider(this.collision, ex, 0.55, 1.5, 0.8);

    // ardoise du menu (おしながき)
    const menu = M.tex(panelTexture(['おしながき', '生ビール ¥500', 'やきとり ¥180', 'えだまめ ¥300'], '#1e1a18', '#fff3d6', 256, 384, 46), 0.7, 0.15);
    const mx = left ? -4.0 : 4.0;
    rboxAt(g, woodL, 0.82, 1.15, 0.1, mx, 0, 0.75, 0.03);
    planeAt(g, menu, 0.7, 1.02, mx, 0.6, 0.81);
    F.collider(this.collision, mx, 0.75, 0.9, 0.4);
  }

  /* ───────────────────────── boulangerie (face à l'izakaya) ───────────────────────── */

  private buildBakeryExtras(loc: LocationConfig, F: Frame, M: MatSet) {
    const g = F.group;
    const left = loc.side === 'left';
    const ex = left ? 3.4 : -3.4;
    const wood = M.std('#8a5a2b', 0.8);
    const crust = [M.std('#c9873f', 0.7), M.std('#a8662a', 0.75), M.std('#e0a95a', 0.7)];
    const melon = M.std('#f0c46a', 0.65);

    // vitrine à pains devant la façade
    const cg = new THREE.Group();
    cg.position.set(ex, 0, 0.7);
    g.add(cg);
    rboxAt(cg, wood, 1.9, 0.85, 0.8, 0, 0, 0, 0.04);
    boxAt(cg, M.std('#f6e7cf', 0.6), 1.8, 0.05, 0.72, 0, 0.85, 0, false);
    const glass = M.std('#ffffff', 0.1, { transparent: true, opacity: 0.3 });
    boxAt(cg, glass, 1.84, 0.5, 0.74, 0, 0.9, 0, false);
    // melon pan (dômes quadrillés) + brioches + baguettes
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), melon);
      m.position.set(-0.7 + i * 0.22, 0.9, -0.15);
      cg.add(m);
    }
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), crust[2]);
      b.scale.set(1, 0.8, 1);
      b.position.set(0.15 + i * 0.22, 0.97, -0.15);
      cg.add(b);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), crust[2]);
      top.position.set(0.15 + i * 0.22, 1.08, -0.15);
      cg.add(top);
    }
    for (let i = 0; i < 3; i++) {
      const bg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.7, 4, 8), crust[i % 2]);
      bg.rotation.z = Math.PI / 2;
      bg.position.set(0, 0.93, 0.15 + i * 0.1 - 0.05);
      cg.add(bg);
    }
    F.collider(this.collision, ex, 0.7, 2.0, 0.9);

    // ardoise du menu
    const menu = M.tex(panelTexture(['やきたて パン', 'メロンパン ¥180', 'ブリオッシュ ¥220', 'コーヒー ¥300'], '#3a2a1e', '#fff3d6', 256, 384, 40), 0.7, 0.15);
    const mx = left ? -4.0 : 4.0;
    rboxAt(g, wood, 0.82, 1.15, 0.1, mx, 0, 0.75, 0.03);
    planeAt(g, menu, 0.7, 1.02, mx, 0.6, 0.81);
    F.collider(this.collision, mx, 0.75, 0.9, 0.4);

    // enseigne suspendue en forme de croissant (lumineuse la nuit)
    const lamp = this.nightMat(M.glow('#ffd9a0', 0.15), 0.15, 1.6);
    const cr = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16, Math.PI * 1.2), crust[0]);
    cr.position.set(left ? 2.2 : -2.2, 3.1, 1.1);
    cr.rotation.z = -Math.PI * 0.1;
    g.add(cr);
    boxAt(g, wood, 0.06, 0.06, 1.0, left ? 2.2 : -2.2, 3.55, 0.6, false);
    // petites lampes au-dessus de l'entrée
    for (const s of [-1.3, 1.3]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), lamp);
      l.position.set(s, 2.75, 0.45);
      g.add(l);
    }
  }

  /* ───────────────────────── passants ───────────────────────── */

  private stops: { z: number; kind: 'cross' | 'vend' }[] = [];

  private buildPassersby(list: { x: number; zFrom: number; zTo: number; speed: number; look: CharacterLook }[], stops: { z: number; kind: 'cross' | 'vend' }[]) {
    this.stops = stops;
    list.forEach((cfg, i) => {
      const ch = new Character(cfg.look as CharacterLook);
      const rnd = mulberry(101 + i * 17);
      const z = cfg.zFrom + (cfg.zTo - cfg.zFrom) * (0.15 + rnd() * 0.7);
      const dir = rnd() < 0.5 ? -1 : 1;
      ch.root.position.set(cfg.x, this.groundHeight(cfg.x, z), z);
      ch.setYaw(dir < 0 ? Math.PI : 0, true);
      this.root.add(ch.root);
      // petits obstacles (< 2 m) qui touchent sa ligne de marche
      const obs = this.collision.rects.filter((r) => r.maxX - r.minX < 2 && r.maxZ - r.minZ < 2 && r.maxX > cfg.x - 0.75 && r.minX < cfg.x + 0.75 && r.maxZ > cfg.zFrom - 1 && r.minZ < cfg.zTo + 1);
      this.walkers.push({ ch, x: cfg.x, z, from: cfg.zFrom, to: cfg.zTo, dir, speed: cfg.speed, wait: rnd() * 1.5, lastStop: NaN, faceYaw: null, rnd, obs, off: 0 });
    });
  }

  private updateWalkers(dt: number, player?: { x: number; z: number }) {
    for (const w of this.walkers) {
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.faceYaw !== null) w.ch.setYaw(w.faceYaw);
        w.ch.update(dt, 0);
        continue;
      }
      w.faceYaw = null;
      // laisse passer le joueur (s'arrête et le regarde)
      if (player) {
        const dx = player.x - w.x;
        const dz = player.z - w.z;
        if (dx * dx + dz * dz < 1.4 && dz * w.dir > -0.3) {
          w.ch.faceTowards(player.x, player.z);
          w.ch.update(dt, 0);
          continue;
        }
      }
      const nz = w.z + w.dir * w.speed * dt;
      for (const st of this.stops) {
        if (st.z === w.lastStop || (w.z - st.z) * (nz - st.z) > 0) continue;
        w.lastStop = st.z;
        if (w.rnd() < 0.5) {
          w.wait = 1.6 + w.rnd() * 2.4;
          // passage piéton : regarde la route · distributeur : regarde la machine
          const out = w.x > 0 ? Math.PI / 2 : -Math.PI / 2;
          w.faceYaw = st.kind === 'cross' ? -out : out;
        }
      }
      w.z = nz;
      if (w.z < w.from || w.z > w.to) {
        w.z = Math.min(w.to, Math.max(w.from, w.z));
        w.dir = -w.dir;
        w.wait = 0.6 + w.rnd() * 1.2;
        w.faceYaw = w.dir < 0 ? Math.PI : 0;
        w.lastStop = NaN;
      }
      // pas de côté autour des obstacles (PNJ, lampadaire, arbre), en douceur
      let want = 0;
      for (const r of w.obs) {
        if (r.off) continue;
        const hz = (r.maxZ - r.minZ) / 2;
        const dz = Math.abs(w.z - (r.minZ + r.maxZ) / 2) - hz;
        if (dz > 1.4) continue;
        const left = r.minX - 0.4 - w.x;
        const right = r.maxX + 0.4 - w.x;
        if (left >= 0 || right <= 0) continue;
        const need = -left < right ? left : right;
        const k = Math.min(1, Math.max(0, (1.4 - dz) / 1.0));
        const o = need * k * k * (3 - 2 * k);
        if (Math.abs(o) > Math.abs(want)) want = o;
      }
      w.off += (want - w.off) * Math.min(1, dt * 6);
      const wx = w.x + w.off;
      w.ch.root.position.set(wx, this.groundHeight(wx, w.z), w.z);
      if (w.wait <= 0) w.ch.setYaw(w.dir < 0 ? Math.PI : 0);
      w.ch.update(dt, w.wait > 0 ? 0 : Math.min(1, w.speed / 3));
    }
  }

  /* ───────────────────────── mise à jour ───────────────────────── */

  update(t: number, dt: number, near: NpcInstance | null, active: NpcInstance | null, player?: { x: number; z: number }) {
    for (const n of this.npcs) {
      const isActive = n === active;
      n.halo.visible = !isActive;
      const isNear = n === near && !n.closed;
      const pulse = 1 + Math.sin(t * 3 + n.pos.x) * (n.closed ? 0.02 : 0.06) + (isNear ? 0.15 : 0);
      n.halo.scale.setScalar(pulse);
      (n.haloRing.material as THREE.MeshBasicMaterial).opacity = n.closed ? 0.45 : isNear ? 1 : 0.75;
      (n.haloGlow.material as THREE.MeshBasicMaterial).opacity = n.closed ? 0.2 : (isNear ? 0.8 : 0.45) + Math.sin(t * 3) * 0.1;
      // onde qui s'élargit puis s'efface
      const k = ((t * 0.65 + n.pos.z * 0.13) % 1 + 1) % 1;
      n.haloRipple.scale.setScalar(1 + k * 0.9);
      (n.haloRipple.material as THREE.MeshBasicMaterial).opacity = n.closed || n.done ? 0 : (1 - k) * (isNear ? 0.9 : 0.55);
      // colonne de lumière quand on passe devant la boutique (visible même si le
      // PNJ est caché derrière la façade, côté caméra)
      let want = 0;
      if (player && !n.closed && !isActive) {
        const d = Math.hypot(player.x - n.haloPos.x, player.z - n.haloPos.z);
        want = d < 9 ? (n.done ? 0.45 : 1) : 0;
      }
      n.beamK += (want - n.beamK) * Math.min(1, dt * 4);
      if (n.beamK < 0.005 && want === 0) n.beamK = 0;
      n.haloBeam.visible = n.beamK > 0;
      (n.haloBeam.material as THREE.MeshBasicMaterial).opacity = n.beamK * ((isNear ? 0.75 : 0.55) + Math.sin(t * 3 + n.pos.x) * 0.08);
      n.label.visible = !isActive && this.labelFade < 0.99;
      (n.label.material as THREE.SpriteMaterial).opacity = 1 - this.labelFade;
      n.label.position.y = n.character.root.position.y + 2.75 + Math.sin(t * 2 + n.pos.z) * 0.06;
      n.character.update(dt, 0);
    }
    // distributeurs : lumière stable (plus de scintillement)
    const f = this.nightF;
    for (const v of this.vending) {
      v.face.emissiveIntensity = 0.62 + 0.8 * f;
      v.glow.opacity = 0.45 + 0.5 * f;
    }
    this.updateWalkers(dt, player);
    for (const a of this.animated) a(t, dt);
  }

  /** Rend translucides les bâtiments qui masquent les points donnés */
  updateOcclusion(samples: THREE.Vector3[], towardCamera: THREE.Vector3, dt: number) {
    for (const o of this.occluders) {
      let hit = false;
      for (const p of samples) {
        this.ray.set(p, towardCamera);
        if (this.ray.intersectsBox(o.box)) {
          hit = true;
          break;
        }
      }
      const target = hit ? 0.18 : 1;
      if (Math.abs(o.opacity - target) < 0.001) continue;
      o.opacity += (target - o.opacity) * Math.min(1, dt * 8);
      if (Math.abs(o.opacity - target) < 0.01) o.opacity = target;
      const fading = o.opacity < 0.99;
      for (const m of o.mats) {
        // valeurs d'origine (vitres déjà translucides, etc.) : on les module au lieu de les écraser
        let b = this.matBase.get(m);
        if (!b) {
          b = { opacity: m.opacity, transparent: m.transparent };
          this.matBase.set(m, b);
        }
        const transparent = b.transparent || fading;
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.needsUpdate = true;
        }
        m.opacity = b.opacity * o.opacity;
        // depthWrite conservé : sans lui, l'intérieur du bâtiment translucide se
        // mélange dans le désordre (faces qui clignotent selon l'angle)
      }
    }
  }
}
