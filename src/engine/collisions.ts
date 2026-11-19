/**
 * Collisions AABB 2D (plan XZ). Le joueur est une boîte alignée sur les axes,
 * résolue axe par axe pour pouvoir glisser le long des murs.
 */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  tag?: string;
  /** rectangle désactivé (ex. PNJ absent la nuit) */
  off?: boolean;
}

export class CollisionWorld {
  readonly rects: Rect[] = [];
  constructor(public bounds: Rect) {}

  /** Ajoute un rectangle par son centre et sa taille */
  addRect(cx: number, cz: number, sx: number, sz: number, tag?: string): Rect {
    const r = { minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, tag };
    this.rects.push(r);
    return r;
  }

  private overlaps(x: number, z: number, h: number, r: Rect) {
    if (r.off) return false;
    return x + h > r.minX && x - h < r.maxX && z + h > r.minZ && z - h < r.maxZ;
  }

  collides(x: number, z: number, h: number): boolean {
    const b = this.bounds;
    if (x - h < b.minX || x + h > b.maxX || z - h < b.minZ || z + h > b.maxZ) return true;
    return this.rects.some((r) => this.overlaps(x, z, h, r));
  }

  /** Déplace pos de (dx, dz) en résolvant les collisions par axe. */
  move(pos: { x: number; z: number }, dx: number, dz: number, h: number) {
    const eps = 1e-4;
    // axe X
    let nx = pos.x + dx;
    for (const r of this.rects) {
      if (this.overlaps(nx, pos.z, h, r)) {
        if (dx > 0) nx = Math.min(nx, r.minX - h - eps);
        else if (dx < 0) nx = Math.max(nx, r.maxX + h + eps);
      }
    }
    nx = Math.min(this.bounds.maxX - h, Math.max(this.bounds.minX + h, nx));
    pos.x = nx;
    // axe Z
    let nz = pos.z + dz;
    for (const r of this.rects) {
      if (this.overlaps(pos.x, nz, h, r)) {
        if (dz > 0) nz = Math.min(nz, r.minZ - h - eps);
        else if (dz < 0) nz = Math.max(nz, r.maxZ + h + eps);
      }
    }
    nz = Math.min(this.bounds.maxZ - h, Math.max(this.bounds.minZ + h, nz));
    pos.z = nz;
  }
}
