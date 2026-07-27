export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("sk-SK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** "YYYY-MM-DD" pre <input type="date"> z ISO reťazca. */
export function dateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
