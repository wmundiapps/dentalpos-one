import {
  type ToothDesignSession,
} from "./toothDesignSession";

import {
  validateToothDesign,
  type ToothDesignValidationResult,
} from "./toothDesignValidation";

export interface ToothDesignReportItem {
  toothNumber: number;

  valid: boolean;

  errors: number;

  warnings: number;

  validation:
    ToothDesignValidationResult;
}

export interface ToothDesignReport {
  createdAt: string;

  totalTeeth: number;

  validTeeth: number;

  teethWithWarnings: number;

  teethWithErrors: number;

  readyForExport: boolean;

  items:
    ToothDesignReportItem[];
}

export function generateToothDesignReport(
  session: ToothDesignSession
): ToothDesignReport {
  const teeth =
    session.getAllTeeth();

  const items:
    ToothDesignReportItem[] =
    [];

  for (
    const instance of teeth
  ) {
    const validation =
      validateToothDesign({
        toothNumber:
          instance.toothNumber,

        tooth:
          instance.mesh,

        getToothMesh:
          (toothNumber) =>
            session.getToothMesh(
              toothNumber
            ),
      });

    items.push({
      toothNumber:
        instance.toothNumber,

      valid:
        validation.valid,

      errors:
        validation.errors,

      warnings:
        validation.warnings,

      validation,
    });
  }

  const validTeeth =
    items.filter(
      (item) =>
        item.valid
    ).length;

  const teethWithWarnings =
    items.filter(
      (item) =>
        item.warnings > 0
    ).length;

  const teethWithErrors =
    items.filter(
      (item) =>
        item.errors > 0
    ).length;

  return {
    createdAt:
      new Date()
        .toISOString(),

    totalTeeth:
      items.length,

    validTeeth,

    teethWithWarnings,

    teethWithErrors,

    readyForExport:
      items.length > 0 &&
      teethWithErrors === 0,

    items,
  };
}

export function reportToText(
  report: ToothDesignReport
) {
  const lines:
    string[] = [];

  lines.push(
    "DENTALPOS DESIGN"
  );

  lines.push(
    "RELATÓRIO DE VALIDAÇÃO"
  );

  lines.push("");

  lines.push(
    `Data: ${new Date(
      report.createdAt
    ).toLocaleString()}`
  );

  lines.push(
    `Dentes: ${report.totalTeeth}`
  );

  lines.push(
    `Aprovados: ${report.validTeeth}`
  );

  lines.push(
    `Com alertas: ${report.teethWithWarnings}`
  );

  lines.push(
    `Com erros: ${report.teethWithErrors}`
  );

  lines.push("");

  lines.push(
    report.readyForExport
      ? "STATUS: PRONTO PARA EXPORTAÇÃO"
      : "STATUS: REVISÃO NECESSÁRIA"
  );

  lines.push("");

  report.items.forEach(
    (item) => {
      lines.push(
        `DENTE ${item.toothNumber}`
      );

      lines.push(
        `Status: ${
          item.valid
            ? "APROVADO"
            : "REVISAR"
        }`
      );

      item.validation.messages.forEach(
        (message) => {
          lines.push(
            `[${message.level.toUpperCase()}] ${message.title}: ${message.message}`
          );
        }
      );

      lines.push("");
    }
  );

  return lines.join(
    "\n"
  );
}

export function downloadToothDesignReport(
  report: ToothDesignReport,
  fileName =
    "DentalPos_Design_Report.txt"
) {
  const content =
    reportToText(
      report
    );

  const blob =
    new Blob(
      [content],
      {
        type:
          "text/plain;charset=utf-8",
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    fileName;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  document.body.removeChild(
    anchor
  );

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    100
  );

  return blob;
}