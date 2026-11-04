
// Botão de acesso ao DentalPos Manager.
// Só aparece para os e-mails da lista ALLOWED_EMAILS.
// Obs.: esconder o botão é só uma conveniência visual. A proteção real é o login do próprio Manager.

const ALLOWED_EMAILS = ['clinicaravel@gmail.com'];

export function canSeeManager(email?: string | null): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}

// Endereço do Manager. Quando o domínio próprio estiver ativo, troque para:
// https://erp.dentalposmanager.com.br  (ou defina VITE_DENTALPOS_MANAGER_URL no ambiente)
export const MANAGER_URL: string =
  (import.meta as any).env?.VITE_DENTALPOS_MANAGER_URL ||
  'https://dentalpos-manager-production.up.railway.app';

type Props = { email?: string | null; className?: string };

export function DentalPosManagerButton({ email, className }: Props) {
  const ok = !!email && ALLOWED_EMAILS.includes(email.trim().toLowerCase());
  if (!ok) return null;
  return (
    <a
      href={MANAGER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={
        className
          ? undefined
          : {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 600,
              textDecoration: 'none',
            }
      }
    >
      Acessar DentalPos Manager
    </a>
  );
}

export default DentalPosManagerButton;
