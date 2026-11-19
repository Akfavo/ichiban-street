/**
 * Boucle de jeu : rendu, caméra isométrique orthographique qui suit le joueur,
 * déplacements relatifs à l'écran, détection des halos et mise en scène des dialogues.
 */
import * as THREE from 'three';
import { CAMERA, FOUNTAIN, GAMEPLAY, LAYOUT, LIGHTING, PLAYER, type DistrictId } from '../data/cityConfig';
import { Character } from './character';
import { Controls } from './controls';
import { World, type Bench, type NpcInstance } from './world';

const DEG = Math.PI / 180;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  /** les deux quartiers (un seul visible à la fois) */
  readonly worlds: Record<DistrictId, World>;
  district: DistrictId = 'ekimae';
  readonly player: Character;
  readonly controls = new Controls();

  /** appelé quand le joueur engage la conversation avec un PNJ */
  onTalk: ((npc: NpcInstance) => void) | null = null;
  /** PNJ à portée (pour l'invite « Espace pour parler ») */
  onNearChange: ((npc: NpcInstance | null) => void) | null = null;
  /** banc à portée / assis (invite « s'asseoir » ou « se lever ») */
  onSeatChange: ((state: 'near' | 'seated' | null) => void) | null = null;
  /** après chaque image rendue du diorama (repères à l'écran) */
  onFrame: (() => void) | null = null;

  private clock = new THREE.Clock();
  private elapsed = 0;
  private offset = new THREE.Vector3();
  private toCamera = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private target = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private zoom = 1;
  private desiredZoom = 1;
  private sun: THREE.DirectionalLight;
  private sunAx = new THREE.Vector3();
  private sunAy = new THREE.Vector3();
  private sunAz = new THREE.Vector3();
  private sunSnap = new THREE.Vector3();
  private hemi: THREE.HemisphereLight;
  /** 0 = jour, 1 = nuit (interpolé) */
  private nightF = 0;
  private nightTarget = 0;
  private cA = new THREE.Color();
  private cB = new THREE.Color();
  private pos = { x: PLAYER.start.x, z: PLAYER.start.z };
  private near: NpcInstance | null = null;
  private active: NpcInstance | null = null;
  private autoArmed = true;
  private cooldown = 0;
  private paused = false;
  /* économie de ressources : images/s plafonnées selon l'état + résolution adaptative */
  private lastFrame = 0;
  /** qualité graphique choisie dans les paramètres */
  private quality: 'high' | 'eco' = 'high';
  private maxDpr = this.dprCap();
  private dpr = this.maxDpr;
  /** une image à rendre même si le jeu est figé (redimensionnement, entrée en pause) */
  private dirty = true;
  private slowFrames = 0;
  private fastFrames = 0;
  private lastCpuMs = 0;
  private samples: THREE.Vector3[] = [];
  /* déplacement à la souris / au doigt : on maintient le clic, le perso suit le curseur */
  private ptrHeld = false;
  private ptrId = -1;
  private ptrNdc = new THREE.Vector2();
  private walkTarget = new THREE.Vector3();
  private walking = false;
  private stuck = 0;
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private marker: THREE.Mesh;
  /* banc : on s'assoit, la caméra recule pour contempler tout le quartier */
  private seat: Bench | null = null;
  private benchNear: Bench | null = null;
  private seatState: 'near' | 'seated' | null = null;
  /** 0 = debout → 1 = assis (transition du corps) */
  private sitK = 0;
  private standPos = { x: 0, z: 0 };
  private seatPos = { x: 0, z: 0 };
  private viewZoom = 1;
  private viewCenter = new THREE.Vector3();
  private wideShadows = false;
  private tmpV = new THREE.Vector3();
  /** scène plein écran (cinématique du shinkansen) qui remplace le diorama */
  private cinematic: { scene: THREE.Scene; camera: THREE.Camera; update(dt: number): void } | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // caméra
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    const az = CAMERA.azimuthDeg * DEG;
    const el = CAMERA.elevationDeg * DEG;
    const h = CAMERA.distance * Math.cos(el);
    this.offset.set(Math.sin(az) * h, CAMERA.distance * Math.sin(el), -Math.cos(az) * h);
    this.toCamera.copy(this.offset).normalize();
    this.forward.set(-this.offset.x, 0, -this.offset.z).normalize();
    this.right.set(-this.forward.z, 0, this.forward.x);

    // lumières
    this.hemi = new THREE.HemisphereLight(LIGHTING.sky, LIGHTING.ground, LIGHTING.hemiIntensity);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(LIGHTING.sun, LIGHTING.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // repère de la caméra d'ombre (direction fixe) pour caler le suivi sur les texels
    const so0 = LIGHTING.sunOffset;
    new THREE.Matrix4().lookAt(new THREE.Vector3(so0.x, so0.y, so0.z), new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).extractBasis(this.sunAx, this.sunAy, this.sunAz);

    this.worlds = { ekimae: new World(this.scene, 'ekimae'), fontaine: new World(this.scene, 'fontaine') };
    this.worlds.fontaine.root.visible = false;

    this.player = new Character(PLAYER.look);
    this.player.root.position.set(this.pos.x, this.world.groundHeight(this.pos.x, this.pos.z), this.pos.z);
    this.player.setYaw(Math.PI, true);
    this.scene.add(this.player.root);

    this.target.set(this.pos.x, 0, this.pos.z);
    this.desiredTarget.copy(this.target);

    this.controls.onInteract = () => this.tryInteract();

    // repère au sol de la destination (anneau discret, toujours au-dessus du sol)
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 32),
      new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 5;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.bindPointer();

    for (let i = 0; i < 8; i++) this.samples.push(new THREE.Vector3());

    window.addEventListener('resize', this.resize);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  private bindPointer() {
    const cv = this.renderer.domElement;
    cv.style.touchAction = 'none';
    const setNdc = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      this.ptrNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.controls.enabled || this.cinematic) return;
      e.preventDefault();
      // assis : un clic suffit à se relever (sans partir en marche)
      if (this.seat) {
        this.standUp();
        return;
      }
      this.ptrHeld = true;
      this.ptrId = e.pointerId;
      cv.setPointerCapture(e.pointerId);
      setNdc(e);
      this.walking = this.pickGround();
      this.stuck = 0;
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.ptrHeld && e.pointerId === this.ptrId) setNdc(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.ptrId) return;
      this.ptrHeld = false;
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** point du sol sous le curseur → destination */
  private pickGround() {
    this.ray.setFromCamera(this.ptrNdc, this.camera);
    this.groundPlane.constant = -this.player.root.position.y;
    if (!this.ray.ray.intersectPlane(this.groundPlane, this.hit)) return false;
    this.walkTarget.set(this.hit.x, 0, this.hit.z);
    return true;
  }

  private clearWalk() {
    this.walking = false;
    this.ptrHeld = false;
    this.marker.visible = false;
  }

  /** quartier affiché */
  get world(): World {
    return this.worlds[this.district];
  }

  /** change de quartier (pendant la cinématique : aucune transition visible) */
  travelTo(d: DistrictId) {
    if (d === this.district) return;
    this.standUp(true);
    this.world.root.visible = false;
    this.district = d;
    this.world.root.visible = true;
    const s = d === 'fontaine' ? FOUNTAIN.start : { x: 12.6, z: 11.2 };
    this.pos.x = s.x;
    this.pos.z = s.z;
    const p = this.player.root.position;
    p.set(s.x, this.world.groundHeight(s.x, s.z), s.z);
    this.player.setYaw(Math.PI, true);
    this.target.set(s.x, 0, s.z);
    this.desiredTarget.copy(this.target);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.near = null;
    this.autoArmed = false;
    this.cooldown = 1;
    this.clearWalk();
    this.onNearChange?.(null);
    // compile les matériaux du nouveau quartier tout de suite (pas d'à-coup à l'arrivée)
    this.renderer.compile(this.scene, this.camera);
    this.dirty = true;
  }

  /** affiche une scène plein écran à la place du diorama (null = retour au jeu) */
  setCinematic(c: { scene: THREE.Scene; camera: THREE.Camera; update(dt: number): void } | null) {
    this.cinematic = c;
    this.dirty = true;
    this.controls.enabled = !c && !this.paused && !this.active;
    if (c) {
      this.controls.clear();
      this.clearWalk();
    }
    this.clock.getDelta();
  }

  get inDialogue() {
    return this.active !== null;
  }

  setPaused(p: boolean) {
    // une dernière image à jour avant de figer l'écran
    if (p && !this.paused) this.dirty = true;
    this.paused = p;
    this.controls.enabled = !p && !this.active && !this.cinematic;
    if (p) {
      this.controls.clear();
      this.clearWalk();
    }
  }

  /** Base écran pour la mini-carte : coordonnées (droite, haut) d'un point monde */
  toScreenPlane(x: number, z: number) {
    return { u: x * this.right.x + z * this.right.z, v: x * this.forward.x + z * this.forward.z };
  }

  get playerPos() {
    return this.pos;
  }

  get playerYaw() {
    return this.player.root.rotation.y;
  }

  /**
   * densité de pixels plafonnée selon la taille de l'écran : au-delà d'≈ 3,2 Mpx
   * le gain de netteté est invisible mais le coût GPU explose (écrans Retina plein écran)
   */
  private dprCap() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 800;
    const dev = window.devicePixelRatio || 1;
    const q = this.quality === 'eco' ? 1.8e6 : 3.2e6;
    return Math.max(1, Math.min(dev, 2, Math.sqrt(q / (w * h))));
  }

  setQuality(q: 'high' | 'eco') {
    this.quality = q;
    this.renderer.shadowMap.type = q === 'eco' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.sun.shadow.mapSize.set(q === 'eco' ? 1024 : 2048, q === 'eco' ? 1024 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.maxDpr = this.dprCap();
    this.setDpr(this.maxDpr);
  }

  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const cap = this.dprCap();
    if (Math.abs(cap - this.maxDpr) > 0.01) {
      this.maxDpr = cap;
      this.dpr = Math.min(this.dpr, cap);
      this.renderer.setPixelRatio(this.dpr);
    }
    this.dirty = true;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    if (this.seat) this.computeWideView();
    this.updateFrustum();
  };

  private get aspect() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    return w / Math.max(1, h);
  }

  /** hauteur de vue au zoom 1 (sur écran étroit/portrait on dézoome un peu pour garder la rue visible) */
  private baseView(aspect: number) {
    return CAMERA.viewHeight * (aspect < 1 ? 1.25 : 1);
  }

  private updateFrustum() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    const vh = this.baseView(aspect) / this.zoom;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camera.left = (-vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.updateProjectionMatrix();
  }

  /* ───────────────────────── interactions ───────────────────────── */

  private distTo(p: { x: number; z: number }) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  /** Espace / Entrée, ou clic sur l'invite (écrans tactiles) */
  interact() {
    this.tryInteract();
  }

  private tryInteract() {
    if (this.active || this.paused || this.cinematic) return;
    if (this.seat) {
      this.standUp();
      return;
    }
    if (this.cooldown > 0) return;
    // Espace/Entrée : dans le halo OU à proximité directe du PNJ
    let best: NpcInstance | null = null;
    let bd = Infinity;
    for (const n of this.world.npcs) {
      const d = Math.min(this.distTo(n.haloPos), this.distTo(n.pos) - 0.4);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && bd < GAMEPLAY.interactRadius + 0.9) this.onTalk?.(best);
    else if (this.benchNear) this.sitDown(this.benchNear);
  }

  /* ───────────────────────── bancs ───────────────────────── */

  get seated() {
    return this.seat !== null;
  }

  /** 0 → 1 : avancement du recul de la caméra (vue « contemplation ») */
  get wideK() {
    if (this.viewZoom >= 1) return 0;
    return THREE.MathUtils.clamp(Math.log(this.zoom) / Math.log(this.viewZoom), 0, 1);
  }

  /** banc le plus proche, à portée de main (le joueur doit être devant ou à côté) */
  private findBench(): Bench | null {
    let best: Bench | null = null;
    let bd = 1.75;
    for (const b of this.world.benches) {
      const d = Math.hypot(b.x + Math.sin(b.yaw) * 0.18 - this.pos.x, b.z + Math.cos(b.yaw) * 0.18 - this.pos.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private sitDown(b: Bench) {
    this.seat = b;
    this.standPos.x = this.pos.x;
    this.standPos.z = this.pos.z;
    this.seatPos.x = b.x + Math.sin(b.yaw) * 0.18;
    this.seatPos.z = b.z + Math.cos(b.yaw) * 0.18;
    this.player.setYaw(b.yaw);
    this.controls.clear();
    this.clearWalk();
    this.computeWideView();
    this.desiredZoom = this.viewZoom;
    // ombres sur tout le quartier (fixé avant le recul : pas de saut pendant la transition)
    this.setWideShadows(true);
    this.cooldown = 0.35;
  }

  /** se relève et revient là où il se tenait (`instant` : changement de quartier) */
  standUp(instant = false) {
    if (!this.seat) return;
    this.seat = null;
    this.desiredZoom = this.active ? CAMERA.dialogueZoom : 1;
    this.pos.x = this.standPos.x;
    this.pos.z = this.standPos.z;
    this.cooldown = 0.35;
    if (instant) {
      this.sitK = 0;
      this.player.sit = 0;
      this.zoom = this.desiredZoom;
      this.updateFrustum();
      this.setWideShadows(false);
    }
  }

  private setWideShadows(on: boolean) {
    if (on === this.wideShadows) return;
    this.wideShadows = on;
    const e = on ? 54 : 34;
    const sc = this.sun.shadow.camera;
    sc.left = -e;
    sc.right = e;
    sc.top = e;
    sc.bottom = -e;
    sc.far = on ? 160 : 120;
    sc.updateProjectionMatrix();
  }

  /** cadre tout le socle du quartier (bâtiments compris) à l'écran */
  private computeWideView() {
    const pl = this.district === 'fontaine' ? FOUNTAIN.plinth : LAYOUT.plinth;
    const el = CAMERA.elevationDeg * DEG;
    const se = Math.sin(el);
    const ce = Math.cos(el);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const x of [pl.minX, pl.maxX])
      for (const z of [pl.minZ, pl.maxZ])
        for (const y of [-pl.thickness, 9]) {
          const u = x * this.right.x + z * this.right.z;
          const v = (x * this.forward.x + z * this.forward.z) * se + y * ce;
          u0 = Math.min(u0, u);
          u1 = Math.max(u1, u);
          v0 = Math.min(v0, v);
          v1 = Math.max(v1, v);
        }
    const aspect = this.aspect;
    const base = this.baseView(aspect);
    // marges : barre du haut, invite en bas, mini-carte
    const needH = (v1 - v0) * 1.12 + 3;
    const needW = (u1 - u0) * 1.06;
    this.viewZoom = Math.min(1, base / needH, (base * aspect) / needW);
    const uc = (u0 + u1) / 2;
    // centre vertical légèrement remonté (l'invite occupe le bas de l'écran)
    const vc = (v0 + v1) / 2 - 0.6;
    // point du sol (y = 0) qui se projette au centre
    const fz = vc / se;
    this.viewCenter.set(uc * this.right.x + fz * this.forward.x, 0, uc * this.right.z + fz * this.forward.z);
  }

  /** position à l'écran (px CSS) d'un point du monde ; null si hors du cadre */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    if (v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Démarre la mise en scène : salut, regards, zoom */
  beginDialogue(npc: NpcInstance) {
    this.active = npc;
    this.controls.enabled = false;
    this.controls.clear();
    this.clearWalk();
    npc.character.faceTowards(this.pos.x, this.pos.z);
    this.player.faceTowards(npc.pos.x, npc.pos.z);
    npc.character.bow();
    window.setTimeout(() => {
      if (this.active === npc) this.player.bow();
    }, 250);
    this.desiredZoom = CAMERA.dialogueZoom;
  }

  endDialogue() {
    const npc = this.active;
    if (!npc) return;
    this.active = null;
    npc.character.setYaw(npc.homeYaw);
    this.desiredZoom = 1;
    this.cooldown = 0.6;
    this.autoArmed = false;
    this.controls.enabled = !this.paused && !this.cinematic;
  }

  /* ───────────────────────── jour / nuit ───────────────────────── */

  get night() {
    return this.nightTarget === 1;
  }

  /** bascule jour ↔ nuit (transition douce, sauf `instant`) */
  setNight(on: boolean, instant = false) {
    this.nightTarget = on ? 1 : 0;
    document.body.classList.toggle('night', on);
    if (instant) {
      this.nightF = this.nightTarget;
      this.applyLighting();
    }
  }

  private applyLighting() {
    const f = this.nightF;
    const N = LIGHTING.night;
    const mix = (a: string, b: string, out: THREE.Color) => out.copy(this.cA.set(a)).lerp(this.cB.set(b), f);
    mix(LIGHTING.sky, N.sky, this.hemi.color);
    mix(LIGHTING.ground, N.ground, this.hemi.groundColor);
    this.hemi.intensity = THREE.MathUtils.lerp(LIGHTING.hemiIntensity, N.hemiIntensity, f);
    mix(LIGHTING.sun, N.sun, this.sun.color);
    this.sun.intensity = THREE.MathUtils.lerp(LIGHTING.sunIntensity, N.sunIntensity, f);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(LIGHTING.exposure, N.exposure, f);
    for (const w of Object.values(this.worlds)) w.applyNight(f);
  }

  /* ───────────────────────── boucle ───────────────────────── */

  /** le monde est figé (fenêtre ouverte ou dialogue) : la mini-carte peut ralentir */
  get idle() {
    return this.paused || this.active !== null;
  }

  private tick = (now: number) => {
    if (this.cinematic) {
      if (now - this.lastFrame < 1000 / 60 - 2) return;
      this.lastFrame = now;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.cinematic.update(dt);
      const exp = this.renderer.toneMappingExposure;
      this.renderer.toneMappingExposure = 1;
      this.renderer.render(this.cinematic.scene, this.cinematic.camera);
      this.renderer.toneMappingExposure = exp;
      return;
    }
    // derrière une fenêtre (billet, carnet, intro…) l'image est figée : aucun rendu,
    // donc aucune saccade et un GPU au repos ; 60 i/s le reste du temps
    if (this.paused && !this.dirty) {
      this.clock.getDelta();
      return;
    }
    const fps = 60;
    if (!this.dirty && now - this.lastFrame < 1000 / fps - 2) return;
    this.dirty = false;
    this.lastFrame = now;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    // ajuste la résolution AVANT le rendu : redimensionner le canvas l'efface,
    // le faire après le rendu affichait une image vide (flash)
    if (!this.paused && !this.active) this.adaptResolution(this.lastCpuMs, dt, fps);
    const t0 = performance.now();
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.lastCpuMs = performance.now() - t0;
    this.onFrame?.();
  };

  /** baisse la résolution si l'appareil peine (images lentes), la remonte quand ça va mieux */
  private adaptResolution(cpuMs: number, dt: number, fps: number) {
    // « lent » = nettement plus long que l'intervalle visé (30 i/s en dialogue n'est pas lent)
    const slow = dt > 1.6 / fps || cpuMs > 14;
    if (slow) {
      this.fastFrames = 0;
      if (++this.slowFrames > 90 && this.dpr > 1) this.setDpr(Math.max(1, this.dpr - 0.25));
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (++this.fastFrames > 600 && this.dpr < this.maxDpr) this.setDpr(Math.min(this.maxDpr, this.dpr + 0.25));
    }
  }

  private setDpr(d: number) {
    this.dpr = d;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.renderer.setPixelRatio(d);
    this.resize();
  }

  /** avance vers la destination souris ; renvoie l'intensité d'animation de marche */
  private stepTowardTarget(dt: number, shift: boolean) {
    const tx = this.walkTarget.x - this.pos.x;
    const tz = this.walkTarget.z - this.pos.z;
    const dist = Math.hypot(tx, tz);
    if (dist < 0.18) {
      if (!this.ptrHeld) this.clearWalk();
      return 0;
    }
    // curseur loin du perso (bouton maintenu) ou Maj : on court
    const run = shift || (this.ptrHeld && dist > 6);
    const speed = PLAYER.speed * (run ? PLAYER.runMultiplier : 1);
    const step = Math.min(dist, speed * dt);
    const dx = (tx / dist) * step;
    const dz = (tz / dist) * step;
    const ox = this.pos.x;
    const oz = this.pos.z;
    this.world.collision.move(this.pos, dx, dz, PLAYER.halfSize);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    // bloqué contre un mur : on abandonne au bout d'un court instant (clic relâché)
    this.stuck = moved < step * 0.25 ? this.stuck + dt : 0;
    if (this.stuck > 0.35 && !this.ptrHeld) {
      this.clearWalk();
      return 0;
    }
    if (moved < 1e-4) return 0;
    this.player.setYaw(Math.atan2(this.pos.x - ox, this.pos.z - oz));
    return run ? 1.4 : 1;
  }

  private updateMarker() {
    const m = this.marker;
    m.visible = this.walking;
    if (!m.visible) return;
    m.position.set(this.walkTarget.x, this.world.groundHeight(this.walkTarget.x, this.walkTarget.z) + 0.03, this.walkTarget.z);
    const k = 1 + 0.12 * Math.sin(this.elapsed * 6);
    m.scale.set(k, k, k);
  }

  private update(dt: number) {
    if (this.cooldown > 0) this.cooldown -= dt;

    // ── déplacement relatif à l'écran
    let move01 = 0;
    if (this.seat && !this.paused && this.cooldown <= 0) {
      // une touche de déplacement relève le joueur
      const a = this.controls.axis();
      if (a.x !== 0 || a.y !== 0) this.standUp();
    }
    if (!this.active && !this.paused && !this.seat && this.sitK < 0.5) {
      const a = this.controls.axis();
      if (a.x !== 0 || a.y !== 0) {
        // le clavier reprend la main sur la souris
        if (this.walking) this.clearWalk();
        const speed = PLAYER.speed * (a.run ? PLAYER.runMultiplier : 1);
        const dx = (this.right.x * a.x + this.forward.x * a.y) * speed * dt;
        const dz = (this.right.z * a.x + this.forward.z * a.y) * speed * dt;
        this.world.collision.move(this.pos, dx, dz, PLAYER.halfSize);
        this.player.setYaw(Math.atan2(dx, dz));
        move01 = a.run ? 1.4 : 1;
      } else if (this.walking || this.ptrHeld) {
        if (this.ptrHeld) this.walking = this.pickGround() || this.walking;
        move01 = this.stepTowardTarget(dt, a.run);
      }
    }
    this.updateMarker();
    const p = this.player.root.position;
    // s'asseoir / se relever : glissement doux entre la place debout et l'assise
    const sitGoal = this.seat ? 1 : 0;
    if (this.sitK !== sitGoal) this.sitK = sitGoal > this.sitK ? Math.min(1, this.sitK + dt / 0.45) : Math.max(0, this.sitK - dt / 0.4);
    if (this.sitK > 0) {
      const k = this.sitK * this.sitK * (3 - 2 * this.sitK);
      p.x = this.pos.x + (this.seatPos.x - this.pos.x) * k;
      p.z = this.pos.z + (this.seatPos.z - this.pos.z) * k;
    } else {
      p.x = this.pos.x;
      p.z = this.pos.z;
    }
    this.player.sit = this.sitK;
    p.y += (this.world.groundHeight(this.pos.x, this.pos.z) - p.y) * Math.min(1, dt * 14);
    this.player.update(dt, move01);

    // ── halos
    let near: NpcInstance | null = null;
    let nd = Infinity;
    for (const n of this.seat || this.sitK > 0 ? [] : this.world.npcs) {
      const d = this.distTo(n.haloPos);
      if (d < GAMEPLAY.interactRadius && d < nd) {
        nd = d;
        near = n;
      }
    }
    if (near !== this.near) {
      this.near = near;
      this.onNearChange?.(near);
    }
    // banc à portée (seulement s'il n'y a personne à qui parler)
    this.benchNear = !near && !this.seat && !this.active && this.sitK === 0 ? this.findBench() : null;
    const seatState = this.seat ? 'seated' : this.benchNear ? 'near' : null;
    if (seatState !== this.seatState) {
      this.seatState = seatState;
      this.onSeatChange?.(seatState);
    }
    if (!near) this.autoArmed = true;
    if (GAMEPLAY.autoTalk && near && this.autoArmed && !this.active && !this.paused && this.cooldown <= 0) {
      this.autoArmed = false;
      this.onTalk?.(near);
    }

    if (this.nightF !== this.nightTarget) {
      const step = dt / LIGHTING.transition;
      this.nightF = this.nightTarget > this.nightF ? Math.min(1, this.nightF + step) : Math.max(0, this.nightF - step);
      this.applyLighting();
    }
    this.world.update(this.elapsed, dt, this.near, this.active, this.pos);

    // ── caméra
    if (this.active) {
      const n = this.active;
      const mx = (n.pos.x + this.pos.x) / 2;
      const mz = (n.pos.z + this.pos.z) / 2;
      // décale la cible vers le « bas » de l'écran pour placer les personnages au-dessus du panneau
      const el = CAMERA.elevationDeg * DEG;
      const shift = ((CAMERA.viewHeight / CAMERA.dialogueZoom) * 0.2) / Math.sin(el);
      this.desiredTarget.set(mx - this.forward.x * shift, 0, mz - this.forward.z * shift);
    } else if (this.seat) {
      this.desiredTarget.copy(this.viewCenter);
    } else {
      this.desiredTarget.set(this.pos.x, 0, this.pos.z);
    }
    // vue large : mouvement plus ample, donc plus posé
    const wide = this.seat !== null || this.zoom < 0.97;
    const k = 1 - Math.exp(-(wide ? 2.4 : CAMERA.followLerp) * dt);
    this.target.lerp(this.desiredTarget, k);
    const prevZoom = this.zoom;
    // interpolation logarithmique : le recul paraît régulier du début à la fin
    const lz = Math.log(this.zoom);
    this.zoom = Math.exp(lz + (Math.log(this.desiredZoom) - lz) * (1 - Math.exp(-(wide ? 2.2 : 3.5) * dt)));
    if (Math.abs(this.zoom - this.desiredZoom) < 1e-4) this.zoom = this.desiredZoom;
    if (Math.abs(prevZoom - this.zoom) > 1e-5) this.updateFrustum();
    if (!this.seat && this.wideShadows && this.zoom > 0.985) this.setWideShadows(false);
    this.world.labelFade = this.wideK;
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);

    // ── soleil qui suit (ombres nettes autour du joueur)
    // déplacement calé sur la taille d'un texel d'ombre, dans le repère de la lumière :
    // les ombres ne « grésillent » plus quand on marche.
    const so = LIGHTING.sunOffset;
    const shc = this.sun.shadow.camera;
    const texel = (shc.right - shc.left) / this.sun.shadow.mapSize.x;
    const tgt = this.sunSnap.set(this.target.x, 0, this.target.z);
    const la = Math.round(tgt.dot(this.sunAx) / texel) * texel;
    const lb = Math.round(tgt.dot(this.sunAy) / texel) * texel;
    const lc = tgt.dot(this.sunAz);
    tgt.copy(this.sunAx).multiplyScalar(la).addScaledVector(this.sunAy, lb).addScaledVector(this.sunAz, lc);
    this.sun.target.position.copy(tgt);
    this.sun.position.set(tgt.x + so.x, tgt.y + so.y, tgt.z + so.z);

    // ── transparence des bâtiments qui masquent le joueur / les PNJ
    let i = 0;
    const s = this.samples;
    s[i++].set(this.pos.x, p.y + 0.3, this.pos.z);
    s[i++].set(this.pos.x, p.y + 1.7, this.pos.z);
    const focus = this.active ? [this.active] : this.world.npcs.filter((n) => this.distTo(n.pos) < 9).slice(0, 3);
    for (const n of focus) {
      if (i >= s.length) break;
      s[i++].set(n.pos.x, 1.2, n.pos.z);
    }
    // vue large (banc) : plus rien à dégager, les bâtiments redeviennent pleins
    this.world.updateOcclusion(this.seat ? [] : s.slice(0, i), this.toCamera, dt);
    this.world.updateLights(this.target, dt);
  }
}
