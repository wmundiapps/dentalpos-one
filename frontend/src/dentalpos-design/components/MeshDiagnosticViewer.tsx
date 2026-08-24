import { useEffect, useState } from "react";

import { loadSTLFile } from "../services/meshLoader";

import {
  processMesh,
  type MeshProcessingResult,
} from "../services/meshProcessor";

import {
  calculateMeshQuality,
  type MeshQualityResult,
} from "../services/meshQuality";

import {
  detectDuplicateSurfaces,
  type DuplicateDetectionResult,
} from "../services/meshDuplicateDetector";

import {
  compareMeshDiagnostics,
  type MeshComparisonResult,
} from "../services/meshComparison";

import { exportGeometryToSTL } from "../services/stlExporter";

interface MeshDiagnosticViewerProps {
  stlFile: File | null;
}

export default function MeshDiagnosticViewer({
  stlFile,
}: MeshDiagnosticViewerProps) {
  const [
    processing,
    setProcessing,
  ] =
    useState<MeshProcessingResult | null>(
      null
    );

  const [
    quality,
    setQuality,
  ] =
    useState<MeshQualityResult | null>(
      null
    );

  const [
    duplicateAnalysis,
    setDuplicateAnalysis,
  ] =
    useState<DuplicateDetectionResult | null>(
      null
    );

  const [
    comparison,
    setComparison,
  ] =
    useState<MeshComparisonResult | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!stlFile) {
        setProcessing(
          (previous) => {
            previous?.geometry.dispose();

            return null;
          }
        );

        setQuality(null);
        setDuplicateAnalysis(null);
        setComparison(null);
        setError(null);

        return;
      }

      setLoading(true);
      setError(null);

      try {
        const loaded =
          await loadSTLFile(
            stlFile
          );

        if (cancelled) {
          loaded.geometry.dispose();
          return;
        }

        const duplicateResult =
          detectDuplicateSurfaces(
            loaded.geometry
          );

        const result =
          processMesh(
            loaded.geometry
          );

        loaded.geometry.dispose();

        if (cancelled) {
          result.geometry.dispose();
          return;
        }

        const qualityResult =
          calculateMeshQuality(
            result.original
          );

        const comparisonResult =
          compareMeshDiagnostics(
            result.original,
            result.repaired
          );

        setProcessing(
          (previous) => {
            previous?.geometry.dispose();

            return result;
          }
        );

        setQuality(
          qualityResult
        );

        setDuplicateAnalysis(
          duplicateResult
        );

        setComparison(
          comparisonResult
        );
      } catch (
        diagnosticError
      ) {
        console.error(
          "DentalPos Diagnostic:",
          diagnosticError
        );

        if (!cancelled) {
          setError(
            diagnosticError instanceof
              Error
              ? diagnosticError.message
              : "Erro no diagnóstico."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [stlFile]);

  useEffect(() => {
    return () => {
      processing?.geometry.dispose();
    };
  }, [processing]);

  const handleExport = () => {
    if (!processing) {
      return;
    }

    const baseName =
      stlFile?.name.replace(
        /\.stl$/i,
        ""
      ) ??
      "DentalPos";

    exportGeometryToSTL(
      processing.geometry,
      `${baseName}-DentalPos-reparado.stl`
    );
  };

  if (!stlFile) {
    return (
      <StatusBox>
        Importe um STL.
      </StatusBox>
    );
  }

  if (loading) {
    return (
      <StatusBox>
        Analisando STL...
      </StatusBox>
    );
  }

  if (error) {
    return (
      <StatusBox error>
        {error}
      </StatusBox>
    );
  }

  if (
    !processing ||
    !quality ||
    !duplicateAnalysis ||
    !comparison
  ) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection:
          "column",
        gap: 12,
      }}
    >
      <div
        style={{
          background:
            "#101820",

          border:
            duplicateAnalysis.suspectedDoubleSurface
              ? "1px solid #ef4444"
              : "1px solid #166534",

          borderRadius: 12,

          padding: 14,
        }}
      >
        <div
          style={{
            color:
              duplicateAnalysis.suspectedDoubleSurface
                ? "#f87171"
                : "#86efac",

            fontSize: 13,
            fontWeight: 900,
          }}
        >
          {duplicateAnalysis.suspectedDoubleSurface
            ? "POSSÍVEL SUPERFÍCIE DUPLICADA"
            : "SEM DUPLICAÇÃO EXTENSA"}
        </div>

        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "1fr 1fr",

            gap: 6,

            marginTop: 10,
          }}
        >
          <Metric
            label="Triângulos"
            value={
              duplicateAnalysis.totalTriangles
            }
          />

          <Metric
            label="Duplicação"
            textValue={`${duplicateAnalysis.duplicatePercentage.toFixed(
              2
            )}%`}
            warning={
              duplicateAnalysis.suspectedDoubleSurface
            }
          />

          <Metric
            label="Duplicados exatos"
            value={
              duplicateAnalysis.exactDuplicates
            }
            warning={
              duplicateAnalysis.exactDuplicates >
              0
            }
          />

          <Metric
            label="Faces invertidas"
            value={
              duplicateAnalysis.reversedDuplicates
            }
            warning={
              duplicateAnalysis.reversedDuplicates >
              0
            }
          />
        </div>
      </div>

      <div
        style={{
          background:
            "#101820",

          border:
            "1px solid #243447",

          borderRadius: 12,

          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                color:
                  "#38bdf8",

                fontSize: 12,
                fontWeight: 900,
              }}
            >
              QUALIDADE
            </div>

            <div
              style={{
                marginTop: 4,

                color:
                  "#94a3b8",

                fontSize: 11,
              }}
            >
              {quality.label}
            </div>
          </div>

          <div
            style={{
              color:
                quality.score >=
                80
                  ? "#22c55e"
                  : quality.score >=
                      60
                    ? "#f59e0b"
                    : "#ef4444",

              fontSize: 30,
              fontWeight: 900,
            }}
          >
            {quality.score}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,

            display: "flex",

            gap: 6,

            flexWrap: "wrap",
          }}
        >
          <Badge
            active={
              quality.canDesign
            }
            label={
              quality.canDesign
                ? "CAD LIBERADO"
                : "CAD BLOQUEADO"
            }
          />

          <Badge
            active={
              quality.canManufacture
            }
            label={
              quality.canManufacture
                ? "FABRICAÇÃO LIBERADA"
                : "REVISAR PARA FABRICAÇÃO"
            }
          />
        </div>
      </div>

      <DiagnosticBlock
        title="ORIGINAL"
        triangles={
          processing.original
            .triangles
        }
        duplicates={
          processing.original
            .duplicateTriangles
        }
        degenerates={
          processing.original
            .degenerateTriangles
        }
        openEdges={
          processing.original
            .openEdges
        }
        nonManifold={
          processing.original
            .nonManifoldEdges
        }
        shells={
          processing.original
            .shells
        }
      />

      <DiagnosticBlock
        title="REPARADO"
        triangles={
          processing.repaired
            .triangles
        }
        duplicates={
          processing.repaired
            .duplicateTriangles
        }
        degenerates={
          processing.repaired
            .degenerateTriangles
        }
        openEdges={
          processing.repaired
            .openEdges
        }
        nonManifold={
          processing.repaired
            .nonManifoldEdges
        }
        shells={
          processing.repaired
            .shells
        }
      />

      <div
        style={{
          background:
            "#101820",

          border:
            comparison.worsened
              ? "1px solid #ef4444"
              : comparison.improved
                ? "1px solid #166534"
                : "1px solid #334155",

          borderRadius: 12,

          padding: 14,
        }}
      >
        <div
          style={{
            color:
              comparison.worsened
                ? "#f87171"
                : comparison.improved
                  ? "#86efac"
                  : "#94a3b8",

            fontSize: 11,
            fontWeight: 900,
          }}
        >
          COMPARAÇÃO
        </div>

        <div
          style={{
            marginTop: 8,

            color:
              "#cbd5e1",

            fontSize: 11,

            lineHeight: 1.5,
          }}
        >
          {comparison.summary}
        </div>
      </div>

      <button
        type="button"
        onClick={
          handleExport
        }
        style={{
          width: "100%",

          padding:
            "10px 12px",

          borderRadius: 8,

          border:
            "1px solid #0284c7",

          background:
            "#0369a1",

          color:
            "#ffffff",

          cursor:
            "pointer",

          fontSize: 11,

          fontWeight: 900,
        }}
      >
        Exportar STL reparado
      </button>
    </div>
  );
}

