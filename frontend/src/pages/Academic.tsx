import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Rating,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DescriptionIcon from "@mui/icons-material/Description";
import EventIcon from "@mui/icons-material/Event";
import GroupsIcon from "@mui/icons-material/Groups";
import LanguageIcon from "@mui/icons-material/Language";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import PaymentsIcon from "@mui/icons-material/Payments";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SchoolIcon from "@mui/icons-material/School";
import StorefrontIcon from "@mui/icons-material/Storefront";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { educationalCourses, formatCoursePrice } from "../services/EducationService";

type AcademicSection = "visao-geral" | "alunos" | "cursos" | "professores" | "turmas" | "financeiro" | "documentos";

const sections: Array<{ key: AcademicSection; label: string; icon: ReactNode }> = [
  { key: "visao-geral", label: "Visão geral", icon: <SchoolIcon /> },
  { key: "alunos", label: "Alunos", icon: <PeopleAltIcon /> },
  { key: "cursos", label: "Cursos", icon: <OndemandVideoIcon /> },
  { key: "professores", label: "Professores", icon: <GroupsIcon /> },
  { key: "turmas", label: "Turmas", icon: <EventIcon /> },
  { key: "financeiro", label: "Financeiro acadêmico", icon: <PaymentsIcon /> },
  { key: "documentos", label: "Frequência e documentos", icon: <DescriptionIcon /> },
];

const operationalAreas: Record<Exclude<AcademicSection, "visao-geral" | "cursos">, Array<{ title: string; description: string }>> = {
  alunos: [
    { title: "Cadastro acadêmico central", description: "Dados do aluno, contatos, documentos e vínculo com cursos e turmas em uma única ficha." },
    { title: "Matrícula e situação acadêmica", description: "Estrutura para ingresso, rematrícula, trancamento, cancelamento e acompanhamento da jornada acadêmica." },
    { title: "Histórico e pendências", description: "Organização de histórico, documentos pendentes, situação financeira e atividades acadêmicas." },
  ],
  professores: [
    { title: "Cadastro de professores", description: "Dados profissionais, documentos, especialidades, cursos e turmas vinculadas." },
    { title: "Agenda docente", description: "Visão de módulos, aulas, horários e compromissos acadêmicos." },
    { title: "Documentação", description: "Base para contratos, documentos acadêmicos, certificados e comprovações." },
  ],
  turmas: [
    { title: "Turmas e períodos", description: "Estrutura para turmas, módulos, calendários, horários e situação da turma." },
    { title: "Alunos por turma", description: "Organização das matrículas e composição de cada turma." },
    { title: "Aulas e frequência", description: "Base para registro de presença, reposições, conteúdo e acompanhamento de carga horária." },
  ],
  financeiro: [
    { title: "Mensalidades e parcelas", description: "Integração planejada com o financeiro central para contas a receber, inadimplência e baixa de pagamentos." },
    { title: "PIX, boleto e cartão", description: "Estrutura compatível com os provedores financeiros já preparados no DentalPos One." },
    { title: "Visão acadêmico-financeira", description: "Separação por curso, turma, aluno e centro de resultado para análise gerencial." },
  ],
  documentos: [
    { title: "Frequência", description: "Estrutura para chamada, faltas, reposições e consolidação da carga horária." },
    { title: "Documentos acadêmicos", description: "Organização de documentos de aluno, professor, curso e turma com trilha de situação." },
    { title: "Assinaturas e certificados", description: "Ponto de integração futuro para assinatura eletrônica, certificados e fluxos regulatórios." },
  ],
};

