// Renderiza os dentes projetados (malhas 3D reais, vista frontal ortográfica) sobre a foto, com esmalte sombreado.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Evaluated } from "../core/project";
import type { SmileMap } from "../core/smile";
import { shadeRgb } from "../core/materials";
import { enamel } from "./Viewer3D";

interface Rig { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; group: THREE.Group; mat: THREE.MeshPhysicalMaterial }
let rig: Rig | null = null;
let failed = false;

function getRig(w: number, h: number): Rig | null {
  if (failed) return null;
  try {
    if (!rig) {
      const canvas = document.createElement("canvas");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      const scene = new THREE.Scene();
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a7a70, 0.75));
      const key = new THREE.DirectionalLight(0xfff4e8, 1.25); key.position.set(30, 160, 90); scene.add(key);
      const fill = new THREE.DirectionalLight(0xdbe6ff, 0.5); fill.position.set(-80, 120, -20); scene.add(fill);
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      camera.matrixAutoUpdate = false; camera.matrixWorld.identity(); camera.matrixWorldInverse.identity();
      const group = new THREE.Group(); scene.add(group);
      const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.28, sheen: 0.2, side: THREE.DoubleSide });
      rig = { renderer, scene, camera, group, mat };
    }
    rig.renderer.setSize(w, h, false);
    return rig;
  } catch { failed = true; return null; }
}

/** Devolve um canvas com os dentes renderizados já na geometria da foto (ou null se WebGL indisponível). */
export function renderTeethSprite(ev: Evaluated, map: SmileMap, shade: string, w: number, h: number): HTMLCanvasElement | null {
  const r = getRig(w, h); if (!r) return null;
  const rgb = shadeRgb(shade);
  for (const c of [...r.group.children]) { r.group.remove(c); (c as THREE.Mesh).geometry.dispose(); }
  for (const t of ev.teeth.values()) {
    if (t.ref.index > 7) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(t.mesh.positions, 3));
    if (t.mesh.normals) g.setAttribute("normal", new THREE.BufferAttribute(t.mesh.normals, 3));
    g.setAttribute("color", new THREE.BufferAttribute(enamel(t, rgb), 3));
    g.setIndex(new THREE.BufferAttribute(t.mesh.indices, 1));
    const m = new THREE.Mesh(g, r.mat); m.frustumCulled = false; r.group.add(m);
  }
  // projeção: mundo (x, z) → pixel da foto (espelhada em x; o canvas é invertido ao compor, preservando a orientação da malha)
  const rot = (map.rollDeg * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot), k = map.pxPerMm, [ox, oy] = map.originPx;
  const a = (2 * k * cs) / w, b = (2 * k * sn) / w, c0 = (2 * (ox - k * map.zRef * sn)) / w - 1;
  const d = -(2 * k * sn) / h, e = (2 * k * cs) / h, f0 = 1 - (2 * oy) / h - (2 * k * map.zRef * cs) / h;
  r.camera.projectionMatrix.set(-a, 0, -b, -c0, d, 0, e, f0, 0, -1 / 300, 0, 0, 0, 0, 0, 1);
  r.camera.projectionMatrixInverse.copy(r.camera.projectionMatrix).invert();
  r.renderer.render(r.scene, r.camera);
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const cx = out.getContext("2d")!;
  cx.translate(w, 0); cx.scale(-1, 1); cx.drawImage(r.renderer.domElement, 0, 0, w, h);
  return out;
}