interface DiagnosticBlockProps {
  title: string;
  triangles: number;
  duplicates: number;
  degenerates: number;
  openEdges: number;
  nonManifold: number;
  shells: number;
}

function DiagnosticBlock({
  title,
  triangles,
  duplicates,
  degenerates,
  openEdges,
  nonManifold,
  shells,
}: DiagnosticBlockProps) {
  return (
    <div
      style={{
        background:
          "#101820",

        border:
          "1px solid #243447",

        borderRadius: 12,

        padding: 14,
      }}
    >
      <div
        style={{
          color:
            "#38bdf8",

          fontSize: 11,

          fontWeight: 900,

          marginBottom: 10,
        }}
      >
        {title}
      </div>

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "1fr 1fr",

          gap: 6,
        }}
      >
        <Metric
          label="Triângulos"
          value={triangles}
        />

        <Metric
          label="Shells"
          value={shells}
        />

        <Metric
          label="Duplicados"
          value={duplicates}
          warning={
            duplicates > 0
          }
        />

        <Metric
          label="Degenerados"
          value={degenerates}
          warning={
            degenerates > 0
          }
        />

        <Metric
          label="Bordas abertas"
          value={openEdges}
          warning={
            openEdges > 0
          }
        />

        <Metric
          label="Não-manifold"
          value={nonManifold}
          warning={
            nonManifold > 0
          }
        />
      </div>
    </div>
  );
}

