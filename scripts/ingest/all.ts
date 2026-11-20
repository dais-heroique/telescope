/**
 * Import complet d'un département (idempotent, relançable) :
 *   npm run ingest -- --dep=74
 *   npm run ingest -- --dep=74 --only=dvf,dpe        (certaines étapes seulement)
 *   npm run ingest -- --dep=74 --skip=rnic           (toutes sauf …)
 * Ordre : cadastre → bâtiments du cadastre → bdnb → dvf → dpe → plu → sitadel → rnic → personnes morales → loyers → vacance → features.
 */
import { closeDb } from "./lib/db";
import { ingestCadastre, ingestCadastreBatiments } from "./cadastre";
import { ingestBdnb } from "./bdnb";
import { ingestDvf } from "./dvf";
import { ingestDpe } from "./dpe";
import { ingestPlu } from "./plu";
import { ingestSitadel } from "./sitadel";
import { ingestRnic } from "./rnic";
import { ingestPersonnesMorales } from "./personnes-morales";
import { ingestLoyers, ingestVacance } from "./loyers";
import { buildFeatures } from "./features";

const STEPS: [string, (dep: string) => Promise<unknown>][] = [
  ["cadastre", ingestCadastre],
  ["cadastre_bati", ingestCadastreBatiments],
  ["bdnb", ingestBdnb],
  ["dvf", ingestDvf],
  ["dpe", ingestDpe],
  ["plu", ingestPlu],
  ["sitadel", ingestSitadel],
  ["rnic", ingestRnic],
  ["pm", ingestPersonnesMorales],
  ["loyers", ingestLoyers],
  ["vacance", ingestVacance],
  ["features", buildFeatures],
];

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a?.split("=")[1];
}

async function main() {
  const dep = arg("dep") ?? process.env.ENABLED_DEPARTMENTS?.split(",")[0] ?? "74";
  const only = arg("only")?.split(",");
  const skip = new Set(arg("skip")?.split(",") ?? []);
  const known = new Set(STEPS.map(([n]) => n));
  for (const n of [...(only ?? []), ...skip]) if (!known.has(n)) throw new Error(`étape inconnue : ${n} (connues : ${[...known].join(", ")})`);

  console.log(`▶ Import du département ${dep}`);
  const t0 = Date.now();
  let failed = 0;
  for (const [name, fn] of STEPS) {
    if ((only && !only.includes(name)) || skip.has(name)) continue;
    try {
      await fn(dep);
    } catch {
      failed++;
      // `features` dépend des autres : on continue quand même les sources indépendantes, mais on le signale.
    }
  }
  console.log(`${failed ? "⚠ terminé avec " + failed + " erreur(s)" : "✔ terminé"} en ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  await closeDb();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
