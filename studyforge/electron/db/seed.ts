import path from "node:path";
import { runMigrations } from "./migrate";
import { CoursesRepo, LessonsRepo, FlashcardsRepo } from "./repositories";

/**
 * Seed dimostrativo: un corso con lezioni e flashcard di esempio, SENZA
 * generazione AI (nessuna chiamata di rete). Utile per esplorare la UI a
 * app appena installata.
 */
function seed() {
  const dbTarget = process.env.RSTUDY_DB_PATH ?? path.resolve(process.cwd(), "rstudy.sqlite3");
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const db = runMigrations(dbTarget, migrationsFolder);

  const course = CoursesRepo.create(db, {
    title: "Algoritmi e Strutture Dati",
    code: "ASD-101",
    cfu: 9,
    examDate: null,
    introduction:
      "Corso introduttivo su algoritmi fondamentali e strutture dati: complessità computazionale, liste, alberi, grafi, tecniche di progettazione (divide et impera, programmazione dinamica, greedy).",
    objectives:
      "Saper analizzare la complessità di un algoritmo, scegliere la struttura dati adeguata a un problema, implementare e confrontare algoritmi su grafi e alberi.",
    targetLessons: 12,
    status: "active",
    color: "#6366f1",
  });

  const lesson1 = LessonsRepo.create(db, {
    courseId: course.id,
    lessonNumber: 1,
    title: "Introduzione alla complessità computazionale",
    lessonDate: "2026-02-10",
  });
  LessonsRepo.saveNotes(db, {
    id: lesson1.id,
    notesPlainText:
      "Notazione O-grande, Omega, Theta. Complessità nel caso peggiore, medio, migliore. Esempi: ricerca lineare O(n), ricerca binaria O(log n), bubble sort O(n^2).",
    notesJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Notazione O-grande, Omega, Theta. Complessità nel caso peggiore, medio, migliore. Esempi: ricerca lineare O(n), ricerca binaria O(log n), bubble sort O(n^2).",
            },
          ],
        },
      ],
    }),
  });
  LessonsRepo.update(db, { id: lesson1.id, status: "completed" });

  const lesson2 = LessonsRepo.create(db, {
    courseId: course.id,
    lessonNumber: 2,
    title: "Liste, pile e code",
    lessonDate: "2026-02-17",
  });
  LessonsRepo.saveNotes(db, {
    id: lesson2.id,
    notesPlainText:
      "Liste concatenate singole e doppie. Pile (LIFO) e code (FIFO): operazioni push/pop, enqueue/dequeue. Casi d'uso: undo/redo, gestione chiamate a funzione, scheduling.",
    notesJson: JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Liste concatenate singole e doppie. Pile (LIFO) e code (FIFO): operazioni push/pop, enqueue/dequeue. Casi d'uso: undo/redo, gestione chiamate a funzione, scheduling.",
            },
          ],
        },
      ],
    }),
  });

  const demoFlashcards: Array<{ front: string; back: string; tags: string[]; difficulty: "easy" | "medium" | "hard" }> = [
    { front: "Cos'è la notazione O-grande?", back: "Un limite superiore asintotico sulla crescita del tempo/spazio di un algoritmo al crescere della dimensione dell'input.", tags: ["complessità"], difficulty: "easy" },
    { front: "Complessità della ricerca binaria su array ordinato?", back: "O(log n), perché a ogni confronto si dimezza lo spazio di ricerca.", tags: ["complessità", "ricerca"], difficulty: "medium" },
    { front: "Differenza tra pila e coda?", back: "La pila è LIFO (ultimo entrato, primo uscito); la coda è FIFO (primo entrato, primo uscito).", tags: ["strutture-dati"], difficulty: "easy" },
    { front: "Quando conviene una lista concatenata rispetto a un array?", back: "Quando servono inserimenti/rimozioni frequenti in posizioni arbitrarie senza necessità di accesso casuale O(1).", tags: ["strutture-dati"], difficulty: "medium" },
    { front: "Complessità nel caso peggiore del bubble sort?", back: "O(n^2), perché nel caso peggiore servono confronti/scambi per ogni coppia di elementi non ordinata.", tags: ["ordinamento"], difficulty: "hard" },
  ];
  for (const card of demoFlashcards) {
    FlashcardsRepo.create(db, { courseId: course.id, lessonId: lesson1.id, ...card, source: "manual" });
  }

   
  console.log(`Seed completato: corso "${course.title}" creato in ${dbTarget}`);
}

seed();
