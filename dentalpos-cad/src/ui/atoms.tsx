import type { ReactNode } from "react";

export function Slider(p: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; digits?: number; testid?: string }) {
  const d = p.digits ?? (p.step && p.step < 1 ? (p.step < 0.1 ? 2 : 1) : 0);
  return (
    <div className="field">
      <label><span>{p.label}</span><b>{p.value.toFixed(d).replace(".", ",")}{p.unit ?? ""}</b></label>
      <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value} data-testid={p.testid} onChange={(e) => p.onChange(parseFloat(e.target.value))} />
    </div>
  );
}
export function Sel<T extends string>(p: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; testid?: string }) {
  return (
    <div className="field">
      <label><span>{p.label}</span></label>
      <select value={p.value} data-testid={p.testid} onChange={(e) => p.onChange(e.target.value as T)}>{p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}
export const Check = (p: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", cursor: "pointer" }}><input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />{p.label}</label>
);
export const Section = (p: { title: string; children: ReactNode }) => (<><h4>{p.title}</h4>{p.children}</>);
export const sevClass = (s: string) => ({ error: "e", warning: "w", info: "i", ok: "o" } as Record<string, string>)[s] ?? "";
export const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
export function download(name: string, data: BlobPart | Uint8Array, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
