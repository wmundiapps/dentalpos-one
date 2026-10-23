import { redirect } from 'next/navigation';

/** Endereço curto da política de privacidade (usado nas lojas de apps e nos e-mails) */
export default function Privacidade() {
  redirect('/termos#privacidade');
}
