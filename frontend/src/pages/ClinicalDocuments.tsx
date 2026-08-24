import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import AssignmentIcon from "@mui/icons-material/Assignment";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionIcon from "@mui/icons-material/Description";
import DrawIcon from "@mui/icons-material/Draw";
import EmailIcon from "@mui/icons-material/Email";
import LocalPrintshopIcon from "@mui/icons-material/LocalPrintshop";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";

import type { ReactNode } from "react";

import PageHeader from "../components/PageHeader";
import { clinicalDocuments } from "../services/ClinicalDocumentService";
import type {
  ClinicalDocumentStatus,
  ClinicalDocumentType,
} from "../types/clinicalDocument";

function getStatusColor(status: ClinicalDocumentStatus) {
  switch (status) {
    case "Assinado":
      return "success" as const;

    case "Emitido":
      return "info" as const;

    case "Rascunho":
      return "warning" as const;

    case "Cancelado":
      return "error" as const;

    default:
      return "default" as const;
  }
}

function getDocumentIcon(
  documentType: ClinicalDocumentType,
): ReactNode {
  switch (documentType) {
    case "Receita":
      return <MedicalServicesIcon />;

    case "Atestado":
    case "Declaração":
      return <AssignmentIcon />;

    default:
      return <DescriptionIcon />;
  }
}

export default function ClinicalDocuments() {
  const signedDocuments = clinicalDocuments.filter(
    (document) => document.digitallySigned,
  ).length;

  const sentDocuments = clinicalDocuments.filter(
    (document) => document.sentToPatient,
  ).length;

  const draftDocuments = clinicalDocuments.filter(
    (document) => document.status === "Rascunho",
  ).length;

  return (
    <Box>
      <PageHeader
        title="Documentos Clínicos"
        description="Receitas, atestados, contratos, consentimentos, garantias e solicitações de exames."
        actionLabel="Novo documento"
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
        <DocumentSummary
          title="Documentos cadastrados"
          value={String(clinicalDocuments.length)}
          icon={<DescriptionIcon />}
        />

        <DocumentSummary
          title="Assinados digitalmente"
          value={String(signedDocuments)}
          icon={<DrawIcon />}
        />

        <DocumentSummary
          title="Enviados aos pacientes"
          value={String(sentDocuments)}
          icon={<EmailIcon />}
        />

        <DocumentSummary
          title="Rascunhos"
          value={String(draftDocuments)}
          icon={<AssignmentIcon />}
        />
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 120px",
              xl: "1.4fr 1fr 1fr 130px 140px 180px",
            },
            gap: 2,
            px: 3,
            py: 2,
            bgcolor: "primary.main",
            color: "#FFFFFF",
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Documento
          </Typography>

          <Typography sx={{ fontWeight: 700 }}>
            Status
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Paciente
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Emissão
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Assinatura
          </Typography>

          <Typography
            sx={{
              fontWeight: 700,
              display: {
                xs: "none",
                xl: "block",
              },
            }}
          >
            Ações
          </Typography>
        </Box>

        {clinicalDocuments.map((document) => (
          <Box
            key={document.id}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr 120px",
                xl: "1.4fr 1fr 1fr 130px 140px 180px",
              },
              gap: 2,
              alignItems: "center",
              px: 3,
              py: 2,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {getDocumentIcon(document.documentType)}
              </Box>

              <Box>
                <Typography sx={{ fontWeight: 800 }}>
                  {document.title}
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {document.documentType}
                </Typography>
              </Box>
            </Box>

            <Chip
              size="small"
              label={document.status}
              color={getStatusColor(document.status)}
            />

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                {document.patientName}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
              >
                Código: {document.patientCode}
              </Typography>
            </Box>

            <Typography
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              {document.issuedAt}
            </Typography>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "block",
                },
              }}
            >
              <Chip
                size="small"
                label={
                  document.digitallySigned
                    ? "Assinado"
                    : "Pendente"
                }
                color={
                  document.digitallySigned
                    ? "success"
                    : "warning"
                }
                icon={
                  document.digitallySigned
                    ? <CheckCircleIcon />
                    : <DrawIcon />
                }
              />
            </Box>

            <Box
              sx={{
                display: {
                  xs: "none",
                  xl: "flex",
                },
                gap: 1,
              }}
            >
              <Button
                size="small"
                variant="outlined"
                startIcon={<LocalPrintshopIcon />}
              >
                Imprimir
              </Button>

              <Button
                size="small"
                variant="contained"
                startIcon={<EmailIcon />}
              >
                Enviar
              </Button>
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

interface DocumentSummaryProps {
  title: string;
  value: string;
  icon: ReactNode;
}

function DocumentSummary({
  title,
  value,
  icon,
}: DocumentSummaryProps) {
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
          fontWeight: 900,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}