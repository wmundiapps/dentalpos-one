import { useId, type InputHTMLAttributes } from 'react';
import { Field } from './ui';
import { maskMoney } from '../lib/format';

type Common = { label: string; hint?: React.ReactNode; error?: string };

export function TextField({ label, hint, error, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} aria-invalid={!!error || undefined} {...rest} />
    </Field>
  );
}

export function MoneyField({ label, hint, error, value, onChange, ...rest }: Common & { value: string; onChange: (masked: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="money">
        <span aria-hidden="true">R$</span>
        <input id={id} inputMode="numeric" autoComplete="off" placeholder="0,00" value={value} onChange={(e) => onChange(maskMoney(e.target.value))} aria-invalid={!!error || undefined} {...rest} />
      </div>
    </Field>
  );
}

export function SelectField({ label, hint, error, children, ...rest }: Common & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} aria-invalid={!!error || undefined} {...rest}>{children}</select>
    </Field>
  );
}

export function TextAreaField({ label, hint, error, ...rest }: Common & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} aria-invalid={!!error || undefined} {...rest} />
    </Field>
  );
}
