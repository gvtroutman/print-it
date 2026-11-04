"use client";

import { memo, useEffect, useId, useRef, type RefObject } from "react";
import styles from "./badge-celebration.module.css";

/** One smooth dome with a rounded star outline and a softly rolled edge. */
function pillowGeometry(THREE: typeof import("three")) {
  const vertices = Array.from({ length: 10 }, (_, index) => {
    const angle = Math.PI / 2 - index * Math.PI / 5;
    const radius = index % 2 === 0 ? 1.12 : .59;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const curve = new THREE.Shape();
  vertices.forEach((vertex, index) => {
    const previous = vertices[(index + 9) % 10], next = vertices[(index + 1) % 10];
    const radius = index % 2 === 0 ? .32 : .16;
    const start = vertex.clone().lerp(previous, radius / vertex.distanceTo(previous));
    const end = vertex.clone().lerp(next, radius / vertex.distanceTo(next));
    if (index === 0) curve.moveTo(start.x, start.y); else curve.lineTo(start.x, start.y);
    curve.quadraticCurveTo(vertex.x, vertex.y, end.x, end.y);
  });
  curve.closePath();
  const segments = 128, rings = 48;
  const outline = curve.getSpacedPoints(segments).slice(0, segments);
  const positions: number[] = [], indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const latitude = ring / rings * Math.PI;
    const radius = Math.sin(latitude);
    // The dome follows actual distance from the centre, so all five arms
    // meet on the same curved face. Roll the rim only near the outline;
    // scaling an ellipsoid to each arm produces five radial creases.
    const rim = Math.cos(latitude) * Math.sqrt(1 + radius ** 2 + radius ** 4);
    for (const point of outline) {
      const x = point.x * radius, y = point.y * radius;
      const dome = Math.sqrt(1 - (x * x + y * y) / 2.25);
      positions.push(x, y, .32 * rim * dome);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let point = 0; point < segments; point++) {
      const next = (point + 1) % segments;
      const a = ring * segments + point, b = (ring + 1) * segments + point;
      const c = (ring + 1) * segments + next, d = ring * segments + next;
      indices.push(a, c, b, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  for (let point = 0; point < segments; point++) {
    normals.setXYZ(point, 0, 0, 1);
    normals.setXYZ(rings * segments + point, 0, 0, -1);
  }
  return geometry;
}

/** Load the renderer for awards only; share the player's clock and controls. */
export const CelebrationStar = memo(function CelebrationStar({ motion, onReady }: {
  motion: RefObject<HTMLDivElement | null>;
  onReady(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const fallback = useRef<SVGSVGElement>(null);
  const id = useId();

  useEffect(() => {
    const element = host.current!;
    let disposed = false, frame = 0;
    const cleanups: Array<() => void> = [];
    const prepare = async () => {
      try {
        const [THREE, { RoomEnvironment }] = await Promise.all([
          import("three"), import("three/examples/jsm/environments/RoomEnvironment.js"),
        ]);
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .85;
        renderer.domElement.className = styles.puffyCanvas;
        element.appendChild(renderer.domElement);
        cleanups.push(() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1.23, 1.23, 1.23, -1.23, .1, 20);
        camera.position.z = 6;
        const studio = new RoomEnvironment();
        const generator = new THREE.PMREMGenerator(renderer);
        const environment = generator.fromScene(studio, .18);
        scene.environment = environment.texture;
        studio.dispose(); generator.dispose();
        cleanups.push(() => environment.dispose());
        scene.add(new THREE.HemisphereLight("#ffffff", "#e8c987", 1));
        const key = new THREE.DirectionalLight("#fff9df", .9);
        key.position.set(-3, 5, 5); scene.add(key);
        const fill = new THREE.DirectionalLight("#fff0c2", .55);
        fill.position.set(4, -2, 2); scene.add(fill);
        const material = new THREE.MeshPhysicalMaterial({
          color: "#ffb000", metalness: .16, roughness: .44,
          clearcoat: .25, clearcoatRoughness: .42, envMapIntensity: .35,
        });
        const polish = { value: 1 };
        material.onBeforeCompile = shader => {
          shader.uniforms.revealPolish = polish;
          shader.fragmentShader = "uniform float revealPolish;\n" + shader.fragmentShader.replace(
            "#include <colorspace_fragment>",
            "#include <colorspace_fragment>\ngl_FragColor.rgb = mix(vec3(1.0, 0.86, 0.18), gl_FragColor.rgb, revealPolish);",
          );
        };
        const geometry = pillowGeometry(THREE);
        const star = new THREE.Mesh(geometry, material);
        scene.add(star);
        cleanups.push(() => { geometry.dispose(); material.dispose(); });
        let dirty = true, lastTime: number | null = null;
        const resize = () => {
          // clientWidth excludes the huge opening transform that covers the screen.
          const width = element.clientWidth || 320;
          renderer.setSize(width, width, false); dirty = true;
        };
        resize();
        const observer = new ResizeObserver(resize); observer.observe(element);
        cleanups.push(() => observer.disconnect());
        const contextLost = (event: Event) => { event.preventDefault(); element.dataset.rendered = "fallback"; };
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        cleanups.push(() => renderer.domElement.removeEventListener("webglcontextlost", contextLost));
        const render = () => {
          if (disposed) return;
          const turn = motion.current;
          const animation = turn?.getAnimations()[0];
          const time = Number(animation?.currentTime ?? -1);
          if (dirty || time !== lastTime) {
            const transform = turn ? getComputedStyle(turn).transform : "none";
            const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
            const y = Math.atan2(matrix.m31, matrix.m11), x = Math.atan2(matrix.m23, matrix.m22);
            star.rotation.set(-x, y, 0);
            // Start with a screen of pure yellow; bring in the studio lighting
            // during the pullback, while the solid star is still oversized.
            const duration = Number(animation?.effect?.getTiming().duration ?? 2000);
            polish.value = time < 0 ? 1 : THREE.MathUtils.smoothstep(time / duration, .055, .3);
            // The badge takes over just beyond the edge of the flip.
            const fade = 1 - THREE.MathUtils.smoothstep(y, Math.PI * .49, Math.PI * .66);
            renderer.domElement.style.opacity = String(fade);
            if (fallback.current) fallback.current.style.transform = transform;
            if (element.dataset.rendered !== "fallback") renderer.render(scene, camera);
            element.dataset.angle = String(y);
            lastTime = time; dirty = false;
          }
          frame = requestAnimationFrame(render);
        };
        element.dataset.rendered = "puffy";
        render(); onReady();
      } catch {
        if (disposed) return;
        cleanups.splice(0).reverse().forEach(cleanup => cleanup());
        element.dataset.rendered = "fallback";
        // Keep the reveal usable when a device cannot create a WebGL context.
        const follow = () => {
          if (disposed) return;
          if (motion.current && fallback.current) fallback.current.style.transform = getComputedStyle(motion.current).transform;
          frame = requestAnimationFrame(follow);
        };
        follow(); onReady();
      }
    };
    void prepare();
    return () => { disposed = true; cancelAnimationFrame(frame); cleanups.reverse().forEach(cleanup => cleanup()); };
  }, [motion, onReady]);

  return <div ref={host} className={styles.solidStar} data-star-3d data-rendered="loading" aria-hidden="true">
    <svg ref={fallback} className={styles.starFallback} viewBox="0 0 100 100">
      <defs>
        <radialGradient id={`${id}-puff`} cx=".3" cy=".25" r=".8">
          <stop stopColor="#fff39b" /><stop offset=".4" stopColor="#ffdc32" /><stop offset=".8" stopColor="#f9bc08" /><stop offset="1" stopColor="#dc8b08" />
        </radialGradient>
        <radialGradient id={`${id}-gloss`} cx=".32" cy=".3" r=".5">
          <stop stopColor="#fffbdc" stopOpacity=".85" /><stop offset=".5" stopColor="#fffbdc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M44 9Q50-1 56 9L65 30Q66 33 70 33L91 35Q103 37 94 46L78 60Q75 62 76 66L80 87Q82 101 70 94L52 83Q50 81 47 83L28 94Q15 101 19 86L23 65Q24 62 21 59L6 45Q-3 36 10 34L31 32Q35 32 37 28Z" fill={`url(#${id}-puff)`} />
      <path d="M44 9Q50-1 56 9L65 30Q66 33 70 33L91 35Q103 37 94 46L78 60Q75 62 76 66L80 87Q82 101 70 94L52 83Q50 81 47 83L28 94Q15 101 19 86L23 65Q24 62 21 59L6 45Q-3 36 10 34L31 32Q35 32 37 28Z" fill={`url(#${id}-gloss)`} />
    </svg>
  </div>;
});
