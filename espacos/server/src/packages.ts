// Pacote recorrente (até 3 dias da semana, por até 30 dias, pago de uma vez): aviso de
// renovação 5 dias antes do último uso, com o mesmo pacote já montado para as semanas seguintes.
import { pool, withTx } from './db.js';
import * as repo from './repo.js';
import { notify } from './notify.js';
import { addDays, bookingPattern, daysBetween, todayInZone, weekdayOf } from '../../shared/rules.js';
import type { Booking } from '../../shared/types.js';

export const RENEWAL_NOTICE_DAYS = 5;

/** Link para reservar o próximo pacote: mesmos dias da semana e horário, começando depois do último dia. */
export function renewalLink(b: Booking) {
  const dates = b.occurrences.map((o) => o.date).sort();
  const days = [...new Set(dates.map(weekdayOf))].sort().join(',');
  const weeks = Math.min(4, Math.max(1, Math.ceil((daysBetween(dates[0], dates[dates.length - 1]) + 1) / 7)));
  const o = b.occurrences[0];
  const q = new URLSearchParams({ pacote: '1', dias: days, inicio: o.start, fim: o.end, semanas: String(weeks), de: addDays(dates[dates.length - 1], 1) });
  return `/espacos/${b.listingId}?${q}`;
}

export async function sendPackageRenewals(now = new Date()) {
  const active = await repo.findBookings(pool, "status = ANY($1) AND renewal_reminded_at IS NULL", [['confirmed', 'checked_in']]);
  let sent = 0;
  for (const b of active) {
    if (bookingPattern(b.occurrences) !== 'package') continue;
    const listing = await repo.getListing(pool, b.listingId);
    if (!listing) continue;
    const last = b.occurrences.map((o) => o.date).sort().at(-1)!;
    const left = daysBetween(todayInZone(listing.timezone, now), last);
    if (left < 0 || left > RENEWAL_NOTICE_DAYS) continue;
    await withTx(async (tx) => {
      const claimed = await tx.query('UPDATE bookings SET renewal_reminded_at = now() WHERE id = $1 AND renewal_reminded_at IS NULL', [b.id]);
      if (!claimed.rowCount) return;
      await notify(tx, { userId: b.guestId }, 'package_renewal',
        `Seu pacote em "${listing.title}" termina em ${left === 0 ? 'hoje' : `${left} dia${left > 1 ? 's' : ''}`}. Quer renovar? Os mesmos dias e horários já estão separados no link: é só conferir e pagar.`,
        renewalLink(b));
      await notify(tx, { userId: b.hostId }, 'package_ending',
        `O pacote recorrente em "${listing.title}" termina em ${left === 0 ? 'hoje' : `${left} dia${left > 1 ? 's' : ''}`}. Avisamos o profissional para renovar.`,
        `/anfitriao/reservas/${b.id}`);
      sent++;
    });
  }
  return sent;
}
