/**
 * Seed de demonstração do AVA (sala virtual) — "SUA INSTITUIÇÃO".
 * Preenche as salas das turmas com trilhas, materiais, aulas (gravadas e ao vivo), atividades com entregas e notas,
 * progresso e acessos dos alunos, fórum e recados. Tudo FICTÍCIO; nenhum aviso é enviado (grava direto no banco).
 * Idempotente: pula a turma que já tem material. Uso: import { seedAva } from './seeds/ava'  ->  await seedAva(c.api, sCtx(c))
 */
import { prisma } from '../../src/lib/prisma'

export interface SeedCtx { tenantId?: string; failures?: string[] }

const DIA = 86_400_000
const h = (s: string) => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x }
const EX = 'Exemplo de demonstração.'

export async function seedAva(_api: unknown, ctx: SeedCtx = {}) {
  const tenantId = ctx.tenantId
  if (!tenantId) { ctx.failures?.push('seedAva: sem tenantId'); return { salas: 0 } }
  const secs = await prisma.classSection.findMany({
    where: { tenantId },
    include: { discipline: { select: { nome: true } }, _count: { select: { ClassSectionEnrollment: true } } as any },
    take: 200,
  } as any).catch(async () => prisma.classSection.findMany({ where: { tenantId }, include: { discipline: { select: { nome: true } } }, take: 200 }))
  const enrCount = async (id: string) => prisma.classSectionEnrollment.count({ where: { classSectionId: id } })
  const comAlunos: any[] = []
  for (const s of secs as any[]) { const n = await enrCount(s.id); if (n > 0) comAlunos.push({ s, n }) }
  comAlunos.sort((a, b) => b.n - a.n)
  const now = Date.now()
  let salas = 0
  for (const { s } of comAlunos.slice(0, 10)) {
    if (await prisma.porMaterial.count({ where: { tenantId, classSectionId: s.id } })) continue
    const prof = s.professorUserId as string
    const profUser = await prisma.user.findUnique({ where: { id: prof }, select: { firstName: true, lastName: true } })
    const profNome = `${profUser?.firstName ?? 'Professor'} ${profUser?.lastName ?? ''}`.trim()
    const disc = s.discipline.nome as string
    const mk = (d: any) => prisma.porMaterial.create({ data: { tenantId, classSectionId: s.id, autorUserId: prof, status: 'PUBLICADO', ...d } })
    const U1 = 'Unidade 1 · Fundamentos', U2 = 'Unidade 2 · Aprofundamento'
    const mats = [
      await mk({ tipo: 'TEXTO', trilha: U1, ordem: 1, titulo: 'Plano de ensino e critérios de avaliação', descricao: EX, conteudo: `Bem-vindo(a) a ${disc}. Ementa, objetivos, cronograma, bibliografia e critérios de avaliação (2 provas, 2 atividades e participação).` }),
      await mk({ tipo: 'ARQUIVO', trilha: U1, ordem: 2, titulo: 'Slides da Unidade 1', descricao: EX, arquivoNome: 'slides-unidade-1.pdf', url: 'https://www.gov.br/mec/pt-br' }),
      await mk({ tipo: 'AULA_GRAVADA', trilha: U1, ordem: 3, titulo: 'Aula 1 · Introdução (gravada)', descricao: EX, url: 'https://www.youtube.com/', duracaoMin: 48 }),
      await mk({ tipo: 'LINK', trilha: U1, ordem: 4, titulo: 'Leitura complementar', descricao: EX, url: 'https://www.gov.br/mec/pt-br' }),
      await mk({ tipo: 'ATIVIDADE', trilha: U1, ordem: 5, titulo: 'Atividade 1 · Estudo dirigido', descricao: 'Responda às questões do estudo dirigido e envie seu texto ou o link do arquivo.', aceitaEntrega: true, prazoEntrega: new Date(now - 3 * DIA), notaMaxima: 10 }),
      await mk({ tipo: 'VIDEO', trilha: U2, ordem: 6, titulo: 'Vídeo · Estudo de caso', descricao: EX, url: 'https://www.youtube.com/', duracaoMin: 22 }),
      await mk({ tipo: 'AULA_AO_VIVO', trilha: U2, ordem: 7, titulo: 'Aula ao vivo · Revisão para a prova', descricao: 'Link da sala de videoconferência indicado pelo professor.', url: 'https://meet.google.com/', inicioEm: new Date(now + 2 * DIA), duracaoMin: 90 }),
      await mk({ tipo: 'ATIVIDADE', trilha: U2, ordem: 8, titulo: 'Atividade 2 · Estudo de caso', descricao: 'Analise o caso apresentado no vídeo e proponha uma solução.', aceitaEntrega: true, prazoEntrega: new Date(now + 7 * DIA), notaMaxima: 10 }),
    ]
    const ativ1 = mats[4], ativ2 = mats[7]
    const enr = await prisma.classSectionEnrollment.findMany({ where: { classSectionId: s.id }, include: { enrollment: { include: { student: { select: { id: true, userId: true, nomeCompleto: true } } } } }, take: 40 })
    const alunos = enr.map((e: any) => e.enrollment.student).filter(Boolean)
    for (const a of alunos) {
      const k = h(a.id + s.id)
      const engajado = k % 5 !== 0 // ~20% pouco engajados, para o alerta de inatividade fazer sentido
      for (const [i, m] of mats.entries()) {
        if (m.tipo === 'AULA_AO_VIVO') continue
        const feito = engajado ? (h(a.id + m.id) % 10) < 8 - Math.min(i, 3) : i === 0 && k % 2 === 0
        if (!feito && !(engajado && h(m.id + a.id) % 3 === 0)) continue
        const pct = feito ? 100 : 30 + (h(m.id + a.id) % 50)
        await prisma.porProgresso.create({ data: { tenantId, materialId: m.id, classSectionId: s.id, studentId: a.id, concluido: feito, percentual: pct, acessos: 1 + (k % 4), ultimoAcessoEm: new Date(now - (k % 9) * DIA) } }).catch(() => null)
      }
      if (engajado) {
        for (let j = 0; j < 3 + (k % 5); j++) await prisma.porAcesso.create({ data: { tenantId, studentId: a.id, classSectionId: s.id, tipo: j % 3 === 0 ? 'AULA' : 'MATERIAL', createdAt: new Date(now - (j * 2 + (k % 3)) * DIA) } })
        if (k % 3 === 0) {
          const entregou = h(a.id + 'e') % 10
          const atrasada = entregou === 0
          const corrigida = entregou < 7
          await prisma.porEntrega.create({
            data: {
              tenantId, materialId: ativ1.id, classSectionId: s.id, studentId: a.id, atrasada,
              texto: `Resposta do estudo dirigido de ${disc} (exemplo de demonstração).`,
              status: corrigida ? 'CORRIGIDA' : 'ENVIADA',
              nota: corrigida ? 6 + (h(a.id + 'n') % 5) : null,
              feedback: corrigida ? 'Bom raciocínio. Revise a conclusão e cite a bibliografia da unidade.' : null,
              corrigidaEm: corrigida ? new Date(now - 1 * DIA) : null, corrigidaPor: corrigida ? prof : null,
              enviadaEm: new Date(now - (atrasada ? 1 : 4) * DIA),
            },
          }).catch(() => null)
        } else if (k % 7 === 0) {
          await prisma.porEntrega.create({ data: { tenantId, materialId: ativ2.id, classSectionId: s.id, studentId: a.id, texto: 'Rascunho de solução para o estudo de caso (exemplo de demonstração).', status: 'ENVIADA', enviadaEm: new Date(now - 1 * DIA) } }).catch(() => null)
        }
      }
    }
    const t1 = await prisma.porForumTopico.create({ data: { tenantId, classSectionId: s.id, autorUserId: prof, autorNome: profNome, autorPapel: 'PROFESSOR', titulo: 'Dúvidas gerais da disciplina', corpo: 'Use este espaço para tirar dúvidas sobre o conteúdo e os prazos. Respondo em até 48 horas.', fixado: true } })
    const asker = alunos[0]
    if (asker) {
      const t2 = await prisma.porForumTopico.create({ data: { tenantId, classSectionId: s.id, autorUserId: asker.userId, autorNome: asker.nomeCompleto, autorPapel: 'ALUNO', titulo: 'Como será a prova da Unidade 1?', corpo: 'Professor(a), a prova terá questões discursivas ou só objetivas? Pode usar consulta?' } })
      await prisma.porForumResposta.create({ data: { tenantId, topicoId: t2.id, autorUserId: prof, autorNome: profNome, autorPapel: 'PROFESSOR', corpo: 'Será mista: 8 objetivas e 2 discursivas, sem consulta. A aula ao vivo de revisão cobre os temas mais cobrados.' } })
      if (alunos[1]) await prisma.porForumResposta.create({ data: { tenantId, topicoId: t2.id, autorUserId: alunos[1].userId, autorNome: alunos[1].nomeCompleto, autorPapel: 'ALUNO', corpo: 'Obrigado pela resposta! Vai ser gravada a revisão?' } })
    }
    await prisma.porForumResposta.create({ data: { tenantId, topicoId: t1.id, autorUserId: prof, autorNome: profNome, autorPapel: 'PROFESSOR', corpo: 'Lembrete: a Atividade 2 abre esta semana e vale 10 pontos.' } })
    await prisma.porRecado.create({ data: { tenantId, classSectionId: s.id, autorUserId: prof, autorNome: profNome, titulo: 'Aula ao vivo de revisão', mensagem: 'Teremos aula ao vivo de revisão para a prova. O link está na trilha da Unidade 2.', fixado: true } })
    await prisma.porRecado.create({ data: { tenantId, classSectionId: s.id, autorUserId: prof, autorNome: profNome, titulo: 'Notas da Atividade 1 lançadas', mensagem: 'As notas e os comentários da Atividade 1 já estão disponíveis na aba Atividades.' } })
    salas++
  }
  return { salas }
}

if (require.main === module) {
  (async () => {
    const c = await prisma.clinic.findFirst({ where: { name: 'SUA INSTITUIÇÃO' } as any })
    const failures: string[] = []
    console.log(await seedAva(null, { tenantId: (c as any)?.tenantId, failures }), failures)
    await prisma.$disconnect()
  })()
}
