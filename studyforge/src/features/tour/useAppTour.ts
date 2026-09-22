import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "@/features/tour/tour.css";
import { useCourses } from "@/features/courses/api";
import { getIpc } from "@/lib/ipc";
import { hasTourBeenSeen, markTourAsSeen } from "./tourStorage";
import { buildTourSteps, type TourContext } from "./steps";
import type { Course } from "@shared/schemas";

async function resolveTourContext(courses: Course[]): Promise<TourContext> {
  const sample = [...courses].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  if (!sample) return { sampleCourseId: null, sampleLessonId: null };
  try {
    const lessons = await getIpc().lessons.listByCourse(sample.id);
    return { sampleCourseId: sample.id, sampleLessonId: lessons[0]?.id ?? null };
  } catch {
    return { sampleCourseId: sample.id, sampleLessonId: null };
  }
}

export function useAppTour() {
  const navigate = useNavigate();
  const coursesQuery = useCourses();
  const activeDriverRef = useRef<Driver | null>(null);
  const autoStartAttemptedRef = useRef(false);

  const runTour = useCallback(async () => {
    if (activeDriverRef.current) return;
    const context = await resolveTourContext(coursesQuery.data ?? []);
    const driverObj = driver({
      showProgress: true,
      allowClose: true,
      // Attesa best-effort che l'elemento del prossimo step compaia nel DOM
      // dopo una navigazione React Router async (Driver.js gira sul DOM
      // reale fuori da React); se non compare in tempo, lo step viene
      // saltato invece di bloccare il tour a tempo indeterminato.
      waitForElement: 2000,
      skipMissingElement: true,
      steps: buildTourSteps(navigate, context),
      onDestroyStarted: () => {
        markTourAsSeen();
        activeDriverRef.current = null;
        driverObj.destroy();
      },
    });
    activeDriverRef.current = driverObj;
    driverObj.drive();
  }, [navigate, coursesQuery.data]);

  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    if (coursesQuery.isLoading) return;
    autoStartAttemptedRef.current = true;
    if (!hasTourBeenSeen()) {
      void runTour();
    }
  }, [coursesQuery.isLoading, runTour]);

  const startTour = useCallback(() => {
    void runTour();
  }, [runTour]);

  return { startTour };
}
