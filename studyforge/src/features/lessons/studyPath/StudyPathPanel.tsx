import { useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpen, Check, Lightbulb, Sparkles, Target, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExerciseSet, StudyTopic } from "@shared/schemas";
import { QuestionMarkdown } from "../shared/QuestionMarkdown";
import { DuolingoQuiz, type QuizResult } from "../exercises/DuolingoQuiz";

interface StudyProgress {
  studied: number[];
  lastResult?: QuizResult;
}

// shortcut: progressi solo in localStorage (per dispositivo), passare al DB se servono altrove.
function progressKey(set: ExerciseSet) {
  return `rstudy:study-path:${set.sourceLessonId}:${set.generatedAt}`;
}

function loadProgress(set: ExerciseSet): StudyProgress {
  try {
    const raw = localStorage.getItem(progressKey(set));
    if (raw) return JSON.parse(raw) as StudyProgress;
  } catch {
    // storage non disponibile o dato corrotto: si riparte da zero
  }
  return { studied: [] };
}

function saveProgress(set: ExerciseSet, progress: StudyProgress) {
  try {
    localStorage.setItem(progressKey(set), JSON.stringify(progress));
  } catch {
    // non bloccante: i progressi restano validi per questa sessione
  }
}

export function StudyPathPanel({
  exerciseSet,
  loading,
  generating,
  onGenerate,
}: {
  exerciseSet: ExerciseSet | null | undefined;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  if (loading || generating) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Preparazione del percorso di studio">
        {generating && (
          <p className="text-base-content/70 flex items-center gap-2 text-sm">
            <span className="loading loading-spinner loading-sm" />
            Sto trasformando la lezione in un percorso di studio...
          </p>
        )}
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-16 w-full rounded-2xl" />
      </div>
    );
  }

  if (!exerciseSet) {
    return (
      <div className="bg-base-100 flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:p-10">
        <Sparkles className="text-primary size-10" aria-hidden="true" />
        <h2 className="text-xl font-semibold">Studia questa lezione passo dopo passo</h2>
        <p className="text-base-content/70 max-w-md">
          L'AI divide la lezione in pochi argomenti, dal più semplice al più complesso: per ognuno una spiegazione
          chiara, la regola da ricordare e un esempio svolto. Poi 8 esercizi per verificare cosa hai capito.
        </p>
        <button type="button" className="btn btn-primary btn-lg w-full max-w-sm" onClick={onGenerate}>
          <Sparkles className="size-5" aria-hidden="true" />
          Prepara il percorso di studio
        </button>
      </div>
    );
  }

  // key: un nuovo set (appunti cambiati) riparte dalla schermata iniziale con i suoi progressi.
  return <StudyPath key={progressKey(exerciseSet)} exerciseSet={exerciseSet} />;
}

