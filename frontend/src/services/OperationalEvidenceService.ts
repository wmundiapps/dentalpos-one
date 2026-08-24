import type { OperationalEvidence } from "../types/operationalEvidence";
import type { OperationalTask } from "../types/operationalTask";

export const operationalEvidence: OperationalEvidence[] = [];

export function canCompleteOperationalTask(
  task: OperationalTask,
  evidence?: OperationalEvidence,
): boolean {
  if (task.evidenceRequirement === "Nenhuma") {
    return true;
  }

  if (!evidence?.photoUrl.trim()) {
    return false;
  }

  if (
    task.evidenceRequirement === "Foto e assinatura" &&
    !evidence.signedBy?.trim()
  ) {
    return false;
  }

  return true;
}