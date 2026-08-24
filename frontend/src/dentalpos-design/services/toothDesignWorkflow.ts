import * as THREE from "three";

import {
  type ToothDesignSession,
} from "./toothDesignSession";

import {
  analyzeDentalDesign,
  runAutoPlacement,
  runGoldenProportion,
  type DentalDesignAnalysis,
} from "./toothDesignEngine";

import {
  analyzeToothThickness,
  type ThicknessAnalysisResult,
} from "./toothThicknessAnalysis";

import {
  analyzeContactMap,
  type ContactMapResult,
} from "./toothContactMap";

import {
  getAntagonists,
} from "./toothAntagonist";

export interface ToothWorkflowAnalysis {
  toothNumber: number;

  design: DentalDesignAnalysis;

  thickness:
    | ThicknessAnalysisResult
    | null;

  contactMap:
    | ContactMapResult
    | null;
}

export class ToothDesignWorkflow {
  private session:
    ToothDesignSession;

  constructor(
    session: ToothDesignSession
  ) {
    this.session =
      session;
  }

  private getContext() {
    const toothNumber =
      this.session.getSelectedToothNumber();

    const tooth =
      this.session.getSelectedMesh();

    if (
      toothNumber === null ||
      !tooth
    ) {
      return null;
    }

    return {
      toothNumber,

      tooth,

      getToothMesh: (
        number: number
      ) =>
        this.session.getToothMesh(
          number
        ),
    };
  }

  analyzeSelected():
    ToothWorkflowAnalysis | null {
    const context =
      this.getContext();

    if (!context) {
      return null;
    }

    const design =
      analyzeDentalDesign(
        context
      );

    let thickness:
      | ThicknessAnalysisResult
      | null = null;

    try {
      thickness =
        analyzeToothThickness(
          context.tooth,
          {
            minimumThickness:
              0.5,

            warningThickness:
              0.8,

            sampleStep:
              12,
          }
        );
    } catch {
      thickness = null;
    }

    const contactMap =
      this.analyzeOcclusion(
        context.toothNumber,
        context.tooth
      );

    return {
      toothNumber:
        context.toothNumber,

      design,

      thickness,

      contactMap,
    };
  }

  autoPlaceSelected() {
    const context =
      this.getContext();

    if (!context) {
      return null;
    }

    const controller =
      this.session.getController();

    controller.saveHistory();

    const result =
      runAutoPlacement(
        context
      );

    if (
      result.positioned
    ) {
      controller
        .getState();

      context.tooth
        .updateMatrixWorld(
          true
        );
    }

    return result;
  }

  applyGoldenProportionToSelected() {
    const context =
      this.getContext();

    if (!context) {
      return null;
    }

    const controller =
      this.session.getController();

    controller.saveHistory();

    const result =
      runGoldenProportion(
        context
      );

    context.tooth.updateMatrixWorld(
      true
    );

    return result;
  }

  private analyzeOcclusion(
    toothNumber: number,
    tooth: THREE.Mesh
  ): ContactMapResult | null {
    const antagonistData =
      getAntagonists(
        toothNumber
      );

    for (
      const antagonistNumber
      of antagonistData.antagonists
    ) {
      const antagonist =
        this.session.getToothMesh(
          antagonistNumber
        );

      if (!antagonist) {
        continue;
      }

      try {
        return analyzeContactMap(
          tooth,
          antagonist,
          {
            collisionDistance:
              0.03,

            strongContactDistance:
              0.08,

            idealContactDistance:
              0.15,

            lightContactDistance:
              0.35,

            sampleStep:
              10,

            maxRayDistance:
              5,
          }
        );
      } catch {
        return null;
      }
    }

    return null;
  }

  undo() {
    return this.session.undo();
  }

  redo() {
    return this.session.redo();
  }

  canUndo() {
    return this.session.canUndo();
  }

  canRedo() {
    return this.session.canRedo();
  }
}

export function createToothDesignWorkflow(
  session: ToothDesignSession
) {
  return new ToothDesignWorkflow(
    session
  );
}