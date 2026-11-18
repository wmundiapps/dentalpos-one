import type { PrismaClient } from '@prisma/client'

/**
 * Polimento da base de DEMONSTRAÇÃO: o que o tempo faz "envelhecer" (prazos vencidos, parcelas em aberto, alertas) é resolvido ou
 * reprogramado, para a demonstração mostrar sempre a instituição em boa situação. Só roda quando chamado explicitamente
 * (script do ambiente de demonstração ou DEMO_POLISH=1). Idempotente e sem apagar cadastros.
 */
const FINAIS = '(PAGO|PAGA|CONCLU|ENCERR|RESOLV|ENTREG|RECEB|FINALIZ|CANCEL|REJEIT|ARQUIV|FECHAD|EMITID|DEVOLV|APROV|REALIZ|ATIV|VIGENTE|EXPIRAD|ENVIAD|LIDA|RESPOND|CUMPRID|OK|CONFERID|CONFIRM|PUBLIC|ENCAMINH|APURAD|GOZAD|PROGRAMAD|AGENDAD|CREDENC|CERTIFIC|EXECUTAD|ASSINAD|CIENT|EM_DIA|VALID)'
const PULAR = /^(Appointment|Patient|Budget|Lab|Rev|Clinic|Dental|Doctor|AccountReceivable$|EduReminder$)/

