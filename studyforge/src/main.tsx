import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { queryClient } from "@/app/queryClient";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { ToastHost } from "@/components/ui/Toast";
import App from "@/App";
import "@/styles/tailwind.css";
import "@/types/ipc";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
        <ToastHost />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
