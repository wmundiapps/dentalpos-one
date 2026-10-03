import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Evaluated } from "../core/project";
import type { Mesh } from "../core/mesh";
import { shadeRgb } from "../core/materials";
import type { Severity } from "../core/rules";

export interface ExtraMesh { id: string; mesh: Mesh; color: string; opacity?: number; wire?: boolean; visible?: boolean }
export interface LineSet { id: string; pts: Array<[number, number, number]>; color: string; closed?: boolean }
export type ColorMode = "shade" | "severity" | "contact" | "ghost";
export interface ViewerProps {
  ev: Evaluated;
  shade: string;
  selected: number | null;
  onSelect: (fdi: number | null) => void;
  onDrag?: (fdi: number, dx: number, dy: number) => void;
  showUpper: boolean; showLower: boolean;
  colorMode: ColorMode;
  severity: Map<number, Severity>;
  vertexColors?: Map<number, Float32Array>;
  extras?: ExtraMesh[];
  lines?: LineSet[];
  view: { name: string; nonce: number };
  dragMode?: boolean;
  hideTeeth?: boolean;
  onPickPoint?: (p: [number, number, number], mesh: string) => void;
  highlightTeeth?: number[];
  shot?: { nonce: number; cb: (url: string) => void };
}

const toGeo = (m: Mesh) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  if (m.normals) g.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3)); 
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  if (!m.normals) g.computeVertexNormals();
  return g;
};
/** esmalte: cervical mais saturado/escuro, terço incisal mais claro e translúcido (azulado) */
export function enamel(t: Evaluated["teeth"] extends Map<number, infer W> ? W : never, rgb: [number, number, number]): Float32Array {
  const pos = t.mesh.positions, out = new Float32Array(pos.length);
  const o = t.occlusal, c = t.lm.cervicalCenter, h = t.dims.h;
  for (let i = 0; i < pos.length; i += 3) {
    const d = ((pos[i] - c[0]) * o[0] + (pos[i + 1] - c[1]) * o[1] + (pos[i + 2] - c[2]) * o[2]) / h;
    const v = Math.min(1, Math.max(0, d));
    const cerv = 1 - Math.min(1, v / 0.35), inc = Math.max(0, (v - 0.72) / 0.28);
    const ant = t.ref.index <= 3 ? 1 : 0.45;
    let r = (rgb[0] / 255) * 0.82, g = (rgb[1] / 255) * 0.82, b = (rgb[2] / 255) * 0.82;
    r = r * (1 - 0.1 * cerv) + 0.04 * inc * ant; g = g * (1 - 0.14 * cerv) + 0.05 * inc * ant; b = b * (1 - 0.3 * cerv) + 0.1 * inc * ant;
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }
  return out;
}
const SEV_COLOR: Record<Severity, string> = { error: "#ff5d5d", warning: "#ffb454", info: "#6cb6ff", ok: "#7bd88f" };

