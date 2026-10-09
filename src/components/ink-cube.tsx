"use client";

import { useEffect, useRef } from "react";

/**
 * The dropzone's colour-mixing cube: a see-through cube of coloured glass,
 * balanced on one corner and turning on the axis through it. Each face is its
 * own colour, the wordmark's six (red, orange, yellow, green, blue, purple),
 * and every face is multiplied onto what is behind it, like ink on paper.
 * Every point of the cube is seen through two faces, so the far face tints
 * the near one and the mixes slide about as it turns. The far faces are laid
 * on paler, so each near face still reads as its own colour. No outline.
 *
 * A canvas, not CSS 3D: `mix-blend-mode` flattens a preserve-3d face, so the
 * CSS cube could not mix. Multiply is order-free, so the faces need no depth
 * sorting. Orthographic, no perspective, like a flat toy.
 */

const SIZE = 120; // CSS px, square
const HALF = 32; // half the cube's edge
const TURN_MS = 16000;

// One per face, in FACES order: left, right, top, bottom, back, front.
const COLORS = ["#ff6b6b", "#6b9bff", "#ffe94d", "#c38bff", "#ffb347", "#6bdc7a"];
// The far faces, halfway to white.
const PALE = COLORS.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  const half = (c: number) => Math.round(c + (255 - c) / 2);
  return `rgb(${half(n >> 16)}, ${half((n >> 8) & 255)}, ${half(n & 255)})`;
});

// The six faces as [axis, sign], each with its four corners in order round.
const FACES: { axis: number; corners: number[][] }[] = [];
for (let axis = 0; axis < 3; axis++) {
  for (const sign of [-1, 1]) {
    const [u, v] = [0, 1, 2].filter((a) => a !== axis);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => {
      const p = [0, 0, 0];
      p[axis] = sign;
      p[u] = a;
      p[v] = b;
      return p;
    });
    FACES.push({ axis, corners });
  }
}

/* CSS's rotation conventions (y down, z towards you), so the angles read the
   same as they would in a transform. */
type V = number[];
const rx = ([x, y, z]: V, a: number): V => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const ry = ([x, y, z]: V, a: number): V => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rz = ([x, y, z]: V, a: number): V => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
const deg = Math.PI / 180;

/* Stand a corner-to-corner diagonal upright — rotateZ(-135°) swings it into
   the y–z plane, rotateX(35.26°) (atan 1/√2) stands it up — then turn it on
   that axis, and look from only a little above: any more and the top corner
   drops into the middle and it reads as sitting flat, not on a point. */
const place = (p: V, turn: number): V => rx(ry(rx(rz(p, -135 * deg), 35.2644 * deg), turn), -6 * deg);

function draw(ctx: CanvasRenderingContext2D, turn: number) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  const faces = FACES.map(({ axis, corners }) => {
    const pts = corners.map((c) => place(c, turn));
    const n = place(corners[0].map((_, i) => (i === axis ? corners[0][axis] : 0)), turn);
    return { pts, front: n[2] > 0 };
  });
  const path = (pts: V[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, SIZE / 2 + x * HALF, SIZE / 2 + y * HALF));
    ctx.closePath();
  };

  ctx.globalCompositeOperation = "multiply";
  faces.forEach((f, i) => {
    path(f.pts);
    ctx.fillStyle = f.front ? COLORS[i] : PALE[i];
    ctx.fill();
  });
  ctx.globalCompositeOperation = "source-over";
}

export function InkCube({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Reduced motion: parked at one angle, still showing its mixes.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(ctx, 20 * deg);
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      draw(ctx, ((now % TURN_MS) / TURN_MS) * 2 * Math.PI);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ width: SIZE, height: SIZE }} />;
}
