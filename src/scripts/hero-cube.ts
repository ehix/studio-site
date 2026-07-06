/**
 * The signature hero cube. One cube cast in a single porous stone texture,
 * on a transparent canvas over the page grid: slow idle rotation, drag to
 * spin with inertia.
 *
 * The texture is generated once at init on a 2D canvas from the live
 * palette tokens (--paper, --ink, --stone), so it is duotone by
 * construction and follows the active theme; a MutationObserver repaints
 * it when [data-theme] changes. The pattern is seeded, so the pores land
 * in the same places every visit and in both themes. A directional light
 * shades the faces apart — same material, one solid object.
 *
 * Motion rules (DESIGN-BRIEF §4/§5): prefers-reduced-motion stops the idle
 * autorotation entirely; dragging still works. Rendering pauses when the
 * cube leaves the viewport or the tab is hidden.
 *
 * Camera distance is derived from the cube's circumsphere so no corner is
 * ever clipped at the canvas edge, whatever the rotation.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

interface Palette {
  paper: string;
  raised: string;
  stone: string;
  ink: string;
}

const TEXTURE_SIZE = 512;
const CUBE_SIZE = 1.6;
const CAMERA_FOV = 34;
const IDLE_SPEED = 0.15; // rad/s — slow enough to read as ambient
const DRAG_FACTOR = 0.006; // px → rad
const INERTIA_DAMPING = 2.4; // exponential decay rate, 1/s
const PITCH_LIMIT = 1.2;
const TEXTURE_SEED = 0x5eed;

const readPalette = (): Palette => {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    paper: token('--paper'),
    raised: token('--paper-raised'),
    stone: token('--stone'),
    ink: token('--ink'),
  };
};

/** Small deterministic PRNG so the stone sets the same way every load. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Porous cast stone: soft mottling, fine grain, then pores — small pits
 * with an offset highlight so they read as depressions, not spots.
 */
const paintStone = (ctx: CanvasRenderingContext2D, p: Palette, s: number): void => {
  const rand = mulberry32(TEXTURE_SEED);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, s, s);

  // Broad mottling: uneven cure of the material.
  for (let i = 0; i < 26; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = s * (0.1 + rand() * 0.22);
    const soft = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.4 ? p.raised : p.stone;
    soft.addColorStop(0, tone);
    soft.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.05 + rand() * 0.07;
    ctx.fillStyle = soft;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine grain.
  for (let i = 0; i < 2400; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = 0.5 + rand() * 1.7;
    const dark = rand() < 0.3;
    ctx.globalAlpha = dark ? 0.06 + rand() * 0.1 : 0.14 + rand() * 0.22;
    ctx.fillStyle = dark ? p.ink : p.stone;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pores: mostly small pits, a scatter of larger craters.
  for (let i = 0; i < 340; i++) {
    const x = rand() * s;
    const y = rand() * s;
    const large = rand() < 0.09;
    const r = large ? 3.5 + rand() * 4.5 : 0.8 + rand() * 2.6;
    const squash = 0.65 + rand() * 0.35;
    // Highlight on the lower-right lip suggests depth under top-left light.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = p.raised;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y + r * 0.35, r, r * squash, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.2 + rand() * 0.3;
    ctx.fillStyle = p.ink;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * squash, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/* -- init ----------------------------------------------------------------- */

/** Mounts the cube into `container`. Returns false if WebGL is unavailable. */
export function initHeroCube(container: HTMLElement): boolean {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 20);
  // Fit the circumsphere: no corner leaves the frustum at any rotation.
  const radius = (CUBE_SIZE * Math.sqrt(3)) / 2;
  camera.position.z = radius / Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) + radius + 0.05;

  const face = document.createElement('canvas');
  face.width = face.height = TEXTURE_SIZE;
  const faceCtx = face.getContext('2d');
  if (faceCtx) paintStone(faceCtx, readPalette(), TEXTURE_SIZE);
  const texture = new CanvasTexture(face);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const cube = new Mesh(
    new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
    new MeshLambertMaterial({ map: texture })
  );
  cube.rotation.set(0.44, -0.62, 0);
  scene.add(cube);

  // Quiet studio light: enough ambient that shadow faces stay in-palette.
  scene.add(new AmbientLight(0xffffff, 2.1));
  const key = new DirectionalLight(0xffffff, 1.9);
  key.position.set(-2.2, 3.2, 4);
  scene.add(key);

  // Repaint the stone when the theme flips; the cube must not break the world.
  new MutationObserver(() => {
    if (!faceCtx) return;
    paintStone(faceCtx, readPalette(), TEXTURE_SIZE);
    texture.needsUpdate = true;
  }).observe(document.documentElement, { attributeFilter: ['data-theme'] });

  const canvas = renderer.domElement;
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'pan-y'; // horizontal drag spins; vertical still scrolls
  canvas.style.cursor = 'grab';
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  const resize = () => {
    const size = container.clientWidth;
    if (size > 0) renderer.setSize(size, size, false);
  };
  resize();
  new ResizeObserver(resize).observe(container);

  /* -- motion -- */
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let dragging = false;
  let velocityX = 0; // pitch rad/s
  let velocityY = 0; // yaw rad/s
  let lastX = 0;
  let lastY = 0;
  let lastMove = 0;

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    lastMove = performance.now();
    velocityX = velocityY = 0;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; drag still works.
    }
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max((now - lastMove) / 1000, 1e-3);
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    cube.rotation.y += dx * DRAG_FACTOR;
    cube.rotation.x = Math.min(
      PITCH_LIMIT,
      Math.max(-PITCH_LIMIT, cube.rotation.x + dy * DRAG_FACTOR)
    );
    velocityY = (dx * DRAG_FACTOR) / dt;
    velocityX = (dy * DRAG_FACTOR) / dt;
    lastX = event.clientX;
    lastY = event.clientY;
    lastMove = now;
  });

  const release = () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  /* -- render loop: runs only while on screen and tab visible -- */
  let running = false;
  let frame = 0;
  let lastTick = 0;

  const tick = (now: number) => {
    if (!running) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;

    if (!dragging) {
      const decay = Math.exp(-INERTIA_DAMPING * dt);
      velocityX *= decay;
      velocityY *= decay;
      if (Math.abs(velocityX) < 1e-3) velocityX = 0;
      if (Math.abs(velocityY) < 1e-3) velocityY = 0;
      const idle = reducedMotion.matches ? 0 : IDLE_SPEED;
      cube.rotation.y += (velocityY + idle) * dt;
      cube.rotation.x = Math.min(
        PITCH_LIMIT,
        Math.max(-PITCH_LIMIT, cube.rotation.x + velocityX * dt)
      );
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };

  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    if (running) {
      lastTick = performance.now();
      frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
    }
  };

  let onScreen = false;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    setRunning(onScreen && !document.hidden);
  }).observe(container);
  document.addEventListener('visibilitychange', () => {
    setRunning(onScreen && !document.hidden);
  });

  renderer.render(scene, camera); // first paint even if observers lag
  return true;
}