export default function Academic() {
  const [params, setParams] = useSearchParams();
  const rawSection = params.get("secao") || "visao-geral";
  const section = sections.some((item) => item.key === rawSection) ? (rawSection as AcademicSection) : "visao-geral";

  const publishedCourses = educationalCourses.filter((course) => course.status === "Publicado");
  const totalStudents = educationalCourses.reduce((total, course) => total + course.studentCount, 0);
  const marketplaceCourses = educationalCourses.filter((course) => course.platformCommissionPercent === 20).length;
  const internationalCourses = educationalCourses.filter((course) => course.currency !== "BRL").length;

  const selectSection = (key: AcademicSection) => {
    if (key === "visao-geral") setParams({});
    else setParams({ secao: key });
  };

  return (
    <Box>
      <PageHeader
        title="DentalPos Academy"
        description="Gestão acadêmica, cursos, professores, turmas, alunos, frequência, documentos e financeiro em um único ambiente."
        actionLabel="Cadastrar curso"
        actionIcon={<AddIcon />}
      />

      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 3, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {sections.map((item) => (
            <Button
              key={item.key}
              size="small"
              variant={section === item.key ? "contained" : "text"}
              startIcon={item.icon}
              onClick={() => selectSection(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </Box>
      </Paper>

      {section === "visao-geral" && (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 3, mb: 4 }}>
            <EducationSummary title="Cursos publicados" value={String(publishedCourses.length)} icon={<SchoolIcon />} />
            <EducationSummary title="Alunos matriculados" value={String(totalStudents)} icon={<WorkspacePremiumIcon />} />
            <EducationSummary title="Cursos de parceiros" value={String(marketplaceCourses)} icon={<StorefrontIcon />} />
            <EducationSummary title="Vendas internacionais" value={String(internationalCourses)} icon={<LanguageIcon />} />
          </Box>

          <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Typography variant="h5" sx={{ fontWeight: 900 }}>Central acadêmica integrada</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 900 }}>
              A navegação acadêmica foi reorganizada para acompanhar a jornada do aluno: cadastro, matrícula, curso, turma, frequência, documentação e financeiro. Os fluxos regulatórios avançados continuam como etapa própria de homologação.
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2, mt: 3 }}>
              <AcademicFlow title="Captação e matrícula" text="Entrada do aluno, documentação e vínculo acadêmico." />
              <AcademicFlow title="Operação acadêmica" text="Cursos, professores, turmas, frequência e documentos." />
              <AcademicFlow title="Financeiro integrado" text="Mensalidades, recebimentos e visão por curso/turma." />
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, mb: 4, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between", gap: 3 }}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>Marketplace de professores</Typography>
                <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
                  Professores parceiros poderão publicar cursos, acompanhar vendas e receber sua participação conforme o contrato configurado.
                </Typography>
              </Box>
              <Box sx={{ minWidth: 220, p: 2, borderRadius: 2, bgcolor: "primary.main", color: "#FFFFFF", textAlign: "center" }}>
                <Typography variant="body2">Comissão padrão</Typography>
                <Typography variant="h3" sx={{ fontWeight: 900 }}>20%</Typography>
                <Typography variant="caption">Configurável por contrato</Typography>
              </Box>
            </Box>
          </Paper>
        </>
      )}

      {section !== "visao-geral" && section !== "cursos" && (
        <OperationalSection section={section} />
      )}

      {(section === "visao-geral" || section === "cursos") && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Catálogo de cursos</Typography>
            {section === "visao-geral" && <Button onClick={() => selectSection("cursos")}>Ver todos</Button>}
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" }, gap: 3 }}>
            {publishedCourses.map((course) => (
              <Paper key={course.id} elevation={0} sx={{ overflow: "hidden", borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
                <Box sx={{ minHeight: 145, p: 3, bgcolor: course.featured ? "primary.main" : "background.default", color: course.featured ? "#FFFFFF" : "text.primary", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Chip size="small" label={course.category} color={course.featured ? "secondary" : "primary"} />
                    {course.featured && <Chip size="small" label="Destaque" sx={{ bgcolor: "#FFFFFF", color: "primary.main", fontWeight: 700 }} />}
                  </Box>
                  <Typography variant="h5" sx={{ mt: 3, fontWeight: 800 }}>{course.title}</Typography>
                </Box>

                <Box sx={{ p: 3 }}>
                  <Typography color="text.secondary" sx={{ minHeight: 72 }}>{course.description}</Typography>
                  <Typography variant="body2" sx={{ mt: 2, fontWeight: 700 }}>{course.teacherName}</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                    <Rating value={course.rating} precision={0.1} size="small" readOnly />
                    <Typography variant="body2">{course.rating}</Typography>
                    <Typography variant="body2" color="text.secondary">({course.studentCount} alunos)</Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    <Box><Typography variant="caption" color="text.secondary">Teaser gratuito</Typography><Typography sx={{ fontWeight: 800 }}>{course.teaserDurationMinutes} minutos</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Curso completo</Typography><Typography sx={{ fontWeight: 800 }}>{course.totalDurationHours} horas</Typography></Box>
                  </Box>

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mt: 3 }}>
                    <Box><Typography variant="caption" color="text.secondary">Investimento</Typography><Typography variant="h6" sx={{ fontWeight: 900 }}>{formatCoursePrice(course.price, course.currency)}</Typography></Box>
                    <Chip label={course.accessType} color="info" variant="outlined" />
                  </Box>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 3 }}>
                    <Button variant="outlined" startIcon={<PlayCircleIcon />}>Ver teaser</Button>
                    <Button variant="contained" startIcon={<OndemandVideoIcon />}>Ver curso</Button>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>

          <Paper elevation={0} sx={{ mt: 4, p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, alignItems: { xs: "flex-start", md: "center" }, gap: 2 }}>
              <LocalAtmIcon color="primary" sx={{ fontSize: 42 }} />
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Pagamentos nacionais e internacionais</Typography>
                <Typography color="text.secondary">Estrutura preparada para múltiplas moedas, PIX, cartão e divisão de receita entre plataforma e professores.</Typography>
              </Box>
              <Button variant="contained" startIcon={<LanguageIcon />}>Configurar pagamentos</Button>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}

function OperationalSection({ section }: { section: Exclude<AcademicSection, "visao-geral" | "cursos"> }) {
  const selected = sections.find((item) => item.key === section);
  return (
    <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Box sx={{ color: "primary.main", display: "grid", placeItems: "center" }}>{selected?.icon}</Box>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>{selected?.label}</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Estrutura de navegação e operação preparada para o módulo. As rotinas que dependem de regras acadêmicas, documentos oficiais ou integrações externas serão homologadas antes da produção.
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" }, gap: 2 }}>
        {operationalAreas[section].map((area) => (
          <Paper key={area.title} variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
            <Typography sx={{ fontWeight: 900 }}>{area.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{area.description}</Typography>
            <Chip size="small" label="Fluxo preparado" color="info" variant="outlined" sx={{ mt: 2 }} />
          </Paper>
        ))}
      </Box>
    </Paper>
  );
}

function AcademicFlow({ title, text }: { title: string; text: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
      <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{text}</Typography>
    </Paper>
  );
}

function EducationSummary({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
      <Box sx={{ width: 46, height: 46, borderRadius: 2, bgcolor: "primary.main", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", mb: 2 }}>{icon}</Box>
      <Typography color="text.secondary">{title}</Typography>
      <Typography variant="h5" sx={{ mt: 1, fontWeight: 800 }}>{value}</Typography>
    </Paper>
  );
}
