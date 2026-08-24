import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Typography,
} from "@mui/material";

import type {
  MeshDiagnosticResult,
} from "../services/meshDiagnostics";

interface MeshDiagnosticDialogProps {
  open: boolean;
  onClose: () => void;
  stlFile: File | null;
  result: MeshDiagnosticResult | null;
}

export default function MeshDiagnosticDialog({
  open,
  onClose,
  stlFile,
  result,
}: MeshDiagnosticDialogProps) {
  const qualityScore =
    calculateQualityScore(result);

  const quality =
    getQualityInfo(
      qualityScore,
      result
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: "#101820",
            color: "#ffffff",
            border:
              "1px solid #243447",
            borderRadius: 3,
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          color: "#38bdf8",
          fontWeight: 700,
        }}
      >
        Diagnóstico da malha
      </DialogTitle>

      <DialogContent>
        {!stlFile && (
          <Typography
            sx={{
              color: "#94a3b8",
            }}
          >
            Nenhum arquivo STL selecionado.
          </Typography>
        )}

        {stlFile && !result && (
          <Box
            sx={{
              py: 2,
            }}
          >
            <Typography
              sx={{
                color: "#94a3b8",
              }}
            >
              Aguardando análise da geometria...
            </Typography>
          </Box>
        )}

        {stlFile && result && (
          <Box>
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                bgcolor: "#0b1520",
                border:
                  "1px solid #243447",
                borderRadius: 2,
              }}
            >
              <Typography
                sx={{
                  color: "#94a3b8",
                  fontSize: 11,
                }}
              >
                ARQUIVO STL
              </Typography>

              <Typography
                sx={{
                  mt: 0.3,
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: 13,
                  wordBreak:
                    "break-word",
                }}
              >
                {stlFile.name}
              </Typography>

              <Typography
                sx={{
                  mt: 0.3,
                  color: "#64748b",
                  fontSize: 11,
                }}
              >
                {formatFileSize(
                  stlFile.size
                )}
              </Typography>
            </Box>

            <Box
              sx={{
                mb: 2,
                p: 1.5,
                bgcolor: "#0b1520",
                border:
                  `1px solid ${quality.color}`,
                borderRadius: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: 2,
                  mb: 1,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 700,
                    color:
                      quality.color,
                  }}
                >
                  {quality.label}
                </Typography>

                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: 20,
                    color:
                      quality.color,
                  }}
                >
                  {qualityScore}/100
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={qualityScore}
                sx={{
                  height: 7,
                  borderRadius: 10,
                  bgcolor: "#1e293b",
                  "& .MuiLinearProgress-bar":
                    {
                      bgcolor:
                        quality.color,
                    },
                }}
              />

              <Typography
                sx={{
                  mt: 1,
                  color: "#94a3b8",
                  fontSize: 11,
                  lineHeight: 1.5,
                }}
              >
                {quality.description}
              </Typography>
            </Box>

            <Typography
              sx={{
                color: "#38bdf8",
                fontWeight: 700,
                fontSize: 12,
                mb: 1,
              }}
            >
              ESTRUTURA DA MALHA
            </Typography>

            <DiagnosticRow
              label="Triângulos"
              value={formatNumber(
                result.triangles
              )}
            />

            <DiagnosticRow
              label="Vértices"
              value={formatNumber(
                result.vertices
              )}
            />

            <DiagnosticRow
              label="Vértices únicos"
              value={formatNumber(
                result.uniqueVertices
              )}
            />

            <Divider
              sx={{
                my: 1.2,
                borderColor:
                  "#243447",
              }}
            />

            <DiagnosticRow
              label="Faces duplicadas"
              value={formatNumber(
                result.duplicateTriangles
              )}
              alert={
                result.duplicateTriangles >
                0
              }
            />

            <DiagnosticRow
              label="Triângulos degenerados"
              value={formatNumber(
                result.degenerateTriangles
              )}
              alert={
                result.degenerateTriangles >
                0
              }
            />

            <DiagnosticRow
              label="Bordas abertas"
              value={formatNumber(
                result.openEdges
              )}
              alert={
                result.openEdges > 0
              }
            />

            <DiagnosticRow
              label="Arestas não-manifold"
              value={formatNumber(
                result.nonManifoldEdges
              )}
              alert={
                result.nonManifoldEdges >
                0
              }
            />

            <DiagnosticRow
              label="Shells"
              value={formatNumber(
                result.shells
              )}
              alert={
                result.shells > 1
              }
            />

            <Divider
              sx={{
                my: 1.2,
                borderColor:
                  "#243447",
              }}
            />

            <Typography
              sx={{
                color: "#38bdf8",
                fontWeight: 700,
                fontSize: 12,
                mb: 1,
              }}
            >
              DIMENSÕES
            </Typography>

            <DiagnosticRow
              label="Largura (X)"
              value={`${result.width.toFixed(
                2
              )} mm`}
            />

            <DiagnosticRow
              label="Altura (Y)"
              value={`${result.height.toFixed(
                2
              )} mm`}
            />

            <DiagnosticRow
              label="Profundidade (Z)"
              value={`${result.depth.toFixed(
                2
              )} mm`}
            />

            <Divider
              sx={{
                my: 1.5,
                borderColor:
                  "#243447",
              }}
            />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 1,
              }}
            >
              <StatusBox
                title="INTEGRIDADE"
                approved={
                  result.healthy
                }
              />

              <StatusBox
                title="FABRICAÇÃO"
                approved={
                  result.healthy &&
                  result.openEdges ===
                    0
                }
              />
            </Box>

            {result.warnings.length >
              0 && (
              <>
                <Divider
                  sx={{
                    my: 1.5,
                    borderColor:
                      "#243447",
                  }}
                />

                <Typography
                  sx={{
                    color:
                      "#f59e0b",
                    fontWeight: 700,
                    fontSize: 12,
                    mb: 0.8,
                  }}
                >
                  AVISOS
                </Typography>

                {result.warnings.map(
                  (
                    warning,
                    index
                  ) => (
                    <Typography
                      key={`${warning}-${index}`}
                      sx={{
                        color:
                          "#fbbf24",
                        fontSize: 11,
                        lineHeight: 1.5,
                        mb: 0.5,
                      }}
                    >
                      • {warning}
                    </Typography>
                  )
                )}
              </>
            )}

            {result.warnings.length ===
              0 && (
              <>
                <Divider
                  sx={{
                    my: 1.5,
                    borderColor:
                      "#243447",
                  }}
                />

                <Typography
                  sx={{
                    color:
                      "#86efac",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  Nenhum problema estrutural
                  relevante foi detectado.
                </Typography>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          variant="contained"
        >
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface DiagnosticRowProps {
  label: string;
  value: string;
  alert?: boolean;
}

function DiagnosticRow({
  label,
  value,
  alert = false,
}: DiagnosticRowProps) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent:
          "space-between",
        alignItems: "center",
        gap: 2,
        py: 0.45,
      }}
    >
      <Typography
        sx={{
          color: "#94a3b8",
          fontSize: 12,
        }}
      >
        {label}
      </Typography>

      <Typography
        sx={{
          color: alert
            ? "#f59e0b"
            : "#e2e8f0",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

interface StatusBoxProps {
  title: string;
  approved: boolean;
}

function StatusBox({
  title,
  approved,
}: StatusBoxProps) {
  return (
    <Box
      sx={{
        p: 1.2,
        borderRadius: 2,
        border: approved
          ? "1px solid #22c55e"
          : "1px solid #f59e0b",
        bgcolor: approved
          ? "rgba(34,197,94,0.08)"
          : "rgba(245,158,11,0.08)",
      }}
    >
      <Typography
        sx={{
          color: "#94a3b8",
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {title}
      </Typography>

      <Typography
        sx={{
          mt: 0.3,
          color: approved
            ? "#86efac"
            : "#fbbf24",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {approved
          ? "APROVADO"
          : "REVISAR"}
      </Typography>
    </Box>
  );
}

function calculateQualityScore(
  result: MeshDiagnosticResult | null
) {
  if (!result) {
    return 0;
  }

  let score = 100;

  score -= Math.min(
    25,
    result.duplicateTriangles *
      0.02
  );

  score -= Math.min(
    20,
    result.degenerateTriangles *
      0.05
  );

  score -= Math.min(
    35,
    result.nonManifoldEdges *
      0.1
  );

  score -= Math.min(
    20,
    result.openEdges *
      0.01
  );

  if (result.shells > 10) {
    score -= 10;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

function getQualityInfo(
  score: number,
  result: MeshDiagnosticResult | null
) {
  if (!result) {
    return {
      label:
        "Aguardando diagnóstico",
      color: "#64748b",
      description:
        "A geometria ainda não foi analisada.",
    };
  }

  if (score >= 95) {
    return {
      label:
        "Malha excelente",
      color: "#22c55e",
      description:
        "A estrutura apresenta excelente integridade geométrica.",
    };
  }

  if (score >= 80) {
    return {
      label:
        "Malha boa",
      color: "#38bdf8",
      description:
        "A malha apresenta boa qualidade geral.",
    };
  }

  if (score >= 60) {
    return {
      label:
        "Requer atenção",
      color: "#f59e0b",
      description:
        "Existem alterações que devem ser avaliadas antes da fabricação.",
    };
  }

  return {
    label: "Malha crítica",
    color: "#ef4444",
    description:
      "A malha apresenta problemas estruturais importantes.",
  };
}

function formatNumber(
  value: number
) {
  return value.toLocaleString(
    "pt-BR"
  );
}

function formatFileSize(
  bytes: number
) {
  if (bytes <= 0) {
    return "0 KB";
  }

  const kilobytes =
    bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(
      1
    )} KB`;
  }

  const megabytes =
    kilobytes / 1024;

  return `${megabytes.toFixed(
    2
  )} MB`;
}