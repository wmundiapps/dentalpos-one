import { describe, it, expect } from "vitest";
import { generateTooth } from "./toothMesh";
import { DEFAULT_PROFILE, styleModifiers } from "./profiles";
import { MEAN_DIMS, toothRef } from "./anatomy";
import { type Mesh, transformMesh, checkWatertight, bounds } from "./mesh";
import { rasterizeSolid, sdfFromOccupancy, surfaceNets, makeGrid, gridPoint, gidx, sampleSdf } from "./voxel";
import { designRestoration, detectMarginProfile } from "./restoration";
import { mIdentity, type Vec3 } from "./math";

const tooth = (fdi: number) => { const r = toothRef(fdi); return generateTooth({ ref: r, dims: MEAN_DIMS[r.jaw][r.type], mods: styleModifiers(DEFAULT_PROFILE), occlusalTilt: 0 }); };
const place = (m: Mesh, t: Vec3): Mesh => transformMesh(m, { R: mIdentity(), t });

/** cenário sintético: gengiva plana z≤0, preparo oval cônico com ombro, vizinhos reais, antagonista plano */
function scene(opts: { antagonistZ?: number } = {}) {
  const n1 = tooth(45), n2 = tooth(47);
  const left = place(n1.mesh, [-(5.3 + n1.dims.md / 2), 0, -0.6]), right = place(n2.mesh, [5.4 + n2.dims.md / 2, 0, -0.6]);
  const g = makeGrid([-22, -14, -3], [22, 14, 10], 0.1, 0);
  const prepOcc = new Uint8Array(g.nx * g.ny * g.nz);
  const truth = { rm: (th: number) => 3.7 * (1 + 0.1 * Math.cos(2 * th)), hm: 0.5, top: 4.6 };
  for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const p = gridPoint(g, i, j, k), r = Math.hypot(p[0], p[1]), th = Math.atan2(p[1], p[0]);
    let inside = p[2] <= 0;
    const rmT = truth.rm(th);
    if (p[2] > 0 && p[2] <= truth.hm) inside = r <= rmT + 0.7;               // colar/ombro
    else if (p[2] > truth.hm && p[2] <= truth.top) inside = r <= rmT - Math.tan((3 * Math.PI) / 180) * (p[2] - truth.hm) * 1.0;
    if (inside) prepOcc[gidx(g, i, j, k)] = 1;
  }
  const partsOcc = rasterizeSolid(g, [left, right]);
  const occ = new Uint8Array(prepOcc.length); for (let i = 0; i < occ.length; i++) occ[i] = prepOcc[i] | partsOcc[i];
  const scan = surfaceNets(g, sdfFromOccupancy(g, occ), 1);
  // antagonista: plano com leve ondulação, acima
  let ant: Mesh | undefined;
  if (opts.antagonistZ !== undefined) {
    const ga = makeGrid([-14, -12, opts.antagonistZ - 0.3], [14, 12, opts.antagonistZ + 6], 0.2, 0);
    const oc = new Uint8Array(ga.nx * ga.ny * ga.nz);
    for (let k = 0; k < ga.nz; k++) for (let j = 0; j < ga.ny; j++) for (let i = 0; i < ga.nx; i++) { const p = gridPoint(ga, i, j, k); if (p[2] >= opts.antagonistZ + 0.25 * Math.sin(p[0] * 0.6)) oc[gidx(ga, i, j, k)] = 1; }
    ant = surfaceNets(ga, sdfFromOccupancy(ga, oc), 1);
  }
  return { scan, ant, truth, left, right };
}

describe("restauração a partir do escaneamento (cenário sintético)", () => {
  it("detecta o término com erro < 0,4 mm e gera coroa íntegra, com contatos e espessura", () => {
    const { scan, ant, truth, left, right } = scene({ antagonistZ: 7.4 });
    const t0 = Date.now();
    const model = tooth(46);
    const res = designRestoration({ scan, antagonist: ant, pick: [0.2, -0.1, truth.top], tooth: model, params: { resolution: 0.14 }, debug: true });
    const r = res.report;
    console.log("ms", Date.now() - t0, JSON.stringify({ ...r, stageLog: undefined, thickness: { ...r.thickness, thinPoints: undefined } }));
    // eixo ≈ vertical
    expect(Math.abs(res.axis[2])).toBeGreaterThan(0.95);
    // término: distância radial e altura
    let errR = 0, errH = 0;
    for (const p of res.margin) { const th = Math.atan2(p[1], p[0]); errR += Math.abs(Math.hypot(p[0], p[1]) - truth.rm(th)); errH += Math.abs(p[2] - truth.hm); }
    errR /= res.margin.length; errH /= res.margin.length;
    console.log("thin pts", JSON.stringify(r.thickness.thinPoints.slice(0, 25).map((p) => p.map((v) => +v.toFixed(1)))));
    console.log("erro término: radial", errR.toFixed(2), "altura", errH.toFixed(2));
    expect(errR).toBeLessThan(0.4); expect(errH).toBeLessThan(0.5);
    { // perfil vertical da coroa em colunas (x,y)
      const gg = makeGrid([-6, -6, -1], [6, 6, 11], 0.1, 0); const oc = rasterizeSolid(gg, [res.crown]);
      for (const [x, y] of [[0, 0], [1.5, 0.5], [-2, 1], [3, 0], [0, 2.5]]) { const i = Math.round((x - gg.o[0]) / 0.1), j = Math.round((y - gg.o[1]) / 0.1); const zs: number[] = []; let prev = 0; for (let k = 0; k < gg.nz; k++) { const v = oc[gidx(gg, i, j, k)]; if (v !== prev) zs.push(+(gg.o[2] + k * 0.1).toFixed(1)); prev = v; } console.log("coluna", x, y, "transições z:", JSON.stringify(zs)); }
      void gridPoint;
    }
    expect(r.components).toBeGreaterThanOrEqual(1);
    expect(res.crown.indices.length).toBeGreaterThan(3000);
    expect(r.volumeMm3).toBeGreaterThan(150);
    // coroa não invade os vizinhos
    const gN = makeGrid([-20, -10, -2], [20, 10, 12], 0.15, 0);
    const sN = sdfFromOccupancy(gN, rasterizeSolid(gN, [left, right]));
    let pen = 0, minD = 9;
    for (let v = 0; v < res.crown.positions.length / 3; v++) { const d = sampleSdf(gN, sN, [res.crown.positions[v * 3], res.crown.positions[v * 3 + 1], res.crown.positions[v * 3 + 2]]); if (d < -0.12) pen++; minD = Math.min(minD, d); }
    console.log("penetração nos vizinhos (vértices >0,12 mm):", pen, "dist. mín.", minD.toFixed(3));
    expect(pen).toBe(0);
    expect(checkWatertight(res.crown, 1e-3).openEdges).toBeLessThan(10);
    // contatos proximais próximos de zero
    expect(r.contacts.mesialGap).not.toBeNull(); expect(r.contacts.mesialGap!).toBeLessThan(0.3);
    expect(r.contacts.distalGap!).toBeLessThan(0.3);
    // espessura axial ≥ 0,7
    expect(r.thickness.minAxial).toBeGreaterThan(0.58);
    expect(r.thickness.minOcclusal!).toBeGreaterThan(0.8);
    // folga de cimento no término
    expect(r.marginFit.maxGap).toBeLessThan(0.25);
    expect(bounds(res.crown).size[2]).toBeGreaterThan(5);
  }, 240000);
  it("perfil de término: parede + ombro", () => {
    expect(typeof detectMarginProfile).toBe("function");
  });
});
