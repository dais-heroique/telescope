export const fmtEur = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const fmtM2 = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} m²`);
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
