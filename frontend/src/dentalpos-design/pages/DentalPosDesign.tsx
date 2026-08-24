import {
  Box,
  Button,
  Chip,
  Paper,
  Typography,
} from "@mui/material";

import UploadFileIcon from "@mui/icons-material/UploadFile";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import StraightenIcon from "@mui/icons-material/Straighten";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import BiotechIcon from "@mui/icons-material/Biotech";

import {
  useCallback,
  useRef,
  useState,
} from "react";

import type * as THREE from "three";

import {
  diagnoseMesh,
  type MeshDiagnosticResult,
} from "../services/meshDiagnostics";

import Dental3DViewer from "../components/Dental3DViewer";
import ToothLibraryPanel from "../components/ToothLibraryPanel";
import MeshDiagnosticDialog from "../components/MeshDiagnosticDialog";
import DesignQueuePanel from "../components/DesignQueuePanel";
import DesignClinicalToolsPanel from "../components/DesignClinicalToolsPanel";
import DesignCaseWorkspacePanel, { type DentalCharacter, type DesignSculptTool } from "../components/DesignCaseWorkspacePanel";

export default function DentalPosDesign() {
  const [stlFile, setStlFile] =
    useState<File | null>(null);

  const [toothFile, setToothFile] =
    useState<File | null>(null);

  const [selectedTooth, setSelectedTooth] =
    useState<number | null>(null);

  const [antagonistFile, setAntagonistFile] = useState<File | null>(null);
  const [biteFile, setBiteFile] = useState<File | null>(null);
  const [sculptTool, setSculptTool] = useState<DesignSculptTool>("Navegação");
  const [brushStrength, setBrushStrength] = useState(35);
  const [toothCharacter, setToothCharacter] = useState<DentalCharacter>("Adulto");
  const [generatedToothNumber, setGeneratedToothNumber] = useState<number | null>(null);
  const [occlusionNonce, setOcclusionNonce] = useState(0);

  const [diagnosticOpen, setDiagnosticOpen] =
    useState(false);

  const [meshGeometry, setMeshGeometry] =
    useState<THREE.BufferGeometry | null>(null);

  const [diagnosticResult, setDiagnosticResult] =
    useState<MeshDiagnosticResult | null>(null);

  const archInputRef =
    useRef<HTMLInputElement | null>(null);

  const toothInputRef =
    useRef<HTMLInputElement | null>(null);

  const handleGeometryLoaded = useCallback(
    (
      geometry: THREE.BufferGeometry | null
    ) => {
      setMeshGeometry(
        (previousGeometry) => {
          previousGeometry?.dispose();

          if (!geometry) {
            return null;
          }

          return geometry.clone();
        }
      );

      setDiagnosticResult(null);
    },
    []
  );

  const handleImportArch = () => {
    archInputRef.current?.click();
  };

  const handleArchFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.name
        .toLowerCase()
        .endsWith(".stl")
    ) {
      alert(
        "Selecione um arquivo STL válido."
      );

      return;
    }

    setStlFile(file);
    setToothFile(null);
    setDiagnosticResult(null);

    event.target.value = "";
  };

  const handleSelectTooth = (
    toothNumber: number
  ) => {
    setSelectedTooth(toothNumber);
  };

  const handleInsertTooth = () => {
    if (!selectedTooth) {
      alert("Selecione primeiro um dente.");
      return;
    }
    setGeneratedToothNumber(selectedTooth);
  };

  const handleToothFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    if (
      !file.name
        .toLowerCase()
        .endsWith(".stl")
    ) {
      alert(
        "Selecione um STL correspondente ao dente."
      );

      return;
    }

    setToothFile(file);

    event.target.value = "";
  };

  const handleOpenDiagnostic = () => {
    if (!meshGeometry) {
      alert(
        "A geometria STL ainda não está disponível."
      );

      return;
    }

    try {
      const result =
        diagnoseMesh(meshGeometry);

      setDiagnosticResult(result);
      setDiagnosticOpen(true);
    } catch (error) {
      console.error(
        "DentalPos Mesh Diagnostic:",
        error
      );

      alert(
        "Não foi possível diagnosticar esta malha."
      );
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        minHeight: "100vh",
        bgcolor: "#07111d",
        p: {
          xs: 1,
          md: 1.5,
        },
      }}
    >
      <input
        ref={archInputRef}
        type="file"
        accept=".stl"
        onChange={handleArchFileChange}
        style={{
          display: "none",
        }}
      />

      <input
        ref={toothInputRef}
        type="file"
        accept=".stl"
        onChange={handleToothFileChange}
        style={{
          display: "none",
        }}
      />

      <DesignQueuePanel />
      <DesignClinicalToolsPanel />
      <DesignCaseWorkspacePanel
        antagonistFile={antagonistFile}
        biteFile={biteFile}
        onAntagonistFile={setAntagonistFile}
        onBiteFile={setBiteFile}
        tool={sculptTool}
        onTool={setSculptTool}
        brushStrength={brushStrength}
        onBrushStrength={setBrushStrength}
        character={toothCharacter}
        onCharacter={setToothCharacter}
        onOcclude={() => setOcclusionNonce((value) => value + 1)}
      />

      <Paper
        elevation={0}
        sx={{
          mb: 1.5,
          px: 2,
          py: 1.25,
          bgcolor: "#101c2a",
          color: "white",
          border:
            "1px solid #243447",
          borderRadius: 2.5,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: {
              xs: "column",
              sm: "row",
            },
            justifyContent:
              "space-between",
            alignItems: {
              xs: "flex-start",
              sm: "center",
            },
            gap: 1,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: {
                  xs: "1.15rem",
                  md: "1.35rem",
                },
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              DentalPos Design
            </Typography>

            <Typography
              sx={{
                mt: 0.25,
                fontSize: "0.78rem",
                color: "#94a3b8",
              }}
            >
              CAD Odontológico • 3D Core
            </Typography>

            {stlFile && (
              <Typography
                sx={{
                  mt: 0.35,
                  fontSize: "0.7rem",
                  color: "#38bdf8",
                  maxWidth: {
                    xs: "280px",
                    md: "600px",
                  },
                  overflow: "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Arcada: {stlFile.name}
              </Typography>
            )}

            {selectedTooth && (
              <Typography
                sx={{
                  mt: 0.2,
                  fontSize: "0.7rem",
                  color: "#a7f3d0",
                }}
              >
                Dente selecionado:{" "}
                {selectedTooth}
              </Typography>
            )}

            {toothFile && (
              <Typography
                sx={{
                  mt: 0.2,
                  fontSize: "0.7rem",
                  color: "#ffc857",
                  maxWidth: {
                    xs: "280px",
                    md: "600px",
                  },
                  overflow: "hidden",
                  textOverflow:
                    "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Anatomia carregada:{" "}
                {toothFile.name}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Chip size="small" label={`Ferramenta: ${sculptTool}`} variant="outlined" sx={{ color: "#bae6fd", borderColor: "#38bdf8" }} />
            {generatedToothNumber && <Chip size="small" label={`Banco: dente ${generatedToothNumber} • ${toothCharacter}`} color="success" />}
          <Chip
            label="ALPHA"
            color="primary"
            size="small"
          />
          </Box>
        </Box>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg:
              "165px minmax(0, 1fr) 205px",
          },
          gap: 1.25,
          alignItems: "stretch",
          width: "100%",
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 1.25,
            bgcolor: "#101c2a",
            border:
              "1px solid #243447",
            borderRadius: 2.5,
            height: {
              lg:
                "calc(100vh - 145px)",
            },
            minHeight: {
              xs: "auto",
              lg: "720px",
            },
            overflowY: "auto",
          }}
        >
          <Typography
            sx={{
              color: "#64748b",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing:
                "0.04em",
            }}
          >
            FERRAMENTAS
          </Typography>

          <Box
            sx={{
              mt: 1.25,
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
            }}
          >
            <Button
              variant="contained"
              startIcon={
                <UploadFileIcon />
              }
              fullWidth
              onClick={
                handleImportArch
              }
              size="small"
              sx={{
                justifyContent:
                  "flex-start",
                textTransform: "none",
                fontSize: "0.78rem",
              }}
            >
              Importar STL
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <BiotechIcon />
              }
              fullWidth
              disabled={!stlFile}
              onClick={
                handleOpenDiagnostic
              }
              size="small"
              sx={{
                justifyContent:
                  "flex-start",
                textTransform: "none",
                fontSize: "0.72rem",
              }}
            >
              Diagnosticar
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <ViewInArIcon />
              }
              fullWidth
              disabled={!stlFile}
              size="small"
              sx={{
                justifyContent:
                  "flex-start",
                textTransform: "none",
                fontSize: "0.78rem",
              }}
            >
              Selecionar
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <ContentCutIcon />
              }
              fullWidth
              disabled={!stlFile}
              size="small"
              sx={{
                justifyContent:
                  "flex-start",
                textTransform: "none",
                fontSize: "0.78rem",
              }}
            >
              Cortar
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <StraightenIcon />
              }
              fullWidth
              disabled={!stlFile}
              size="small"
              sx={{
                justifyContent:
                  "flex-start",
                textTransform: "none",
                fontSize: "0.78rem",
              }}
            >
              Medir
            </Button>
          </Box>

          <Box
            sx={{
              mt: 2,
              pt: 1.5,
              borderTop:
                "1px solid #243447",
            }}
          >
            <Typography
              sx={{
                color: "#38bdf8",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing:
                  "0.04em",
              }}
            >
              DESIGN DENTÁRIO
            </Typography>

            <Box
              sx={{
                mt: 1,
                display: "flex",
                flexDirection:
                  "column",
                gap: 0.75,
              }}
            >
              <Button
                variant="contained"
                fullWidth
                disabled={
                  !selectedTooth
                }
                onClick={
                  handleInsertTooth
                }
                size="small"
                sx={{
                  justifyContent:
                    "flex-start",
                  textTransform:
                    "none",
                  fontSize:
                    "0.78rem",
                }}
              >
                Inserir dente
              </Button>

              <Button
                variant="outlined"
                fullWidth
                disabled={
                  !selectedTooth
                }
                size="small"
                sx={{
                  justifyContent:
                    "flex-start",
                  textTransform:
                    "none",
                  fontSize:
                    "0.78rem",
                }}
              >
                Espelhar
              </Button>

              <Button
                variant="outlined"
                fullWidth
                disabled={
                  !selectedTooth
                }
                size="small"
                sx={{
                  justifyContent:
                    "flex-start",
                  textTransform:
                    "none",
                  fontSize:
                    "0.75rem",
                }}
              >
                Proporção áurea
              </Button>

              <Button
                variant="outlined"
                fullWidth
                disabled={
                  !selectedTooth
                }
                size="small"
                sx={{
                  justifyContent:
                    "flex-start",
                  textTransform:
                    "none",
                  fontSize:
                    "0.78rem",
                }}
              >
                Adjacentes
              </Button>

              <Button
                variant="outlined"
                fullWidth
                disabled={
                  !selectedTooth
                }
                size="small"
                sx={{
                  justifyContent:
                    "flex-start",
                  textTransform:
                    "none",
                  fontSize:
                    "0.78rem",
                }}
              >
                Antagonista
              </Button>
            </Box>
          </Box>

          <Box
            sx={{
              mt: 2,
              pt: 1.5,
              borderTop:
                "1px solid #243447",
            }}
          >
            <Typography
              sx={{
                color: "#475569",
                fontSize: "0.62rem",
                lineHeight: 1.4,
              }}
            >
              DENTALPOS
              <br />
              3D ENGINE
            </Typography>
          </Box>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            position: "relative",
            minWidth: 0,
            height: {
              xs: "700px",
              lg:
                "calc(100vh - 145px)",
            },
            minHeight: {
              xs: "700px",
              lg: "720px",
            },
            bgcolor: "#101820",
            border:
              "1px solid #243447",
            borderRadius: 2.5,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          >
            <Dental3DViewer
              stlFile={stlFile}
              toothFile={toothFile}
              antagonistFile={antagonistFile}
              biteFile={biteFile}
              generatedToothNumber={generatedToothNumber}
              toothCharacter={toothCharacter}
              occlusionNonce={occlusionNonce}
              activeTool={sculptTool}
              brushStrength={brushStrength}
              onGeometryLoaded={handleGeometryLoaded}
            />
          </Box>
        </Paper>

        <Box
          sx={{
            height: {
              lg:
                "calc(100vh - 145px)",
            },
            minHeight: {
              lg: "720px",
            },
            overflowY: {
              lg: "auto",
            },
          }}
        >
          <ToothLibraryPanel
            onSelectTooth={
              handleSelectTooth
            }
          />

          <Paper
            elevation={0}
            sx={{
              mt: 1.25,
              p: 1.25,
              bgcolor: "#101820",
              border:
                "1px solid #243447",
              borderRadius: 2.5,
            }}
          >
            <Typography
              sx={{
                color: "#38bdf8",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing:
                  "0.04em",
              }}
            >
              DENTALPOS AI
            </Typography>

            <Typography
              sx={{
                mt: 0.75,
                color: "#94a3b8",
                fontSize: "0.68rem",
                lineHeight: 1.45,
              }}
            >
              Análise automática de espaço,
              adjacentes, antagonista,
              término e anatomia sugerida.
            </Typography>

            <Button
              variant="contained"
              fullWidth
              disabled={
                !stlFile ||
                !selectedTooth
              }
              size="small"
              sx={{
                mt: 1.25,
                textTransform: "none",
                fontSize: "0.76rem",
              }}
            >
              Gerar proposta
            </Button>
          </Paper>
        </Box>
      </Box>

      <MeshDiagnosticDialog
        open={diagnosticOpen}
        stlFile={stlFile}
        result={diagnosticResult}
        onClose={() =>
          setDiagnosticOpen(false)
        }
      />
    </Box>
  );
}