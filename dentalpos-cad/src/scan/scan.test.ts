import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { diagnoseMesh } from "./engine/meshDiagnostics";
import { repairMesh } from "./engine/meshRepair";
import { analyzeToothThickness } from "./engine/toothThicknessAnalysis";

describe("motor portado do DentalPos One", () => {
  it("diagnostica e repara triângulos duplicados em uma esfera", () => {
    const g = new THREE.SphereGeometry(5, 24, 16).toNonIndexed();
    const pos = Array.from(g.getAttribute("position").array);
    const dup = new THREE.BufferGeometry();
    dup.setAttribute("position", new THREE.Float32BufferAttribute([...pos, ...pos.slice(0, 9 * 20)], 3));
    const d = diagnoseMesh(dup);
    expect(d.duplicateTriangles).toBeGreaterThan(0);
    const r = repairMesh(dup);
    expect(r.removedDuplicateTriangles).toBeGreaterThan(0);
    expect(diagnoseMesh(r.geometry).duplicateTriangles).toBe(0);
    const t = analyzeToothThickness(new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial()));
    expect(t.maximumThickness).toBeGreaterThan(0);
  });
});
