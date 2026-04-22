import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface CheckerStatus {
  name: string;
  progress: number;
  isChecking: boolean;
}

interface CheckerContextType {
  activeCheckers: CheckerStatus[];
  setCheckerStatus: (
    name: string,
    isChecking: boolean,
    progress: number,
  ) => void;
}

const CheckerContext = createContext<CheckerContextType | undefined>(undefined);

export function CheckerProvider({ children }: { children: ReactNode }) {
  const [activeCheckers, setActiveCheckers] = useState<CheckerStatus[]>([]);

  const setCheckerStatus = useCallback(
    (name: string, isChecking: boolean, progress: number) => {
      setActiveCheckers((prev) => {
        const existing = prev.find((c) => c.name === name);
        if (isChecking) {
          if (existing) {
            return prev.map((c) => (c.name === name ? { ...c, progress } : c));
          }
          return [...prev, { name, progress, isChecking: true }];
        }
        return prev.filter((c) => c.name !== name);
      });
    },
    [],
  );

  return (
    <CheckerContext.Provider value={{ activeCheckers, setCheckerStatus }}>
      {children}
    </CheckerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCheckerStatus() {
  const ctx = useContext(CheckerContext);
  if (!ctx)
    throw new Error("useCheckerStatus must be used within CheckerProvider");
  return ctx;
}
