export interface Etude {
  label: string;
  generatedAt: string;
  population: { population: number | null; surfaceKm2: number | null; densite: number | null; codesPostaux: string[] } | null;
  parcelles: { total: number; baties: number };
  transactions: {
    total: number;
    byType: { type: string; n: number; median: number | null }[];
    byYear: { year: number; maison: { n: number; median: number | null }; appartement: { n: number; median: number | null } }[];
  };
  detention: { label: string; n: number }[];
  dpe: { label: string; n: number }[];
  permis: { byYear: { year: number; n: number; logements: number }[]; total: number };
  social: { logements: number | null } | null;
  notes: string[];
}
