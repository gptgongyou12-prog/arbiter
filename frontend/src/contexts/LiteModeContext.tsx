import { createContext, useContext, useEffect, useState } from "react";

interface LiteModeContextType {
  isLite: boolean;
}

const LiteModeContext = createContext<LiteModeContextType>({ isLite: false });

export function useLiteMode() {
  return useContext(LiteModeContext);
}

export function LiteModeProvider({ children }: { children: React.ReactNode }) {
  const [isLite, setIsLite] = useState(false);

  useEffect(() => {
    fetch("/api/preferences", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.data?.lite_mode || data?.lite_mode) {
          setIsLite(true);
          document.documentElement.setAttribute("data-lite", "true");
        }
      })
      .catch(() => {});
  }, []);

  return (
    <LiteModeContext.Provider value={{ isLite }}>
      {children}
    </LiteModeContext.Provider>
  );
}