function StudyPath({ exerciseSet }: { exerciseSet: ExerciseSet }) {
  const topics = exerciseSet.topics ?? [];
  const [progress, setProgress] = useState<StudyProgress>(() => loadProgress(exerciseSet));
  const [view, setView] = useState<"home" | "study" | "test">("home");
  const [topicIndex, setTopicIndex] = useState(0);
  const [quizRun, setQuizRun] = useState(0);

  const updateProgress = (patch: Partial<StudyProgress>) => {
    setProgress((prev) => {
      const next = { ...prev, ...patch };
      saveProgress(exerciseSet, next);
      return next;
    });
  };

  const openTopic = (index: number) => {
    setTopicIndex(index);
    setView("study");
  };

  const startTest = () => {
    setQuizRun((n) => n + 1);
    setView("test");
  };

  const markStudiedAndContinue = () => {
    if (!progress.studied.includes(topicIndex)) updateProgress({ studied: [...progress.studied, topicIndex] });
    if (topicIndex < topics.length - 1) openTopic(topicIndex + 1);
    else startTest();
  };

  if (view === "test") {
    return (
      <div className="bg-base-100 overflow-hidden rounded-2xl">
        <DuolingoQuiz
          key={quizRun}
          exerciseSet={exerciseSet}
          onClose={() => setView("home")}
          onFinish={(result) => updateProgress({ lastResult: result })}
          onReviewTopic={openTopic}
        />
      </div>
    );
  }

  if (view === "study" && topics[topicIndex]) {
    return (
      <TopicView
        key={topicIndex}
        topic={topics[topicIndex]}
        index={topicIndex}
        total={topics.length}
        onBack={() => setView("home")}
        onPrevious={() => openTopic(topicIndex - 1)}
        onNext={markStudiedAndContinue}
      />
    );
  }

  const studiedCount = progress.studied.filter((i) => i < topics.length).length;
  const percent = Math.round(((studiedCount + (progress.lastResult ? 1 : 0)) / (topics.length + 1)) * 100);
  const firstToStudy = topics.findIndex((_, i) => !progress.studied.includes(i));
  const toReview = new Set(progress.lastResult?.topicsToReview ?? []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section className="bg-base-100 flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{exerciseSet.title}</h2>
          <p className="text-base-content/60 text-sm">
            {topics.length} argomenti · {exerciseSet.exercises.length} esercizi
          </p>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">I tuoi progressi</span>
            <span className="font-semibold">{percent}%</span>
          </div>
          <progress
            className="progress progress-success h-3 w-full"
            value={percent}
            max={100}
            aria-label={`Progressi: ${percent} per cento`}
          />
          {progress.lastResult && (
            <p className="text-base-content/60 mt-2 text-sm">
              Ultimo test: {progress.lastResult.correct} risposte corrette su {progress.lastResult.total}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={topics.length === 0}
            onClick={() => openTopic(firstToStudy >= 0 ? firstToStudy : 0)}
          >
            <BookOpen className="size-5" aria-hidden="true" />
            Studia
          </button>
          <button type="button" className="btn btn-success btn-lg" onClick={startTest}>
            <Target className="size-5" aria-hidden="true" />
            Mettiti alla prova
          </button>
        </div>
      </section>

      {(exerciseSet.missingInfo?.length ?? 0) > 0 && (
        <div role="alert" className="alert alert-warning items-start">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold">Nella lezione mancano alcune informazioni</p>
            <ul className="mt-1 list-disc pl-5">
              {exerciseSet.missingInfo!.map((info, i) => (
                <li key={i}>{info}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <ol className="flex flex-col gap-3" aria-label="Argomenti della lezione">
          {topics.map((topic, i) => {
            const studied = progress.studied.includes(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  className="bg-base-100 hover:bg-base-200 flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors"
                  onClick={() => openTopic(i)}
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
                      studied ? "bg-success text-success-content" : "bg-base-200",
                    )}
                    aria-hidden="true"
                  >
                    {studied ? <Check className="size-5" /> : i + 1}
                  </span>
                  <span className="flex-1 font-medium">{topic.title}</span>
                  {toReview.has(i) && <span className="badge badge-warning shrink-0">Da ripassare</span>}
                  <span className="sr-only">{studied ? "(studiato)" : "(da studiare)"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function TopicView({
  topic,
  index,
  total,
  onBack,
  onPrevious,
  onNext,
}: {
  topic: StudyTopic;
  index: number;
  total: number;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [showSolution, setShowSolution] = useState(false);
  const isLast = index === total - 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost btn-circle" onClick={onBack} aria-label="Torna agli argomenti">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </button>
        <progress
          className="progress progress-success h-3 flex-1"
          value={index + 1}
          max={total}
          aria-label={`Argomento ${index + 1} di ${total}`}
        />
        <span className="text-base-content/60 shrink-0 text-sm">
          {index + 1}/{total}
        </span>
      </div>

      <section className="bg-base-100 rounded-2xl p-5 text-base leading-relaxed sm:p-6">
        <h2 className="mb-3 text-xl font-semibold sm:text-2xl">{topic.title}</h2>
        <QuestionMarkdown>{topic.explanation}</QuestionMarkdown>
      </section>

      <section className="border-warning bg-warning/15 rounded-2xl border-2 p-5">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Lightbulb className="size-5" aria-hidden="true" />
          Da ricordare
        </p>
        <div className="text-lg">
          <QuestionMarkdown>{topic.keyRule}</QuestionMarkdown>
        </div>
      </section>

      <section className="bg-info/10 rounded-2xl p-5">
        <p className="mb-2 font-semibold">Esempio svolto</p>
        <QuestionMarkdown>{topic.example.problem}</QuestionMarkdown>
        <ol className="mt-3 flex flex-col gap-2">
          {topic.example.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="bg-info text-info-content flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {i + 1}
              </span>
              <div className="flex-1">
                <QuestionMarkdown>{step}</QuestionMarkdown>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {topic.commonMistake && (
        <section className="bg-error/10 rounded-2xl p-5">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <XCircle className="text-error size-5" aria-hidden="true" />
            Errore comune
          </p>
          <QuestionMarkdown>{topic.commonMistake}</QuestionMarkdown>
        </section>
      )}

      {topic.practice && (
        <section className="bg-primary/10 rounded-2xl p-5">
          <p className="mb-2 font-semibold">Esercizio</p>
          <QuestionMarkdown>{topic.practice.question}</QuestionMarkdown>
          <button
            type="button"
            className="btn btn-outline btn-sm mt-3"
            aria-expanded={showSolution}
            onClick={() => setShowSolution((v) => !v)}
          >
            {showSolution ? "Nascondi la soluzione" : "Mostra la soluzione"}
          </button>
          {showSolution && (
            <div className="bg-base-100 mt-3 rounded-xl p-4">
              <QuestionMarkdown>{topic.practice.solution}</QuestionMarkdown>
            </div>
          )}
        </section>
      )}

      <div className="bg-base-200/80 sticky bottom-0 flex gap-3 rounded-2xl py-3 backdrop-blur">
        <button type="button" className="btn btn-lg flex-1" disabled={index === 0} onClick={onPrevious}>
          Indietro
        </button>
        <button type="button" className="btn btn-primary btn-lg flex-[2]" onClick={onNext}>
          {isLast ? "Ho capito: mettiti alla prova" : "Ho capito, avanti"}
        </button>
      </div>
    </div>
  );
}
