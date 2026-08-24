import ToothDesignShell from "./components/ToothDesignShell";

import ToothDesignErrorBoundary from "./components/ToothDesignErrorBoundary";

import {
  DentalPosDesignProvider,
} from "./DentalPosDesignProvider";

export default function DentalPosDesignPage() {
  return (
    <DentalPosDesignProvider>
      <ToothDesignErrorBoundary>
        <ToothDesignShell />
      </ToothDesignErrorBoundary>
    </DentalPosDesignProvider>
  );
}