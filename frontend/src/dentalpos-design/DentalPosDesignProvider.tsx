import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

interface DentalPosDesignContextValue {
  version: string;
  productName: string;
  environment: "alpha";
}

const DentalPosDesignContext =
  createContext<DentalPosDesignContextValue | null>(
    null
  );

interface DentalPosDesignProviderProps {
  children: ReactNode;
}

export function DentalPosDesignProvider({
  children,
}: DentalPosDesignProviderProps) {
  const value =
    useMemo<DentalPosDesignContextValue>(
      () => ({
        version: "ALPHA",
        productName:
          "DentalPos Design",
        environment:
          "alpha",
      }),
      []
    );

  return (
    <DentalPosDesignContext.Provider
      value={value}
    >
      {children}
    </DentalPosDesignContext.Provider>
  );
}

export function useDentalPosDesign() {
  const context =
    useContext(
      DentalPosDesignContext
    );

  if (!context) {
    throw new Error(
      "useDentalPosDesign deve ser usado dentro de DentalPosDesignProvider."
    );
  }

  return context;
}