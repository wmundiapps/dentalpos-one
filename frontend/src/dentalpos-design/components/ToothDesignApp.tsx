import {
  useCallback,
  useMemo,
  useState,
} from "react";

import Dental3DViewer from "./Dental3DViewer";

import ToothLibraryPanel from "./ToothLibraryPanel";

import ToothDesignToolbar from "./ToothDesignToolbar";

import ToothProjectToolbar from "./ToothProjectToolbar";

import ToothTransformPanel from "./ToothTransformPanel";

import ToothAnalysisPanel from "./ToothAnalysisPanel";

import ToothDesignStatusPanel from "./ToothDesignStatusPanel";

import ToothFinalizationPanel from "./ToothFinalizationPanel";

import ToothDesignWorkspace from "./ToothDesignWorkspace";

export default function ToothDesignApp() {
  const [
    selectedTooth,
    setSelectedTooth,
  ] = useState<number | null>(
    null
  );

  const [
    stlFile,
    setStlFile,
  ] = useState<File | null>(
    null
  );

  const [
    projectName,
    setProjectName,
  ] = useState(
    "Novo Projeto"
  );

  const [
    score,
    setScore,
  ] = useState<number | null>(
    null
  );

  const [
    errors,
    setErrors,
  ] = useState(0);

  const [
    warnings,
    setWarnings,
  ] = useState(0);

  const [
    readyForManufacturing,
    setReadyForManufacturing,
  ] = useState(false);

  const [
    canUndo,
    setCanUndo,
  ] = useState(false);

  const [
    canRedo,
    setCanRedo,
  ] = useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] = useState(
    "Selecione um dente para iniciar."
  );

  const handleSelectTooth =
    useCallback(
      (toothNumber: number) => {
        setSelectedTooth(
          toothNumber
        );

        setStatusMessage(
          `Dente ${toothNumber} selecionado.`
        );
      },
      []
    );

  const handleAnalyze =
    useCallback(() => {
      if (
        selectedTooth === null
      ) {
        setStatusMessage(
          "Selecione um dente antes da análise."
        );

        return;
      }

      setStatusMessage(
        `Análise solicitada para o dente ${selectedTooth}.`
      );
    }, [selectedTooth]);

  const handleNewProject =
    useCallback(() => {
      setProjectName(
        "Novo Projeto"
      );

      setSelectedTooth(
        null
      );

      setStlFile(
        null
      );

      setScore(
        null
      );

      setErrors(0);

      setWarnings(0);

      setReadyForManufacturing(
        false
      );

      setCanUndo(
        false
      );

      setCanRedo(
        false
      );

      setStatusMessage(
        "Novo projeto criado."
      );
    }, []);

  const handleOpenProject =
    useCallback(
      (file: File) => {
        setStlFile(
          file
        );

        setProjectName(
          file.name
        );

        setStatusMessage(
          `Arquivo ${file.name} carregado.`
        );
      },
      []
    );

  const rightPanel =
    useMemo(
      () => (
        <>
          <ToothDesignStatusPanel
            selectedTooth={
              selectedTooth
            }
            score={
              score
            }
            errors={
              errors
            }
            warnings={
              warnings
            }
            readyForExport={
              readyForManufacturing
            }
            statusMessage={
              statusMessage
            }
          />

          <ToothTransformPanel
            disabled={
              selectedTooth ===
              null
            }
          />

          <ToothAnalysisPanel
            disabled={
              selectedTooth ===
              null
            }
            criticalPoints={
              errors
            }
            warningPoints={
              warnings
            }
            onAnalyze={
              handleAnalyze
            }
          />

          <ToothFinalizationPanel
            totalTeeth={
              selectedTooth !==
              null
                ? 1
                : 0
            }
            approvedTeeth={
              readyForManufacturing
                ? 1
                : 0
            }
            rejectedTeeth={
              errors > 0
                ? 1
                : 0
            }
            averageScore={
              score ?? 0
            }
            readyForManufacturing={
              readyForManufacturing
            }
            disabled={
              selectedTooth ===
              null
            }
          />
        </>
      ),
      [
        selectedTooth,
        score,
        errors,
        warnings,
        readyForManufacturing,
        statusMessage,
        handleAnalyze,
      ]
    );

  return (
    <ToothDesignWorkspace
      projectToolbar={
        <ToothProjectToolbar
          projectName={
            projectName
          }
          onNewProject={
            handleNewProject
          }
          onOpenProject={
            handleOpenProject
          }
        />
      }

      toolbar={
        <ToothDesignToolbar
          canUndo={
            canUndo
          }
          canRedo={
            canRedo
          }
          onAnalyze={
            handleAnalyze
          }
        />
      }

      leftPanel={
        <ToothLibraryPanel
          onSelectTooth={
            handleSelectTooth
          }
        />
      }

      viewer={
        <Dental3DViewer
          stlFile={
            stlFile
          }
        />
      }

      rightPanel={
        rightPanel
      }
    />
  );
}