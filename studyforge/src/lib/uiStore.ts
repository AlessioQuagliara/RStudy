import { create } from "zustand";

type ThemeMode = "light" | "dark" | "system";

interface UiState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

function applyTheme(theme: ThemeMode) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export const useUiStore = create<UiState>((set) => ({
  theme: "system",
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));

applyTheme("system");
