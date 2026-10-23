'use client';

export function PrintButton({ label = 'Imprimir ou salvar em PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn coin" onClick={() => window.print()}>
      {label}
    </button>
  );
}
