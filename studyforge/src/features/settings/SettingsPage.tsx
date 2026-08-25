import { useEffect, useState } from "react";
import { KeyRound, FolderOpen, Download, Upload, PlugZap, ShieldCheck } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useUiStore } from "@/lib/uiStore";
import {
  useApiKeyStatus,
  useClearApiKey,
  useExportBackup,
  useImportBackup,
  usePickBackupFile,
  usePickImportFolder,
  useSetApiKey,
  useSettings,
  useUpdateSettings,
} from "@/features/settings/api";
import { useTestDeepSeekConnection } from "@/features/courses/aiApi";
import { toast } from "@/lib/toastStore";
import type { ThemeMode } from "@shared/schemas";

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: apiKeyStatus } = useApiKeyStatus();
  const updateSettings = useUpdateSettings();
  const setApiKey = useSetApiKey();
  const clearApiKey = useClearApiKey();
  const pickImportFolder = usePickImportFolder();
  const testConnection = useTestDeepSeekConnection();
  const exportBackup = useExportBackup();
  const pickBackupFile = usePickBackupFile();
  const importBackup = useImportBackup();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);

  useEffect(() => {
    if (settings) {
      setModel(settings.deepseekModel);
      setBaseUrl(settings.deepseekBaseUrl);
      setTemperature(settings.temperature);
      setMaxTokens(settings.maxTokens);
    }
  }, [settings]);

  const saveModelSettings = async () => {
    try {
      await updateSettings.mutateAsync({ deepseekModel: model, deepseekBaseUrl: baseUrl, temperature, maxTokens });
      toast.success("Impostazioni AI salvate");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio");
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await setApiKey.mutateAsync(apiKeyInput.trim());
      setApiKeyInput("");
      toast.success("Chiave API salvata nel Keychain macOS");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio della chiave");
    }
  };

  const handleTestConnection = async () => {
    const result = await testConnection.mutateAsync();
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleExport = async () => {
    const result = await exportBackup.mutateAsync();
    if (result.ok) toast.success(`Backup esportato in ${result.filePath}`);
  };

  const handleImport = async () => {
    const filePath = await pickBackupFile.mutateAsync();
    if (!filePath) return;
    try {
      await importBackup.mutateAsync(filePath);
      toast.success("Backup importato. Riavvia la vista per vedere i dati aggiornati.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import fallito");
    }
  };

  return (
    <>
      <Topbar title="Impostazioni" />

      <Card span={6}>
        <h2 className="card-title">
          <KeyRound className="size-4" /> API key DeepSeek
        </h2>
        <p className="text-base-content/60 text-sm">
          {apiKeyStatus?.configured ? (
            <span className="flex items-center gap-1 text-success">
              <ShieldCheck className="size-4" /> Chiave salvata nel Keychain macOS
            </span>
          ) : (
            "Nessuna chiave configurata. Le funzioni AI resteranno disattivate finché non ne aggiungi una."
          )}
        </p>
        <div className="join">
          <input
            type="password"
            className="input input-bordered join-item grow"
            placeholder="sk-..."
            aria-label="API key DeepSeek"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <button type="button" className="btn btn-primary join-item" onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()}>
            Salva
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn btn-sm" onClick={handleTestConnection} disabled={testConnection.isPending}>
            <PlugZap className="size-4" /> Testa connessione
          </button>
          {apiKeyStatus?.configured && (
            <button type="button" className="btn btn-sm btn-ghost text-error" onClick={() => clearApiKey.mutate()}>
              Rimuovi chiave
            </button>
          )}
        </div>
      </Card>

      <Card span={6}>
        <h2 className="card-title">Modello e parametri</h2>
        <label className="form-control">
          <span className="label-text mb-1 text-xs">Model name</span>
          <input className="input input-bordered input-sm" value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-xs">Base URL</span>
          <input className="input input-bordered input-sm" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1 text-xs">Temperatura ({temperature.toFixed(1)})</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              className="range range-sm"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1 text-xs">Max token</span>
            <input
              type="number"
              min={256}
              max={16000}
              className="input input-bordered input-sm"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
            />
          </label>
        </div>
        <button type="button" className="btn btn-primary btn-sm mt-2 self-start" onClick={saveModelSettings}>
          Salva impostazioni modello
        </button>
      </Card>

      <Card span={6}>
        <h2 className="card-title">
          <FolderOpen className="size-4" /> Cartella file importati
        </h2>
        <p className="text-base-content/60 text-sm">{settings?.importFolder ?? "Directory applicativa predefinita (userData/materials)"}</p>
        <button type="button" className="btn btn-sm self-start" onClick={() => pickImportFolder.mutate()}>
          Scegli cartella
        </button>
      </Card>

      <Card span={6}>
        <h2 className="card-title">Aspetto</h2>
        <div className="join">
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn btn-sm join-item ${theme === mode ? "btn-active" : ""}`}
              onClick={() => {
                setTheme(mode);
                updateSettings.mutate({ theme: mode });
              }}
            >
              {mode === "light" ? "Chiaro" : mode === "dark" ? "Scuro" : "Sistema"}
            </button>
          ))}
        </div>
      </Card>

      <Card span={12}>
        <h2 className="card-title">Backup</h2>
        <p className="text-base-content/60 text-sm">
          Il backup esporta corsi, lezioni, materiali (metadati), flashcard e output AI in un file JSON. La API key
          DeepSeek NON viene mai inclusa nel backup: resta esclusivamente nel Keychain macOS.
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" onClick={handleExport}>
            <Download className="size-4" /> Esporta backup JSON
          </button>
          <button type="button" className="btn btn-sm" onClick={handleImport}>
            <Upload className="size-4" /> Importa backup JSON
          </button>
        </div>
      </Card>
    </>
  );
}
