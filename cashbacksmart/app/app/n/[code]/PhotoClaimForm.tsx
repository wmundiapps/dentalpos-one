'use client';

import { useState } from 'react';
import { photoClaimAction } from '@/app/actions';
import { ActionForm, Submit } from '@/components/ui';

/** Reduz a foto no próprio celular (até 1600 px, JPEG) para enviar rápido e gastar menos dados */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? new File([blob], 'nota.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

export function PhotoClaimForm({ kit, stores }: { kit?: string; stores?: { kit_code: string; name: string }[] }) {
  const [preview, setPreview] = useState<string | null>(null);
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) return;
    const small = await shrink(f);
    const dt = new DataTransfer();
    dt.items.add(small);
    input.files = dt.files;
    setPreview(URL.createObjectURL(small));
  }
  return (
    <ActionForm action={photoClaimAction} className="stack" resetOnOk onOk={() => setPreview(null)}>
      {kit ? (
        <input type="hidden" name="kit" value={kit} />
      ) : (
        <div className="field">
          <label htmlFor="p-kit">Loja</label>
          <select id="p-kit" name="kit" required defaultValue="">
            <option value="" disabled>
              Escolha a loja
            </option>
            {(stores || []).map((s) => (
              <option key={s.kit_code} value={s.kit_code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="p-photo">Foto da nota fiscal</label>
        <input id="p-photo" name="photo" type="file" accept="image/*" capture="environment" onChange={onPick} required />
        {preview && <img src={preview} alt="Foto da nota" style={{ marginTop: 8, maxHeight: 220, borderRadius: 12, objectFit: 'contain', width: '100%', background: '#EEF3FF' }} />}
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="p-amount">Valor total (R$)</label>
          <input id="p-amount" name="amount" inputMode="decimal" placeholder="0,00" required />
        </div>
        <div className="field">
          <label htmlFor="p-number">Número da nota</label>
          <input id="p-number" name="number" inputMode="numeric" placeholder="ex.: 123456" required />
        </div>
      </div>
      <Submit pendingText="Enviando…">Enviar nota</Submit>
    </ActionForm>
  );
}
