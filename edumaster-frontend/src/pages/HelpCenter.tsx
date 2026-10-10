import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PageHeader from "../components/PageHeader";

interface FaqItem { question: string; answer: string }
interface FaqGroup { group: string; items: FaqItem[] }

const PRIMEIROS_PASSOS = [
  "Configure a identidade da instituição (logo, razão social, endereço) em Configurações → Identidade e marca.",
  "Cadastre os cursos em Acadêmico → Programas, depois as disciplinas e a matriz curricular.",
  "Crie os períodos letivos (semestre/ano) antes de abrir turmas.",
  "Cadastre os alunos e matricule-os em uma turma — a mensalidade, se informada, já gera a cobrança automaticamente no Financeiro.",
  "Convide professores e coordenadores com o perfil de acesso adequado em Configurações.",
  "Explore os módulos extras (Conteúdo, Provas, Suprimentos etc.) conforme a necessidade da instituição.",
];

const FAQ: FaqGroup[] = [
  {
    group: "Acadêmico",
    items: [
      { question: "Como matricular um aluno?", answer: "Vá em Acadêmico → Alunos, cadastre o aluno e depois em Matrículas, vincule-o a um curso, matriz curricular e período letivo. Se informar a mensalidade, a cobrança é gerada automaticamente." },
      { question: "Como funciona a equivalência de disciplinas?", answer: "Em Acadêmico → Equivalência de disciplinas, abra uma solicitação informando a instituição de origem e a(s) disciplina(s) cursada(s). A coordenação decide item a item (aprovar/rejeitar), e o status da solicitação é calculado automaticamente." },
      { question: "O aluno pode se agendar em aulas práticas?", answer: "Sim, pelo portal do aluno (self-service), nas sessões disponíveis da turma em que está matriculado." },
    ],
  },
  {
    group: "Provas e Conteúdo",
    items: [
      { question: "Como gerar questões por IA?", answer: "No Banco de Questões, use a opção de geração automática informando o tema e a dificuldade. A IA sugere as questões para revisão antes da publicação." },
      { question: "Como funciona o resumo 80/20?", answer: "Em Conteúdo, adicione um texto-base ao material (campo 'Texto-base para resumo 80/20') e use o botão 'Gerar resumo 80/20' — a IA identifica os conceitos que respondem pela maior parte do entendimento do tema." },
      { question: "Onde ficam as aulas gravadas?", answer: "Em Conteúdo → Conteúdos e aulas, use 'Enviar arquivo' para subir a gravação direto para o storage da instituição, ou 'Adicionar link externo' se já estiver hospedada em outro lugar (YouTube não listado, Vimeo etc.)." },
    ],
  },
  {
    group: "Financeiro",
    items: [
      { question: "A mensalidade é cobrada automaticamente?", answer: "Sim. Ao matricular um aluno com valor de mensalidade informado, o sistema já gera a cobrança recorrente no módulo financeiro, com DRE e contabilidade integrados." },
      { question: "Onde vejo o DRE da instituição?", answer: "No Backoffice/Financeiro, que consolida todas as receitas e despesas lançadas, incluindo as mensalidades geradas pelo Acadêmico." },
    ],
  },
  {
    group: "Documentos e Certificados",
    items: [
      { question: "Como emitir um certificado ou diploma?", answer: "Em Protocolo e Certificados → Certificados e diplomas, emita o documento para o aluno. Um código de verificação público é gerado automaticamente." },
      { question: "Como alguém confere se um certificado é autêntico?", answer: "Compartilhe o código de verificação gerado — qualquer pessoa pode conferir a autenticidade em uma página pública, sem precisar de login." },
    ],
  },
  {
    group: "Operações do campus",
    items: [
      { question: "Como reservar uma sala?", answer: "Em Operacional → Reservas de salas, escolha o recurso e o horário. O sistema recusa automaticamente reservas que conflitam com outra já confirmada." },
      { question: "Como publicar uma vaga de estágio/emprego?", answer: "Em Operacional → Vagas e carreiras, publique a vaga. Alunos podem se candidatar pelo próprio portal." },
    ],
  },
  {
    group: "Personalização",
    items: [
      { question: "Como trocar a logomarca da instituição?", answer: "Em Configurações → Identidade e marca, informe a URL pública da imagem. Ela aparece no cabeçalho e no rodapé de todas as telas." },
      { question: "Como adicionar um polo/campus?", answer: "Em Configurações → Unidades e polos, cadastre o endereço e as coordenadas — um link para o mapa é gerado automaticamente." },
    ],
  },
];

export default function HelpCenter() {
  const [tab, setTab] = useState<"inicio" | "faq">("inicio");
  const [search, setSearch] = useState("");

  const filtered = FAQ.map((g) => ({
    ...g,
    items: g.items.filter((i) =>
      !search.trim() || `${i.question} ${i.answer}`.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <Box>
      <PageHeader title="Central de Ajuda" description="Primeiros passos e perguntas frequentes por módulo." />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="inicio" label="Primeiros passos" />
        <Tab value="faq" label="Perguntas frequentes" />
      </Tabs>

      {tab === "inicio" && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, maxWidth: 760 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Guia rápido de configuração</Typography>
          <Box component="ol" sx={{ pl: 3, display: "grid", gap: 1.5 }}>
            {PRIMEIROS_PASSOS.map((step, i) => (
              <Box component="li" key={i}>
                <Typography>{step}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {tab === "faq" && (
        <Box sx={{ maxWidth: 760 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar na ajuda…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 3 }}
          />
          {filtered.length === 0 && <Typography color="text.secondary">Nenhum resultado para "{search}".</Typography>}
          {filtered.map((group) => (
            <Box key={group.group} sx={{ mb: 3 }}>
              <Chip label={group.group} size="small" sx={{ mb: 1, fontWeight: 700 }} />
              {group.items.map((item) => (
                <Accordion key={item.question} disableGutters variant="outlined">
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 600 }}>{item.question}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography color="text.secondary">{item.answer}</Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
