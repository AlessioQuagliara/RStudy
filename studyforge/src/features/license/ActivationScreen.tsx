import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useActivateLicense } from "@/features/license/api";
import { toast } from "@/lib/toastStore";

/**
 * Schermata a tutto schermo mostrata al posto dell'app (App.tsx) finché non
 * esiste una licenza attivata nel DB locale: nessuna funzione dell'app è
 * raggiungibile prima dell'attivazione, per design (licenza one-time, non
 * c'è una modalità trial).
 */
export function ActivationScreen() {
  const [licenseKey, setLicenseKey] = useState("");
  const activateLicense = useActivateLicense();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    try {
      await activateLicense.mutateAsync(licenseKey.trim());
      toast.success("Licenza attivata. Buono studio!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Attivazione fallita");
    }
  };

  return (
    <div className="bg-base-200 flex min-h-screen items-center justify-center p-6">
      <div className="card bg-base-100 w-full max-w-md shadow-xl">
        <div className="card-body">
          <div className="mb-2 flex items-center gap-2">
            <img src="./logo-mark.svg" alt="" className="size-8 rounded-md" />
            <h1 className="text-lg font-semibold">Attiva RStudy</h1>
          </div>
          <p className="text-base-content/60 text-sm">
            Inserisci la chiave di licenza ricevuta via email dopo l'acquisto sul sito. La trovi anche nella pagina
            di conferma del pagamento.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Chiave di licenza</span>
              <input
                type="text"
                className="input input-bordered"
                placeholder="txn_..."
                autoFocus
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                disabled={activateLicense.isPending}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!licenseKey.trim() || activateLicense.isPending}
            >
              {activateLicense.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Attiva
            </button>
          </form>
          <p className="text-base-content/40 mt-2 text-xs">
            Non hai ancora una licenza? Acquistala dal sito ufficiale di RStudy.
          </p>
        </div>
      </div>
    </div>
  );
}