export async function polirDemo(prisma: PrismaClient) {
  const log: string[] = []
  const run = async (nome: string, sql: string) => {
    try { const n = await prisma.$executeRawUnsafe(sql); if (n) log.push(`${nome}: ${n}`) } catch (e: any) { log.push(`${nome}: ignorado (${String(e?.message || e).split('\n')[0].slice(0, 90)})`) }
  }

  // Financeiro: poucas parcelas em aberto (normal), o restante pago; sem vencidas sem destino
  await run('receber-atrasadas-pagas', `UPDATE "AccountReceivable" SET status='PAGO', "dataPagamento"="dataVencimento" + interval '2 days' WHERE status='ATRASADO' AND abs(hashtext(id::text)) % 7 <> 0`)
  await run('receber-vencidas-pagas', `UPDATE "AccountReceivable" SET status='PAGO', "dataPagamento"="dataVencimento" + interval '1 day' WHERE status='PENDENTE' AND "dataVencimento" < now() - interval '1 day' AND abs(hashtext(id::text)) % 7 <> 0`)
  await run('pagar-vencidas', `UPDATE "AccountPayable" SET status='PAGO', "dataPagamento"="dataVencimento" WHERE "dataVencimento" < now() AND status::text !~* '${FINAIS}'`)

  // Alunos e matrículas: sem evasão/cancelamento aparente
  await run('alunos-ativos', `UPDATE "Student" SET status='ATIVO' WHERE status::text IN ('DESISTENTE','CANCELADO','TRANCADO')`)
  await run('matriculas-ativas', `UPDATE "Enrollment" SET status='ATIVA' WHERE status::text IN ('CANCELADA','TRANCADA')`)
  await run('candidatos', `UPDATE "AdmCandidato" SET status='MATRICULADO' WHERE status::text IN ('DESISTENTE','REPROVADO')`)

  // Presença, biblioteca e segurança patrimonial
  await run('frequencia', `UPDATE "PreFrequencia" SET status='PRESENTE', "minutosAtraso"=0, "minutosSaidaAntecipada"=0, "minutosForaIntervalo"=0, "intervaloExcedido"=false, divergente=false WHERE status IN ('FALTA','ATRASO_SAIDA_ANTECIPADA')`)
  await run('emprestimos', `UPDATE "PreEmprestimo" SET status='DEVOLVIDO', "devolucaoEm"=LEAST(now(), "previstaEm"), "diasAtraso"=0, "metodoDevolucao"=COALESCE("metodoDevolucao",'QR') WHERE status='ATIVO' AND "previstaEm" < now()`)
  await run('emprestimos-dias', `UPDATE "PreEmprestimo" SET "diasAtraso"=0 WHERE "diasAtraso" > 0`)
  await run('multas', `DELETE FROM "PreMulta"`)
  await run('bloqueios', `DELETE FROM "PreBloqueio"`)
  await run('alertas-acesso', `UPDATE "PreAlerta" SET status='RESOLVIDO', "resolvidoEm"=now() WHERE status IN ('ABERTO','RECONHECIDO')`)

  // RH
  await run('ferias', `UPDATE "RheFeriasPeriodo" SET status='DISPONIVEL', "concessivoFim"=now() + interval '200 days' WHERE status='VENCIDO'`)
  await run('advertencias', `DELETE FROM "RheAdvertencia"`)

  // Comunicação
  await run('notificacoes', `UPDATE "EduNotification" SET status='PENDENTE' WHERE status::text='FALHA'`)
  await run('marketing-envios', `UPDATE "MktEnvio" SET status='AGENDADO' WHERE status::text='BLOQUEADO'`)

  // CIPA: ocorrências do exemplo já tratadas, com providência registrada
  await run('cat', `UPDATE "CipCat" SET status='ENCERRADA', providencia=COALESCE(providencia,'Atendimento prestado, área sinalizada e equipe orientada. Providência confirmada pela CIPA.'), "confirmadoEm"=COALESCE("confirmadoEm", now()), "confirmadoPor"=COALESCE("confirmadoPor",'CIPA'), "encerradoEm"=COALESCE("encerradoEm", now()) WHERE status<>'ENCERRADA'`)
  await run('cat-avisos', `UPDATE "CipAviso" SET "reconhecidoEm"=COALESCE("reconhecidoEm", now()) WHERE "reconhecidoEm" IS NULL`)

  // Lembretes e tarefas vencidas viram concluídas
  await run('lembretes', `UPDATE "EduReminder" SET status='CONCLUIDO', "concluidoEm"=now() WHERE "dueAt" < now() AND status::text IN ('PENDENTE','NOTIFICADO','ADIADO')`)


  // Financeiro: a despesa do mês não pode aparecer acima do mês anterior; inadimplência residual mínima
  await run('despesa-mes', `UPDATE "PaymentTransaction" SET "dataTransacao"="dataTransacao" - interval '1 month' WHERE id IN (SELECT id FROM "PaymentTransaction" WHERE tipo='DESPESA' AND "dataTransacao" >= date_trunc('month', now()) ORDER BY valor ASC OFFSET 1)`)
  await run('inadimplencia-residual', `UPDATE "AccountReceivable" SET status='PAGO', "dataPagamento"="dataVencimento" + interval '3 days' WHERE status='ATRASADO' AND id NOT IN (SELECT id FROM "AccountReceivable" WHERE status='ATRASADO' ORDER BY "dataVencimento" DESC LIMIT 4)`)

  // Biblioteca: tudo devolvido no prazo
  await run('biblioteca-emprestimos', `UPDATE "BibEmprestimo" SET status='DEVOLVIDO', "dataDevolucao"=LEAST(now(), "dataPrevista"), "diasAtraso"=0, "multaPrevista"=0 WHERE status='ATIVO' AND "dataPrevista" < now()`)
  await run('biblioteca-multas', `UPDATE "BibMulta" SET status='PAGA' WHERE status::text IN ('ABERTA','EM_COBRANCA')`)

  // Suprimentos
  await run('estoque', `UPDATE "SupSaldo" s SET quantidade = GREATEST(s.quantidade, i."estoqueMinimo" * 3) FROM "SupItem" i WHERE i.id = s."itemId" AND i."estoqueMinimo" > 0`)
  await run('requisicoes', `UPDATE "SupRequisicao" SET status='APROVADA' WHERE status::text='AGUARDANDO_APROVACAO'`)

  // Notas e apoio ao estudante
  await run('resultados', `UPDATE "NtResultado" SET situacao='APROVADO' WHERE situacao::text IN ('REPROVADO_NOTA','REPROVADO_FREQ') AND abs(hashtext(id::text)) % 5 <> 0`)
  await run('risco-evasao', `UPDATE "ApoRiscoSnapshot" SET nivel='BAIXO' WHERE nivel::text IN ('ALTO','CRITICO')`)

  // Pendências críticas viram atenção
  await run('lembretes-criticos', `UPDATE "EduReminder" SET severity='ATENCAO' WHERE severity::text='CRITICO' AND status::text IN ('PENDENTE','NOTIFICADO','ADIADO')`)

  // Demais prazos vencidos de itens em aberto: reprogramados para as próximas semanas
  let cols: Array<{ t: string; c: string }> = []
  try {
    cols = await prisma.$queryRawUnsafe<any[]>(`select c.table_name as t, c.column_name as c from information_schema.columns c where c.table_schema='public' and c.data_type like 'timestamp%' and c.column_name ~* '(prazo|vencimento|dueAt|sla|previs|limite)' and exists (select 1 from information_schema.columns s where s.table_name=c.table_name and s.table_schema='public' and s.column_name='status')`)
  } catch { /* sem catálogo */ }
  for (const { t, c } of cols) {
    if (PULAR.test(t)) continue
    await run(`prazo ${t}.${c}`, `UPDATE "${t}" SET "${c}" = now() + ((abs(hashtext(ctid::text)) % 25 + 3) * interval '1 day') WHERE "${c}" < now() AND status::text !~* '${FINAIS}'`)
  }
  return log
}
