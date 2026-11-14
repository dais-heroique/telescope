"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import { baseStyle } from "@/lib/map/styles";
import { addVigieLayers, setVigieTiles, syncVigieLayers } from "@/lib/map/vigie-layers";
import { encodeFilters } from "@/lib/filters";
import { useUi } from "@/lib/store";

const START: [number, number] = [6.1294, 45.8992]; // Annecy (département 74 par défaut)

/** Éléments DOM construits sans innerHTML : aucune donnée de tuile n'est interprétée comme du HTML. */
function popupContent(title: string, lines: string[]): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "font:12px/1.4 var(--font-sans, system-ui);color:#0d1626;min-width:140px";
  const h = document.createElement("div");
  h.style.fontWeight = "600";
  h.textContent = title;
  root.appendChild(h);
  for (const l of lines) {
    const d = document.createElement("div");
    d.textContent = l;
    root.appendChild(d);
  }
  return root;
}

const eur = (n: unknown) => (typeof n === "number" ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €" : "—");

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const filtersKey = useUi((s) => encodeFilters(s.filters));

  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncVigieLayers(map, useUi.getState());
  }

  // ── Initialisation unique ─────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: START,
      zoom: 13,
      maxZoom: 20,
      minZoom: 4,
      attributionControl: { compact: true },
      hash: "map",
      fadeDuration: 0,
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      addVigieLayers(map, encodeFilters(useUi.getState().filters));
      readyRef.current = true;
      sync();
    });

    // Survol des parcelles (états de feature : pas de re-rendu de tuile)
    let hoverId: string | null = null;
    const hoverSource = (idu: string) => ({ source: "pci", sourceLayer: "parcelle", id: idu });
    const onMove = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const id = e.features?.[0]?.properties?.idu as string | undefined;
      if (!id || id === hoverId) return;
      if (hoverId) map.setFeatureState(hoverSource(hoverId), { hover: false });
      hoverId = id;
      map.setFeatureState(hoverSource(id), { hover: true });
    };
    map.on("mousemove", "parcelles-fill", onMove);
    map.on("mouseleave", "parcelles-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hoverId) map.setFeatureState(hoverSource(hoverId), { hover: false });
      hoverId = null;
    });
    for (const l of ["dvf-circles", "permis-circles", "copros-circles"]) {
      map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
    }

    // Clic : points d'intérêt d'abord (popup), sinon parcelle (fiche)
    map.on("click", (e) => {
      const pointLayers = ["dvf-circles", "permis-circles", "copros-circles"].filter((l) => map.getLayer(l));
      const pts = map.queryRenderedFeatures(e.point, { layers: pointLayers });
      if (pts.length) {
        const f = pts[0] as MapGeoJSONFeature;
        const p = f.properties;
        let content: HTMLElement | null = null;
        if (f.layer.id === "dvf-circles") {
          content = popupContent(`Vente du ${p.d}`, [`${eur(p.v)}`, p.p ? `${eur(p.p)}/m²` : "prix/m² non calculable", String(p.t ?? "")]);
        } else if (f.layer.id === "permis-circles") {
          content = popupContent(`${p.t ?? "Permis"} du ${p.d}`, [p.nl ? `${p.nl} logement(s)` : "", String(p.k ?? "")].filter(Boolean));
        } else if (f.layer.id === "copros-circles") {
          content = popupContent(String(p.n ?? "Copropriété"), [`${p.lots ?? "?"} lots`, p.per ? `Construite : ${p.per}` : ""].filter(Boolean));
        }
        if (content) {
          new maplibregl.Popup({ closeButton: false, offset: 10 }).setLngLat(e.lngLat).setDOMContent(content).addTo(map);
          return;
        }
      }
      const fs = map.queryRenderedFeatures(e.point, { layers: ["vparcelles-fill", "parcelles-fill"].filter((l) => map.getLayer(l)) });
      const p = fs[0]?.properties;
      const idu = (p?.idu ?? p?.id) as string | undefined;
      if (!idu) return;
      useUi.getState().select({
        idu: String(idu),
        section: p?.section ? String(p.section) : String(idu).slice(8, 10),
        numero: p?.numero ? String(p.numero) : String(idu).slice(10, 14),
        contenance: Number(p?.contenance ?? p?.c) || undefined,
        commune: p?.nom_com ? String(p.nom_com) : undefined,
        codeInsee: String(idu).slice(0, 5),
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // ── État → carte ──────────────────────────────────────────────────────
  useEffect(() => useUi.subscribe(sync), []);

  // Filtres : on recharge les tuiles (debounce 250 ms)
  useEffect(() => {
    const t = setTimeout(() => {
      const map = mapRef.current;
      if (map && readyRef.current) setVigieTiles(map, filtersKey);
    }, 250);
    return () => clearTimeout(t);
  }, [filtersKey]);

  const flyTo = useUi((s) => s.flyTo);
  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 17, speed: 1.6, essential: true });
  }, [flyTo]);

  // MapLibre impose `position: relative` sur son conteneur : on l'enveloppe dans un bloc absolu.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" data-testid="map" />
    </div>
  );
}