interface MetricProps {
  label: string;
  value?: number;
  textValue?: string;
  warning?: boolean;
}

function Metric({
  label,
  value,
  textValue,
  warning = false,
}: MetricProps) {
  return (
    <div
      style={{
        background:
          "#0b121b",

        border:
          warning
            ? "1px solid #92400e"
            : "1px solid #1e293b",

        borderRadius: 7,

        padding: 7,
      }}
    >
      <div
        style={{
          color:
            "#64748b",

          fontSize: 9,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 2,

          color:
            warning
              ? "#f59e0b"
              : "#e2e8f0",

          fontSize: 12,

          fontWeight: 900,
        }}
      >
        {textValue ??
          value?.toLocaleString(
            "pt-BR"
          ) ??
          "0"}
      </div>
    </div>
  );
}

interface BadgeProps {
  active: boolean;
  label: string;
}

function Badge({
  active,
  label,
}: BadgeProps) {
  return (
    <div
      style={{
        padding:
          "4px 7px",

        borderRadius:
          999,

        border:
          active
            ? "1px solid #166534"
            : "1px solid #92400e",

        color:
          active
            ? "#86efac"
            : "#fbbf24",

        fontSize: 9,

        fontWeight: 900,
      }}
    >
      {label}
    </div>
  );
}

interface StatusBoxProps {
  children:
    React.ReactNode;

  error?: boolean;
}

function StatusBox({
  children,
  error = false,
}: StatusBoxProps) {
  return (
    <div
      style={{
        padding: 14,

        background:
          "#101820",

        border:
          error
            ? "1px solid #7f1d1d"
            : "1px solid #243447",

        borderRadius: 12,

        color:
          error
            ? "#fca5a5"
            : "#38bdf8",

        fontSize: 12,

        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}