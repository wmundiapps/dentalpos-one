import {
  Box,
  Button,
  Chip,
  Paper,
  Rating,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import LanguageIcon from "@mui/icons-material/Language";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";
import OndemandVideoIcon from "@mui/icons-material/OndemandVideo";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SchoolIcon from "@mui/icons-material/School";
import StorefrontIcon from "@mui/icons-material/Storefront";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import {
  educationalCourses,
  formatCoursePrice,
} from "../services/EducationService";

export default function Academic() {
  const publishedCourses = educationalCourses.filter(
    (course) => course.status === "Publicado",
  );

  const totalStudents = educationalCourses.reduce(
    (total, course) => total + course.studentCount,
    0,
  );

  const marketplaceCourses =
    educationalCourses.filter(
      (course) =>
        course.platformCommissionPercent === 20,
    ).length;

  const internationalCourses =
    educationalCourses.filter(
      (course) => course.currency !== "BRL",
    ).length;

  return (
    <Box>
      <PageHeader
        title="DentalPos Academy"
        description="Cursos, teasers, marketplace de professores, certificações e vendas internacionais."
        actionLabel="Cadastrar curso"
        actionIcon={<AddIcon />}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(4, 1fr)",
          },
          gap: 3,
          mb: 4,
        }}
      >
        <EducationSummary
          title="Cursos publicados"
          value={String(publishedCourses.length)}
          icon={<SchoolIcon />}
        />

        <EducationSummary
          title="Alunos matriculados"
          value={String(totalStudents)}
          icon={<WorkspacePremiumIcon />}
        />

        <EducationSummary
          title="Cursos de parceiros"
          value={String(marketplaceCourses)}
          icon={<StorefrontIcon />}
        />

        <EducationSummary
          title="Vendas internacionais"
          value={String(internationalCourses)}
          icon={<LanguageIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: {
              xs: "column",
              md: "row",
            },
            alignItems: {
              xs: "stretch",
              md: "center",
            },
            justifyContent: "space-between",
            gap: 3,
          }}
        >
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
              }}
            >
              Marketplace de professores
            </Typography>

            <Typography
              color="text.secondary"
              sx={{
                mt: 1,
                maxWidth: 760,
              }}
            >
              Professores parceiros poderão publicar
              seus cursos, acompanhar vendas e receber
              automaticamente sua participação.
            </Typography>
          </Box>

          <Box
            sx={{
              minWidth: 220,
              p: 2,
              borderRadius: 2,
              bgcolor: "primary.main",
              color: "#FFFFFF",
              textAlign: "center",
            }}
          >
            <Typography variant="body2">
              Comissão padrão
            </Typography>

            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
              }}
            >
              20%
            </Typography>

            <Typography variant="caption">
              Configurável por contrato
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Typography
        variant="h5"
        sx={{
          fontWeight: 800,
          mb: 3,
        }}
      >
        Catálogo de cursos
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
            xl: "repeat(3, 1fr)",
          },
          gap: 3,
        }}
      >
        {publishedCourses.map((course) => (
          <Paper
            key={course.id}
            elevation={0}
            sx={{
              overflow: "hidden",
              borderRadius: 3,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                minHeight: 150,
                p: 3,
                bgcolor: course.featured
                  ? "primary.main"
                  : "background.default",
                color: course.featured
                  ? "#FFFFFF"
                  : "text.primary",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                }}
              >
                <Chip
                  size="small"
                  label={course.category}
                  color={
                    course.featured
                      ? "secondary"
                      : "primary"
                  }
                />

                {course.featured && (
                  <Chip
                    size="small"
                    label="Destaque"
                    sx={{
                      bgcolor: "#FFFFFF",
                      color: "primary.main",
                      fontWeight: 700,
                    }}
                  />
                )}
              </Box>

              <Typography
                variant="h5"
                sx={{
                  mt: 3,
                  fontWeight: 800,
                }}
              >
                {course.title}
              </Typography>
            </Box>

            <Box sx={{ p: 3 }}>
              <Typography
                color="text.secondary"
                sx={{
                  minHeight: 72,
                }}
              >
                {course.description}
              </Typography>

              <Typography
                variant="body2"
                sx={{
                  mt: 2,
                  fontWeight: 700,
                }}
              >
                {course.teacherName}
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mt: 2,
                }}
              >
                <Rating
                  value={course.rating}
                  precision={0.1}
                  size="small"
                  readOnly
                />

                <Typography variant="body2">
                  {course.rating}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  ({course.studentCount} alunos)
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 2,
                  mt: 3,
                }}
              >
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Teaser gratuito
                  </Typography>

                  <Typography sx={{ fontWeight: 800 }}>
                    {course.teaserDurationMinutes} minutos
                  </Typography>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Curso completo
                  </Typography>

                  <Typography sx={{ fontWeight: 800 }}>
                    {course.totalDurationHours} horas
                  </Typography>
                </Paper>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 2,
                  mt: 3,
                }}
              >
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Investimento
                  </Typography>

                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 900,
                    }}
                  >
                    {formatCoursePrice(
                      course.price,
                      course.currency,
                    )}
                  </Typography>
                </Box>

                <Chip
                  label={course.accessType}
                  color="info"
                  variant="outlined"
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 2,
                  mt: 3,
                }}
              >
                <Button
                  variant="outlined"
                  startIcon={<PlayCircleIcon />}
                >
                  Ver teaser
                </Button>

                <Button
                  variant="contained"
                  startIcon={<OndemandVideoIcon />}
                >
                  Ver curso
                </Button>
              </Box>

              {course.certificateAvailable && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 2,
                  }}
                >
                  <WorkspacePremiumIcon
                    color="primary"
                    fontSize="small"
                  />

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    Certificado disponível conforme a
                    modalidade do curso.
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        ))}
      </Box>

      <Paper
        elevation={0}
        sx={{
          mt: 4,
          p: 3,
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: {
              xs: "column",
              md: "row",
            },
            alignItems: {
              xs: "flex-start",
              md: "center",
            },
            gap: 2,
          }}
        >
          <LocalAtmIcon
            color="primary"
            sx={{
              fontSize: 42,
            }}
          />

          <Box sx={{ flexGrow: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
              }}
            >
              Pagamentos nacionais e internacionais
            </Typography>

            <Typography color="text.secondary">
              Estrutura preparada para múltiplas moedas,
              cartões internacionais, PIX e divisão
              automática da receita entre plataforma e
              professores.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<LanguageIcon />}
          >
            Configurar pagamentos
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

interface EducationSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function EducationSummary({
  title,
  value,
  icon,
}: EducationSummaryProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          width: 46,
          height: 46,
          borderRadius: 2,
          bgcolor: "primary.main",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
        }}
      >
        {icon}
      </Box>

      <Typography color="text.secondary">
        {title}
      </Typography>

      <Typography
        variant="h5"
        sx={{
          mt: 1,
          fontWeight: 800,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}