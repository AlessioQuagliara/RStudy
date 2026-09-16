import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CoursesListPage } from "@/features/courses/CoursesListPage";
import { CourseDetailPage } from "@/features/courses/CourseDetailPage";
import { LessonPage } from "@/features/lessons/LessonPage";
import { FlashcardsPage } from "@/features/flashcards/FlashcardsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ActivationScreen } from "@/features/license/ActivationScreen";
import { useLicenseStatus } from "@/features/license/api";

export default function App() {
  const { data: licenseStatus, isLoading } = useLicenseStatus();

  if (isLoading) return <div className="bg-base-200 min-h-screen" />;
  if (!licenseStatus?.activated) return <ActivationScreen />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/courses" element={<CoursesListPage />} />
        <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        <Route path="/courses/:courseId/lessons/:lessonId" element={<LessonPage />} />
        <Route path="/flashcards" element={<FlashcardsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
