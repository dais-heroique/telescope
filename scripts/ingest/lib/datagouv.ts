import { getJson } from "./download";

interface Resource {
  title: string;
  format: string;
  url: string;
  filesize?: number;
}
interface Dataset {
  title: string;
  last_modified: string;
  resources: Resource[];
}

/**
 * Les URLs `static.data.gouv.fr/resources/...` changent à chaque publication :
 * on interroge l'API data.gouv.fr pour obtenir l'URL courante d'une ressource.
 */
export async function resolveResource(datasetSlug: string, match: (r: Resource) => boolean): Promise<Resource & { datasetModified: string }> {
  const ds = await getJson<Dataset>(`https://www.data.gouv.fr/api/1/datasets/${datasetSlug}/`);
  const r = ds.resources.find(match);
  if (!r) throw new Error(`Ressource introuvable dans le dataset ${datasetSlug}`);
  return { ...r, datasetModified: ds.last_modified };
}
