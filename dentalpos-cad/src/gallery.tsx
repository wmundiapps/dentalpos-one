// Galeria da biblioteca de dentes: miniaturas 3D de cada tipo dental nas formas disponíveis.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import * as THREE from "three";
import "./ui/styles.css";
import { MEAN_DIMS, toothRef, type ToothType } from "./core/anatomy";
import { DEFAULT_PROFILE, FORM_LABEL, styleModifiers, type ToothForm } from "./core/profiles";
import { generateTooth } from "./core/toothMesh";
import { ANDREWS_NORMS } from "./core/anatomy";

const TYPES: Array<[ToothType, number, number]> = [["central", 11, 41], ["lateral", 12, 42], ["canine", 13, 43], ["premolar1", 14, 44], ["premolar2", 15, 45], ["molar1", 16, 46], ["molar2", 17, 47]];
const FORMS = ["ovoid", "square"] as ToothForm[];

function thumbs(): Record<string, string> {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(180, 190);
  const out: Record<string, string> = {};
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x0f1722);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(30, 60, 80); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 180 / 190, 1, 500);
  for (const form of FORMS) for (const [type, up, lo] of TYPES) for (const [fdi, view] of [[up, "v"], [up, "p"], [up, "o"], [lo, "p"], [lo, "o"]] as Array<[number, string]>) {
    const ref = toothRef(fdi), dims = MEAN_DIMS[ref.jaw][ref.type], mods = styleModifiers(DEFAULT_PROFILE, form);
    const t = generateTooth({ ref, dims: { md: dims.md * mods.widthScale, bl: dims.bl, h: dims.h * mods.heightScale }, mods, occlusalTilt: type.startsWith("pre") || type.startsWith("mol") ? Math.abs(ANDREWS_NORMS[ref.jaw][ref.type].torque) * 0.55 : 0 });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(t.mesh.positions, 3)); g.setAttribute("normal", new THREE.BufferAttribute(t.mesh.normals!, 3)); g.setIndex(new THREE.BufferAttribute(t.mesh.indices, 1));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.4 })); sc.add(m);
    const c = new THREE.Vector3(0, 0, t.dims.h / 2);
    if (view === "v") { cam.up.set(0, 0, 1); cam.position.set(0, 34, t.dims.h / 2); } else if (view === "p") { cam.up.set(0, 0, 1); cam.position.set(14, 24, t.dims.h + 14); } else { cam.up.set(0, 1, 0); cam.position.set(0, 0, t.dims.h + 34); }
    if (ref.jaw === "lower" && view === "v") { /* mesma vista */ }
    cam.lookAt(c); r.render(sc, cam); out[`${form}-${type}-${view}-${fdi}`] = r.domElement.toDataURL(); sc.remove(m); g.dispose();
  }
  r.dispose();
  return out;
}

function Gallery() {
  const [imgs, setImgs] = useState<Record<string, string> | null>(null);
  useEffect(() => { setTimeout(() => setImgs(thumbs()), 30); }, []);
  if (!imgs) return <p style={{ padding: 20 }}>Gerando miniaturas…</p>;
  return (
    <div style={{ padding: 16 }} data-testid="gallery">
      <h2>Biblioteca de dentes — {FORMS.length} formas × {TYPES.length} tipos</h2>
      {FORMS.map((f) => (
        <div key={f}><h3>{FORM_LABEL[f]}</h3>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TYPES.flatMap(([type, up, lo]) => [[up, "v"], [up, "p"], [up, "o"], [lo, "p"], [lo, "o"]].map(([fdi, v]) => <img key={`${f}${type}${v}${fdi}`} src={imgs[`${f}-${type}-${v}-${fdi}`]} width={140} title={`${fdi} ${v === "v" ? "vestibular" : "oclusal"}`} style={{ borderRadius: 6 }} />))}
          </div>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Gallery />);
