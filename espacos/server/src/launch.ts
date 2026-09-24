import { LAUNCH_COUNTRY_CODES } from '../../shared/countries';

/** País liberado para anúncios e reservas. LAUNCH_COUNTRIES=BR,PT (ou "all") sobrescreve a lista padrão. */
export function isLaunched(countryCode: string): boolean {
  const env = process.env.LAUNCH_COUNTRIES;
  if (env === 'all') return true;
  return (env ? env.split(',').map((c) => c.trim().toUpperCase()) : LAUNCH_COUNTRY_CODES).includes(countryCode);
}
