export function formatDateIt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate);
  const now = new Date();
  const diffMs = target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
