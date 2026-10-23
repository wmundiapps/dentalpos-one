import { CATEGORIES, STATES } from '@/lib/config';

export function Field({ label, name, type = 'text', hint, prefix = 'f', ...rest }: { label: string; name: string; type?: string; hint?: string; prefix?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `${prefix}-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} {...rest} />
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

export function StateSelect({ defaultValue = 'PR', prefix = 'f' }: { defaultValue?: string; prefix?: string }) {
  return (
    <div className="field">
      <label htmlFor={`${prefix}-state`}>UF</label>
      <select id={`${prefix}-state`} name="state" defaultValue={defaultValue} required>
        {STATES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

export function CategorySelect({ defaultValue, prefix = 'f' }: { defaultValue?: string; prefix?: string }) {
  return (
    <div className="field">
      <label htmlFor={`${prefix}-category`}>Ramo</label>
      <select id={`${prefix}-category`} name="category" defaultValue={defaultValue || ''} required>
        <option value="" disabled>
          Escolha
        </option>
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

export function CashbackFields({ kind = 'percent', value = '' }: { kind?: string; value?: string }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
      <legend style={{ fontWeight: 600, fontSize: '.92rem', marginBottom: 6 }}>Cashback que você vai oferecer</legend>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="seg" role="radiogroup" aria-label="Tipo de cashback">
          <label>
            <input type="radio" name="cashbackKind" value="percent" defaultChecked={kind !== 'fixed'} />
            <span>% da compra</span>
          </label>
          <label>
            <input type="radio" name="cashbackKind" value="fixed" defaultChecked={kind === 'fixed'} />
            <span>Valor fixo R$</span>
          </label>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <input name="cashbackValue" aria-label="Valor do cashback" inputMode="decimal" placeholder="ex.: 5 (%) ou 3,00 (R$)" defaultValue={value} required />
        </div>
      </div>
      <small className="muted" style={{ display: 'block', marginTop: 6 }}>
        Você pode criar outras regras depois: dias da semana, compra mínima, teto e validade.
      </small>
    </fieldset>
  );
}