export function Viewer3D(props: ViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; controls: OrbitControls; teeth: THREE.Group; extras: THREE.Group; lines: THREE.Group; ray: THREE.Raycaster; props: ViewerProps } | null>(null);
  st.current && (st.current.props = props);

  // ---- setup ----
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1722);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(78, 100, 62);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -18, 0);
    controls.enableDamping = true;
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.28;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(60, 140, 120); scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.5); fill.position.set(-90, 40, -60); scene.add(fill);
    const grid = new THREE.GridHelper(160, 16, 0x2a3a50, 0x1c2838); grid.rotation.x = Math.PI / 2; grid.position.z = -22; scene.add(grid);
    const teeth = new THREE.Group(), extras = new THREE.Group(), lines = new THREE.Group();
    scene.add(teeth, extras, lines);
    const ray = new THREE.Raycaster();
    st.current = { scene, camera, renderer, controls, teeth, extras, lines, ray, props };

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    // ---- interação ----
    const ndc = (e: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    let down: { x: number; y: number; fdi: number | null; drag: boolean; plane: THREE.Plane; last: THREE.Vector3 | null } | null = null;
    const pick = (e: PointerEvent) => {
      const s = st.current!; s.ray.setFromCamera(ndc(e), s.camera);
      const hits = s.ray.intersectObjects([...s.teeth.children, ...s.extras.children], false).filter((h) => h.object.visible);
      return hits[0] ?? null;
    };
    const onDown = (e: PointerEvent) => {
      const s = st.current!; const h = pick(e);
      const fdi = h && h.object.userData.fdi ? (h.object.userData.fdi as number) : null;
      let plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), last: THREE.Vector3 | null = null;
      if (fdi && s.props.dragMode && s.props.selected === fdi) {
        const t = s.props.ev.teeth.get(fdi)!; plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -t.lm.anchor[2]);
        s.ray.setFromCamera(ndc(e), s.camera); last = s.ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (last) s.controls.enabled = false;
      }
      down = { x: e.clientX, y: e.clientY, fdi, drag: false, plane, last };
    };
    const onMove = (e: PointerEvent) => {
      const s = st.current!;
      if (!down || !down.last || !s.props.dragMode || !down.fdi) return;
      s.ray.setFromCamera(ndc(e), s.camera);
      const cur = s.ray.ray.intersectPlane(down.plane, new THREE.Vector3());
      if (!cur) return;
      const dx = cur.x - down.last.x, dy = cur.y - down.last.y;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 3) down.drag = true;
      if (down.drag) { s.props.onDrag?.(down.fdi, dx, dy); down.last = cur; }
    };
    const onUp = (e: PointerEvent) => {
      const s = st.current!; s.controls.enabled = true;
      if (down && !down.drag && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) < 5) {
        const h = pick(e);
        if (h?.object.userData.fdi) s.props.onSelect(h.object.userData.fdi as number);
        else if (h && s.props.onPickPoint) s.props.onPickPoint([h.point.x, h.point.y, h.point.z], String(h.object.userData.id));
        else if (!h) s.props.onSelect(null);
      }
      down = null;
    };
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onDown); dom.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener("pointerdown", onDown); dom.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); st.current = null;
    };
  }, []);

  // ---- dentes ----
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.teeth.children.forEach((c) => { (c as THREE.Mesh).geometry.dispose(); ((c as THREE.Mesh).material as THREE.Material).dispose(); });
    s.teeth.clear();
    if (props.hideTeeth) return;
    const [r, g, b] = shadeRgb(props.shade);
    const hi = new Set(props.highlightTeeth ?? []);
    for (const t of props.ev.teeth.values()) {
      if ((t.ref.jaw === "upper" && !props.showUpper) || (t.ref.jaw === "lower" && !props.showLower)) continue;
      const geo = toGeo(t.mesh);
      let vc = props.colorMode === "contact" ? props.vertexColors?.get(t.fdi) : undefined;
      if (!vc && props.colorMode === "shade") vc = enamel(t, [r, g, b]);
      if (vc) geo.setAttribute("color", new THREE.BufferAttribute(vc, 3));
      const sel = props.selected === t.fdi;
      let color = new THREE.Color(`rgb(${r},${g},${b})`);
      if (props.colorMode === "severity") { const sv = props.severity.get(t.fdi); if (sv) color = new THREE.Color(SEV_COLOR[sv]); }
      if (hi.has(t.fdi)) color = new THREE.Color("#ffb454");
      if (sel) color = color.clone().lerp(new THREE.Color("#4da3ff"), 0.55);
      const mat = new THREE.MeshPhysicalMaterial({ color: vc && props.colorMode === "shade" && !sel ? new THREE.Color(1, 1, 1) : color, roughness: 0.3, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, vertexColors: !!vc, transparent: props.colorMode === "ghost", opacity: props.colorMode === "ghost" ? 0.45 : 1, emissive: sel ? new THREE.Color("#10304f") : new THREE.Color(0x000000) });
      const m = new THREE.Mesh(geo, mat); m.userData.fdi = t.fdi; s.teeth.add(m);
    }
  }, [props.ev, props.shade, props.selected, props.showUpper, props.showLower, props.colorMode, props.severity, props.vertexColors, props.hideTeeth, props.highlightTeeth]);

  // ---- extras ----
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.extras.children.forEach((c) => { (c as THREE.Mesh).geometry.dispose(); ((c as THREE.Mesh).material as THREE.Material).dispose(); });
    s.extras.clear();
    for (const x of props.extras ?? []) {
      if (x.visible === false || !x.mesh.indices.length) continue;
      const mat = new THREE.MeshStandardMaterial({ color: x.color, roughness: 0.55, transparent: (x.opacity ?? 1) < 1, opacity: x.opacity ?? 1, wireframe: !!x.wire, side: THREE.DoubleSide });
      const m = new THREE.Mesh(toGeo(x.mesh), mat); m.userData.id = x.id; s.extras.add(m);
    }
  }, [props.extras]);

  // ---- linhas ----
  useEffect(() => {
    const s = st.current; if (!s) return;
    s.lines.children.forEach((c) => { (c as THREE.Line).geometry.dispose(); ((c as THREE.Line).material as THREE.Material).dispose(); });
    s.lines.clear();
    for (const l of props.lines ?? []) {
      const pts = l.pts.map((p) => new THREE.Vector3(...p));
      const geo = new THREE.BufferGeometry().setFromPoints(l.closed ? [...pts, pts[0]] : pts);
      s.lines.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: l.color })));
    }
  }, [props.lines]);

  // ---- câmera ----
  useEffect(() => {
    const s = st.current; if (!s) return;
    const V: Record<string, [number[], number[]]> = {
      front: [[0, 120, 4], [0, -10, 0]], left: [[130, -22, 6], [0, -22, 0]], right: [[-130, -22, 6], [0, -22, 0]],
      upper: [[0, -18, -120], [0, -18, 0]], lower: [[0, -18, 120], [0, -18, 0]], iso: [[78, 100, 62], [0, -18, 0]], back: [[0, -150, 30], [0, -20, 0]],
    };
    if (props.view.name === "fit") {
      const box = new THREE.Box3().setFromObject(s.extras.children.length ? s.extras : s.teeth);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
        const dir = s.camera.position.clone().sub(s.controls.target).normalize();
        s.controls.target.copy(c); s.camera.position.copy(c.clone().add(dir.multiplyScalar(Math.max(60, size * 1.35)))); s.controls.update();
      }
      return;
    }
    const v = V[props.view.name] ?? V.iso;
    s.camera.position.set(...(v[0] as [number, number, number])); s.controls.target.set(...(v[1] as [number, number, number]));
    const occl = props.view.name === "upper" || props.view.name === "lower";
    s.camera.up.set(0, occl ? 1 : 0, occl ? 0 : 1);
    s.controls.update();
  }, [props.view.nonce]);

  useEffect(() => {
    const s = st.current; if (!s || !props.shot) return;
    s.renderer.render(s.scene, s.camera);
    props.shot.cb(s.renderer.domElement.toDataURL("image/png"));
  }, [props.shot?.nonce]);

  return <div ref={host} className="viewer" data-testid="viewer3d" />;
}
