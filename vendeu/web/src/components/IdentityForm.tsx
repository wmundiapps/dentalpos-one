import { useState } from 'react';
import { isValidCnpj, isValidCpf, isValidCep, onlyDigits } from '@shared/documents';
import { maskCepInput, maskCnpjInput, maskCpfInput, STATES } from '../lib/format';
import { SelectField, TextField } from './fields';


export interface Identity {
  docType: 'cpf' | 'cnpj'; docNumber: string; companyName: string; birthDate: string;
  cep: string; street: string; number: string; complement: string; district: string; city: string; state: string;
}
export const emptyIdentity = (): Identity => ({ docType: 'cpf', docNumber: '', companyName: '', birthDate: '', cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' });

export function validateIdentity(v: Identity): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.docType === 'cpf' && !isValidCpf(v.docNumber)) e.docNumber = 'CPF inválido. Confira os 11 dígitos.';
  if (v.docType === 'cnpj' && !isValidCnpj(v.docNumber)) e.docNumber = 'CNPJ inválido. Confira os 14 dígitos.';
  if (v.docType === 'cnpj' && v.companyName.trim().length < 2) e.companyName = 'Informe a razão social.';
  if (v.docType === 'cpf' && !v.birthDate) e.birthDate = 'Informe a data de nascimento.';
  if (v.birthDate) {
    const age = (Date.now() - new Date(v.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (!(age >= 18 && age < 120)) e.birthDate = 'Anunciante precisa ter 18 anos ou mais.';
  }
  if (!isValidCep(v.cep)) e.cep = 'CEP inválido (8 dígitos).';
  if (v.street.trim().length < 3) e.street = 'Informe a rua.';
  if (!v.number.trim()) e.number = 'Informe o número (ou S/N).';
  if (v.district.trim().length < 2) e.district = 'Informe o bairro.';
  if (v.city.trim().length < 2) e.city = 'Informe a cidade.';
  if (!v.state) e.state = 'Escolha o estado.';
  return e;
}

export function identityPayload(v: Identity) {
  return {
    docType: v.docType, docNumber: onlyDigits(v.docNumber),
    ...(v.docType === 'cnpj' ? { companyName: v.companyName.trim() } : {}),
    ...(v.birthDate ? { birthDate: v.birthDate } : {}),
    address: { cep: onlyDigits(v.cep), street: v.street.trim(), number: v.number.trim(), complement: v.complement.trim(), district: v.district.trim(), city: v.city.trim(), state: v.state },
  };
}

export function AddressFields({ v, set, errors }: { v: Pick<Identity, 'cep' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'state'>; set: (p: Partial<Identity>) => void; errors: Record<string, string> }) {
  const [cepMsg, setCepMsg] = useState('');
  const lookup = async (cep: string) => {
    if (onlyDigits(cep).length !== 8) return;
    setCepMsg('Buscando endereço…');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${onlyDigits(cep)}/json/`);
      const j = await r.json();
      if (!r.ok || j.erro) throw new Error('nao_achou');
      set({ street: j.logradouro || v.street, district: j.bairro || v.district, city: j.localidade || v.city, state: j.uf || v.state });
      setCepMsg('Endereço encontrado. Confira e informe o número.');
    } catch {
      setCepMsg('Não conseguimos buscar o CEP agora. Preencha o endereço manualmente.');
    }
  };
  return (
    <fieldset className="fieldset">
      <legend>Endereço</legend>
      <div className="form-grid">
        <TextField label="CEP" value={v.cep} onChange={(e) => set({ cep: maskCepInput(e.target.value) })} onBlur={(e) => void lookup(e.target.value)}
          inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" error={errors.cep} hint={cepMsg} required />
        <TextField label="Rua" value={v.street} onChange={(e) => set({ street: e.target.value })} autoComplete="address-line1" error={errors.street} maxLength={150} required />
        <TextField label="Número" value={v.number} onChange={(e) => set({ number: e.target.value })} error={errors.number} maxLength={20} required />
        <TextField label="Complemento (opcional)" value={v.complement} onChange={(e) => set({ complement: e.target.value })} maxLength={80} />
        <TextField label="Bairro" value={v.district} onChange={(e) => set({ district: e.target.value })} error={errors.district} maxLength={80} required />
        <TextField label="Cidade" value={v.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" error={errors.city} maxLength={80} required />
        <SelectField label="Estado" value={v.state} onChange={(e) => set({ state: e.target.value })} error={errors.state} required>
          <option value="">Escolha…</option>
          {STATES.map((s) => <option key={s}>{s}</option>)}
        </SelectField>
      </div>
    </fieldset>
  );
}

export function IdentityFields({ v, set, errors }: { v: Identity; set: (p: Partial<Identity>) => void; errors: Record<string, string> }) {
  const mask = v.docType === 'cpf' ? maskCpfInput : maskCnpjInput;
  return (
    <>
      <fieldset className="fieldset">
        <legend>Documento</legend>
        <div className="seg-radio" role="radiogroup" aria-label="Tipo de documento">
          {(['cpf', 'cnpj'] as const).map((t) => (
            <label key={t} className={v.docType === t ? 'on' : ''}>
              <input type="radio" name="docType" checked={v.docType === t} onChange={() => set({ docType: t, docNumber: '' })} />
              {t === 'cpf' ? 'Pessoa física (CPF)' : 'Empresa (CNPJ)'}
            </label>
          ))}
        </div>
        <div className="form-grid">
          <TextField label={v.docType === 'cpf' ? 'CPF' : 'CNPJ'} value={v.docNumber} onChange={(e) => set({ docNumber: mask(e.target.value) })} inputMode="numeric" autoComplete="off"
            placeholder={v.docType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'} error={errors.docNumber} required
            hint="Guardado cifrado. Aparece mascarado nas telas." />
          {v.docType === 'cnpj' && <TextField label="Razão social" value={v.companyName} onChange={(e) => set({ companyName: e.target.value })} error={errors.companyName} maxLength={150} required />}
          <TextField label={v.docType === 'cnpj' ? 'Data de nascimento do responsável (opcional)' : 'Data de nascimento'} type="date" value={v.birthDate} onChange={(e) => set({ birthDate: e.target.value })}
            autoComplete="bday" error={errors.birthDate} required={v.docType === 'cpf'} max={new Date().toISOString().slice(0, 10)} hint="Para anunciar é preciso ter 18 anos ou mais." />
        </div>
      </fieldset>
      <AddressFields v={v} set={set} errors={errors} />
    </>
  );
}
