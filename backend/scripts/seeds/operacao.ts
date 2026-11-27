/**
 * Seed de OPERAÇÃO (EduMaster Pro): Portal do colaborador (declarações, POPs, instruções, manuais, treinamentos, EPIs, hierarquia de reporte),
 * CIPA/SST (membros, brigada, calendário, instruções, telefones, CAT com avisos), Lavanderia (rotas e remessas em várias etapas),
 * rastreio de compras por etapa e polos por gestor. Dados fictícios. Idempotente (só semeia o que estiver vazio).
 */
type Api = (method: string, path: string, body?: any) => Promise<any>
export async function seedOperacao(api: Api, ctx: { failures?: string[] } = {}) {
  const falha = (m: string, e?: any) => { ctx.failures?.push(`seedOperacao: ${m} ${e?.message ?? ''}`); console.log('!! seedOperacao:', m, e?.message ?? '') }
  const dia = 86_400_000
  const em = (d: number, h = 9) => { const x = new Date(Date.now() + d * dia); x.setHours(h, 0, 0, 0); return x.toISOString() }
  const lista = (r: any) => (Array.isArray(r) ? r : r?.items ?? r?.pedidos ?? [])

  // ---------- Portal do colaborador
  try {
    const p = await api('GET', '/edu/colaborador/painel')
    if (!(p.documentos ?? []).length) {
      const docs: any[] = [
        { tipo: 'DECLARACAO', titulo: 'Declaração de vínculo empregatício', conteudo: 'Declaramos, para os devidos fins, que {{nome}}, matrícula {{matricula}}, exerce o cargo de {{cargo}} no departamento {{departamento}}, admitido(a) em {{admissao}}. Emitida em {{data}}.' },
        { tipo: 'DECLARACAO', titulo: 'Declaração de tempo de serviço', conteudo: '{{nome}} (matrícula {{matricula}}) presta serviços à instituição desde {{admissao}}, no cargo de {{cargo}}. Emitida em {{data}}.' },
        { tipo: 'DECLARACAO', titulo: 'Declaração para fins de rendimentos e imposto de renda', conteudo: 'Declaramos que {{nome}}, matrícula {{matricula}}, é colaborador(a) da instituição. Informe de rendimentos disponível no Holerite digital. Emitida em {{data}}.' },
        { tipo: 'POP', titulo: 'POP 01 — Atendimento ao aluno no balcão da secretaria', descricao: 'Padrão de acolhimento, identificação, protocolo e encerramento do atendimento.', conteudo: '1. Cumprimente e identifique o aluno (RA ou CPF).\n2. Abra o protocolo no sistema antes de iniciar.\n3. Resolva ou encaminhe com prazo informado.\n4. Registre a solução e peça confirmação.\n5. Encerre o protocolo.', obrigatorio: true, prazoDias: 15 },
        { tipo: 'POP', titulo: 'POP 02 — Abertura e fechamento de salas e laboratórios', conteudo: 'Verifique iluminação, ar-condicionado e equipamentos; registre ocorrências em Infraestrutura; tranque ao final e devolva as chaves ao controle.', obrigatorio: true, prazoDias: 15 },
        { tipo: 'INSTRUCAO', titulo: 'IT 05 — Registro de ordem de serviço com fotos', conteudo: 'Abra Infraestrutura > Solicitações, descreva o problema, anexe 2 fotos (visão geral e detalhe) e informe o local.', obrigatorio: false },
        { tipo: 'MANUAL', titulo: 'Manual do colaborador', descricao: 'Direitos, deveres, jornada, benefícios e canais internos.', url: '#', obrigatorio: true, prazoDias: 30 },
        { tipo: 'MANUAL', titulo: 'Manual de serviço — Lavanderia e rouparia', conteudo: 'Separe por tipo, conte as peças na entrega, registre na remessa, confira na devolução.' },
        { tipo: 'TREINAMENTO', titulo: 'Integração institucional', duracaoHoras: 4, obrigatorio: true, prazoDias: 30, descricao: 'História, valores, estrutura e sistemas.' },
        { tipo: 'TREINAMENTO', titulo: 'NR-5 — Noções de CIPA e prevenção de acidentes', duracaoHoras: 2, obrigatorio: true, prazoDias: 60 },
        { tipo: 'TREINAMENTO', titulo: 'Primeiros socorros e uso de extintores', duracaoHoras: 3, obrigatorio: true, prazoDias: 90 },
        { tipo: 'TREINAMENTO', titulo: 'LGPD no dia a dia', duracaoHoras: 1.5, obrigatorio: true, prazoDias: 45 },
        { tipo: 'REGRA', titulo: 'Regras de conduta e uso de crachá', conteudo: 'Crachá visível, sigilo de dados de alunos, proibido compartilhar senhas, uso responsável de equipamentos.', obrigatorio: true, prazoDias: 15 },
      ]
      for (const d of docs) await api('POST', '/edu/colaborador/documentos', d)
    }
    if (!(p.epis ?? []).length) {
      const epis = [
        { nome: 'Luvas de procedimento', ca: 'CA 38.402', categoria: 'Proteção das mãos', validadeDias: 30 },
        { nome: 'Óculos de proteção', ca: 'CA 29.114', categoria: 'Proteção visual', validadeDias: 365 },
        { nome: 'Jaleco de manga longa', categoria: 'Vestimenta', validadeDias: 365 },
        { nome: 'Máscara PFF2', ca: 'CA 41.230', categoria: 'Proteção respiratória', validadeDias: 90 },
        { nome: 'Protetor auricular', ca: 'CA 5.745', categoria: 'Proteção auditiva', validadeDias: 180 },
        { nome: 'Calçado de segurança', ca: 'CA 33.017', categoria: 'Proteção dos pés', validadeDias: 365 },
      ]
      for (const e of epis) await api('POST', '/edu/colaborador/epis', e)
    }
    if (!(p.escalonamento ?? []).length) {
      const esc = [
        { demanda: 'Falta de material ou equipamento', nivel: 1, responsavel: 'Coordenação do setor', cargo: 'Coordenador(a)' },
        { demanda: 'Falta de material ou equipamento', nivel: 2, responsavel: 'Almoxarifado / Compras', cargo: 'Suprimentos', contato: 'ramal 214' },
        { demanda: 'Acidente ou mal-estar', nivel: 1, responsavel: 'Brigada de emergência / CIPA', cargo: 'Brigadista', contato: 'ramal 190' },
        { demanda: 'Acidente ou mal-estar', nivel: 2, responsavel: 'RH — Segurança do trabalho', cargo: 'Técnico de segurança', contato: 'ramal 230' },
        { demanda: 'Dúvida de folha, ponto ou férias', nivel: 1, responsavel: 'Departamento Pessoal', cargo: 'Analista de DP', contato: 'ramal 231' },
        { demanda: 'Problema de sistema ou acesso', nivel: 1, responsavel: 'Diretoria de TI — Suporte', cargo: 'Suporte', contato: 'ramal 300' },
        { demanda: 'Conflito ou assédio', nivel: 1, responsavel: 'RH — Canal confidencial', cargo: 'Gerente de RH', contato: 'ramal 232' },
      ]
      for (const e of esc) await api('POST', '/edu/colaborador/escalonamento', e)
    }
    // Entregas de EPI: parte já entregue, parte pendente (aparece o aviso "ainda não retirou")
    const colabs = lista(await api('GET', '/edu/colaborador/colaboradores'))
    const painel2 = await api('GET', '/edu/colaborador/painel')
    if (!(painel2.entregas ?? []).length && colabs.length && (painel2.epis ?? []).length) {
      const ep = painel2.epis
      for (let i = 0; i < Math.min(colabs.length, 12); i++) {
        for (let j = 0; j < 3; j++) {
          const e = ep[(i + j) % ep.length]
          const ent = await api('POST', '/edu/colaborador/epis/entregas', { colaboradorId: colabs[i].id, epiId: e.id, tamanho: ['P', 'M', 'G'][i % 3] })
          if ((i + j) % 3 !== 0) await api('POST', `/edu/colaborador/epis/entregas/${ent.id}/entregar`, { entreguePor: 'Almoxarifado' })
        }
      }
    }
  } catch (e) { falha('portal do colaborador', e) }


  // ---------- POPs ligados aos alertas críticos (cada alerta mostra o procedimento relacionado)
  try {
    const painelP = await api('GET', '/edu/colaborador/painel')
    const tem = new Set((painelP.documentos ?? []).map((d: any) => String(d.titulo)))
    const pops: Array<[string, string]> = [
      ['POP — Tratativa de parcelas em atraso (cobrança amigável)', '1. Confira em Cobrança > Inadimplentes quem tem parcela vencida.\n2. Execute a régua de cobrança (WhatsApp, depois e-mail).\n3. Com o retorno do aluno, registre acordo ou promessa de pagamento.\n4. Sem retorno após a régua, escale ao Jurídico com o histórico.\n5. Atualize o status e encerre quando houver o pagamento.'],
      ['POP — Pagamento de fornecedores e contas a pagar', '1. Confira a conta e o documento na fila de conferência.\n2. Autorize conforme a alçada do valor.\n3. Pague na data e registre a baixa.\n4. Em atraso, negocie nova data com o fornecedor e registre.'],
      ['POP — Empréstimo e devolução de obras na biblioteca', '1. Identifique o leitor e confira o prazo.\n2. Registre a devolução ou a renovação.\n3. Em atraso, avise o leitor e aplique a multa conforme a política.\n4. Confira o estado da obra na devolução.'],
      ['POP — Ordem de serviço e prazo (SLA) de manutenção', '1. Abra a OS com descrição, local e fotos.\n2. Defina responsável e prazo.\n3. Atualize o andamento e peça material, se faltar.\n4. Conclua com a solução e avise o solicitante.'],
      ['POP — Reposição de estoque mínimo', '1. Confira o saldo por almoxarifado.\n2. Crie a requisição com a quantidade de reposição.\n3. Aprove na alçada e acompanhe o pedido até o setor.\n4. Dê entrada no estoque na conferência.'],
      ['POP — Acompanhamento de pedidos de compra', '1. Registre cada etapa: enviado, chegou, conferido, entrada, saiu para entrega e entregue.\n2. Contate o fornecedor se a previsão passar.\n3. Confira quantidade e qualidade na chegada.\n4. Avise o setor solicitante.'],
      ['POP — Renovação do certificado da brigada de incêndio', '1. Verifique a validade em CIPA > Brigada.\n2. Agende a reciclagem no calendário de treinamentos.\n3. Confirme presença e carga horária.\n4. Atualize a validade do certificado.'],
      ['POP — Tratamento de acidente de trabalho (CAT)', '1. Preste o primeiro atendimento e acione a brigada.\n2. Registre a ocorrência no Registro de CAT.\n3. Descreva e execute a providência.\n4. Comunique o órgão competente se houver afastamento.\n5. Encerre depois da confirmação.'],
      ['POP — Entrega e troca de EPI', '1. Designe o EPI ao colaborador no RH.\n2. Registre a entrega, o tamanho e a validade.\n3. O colaborador confirma o recebimento.\n4. Troque no prazo de validade.'],
      ['POP — Evidências e prazos do MEC', '1. Identifique o indicador e o documento exigido.\n2. Reúna e anexe a evidência na pasta do kit.\n3. Marque como atendida.\n4. Avise a coordenação.'],
      ['POP — Tratamento de publicações do Diário Oficial', '1. Leia a publicação e identifique a exigência.\n2. Designe o responsável e o prazo.\n3. Registre o andamento.\n4. Marque como tratada.'],
      ['POP — Atendimento dentro do prazo (SLA)', '1. Responda ao solicitante no primeiro contato.\n2. Encaminhe ao setor com prazo, se necessário.\n3. Resolva e registre a solução.\n4. Peça a avaliação do atendimento.'],
      ['POP — Alertas de acesso e portaria', '1. Confira o registro de entrada e saída.\n2. Verifique o local e a pessoa.\n3. Resolva o alerta e registre a conclusão.'],
      ['POP — Rouparia: coleta, retorno e conferência', '1. Conte as peças na coleta e registre a remessa.\n2. Acompanhe cada etapa da jornada.\n3. Confira as peças na devolução.\n4. Registre divergências.'],
      ['POP — Guias e vencimentos fiscais', '1. Confira o valor e a linha digitável.\n2. Programe o pagamento antes do vencimento.\n3. Marque como paga e arquive o comprovante.'],
    ]
    for (const [titulo, conteudo] of pops) if (!tem.has(titulo)) await api('POST', '/edu/colaborador/documentos', { tipo: 'POP', titulo, conteudo, obrigatorio: false })
  } catch (e) { falha('POPs dos alertas', e) }

  // ---------- CIPA
  try {
    const painel = await api('GET', '/edu/cipa/painel')
    if (!painel.membros) {
      const membros = [
        ['Mariana Alves Duarte', 'PRESIDENTE', 'EMPREGADOR', 'Diretoria Administrativa'], ['Carlos Eduardo Pinto', 'VICE_PRESIDENTE', 'EMPREGADOS', 'Infraestrutura'],
        ['Fernanda Rocha Lima', 'SECRETARIO', 'EMPREGADOS', 'Secretaria Acadêmica'], ['Ricardo Tavares', 'TITULAR', 'EMPREGADOR', 'Financeiro'],
        ['Juliana Prado', 'TITULAR', 'EMPREGADOS', 'Biblioteca'], ['Anderson Moreira', 'TITULAR', 'EMPREGADOS', 'Laboratórios'],
        ['Patrícia Nogueira', 'SUPLENTE', 'EMPREGADOR', 'RH'], ['Thiago Barros', 'SUPLENTE', 'EMPREGADOS', 'Manutenção'],
      ]
      for (const [nome, funcao, representacao, setor] of membros) await api('POST', '/edu/cipa/membros', { nome, funcao, representacao, setor, mandatoInicio: em(-200), mandatoFim: em(165) })
      const brig = [['Carlos Eduardo Pinto', 'CHEFE', 'Infraestrutura'], ['Anderson Moreira', 'LIDER_ANDAR', 'Laboratórios'], ['Juliana Prado', 'BRIGADISTA', 'Biblioteca'], ['Thiago Barros', 'BRIGADISTA', 'Manutenção'], ['Fernanda Rocha Lima', 'SOCORRISTA', 'Secretaria'], ['Luciana Ferraz', 'BRIGADISTA', 'Portaria'], ['Marcos Vieira', 'SOCORRISTA', 'Clínicas-escola']]
      for (const [i, [nome, funcao, setor]] of brig.entries()) await api('POST', '/edu/cipa/brigada', { nome, funcao, setor, turno: i % 2 ? 'Noite' : 'Manhã/Tarde', certificadoAte: em(i === 3 ? 25 : 180 + i * 20) })
      const ev = [
        { tipo: 'TREINAMENTO', titulo: 'Treinamento de brigada de incêndio', inicio: em(12), cargaHoras: 8, local: 'Auditório', instrutor: 'Corpo de Bombeiros — instrutor credenciado', publico: 'Brigadistas' },
        { tipo: 'REUNIAO', titulo: 'Reunião ordinária da CIPA', inicio: em(5, 14), local: 'Sala de reuniões da Reitoria' },
        { tipo: 'SIMULADO', titulo: 'Simulado de abandono de edifício', inicio: em(30, 10), local: 'Todos os blocos', publico: 'Todos os colaboradores, alunos e visitantes' },
        { tipo: 'TREINAMENTO', titulo: 'Primeiros socorros — RCP e engasgo', inicio: em(20, 13), cargaHoras: 4, local: 'Laboratório de Habilidades', publico: 'Colaboradores' },
        { tipo: 'SIPAT', titulo: 'SIPAT — Semana Interna de Prevenção de Acidentes', inicio: em(60), fim: em(64, 17), local: 'Campus' },
      ]
      for (const e of ev) await api('POST', '/edu/cipa/eventos', e)
      const ins = [
        ['URGENCIA', 'Mal-estar ou lesão leve', '1. Mantenha a calma e afaste a pessoa do risco.\n2. Chame um brigadista ou a portaria.\n3. Registre a ocorrência em CIPA > Registros.\n4. Não ofereça medicamentos.'],
        ['EMERGENCIA', 'Incêndio', '1. Acione o alarme e ligue 193.\n2. Se for seguro e você for treinado, use o extintor adequado.\n3. Saia pela rota de fuga, sem correr, sem usar elevador.\n4. Vá ao ponto de encontro e aguarde o chamado.'],
        ['EMERGENCIA', 'Parada cardiorrespiratória', '1. Chame o SAMU (192) e peça o desfibrilador (DEA).\n2. Inicie compressões torácicas fortes e rápidas (100 a 120 por minuto).\n3. Use o DEA assim que chegar, seguindo as instruções de voz.\n4. Só pare quando a equipe de saúde assumir.'],
        ['AUTOSSOCORRO', 'Se você se machucar', '1. Pare a atividade e afaste-se do risco.\n2. Lesão com sangue: lave com água e sabão, comprima com gaze limpa.\n3. Avise o responsável do setor e a brigada.\n4. Procure atendimento mesmo que pareça simples; registre a ocorrência.'],
        ['SOCORRO_PROXIMO', 'Ao encontrar alguém que precisa de ajuda', '1. Garanta a sua segurança primeiro.\n2. Chame ajuda (192 / brigada) e informe local e situação.\n3. Faça apenas o que for treinado a fazer.\n4. Acompanhe a pessoa até a chegada da equipe.'],
        ['LIMITES', 'Até onde posso ir', 'Qualquer pessoa: chamar ajuda, manter vias livres, acalmar a vítima. Somente brigadista/socorrista treinado: compressões, DEA, imobilização. Ninguém: administrar medicamentos, mover vítima de trauma sem necessidade, retirar objetos cravados.'],
      ]
      for (const [i, [categoria, titulo, passos]] of ins.entries()) await api('POST', '/edu/cipa/instrucoes', { categoria, titulo, passos, ordem: i })
      const tel = [['SAMU', '192'], ['Corpo de Bombeiros', '193'], ['Polícia Militar', '190'], ['Defesa Civil', '199'], ['Portaria / Segurança do campus', 'ramal 100'], ['Brigada de emergência', 'ramal 190'], ['Técnico de segurança do trabalho', 'ramal 230']]
      for (const [i, [nome, numero]] of tel.entries()) await api('POST', '/edu/cipa/contatos', { nome, numero, categoria: i < 4 ? 'EMERGENCIA' : 'INTERNO', ordem: i })
    }
    const cats = lista(await api('GET', '/edu/cipa/cat'))
    if (!cats.length) {
      const a = await api('POST', '/edu/cipa/cat', { colaboradorNome: 'Marcos Vieira', setor: 'Clínicas-escola', dataOcorrencia: em(-1, 10), local: 'Clínica odontológica — sala 3', tipo: 'TIPICO', gravidade: 'MODERADA', descricao: 'Perfuração acidental do dedo com instrumental durante a limpeza. Atendido pela brigada e encaminhado à unidade de saúde.', afastamento: false })
      const b = await api('POST', '/edu/cipa/cat', { colaboradorNome: 'Luciana Ferraz', setor: 'Portaria', dataOcorrencia: em(-12, 7), local: 'Entrada principal', tipo: 'TRAJETO', gravidade: 'LEVE', descricao: 'Queda na calçada molhada em frente ao bloco A, sem afastamento.' })
      await api('POST', `/edu/cipa/cat/${b.id}/providencia`, { providencia: 'Instalada sinalização de piso molhado, colocada fita antiderrapante na rampa e orientação à equipe de limpeza.', comunicadoOrgao: true })
      await api('POST', `/edu/cipa/cat/${b.id}/encerrar`, {})
      void a
    }
  } catch (e) { falha('CIPA', e) }

  // ---------- Lavanderia
  try {
    const painel = await api('GET', '/edu/lavanderia/painel')
    const existentes = lista(await api('GET', '/edu/lavanderia/remessas'))
    if (!existentes.length && !painel.abertas) {
      const rotas = [
        { nome: 'Clínicas-escola — segunda', departamento: 'Clínicas-escola', diaSemana: 1, horaColeta: '07:30', horaEntrega: '16:00', prazoRetornoDias: 2, responsavelColeta: 'Marcos Vieira', transportador: 'Transporte interno — Valter', responsavelEntrega: 'Marcos Vieira' },
        { nome: 'Laboratórios — quarta', departamento: 'Laboratórios', diaSemana: 3, horaColeta: '08:00', horaEntrega: '15:00', prazoRetornoDias: 3, responsavelColeta: 'Anderson Moreira', transportador: 'Transporte interno — Valter', responsavelEntrega: 'Anderson Moreira' },
        { nome: 'Cozinha pedagógica e eventos — sexta', departamento: 'Cozinha pedagógica', diaSemana: 5, horaColeta: '09:00', horaEntrega: '14:00', prazoRetornoDias: 2, responsavelColeta: 'Luciana Ferraz', transportador: 'Lavanderia parceira — motorista', responsavelEntrega: 'Luciana Ferraz' },
      ]
      for (const r of rotas) await api('POST', '/edu/lavanderia/rotas', r)
      const mk = (departamento: string, tipo: string, itens: any[], solicitante: string) => ({ departamento, tipo, itens, solicitante })
      const ids: string[] = []
      for (const r of [
        mk('Clínicas-escola', 'JALECO', [{ peca: 'Jaleco branco', qtd: 40 }, { peca: 'Touca', qtd: 40 }], 'Marcos Vieira'),
        mk('Clínicas-escola', 'CAMPO_CIRURGICO', [{ peca: 'Campo cirúrgico', qtd: 25 }, { peca: 'Avental cirúrgico', qtd: 12 }], 'Marcos Vieira'),
        mk('Laboratórios', 'JALECO', [{ peca: 'Jaleco de laboratório', qtd: 30 }], 'Anderson Moreira'),
        mk('Cozinha pedagógica', 'UNIFORME', [{ peca: 'Dólmã', qtd: 20 }, { peca: 'Avental', qtd: 20 }, { peca: 'Pano de prato', qtd: 30 }], 'Luciana Ferraz'),
        mk('Clínicas-escola', 'ENXOVAL', [{ peca: 'Lençol descartável reutilizável', qtd: 30 }, { peca: 'Fronha', qtd: 15 }], 'Marcos Vieira'),
        mk('Laboratórios', 'UNIFORME', [{ peca: 'Avental de proteção', qtd: 18 }], 'Anderson Moreira'),
      ]) ids.push((await api('POST', '/edu/lavanderia/remessas', r)).id)
      const passos = [['Marcos Vieira', 'Valter', 'Recebida pela lavanderia — conferido', 'Lavanderia Higiene Total', 'Valter', 'Marcos Vieira', 'Marcos Vieira'], ['Marcos Vieira', 'Valter', 'Lavanderia Higiene Total', 'Lavanderia Higiene Total'], ['Anderson Moreira'], ['Luciana Ferraz', 'Motorista', 'Lavanderia Higiene Total'], [], []]
      for (const [i, resp] of passos.entries()) for (const r of resp) await api('POST', `/edu/lavanderia/remessas/${ids[i]}/avancar`, { responsavel: r }).catch(() => null)
    }
  } catch (e) { falha('lavanderia', e) }

  // ---------- Rastreio de compras
  try {
    const rastreio = await api('GET', '/edu/compras-rastreio/pedidos')
    const pedidos: any[] = rastreio.pedidos ?? []
    const sem = pedidos.filter((p) => !p.departamento).slice(0, 5)
    const deptos = ['Clínicas-escola', 'Laboratórios', 'Biblioteca', 'Secretaria Acadêmica', 'Cozinha pedagógica']
    const quem = ['Compras — Renata', 'Recebimento — Paulo', 'Conferência — Sandra', 'Almoxarifado — Jorge', 'Entregador interno — Valter', 'Coordenação do setor']
    for (const [i, p] of sem.entries()) {
      const resp: Record<string, string> = { ENVIADO_FORNECEDOR: quem[0], CHEGOU: quem[1], CONFERIDO: quem[2], ENTRADA_ESTOQUE: quem[3], SAIU_ENTREGA: quem[4], ENTREGUE_SETOR: quem[5] }
      await api('PUT', `/edu/compras-rastreio/pedidos/${p.id}/destino`, { departamento: deptos[i % deptos.length], solicitante: 'Coordenação do setor', responsaveis: resp })
      const feitas = [6, 4, 3, 1, 0][i] ?? 0
      const ordem = ['ENVIADO_FORNECEDOR', 'CHEGOU', 'CONFERIDO', 'ENTRADA_ESTOQUE', 'SAIU_ENTREGA', 'ENTREGUE_SETOR']
      for (let k = 0; k < feitas; k++) await api('POST', `/edu/compras-rastreio/pedidos/${p.id}/etapa`, { etapa: ordem[k], responsavel: resp[ordem[k]] })
    }
    if (!pedidos.length) console.log('operacao: nenhum pedido de compra emitido para exibir no rastreio.')
  } catch (e) { falha('rastreio de compras', e) }

  // ---------- Polos por gestor
  try {
    const cfg = await api('GET', '/edu/acesso-polos')
    const polos: any[] = cfg.polos ?? []
    const gestores: any[] = (cfg.usuarios ?? []).filter((u: any) => ['COORDINATOR', 'SECRETARY', 'FINANCE'].includes(String(u.cargo).toUpperCase()) && !(u.poloIds ?? []).length)
    for (const [i, g] of gestores.slice(0, 3).entries()) {
      if (!polos.length) break
      const ids = polos.slice(i * 2, i * 2 + 2).map((p) => p.id)
      if (ids.length) await api('PUT', `/edu/acesso-polos/usuarios/${g.id}`, { poloIds: ids })
    }
  } catch (e) { falha('polos por gestor', e) }
}
