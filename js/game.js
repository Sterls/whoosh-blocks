// The 3D puzzle: renders a level, handles drag-to-rotate, pinch-to-zoom and
// tap-to-move, and animates cubes flying away or bumping into each other.

import * as THREE from 'three';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import { DIRS, key, blockerDistance, boundsOf } from './levels.js';

const CUBE_SIZE = 0.9;
const TAP_SLOP = 10; // px a finger may move and still count as a tap
const ROTATE_SPEED = 0.0085;

const ease = {
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

// ---------- face textures ----------

function makeTexture(draw) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = ctx.strokeStyle = 'rgba(30, 30, 55, 0.78)';
  ctx.translate(size / 2, size / 2);
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Arrow pointing "up" the texture (+v), rotated by quarter turns.
function arrowTexture(quarterTurns) {
  return makeTexture((ctx) => {
    ctx.rotate((quarterTurns * Math.PI) / 2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(56, -18);
    ctx.lineTo(22, -18);
    ctx.lineTo(22, 78);
    ctx.lineTo(-22, 78);
    ctx.lineTo(-22, -18);
    ctx.lineTo(-56, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

// Arrow pointing straight out of the face: a solid dot.
function dotTexture() {
  return makeTexture((ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Arrow pointing into the face (away from you): a faint ring.
function ringTexture() {
  return makeTexture((ctx) => {
    ctx.strokeStyle = 'rgba(30, 30, 55, 0.3)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// For each face (material group) of a box geometry, work out which world axis
// the texture's u and v run along, so arrows can be drawn the right way round.
function faceAxes(geometry) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const nrm = geometry.attributes.normal;
  const index = geometry.index;
  const round = (v) => {
    const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
    const i = a.indexOf(Math.max(...a));
    const out = [0, 0, 0];
    out[i] = Math.sign(v.getComponent(i));
    return out;
  };
  return geometry.groups.map((g) => {
    const ids = [];
    for (let i = g.start; i < g.start + g.count; i++) ids.push(index ? index.getX(i) : i);
    const mp = new THREE.Vector3(), mn = new THREE.Vector3();
    let mu = 0, mv = 0;
    for (const i of ids) {
      mp.x += pos.getX(i); mp.y += pos.getY(i); mp.z += pos.getZ(i);
      mn.x += nrm.getX(i); mn.y += nrm.getY(i); mn.z += nrm.getZ(i);
      mu += uv.getX(i); mv += uv.getY(i);
    }
    mp.divideScalar(ids.length); mu /= ids.length; mv /= ids.length;
    const U = new THREE.Vector3(), V = new THREE.Vector3(), p = new THREE.Vector3();
    for (const i of ids) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(mp);
      U.addScaledVector(p, uv.getX(i) - mu);
      V.addScaledVector(p, uv.getY(i) - mv);
    }
    return { u: round(U), v: round(V), n: round(mn), materialIndex: g.materialIndex };
  });
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const neg = (a) => [-a[0], -a[1], -a[2]];

// ---------- the game ----------

export class Game {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.animations = [];
    this.dirty = true;
    this.active = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0d0, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    this.camera.add(sun); // light follows the view so the front is always lit

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.geometry = new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 3, 0.12);
    this.axes = faceAxes(this.geometry);
    this.textures = {
      arrows: [0, 1, 2, 3].map(arrowTexture),
      dot: dotTexture(),
      ring: ringTexture(),
    };
    this.materialCache = new Map();

    this.zoom = 1;
    this.baseDistance = 10;
    this.spin = { x: 0, y: 0 };

    this._bindInput();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(container);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // Six materials (one per face) for a cube of `color` pointing along `dir`.
  _materials(color, dir) {
    const cacheKey = color + '|' + dir;
    let mats = this.materialCache.get(cacheKey);
    if (mats) return mats;
    const d = DIRS[dir];
    mats = [];
    for (const face of this.axes) {
      let map;
      if (same(d, face.n)) map = this.textures.dot;
      else if (same(d, neg(face.n))) map = this.textures.ring;
      else if (same(d, face.v)) map = this.textures.arrows[0];
      else if (same(d, face.u)) map = this.textures.arrows[1];
      else if (same(d, neg(face.v))) map = this.textures.arrows[2];
      else map = this.textures.arrows[3];
      mats[face.materialIndex] = new THREE.MeshLambertMaterial({ color, map });
    }
    this.materialCache.set(cacheKey, mats);
    return mats;
  }

  load(level) {
    for (const child of [...this.pivot.children]) this.pivot.remove(child);
    this.animations = [];
    this.level = level;
    this.mistakes = 0;
    this.taps = 0;
    this.won = false;
    this.failed = false; // a perfect-run challenge was bumped
    this.startTime = null; // the clock starts on the first tap
    this.endTime = null;
    this.pausedAt = null;
    this.occupied = new Map();
    this.bounds = boundsOf(level.cubes);

    const { min, max } = this.bounds;
    const center = new THREE.Vector3(
      (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);

    level.cubes.forEach((c, i) => {
      const color = c[4] || level.palette[i % level.palette.length];
      const mesh = new THREE.Mesh(this.geometry, this._materials(color, c[3]));
      mesh.position.set(c[0] - center.x, c[1] - center.y, c[2] - center.z);
      mesh.userData = { cube: c, color, home: mesh.position.clone(), busy: false, alive: true };
      this.pivot.add(mesh);
      this.occupied.set(key(c[0], c[1], c[2]), mesh);
    });

    // Fit the whole shape on screen whichever way it's turned.
    const size = new THREE.Vector3(max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1);
    this.radius = Math.max(1.2, size.length() / 2);
    this.zoom = 1;
    this.spin = { x: 0, y: 0 };
    this.pivot.quaternion.setFromEuler(new THREE.Euler(0.45, -0.65, 0, 'XYZ'));
    if (size.z === 1) this.pivot.quaternion.setFromEuler(new THREE.Euler(0.25, -0.3, 0, 'XYZ'));
    if (level.front) this.pivot.quaternion.setFromEuler(new THREE.Euler(0.15, -0.25, 0, 'XYZ'));
    this._placeCamera();
    this.dirty = true;
  }

  get remaining() {
    return this.occupied ? this.occupied.size : 0;
  }

  // Seconds since the first tap, not counting time the app was in the background.
  get elapsed() {
    if (this.startTime === null) return 0;
    const end = this.endTime ?? this.pausedAt ?? performance.now();
    return (end - this.startTime) / 1000;
  }

  pauseClock() {
    if (this.pausedAt === null) this.pausedAt = performance.now();
  }

  resumeClock() {
    if (this.pausedAt === null) return;
    if (this.startTime !== null && this.endTime === null) this.startTime += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }

  setActive(active) {
    this.active = active;
    this.dirty = true;
  }

  // Pulse a cube that can be removed right now.
  hint() {
    for (const mesh of this.occupied.values()) {
      const u = mesh.userData;
      if (u.busy || blockerDistance(this.occupied, u.cube, this.bounds) !== 0) continue;
      if (u.pulse) u.pulse.cancelled = true;
      u.pulse = this._animate(1.4, (t) => {
        mesh.scale.setScalar(1 + 0.22 * Math.sin(t * Math.PI * 4) ** 2);
      }, () => {
        mesh.scale.setScalar(1);
      });
      return true;
    }
    return false;
  }

  // ---------- moves ----------

  _tap(mesh) {
    const u = mesh.userData;
    if (!u.alive || u.busy || this.won || this.failed) return;
    this.taps++;
    if (this.startTime === null) this.startTime = performance.now();
    this.cb.onTap?.(this.taps);
    if (u.pulse) {
      u.pulse.cancelled = true;
      mesh.scale.setScalar(1);
    }
    const d = DIRS[u.cube[3]];
    const dir = new THREE.Vector3(d[0], d[1], d[2]);
    const dist = blockerDistance(this.occupied, u.cube, this.bounds);

    if (dist === 0) {
      // Free: fly away.
      u.alive = false;
      this.occupied.delete(key(u.cube[0], u.cube[1], u.cube[2]));
      const start = mesh.position.clone();
      const travel = this.radius * 2 + 12;
      this._animate(0.55, (t) => {
        mesh.position.copy(start).addScaledVector(dir, ease.in(t) * travel);
        mesh.scale.setScalar(1 - 0.4 * t);
      }, () => this.pivot.remove(mesh));
      this.cb.onRemove?.(this.remaining);
      if (this.remaining === 0) {
        this.won = true;
        this.endTime = performance.now();
        setTimeout(() => this.cb.onWin?.(this.mistakes), 650);
      }
      return;
    }

    // Blocked: slide up to the blocker, bump, and come back.
    this.mistakes++;
    if (this.level.challenge === 'perfect') this.failed = true;
    u.busy = true;
    const b = u.cube;
    const blocker = this.occupied.get(key(b[0] + d[0] * dist, b[1] + d[1] * dist, b[2] + d[2] * dist));
    const reach = dist - 1 + 0.1;
    const start = u.home.clone();
    const dur = 0.22 + reach * 0.09;
    // Picture levels have red cubes of their own, so they flash dark instead.
    mesh.material = this._materials(this.level.front ? '#3d3a55' : '#ff6b6b', u.cube[3]);
    let bumped = false;
    this._animate(dur, (t) => {
      const s = t < 0.5 ? ease.out(t * 2) : 1 - ease.inOut((t - 0.5) * 2);
      mesh.position.copy(start).addScaledVector(dir, s * reach);
      if (!bumped && t >= 0.5) {
        bumped = true;
        this.cb.onBump?.();
        if (blocker) this._wobble(blocker, dir);
      }
    }, () => {
      mesh.position.copy(start);
      setTimeout(() => {
        mesh.material = this._materials(u.color, u.cube[3]);
        u.busy = false;
        this.dirty = true;
        if (this.failed) this.cb.onFail?.();
      }, 150);
    });
    this.cb.onMistake?.(this.mistakes);
  }

  _wobble(mesh, dir) {
    const home = mesh.userData.home;
    this._animate(0.3, (t) => {
      mesh.position.copy(home).addScaledVector(dir, Math.sin(t * Math.PI * 3) * (1 - t) * 0.08);
    }, () => {
      if (mesh.userData.alive) mesh.position.copy(home);
    });
  }

  _animate(duration, update, done) {
    const anim = { start: performance.now(), duration: duration * 1000, update, done, cancelled: false };
    this.animations.push(anim);
    this.dirty = true;
    return anim;
  }

  // ---------- camera & input ----------

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._placeCamera();
    this.dirty = true;
  }

  _placeCamera() {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    // Leave room for the buttons at the top and bottom of the screen.
    this.baseDistance = ((this.radius || 2) / Math.sin(fov / 2)) * 1.12;
    this.camera.position.set(0, 0, this.baseDistance * this.zoom);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }

  _rotate(dx, dy) {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * ROTATE_SPEED);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * ROTATE_SPEED);
    this.pivot.quaternion.premultiply(qy).premultiply(qx);
    this.dirty = true;
  }

  _bindInput() {
    const el = this.renderer.domElement;
    const pointers = new Map();
    let gesture = null; // { startX, startY, moved, multi, lastX, lastY, pinchDist, pinchZoom, lastT }

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.spin = { x: 0, y: 0 };
      if (pointers.size === 1) {
        gesture = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
          moved: false, multi: false, lastT: performance.now(), vx: 0, vy: 0 };
      } else if (gesture) {
        gesture.multi = true;
        const [a, b] = [...pointers.values()];
        gesture.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        gesture.pinchZoom = this.zoom;
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (gesture.pinchDist > 0) {
          this.zoom = THREE.MathUtils.clamp(gesture.pinchZoom * (gesture.pinchDist / dist), 0.45, 2.2);
          this._placeCamera();
        }
        return;
      }
      if (gesture.multi) return;
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > TAP_SLOP) gesture.moved = true;
      if (!gesture.moved) return;
      const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
      const now = performance.now();
      const dt = Math.max(1, now - gesture.lastT);
      gesture.vx = (dx / dt) * 16; gesture.vy = (dy / dt) * 16;
      gesture.lastX = e.clientX; gesture.lastY = e.clientY; gesture.lastT = now;
      this._rotate(dx, dy);
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size > 0 || !gesture) return;
      if (!gesture.moved && !gesture.multi && e.type === 'pointerup') {
        this._pick(e.clientX, e.clientY);
      } else if (gesture.moved && !gesture.multi && performance.now() - gesture.lastT < 80) {
        this.spin = { x: gesture.vx, y: gesture.vy }; // a little momentum after a flick
      }
      gesture = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(e.deltaY * 0.001), 0.45, 2.2);
      this._placeCamera();
    }, { passive: false });
  }

  _pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets = this.pivot.children.filter((m) => m.userData.alive);
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) this._tap(hit.object);
  }

  // ---------- frame loop ----------

  _loop() {
    requestAnimationFrame(this._loop);
    if (!this.active) return;

    if (Math.abs(this.spin.x) + Math.abs(this.spin.y) > 0.05) {
      this._rotate(this.spin.x, this.spin.y);
      this.spin.x *= 0.92;
      this.spin.y *= 0.92;
    }

    if (this.animations.length) {
      const now = performance.now();
      this.animations = this.animations.filter((a) => {
        if (a.cancelled) return false;
        const t = Math.min(1, (now - a.start) / a.duration);
        a.update(t);
        if (t >= 1) { a.done?.(); return false; }
        return true;
      });
      this.dirty = true;
    }

    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  }
}
