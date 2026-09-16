import { useEffect, useState } from "react";
import { Cpu, FolderOpen, Download, Upload, PlugZap, ShieldCheck, AlertTriangle, BadgeCheck } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { useUiStore } from "@/lib/uiStore";
import {
  useDownloadModel,
  useExportBackup,
  useImportBackup,
  useModelStatus,
  usePickBackupFile,
  usePickImportFolder,
  useSettings,
  useUpdateSettings,
} from "@/features/settings/api";
import { useTestLocalAiConnection } from "@/features/courses/aiApi";
import { useLicenseStatus } from "@/features/license/api";
import { toast } from "@/lib/toastStore";
import type { ThemeMode } from "@shared/schemas";

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: licenseStatus } = useLicenseStatus();
  const { data: modelStatus } = useModelStatus();
  const updateSettings = useUpdateSettings();
  const downloadModel = useDownloadModel();
  const pickImportFolder = usePickImportFolder();
  const testConnection = useTestLocalAiConnection();
  const exportBackup = useExportBackup();
  const pickBackupFile = usePickBackupFile();
  const importBackup = useImportBackup();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [modelUri, setModelUri] = useState("");
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(4096);

  useEffect(() => {
    if (settings) {
      setModelUri(settings.localModelUri);
      setTemperature(settings.temperature);
      setMaxTokens(settings.maxTokens);
    }
  }, [settings]);

  const saveModelSettings = async () => {
    try {
      await updateSettings.mutateAsync({ localModelUri: modelUri, temperature, maxTokens });
      toast.success("Impostazioni AI salvate");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel salvataggio");
    }
  };

  const handleDownloadModel = async () => {
    try {
      // L'URI corrente potrebbe essere stato modificato ma non ancora salvato:
      // il download deve sempre usare l'URI effettivamente in Impostazioni.
      if (settings && modelUri !== settings.localModelUri) {
        await updateSettings.mutateAsync({ localModelUri: modelUri });
      }
      await downloadModel.mutateAsync();
      toast.success("Download del modello avviato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile avviare il download");
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

  const downloadDisabled =
    modelStatus?.state === "downloading" || modelStatus?.state === "ready" || downloadModel.isPending;

  return (
    <>
      <Topbar title="Impostazioni" />

      <Card span={6}>
        <h2 className="card-title">
          <Cpu className="size-4" /> AI locale
        </h2>
        <p className="text-base-content/60 text-sm">
          {modelStatus?.state === "ready" && (
            <span className="flex items-center gap-1 text-success">
              <ShieldCheck className="size-4" /> Modello pronto
            </span>
          )}
          {modelStatus?.state === "downloading" && (
            <span>
              Download in corso… {Math.round((modelStatus.progress ?? 0) * 100)}%
              <progress
                className="progress progress-primary mt-1 w-full"
                value={(modelStatus.progress ?? 0) * 100}
                max={100}
              />
            </span>
          )}
          {modelStatus?.state === "not_downloaded" && (
            "Nessun modello scaricato. Le funzioni AI resteranno disattivate finché non ne scarichi uno."
          )}
          {modelStatus?.state === "error" && (
            <span className="flex items-center gap-1 text-error">
              <AlertTriangle className="size-4" /> {modelStatus.error ?? "Download fallito."}
            </span>
          )}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleDownloadModel}
            disabled={downloadDisabled}
          >
            <Download className="size-4" /> Scarica modello
          </button>
          <button type="button" className="btn btn-sm" onClick={handleTestConnection} disabled={testConnection.isPending}>
            <PlugZap className="size-4" /> Testa connessione
          </button>
        </div>
        <p className="text-base-content/40 mt-2 text-xs">
          L'inferenza è 100% locale: nessuna API key, nessun dato inviato in rete durante l'uso. Il modello
          viene scaricato una sola volta e salvato nella cartella dati dell'app.
        </p>
      </Card>

      <Card span={6}>
        <h2 className="card-title">Modello e parametri</h2>
        <label className="form-control">
          <span className="label-text mb-1 text-xs">URI modello (formato node-llama-cpp / Hugging Face)</span>
          <input
            className="input input-bordered input-sm"
            value={modelUri}
            onChange={(e) => setModelUri(e.target.value)}
          />
        </label>
        <p className="text-base-content/40 text-xs">
          Cambiare l'URI dopo aver già scaricato un modello richiede un nuovo download.
        </p>
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
        <h2 className="card-title">
          <BadgeCheck className="size-4" /> Licenza
        </h2>
        {licenseStatus?.activated ? (
          <>
            <p className="flex items-center gap-1 text-sm text-success">
              <ShieldCheck className="size-4" /> App attivata
            </p>
            <p className="text-base-content/60 text-sm">
              Acquistata il {new Date(licenseStatus.purchasedAt!).toLocaleDateString("it-IT")}.{" "}
              {licenseStatus.updatesIncluded
                ? `Aggiornamenti gratuiti inclusi fino al ${new Date(licenseStatus.updatesValidUntil!).toLocaleDateString("it-IT")}.`
                : "Il periodo di aggiornamenti gratuiti inclusi nella licenza è scaduto: le funzioni dell'app restano comunque attive."}
            </p>
          </>
        ) : (
          <p className="text-base-content/60 text-sm">Nessuna licenza attivata.</p>
        )}
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
          Il backup esporta corsi, lezioni, materiali (metadati), flashcard e output AI in un file JSON. Il
          modello AI scaricato NON viene mai incluso nel backup: resta solo il riferimento (URI/percorso) in
          Impostazioni, e va ri-scaricato su una nuova installazione.
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
