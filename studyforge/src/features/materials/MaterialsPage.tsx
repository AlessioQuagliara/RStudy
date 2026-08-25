import { useState } from "react";
import { FileText, FileType, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Dropzone } from "@/features/materials/Dropzone";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDeleteMaterial, useImportMaterials, useMaterials, usePickMaterialFiles } from "@/features/materials/api";
import { useLessons } from "@/features/lessons/api";
import { toast } from "@/lib/toastStore";
import type { MaterialType } from "@shared/schemas";

const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  lecture: "Lezione",
  notes: "Appunti",
  exercise: "Esercizio",
  deepening: "Approfondimento",
  other: "Altro",
};

const EXTRACTION_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "In elaborazione", className: "badge-info" },
  done: { label: "Indicizzato", className: "badge-success" },
  unsupported: { label: "Supporto in arrivo", className: "badge-warning" },
  failed: { label: "Estrazione fallita", className: "badge-error" },
};

export function MaterialsPage({ courseId }: { courseId: string }) {
  const { data: materials = [], isLoading } = useMaterials(courseId);
  const { data: lessons = [] } = useLessons(courseId);
  const pickFiles = usePickMaterialFiles();
  const importMaterials = useImportMaterials(courseId);
  const deleteMaterial = useDeleteMaterial(courseId);

  const [materialType, setMaterialType] = useState<MaterialType>("lecture");
  const [lessonId, setLessonId] = useState<string>("");

  const runImport = async (filePaths: string[]) => {
    if (filePaths.length === 0) return;
    try {
      await importMaterials.mutateAsync({ filePaths, materialType, lessonId: lessonId || null });
      toast.success(`${filePaths.length} materiale/i importato/i`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import fallito");
    }
  };

  const handlePick = async () => {
    const paths = await pickFiles.mutateAsync();
    await runImport(paths);
  };

  return (
    <div className="col-span-12 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="form-control">
          <span className="label-text mb-1 text-xs">Tipo materiale</span>
          <select
            className="select select-bordered select-sm"
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value as MaterialType)}
          >
            {Object.entries(MATERIAL_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-xs">Collega a lezione (opzionale)</span>
          <select
            className="select select-bordered select-sm"
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            <option value="">Nessuna lezione specifica</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                Lezione {l.lessonNumber}: {l.title}
              </option>
            ))}
          </select>
        </label>
        {importMaterials.isPending && (
          <span className="text-base-content/60 flex items-center gap-1 text-xs">
            <Loader2 className="size-3 animate-spin" /> Importazione in corso…
          </span>
        )}
      </div>

      <Dropzone onFilesPicked={handlePick} onFilesDropped={runImport} />

      {isLoading ? (
        <div className="skeleton h-24 w-full" />
      ) : materials.length === 0 ? (
        <EmptyState icon={FileText} title="Nessun materiale" description="Importa PDF, DOCX, TXT o Markdown per questo corso." />
      ) : (
        <ul className="divide-base-300 divide-y">
          {materials.map((m) => {
            const badge = EXTRACTION_BADGE[m.extractionStatus] ?? EXTRACTION_BADGE.pending!;
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileType className="text-base-content/40 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.title}</p>
                    <p className="text-base-content/50 text-xs">
                      {MATERIAL_TYPE_LABEL[m.materialType]} · {(m.fileSize / 1024).toFixed(0)} KB
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`badge badge-sm ${badge.className}`}>
                    {m.extractionStatus === "failed" && <AlertCircle className="mr-1 size-3" />}
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    aria-label={`Elimina ${m.title}`}
                    onClick={() => deleteMaterial.mutate(m.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
