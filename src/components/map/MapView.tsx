"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapLayerMouseEvent } from "maplibre-gl";
import { useTheme } from "next-themes";
import { baseStyle } from "@/lib/map/styles";
import { useUi } from "@/lib/store";

const FRANCE_CENTER: [number, number] = [6.1294, 45.8992]; // Annecy (département 74 par défaut)

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const { basemap, layers, selected, flyTo, select } = useUi();

  // ── Initialisation unique ─────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: FRANCE_CENTER,
      zoom: 13,
      maxZoom: 20,
      minZoom: 4,
      attributionControl: { compact: true },
      hash: "map",
      fadeDuration: 0,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // Parcelles (tuiles vectorielles PCI, couverture France entière)
      map.addLayer({
        id: "parcelles-fill",
        type: "fill",
        source: "pci",
        "source-layer": "parcelle",
        minzoom: 14,
        paint: {
          "fill-color": ["case", ["boolean", ["feature-state", "hover"], false], "#e8a317", "#10294a"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.35, 0.04],
        },
      });
      map.addLayer({
        id: "parcelles-line",
        type: "line",
        source: "pci",
        "source-layer": "parcelle",
        minzoom: 14,
        paint: { "line-color": "#10294a", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 19, 1.2] },
      });
      map.addLayer({
        id: "batiments-fill",
        type: "fill",
        source: "pci",
        "source-layer": "batiment",
        minzoom: 16,
        layout: { visibility: "none" },
        paint: { "fill-color": "#6b7a90", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "parcelle-selected",
        type: "line",
        source: "pci",
        "source-layer": "parcelle",
        filter: ["==", ["get", "idu"], ""],
        paint: { "line-color": "#e8a317", "line-width": 3 },
      });
      map.addLayer({
        id: "parcelles-label",
        type: "symbol",
        source: "pci",
        "source-layer": "parcelle",
        minzoom: 18,
        layout: { "text-field": ["get", "numero"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#10294a", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
      });
      readyRef.current = true;
      syncLayers();
    });

    // Survol + clic parcelle
    let hoverId: string | null = null;
    map.on("mousemove", "parcelles-fill", (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const id = e.features?.[0]?.properties?.idu as string | undefined;
      if (id === hoverId || !id) return;
      if (hoverId) map.setFeatureState({ source: "pci", sourceLayer: "parcelle", id: hoverId }, { hover: false });
      hoverId = id;
      map.setFeatureState({ source: "pci", sourceLayer: "parcelle", id }, { hover: true });
    });
    map.on("mouseleave", "parcelles-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hoverId) map.setFeatureState({ source: "pci", sourceLayer: "parcelle", id: hoverId }, { hover: false });
      hoverId = null;
    });
    map.on("click", "parcelles-fill", (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p?.idu) return;
      select({
        idu: String(p.idu),
        section: String(p.section),
        numero: String(p.numero),
        contenance: Number(p.contenance),
        commune: String(p.nom_com),
        codeInsee: String(p.code_insee),
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Synchronisation état → carte ──────────────────────────────────────
  function syncLayers() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { basemap, layers, selected } = useUi.getState();
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("basemap-plan", basemap === "plan");
    vis("basemap-satellite", basemap === "satellite");
    const parcels = layers["parcelles"] !== false;
    vis("parcelles-fill", parcels);
    vis("parcelles-line", parcels);
    vis("parcelles-label", parcels);
    vis("batiments-fill", Boolean(layers["batiments"]) || basemap === "cadastre");
    // Fond « cadastre seul » : traits plus marqués sur fond neutre.
    if (map.getLayer("parcelles-line")) {
      map.setPaintProperty("parcelles-line", "line-opacity", basemap === "cadastre" ? 0.9 : 0.55);
    }
    if (map.getLayer("parcelle-selected")) map.setFilter("parcelle-selected", ["==", ["get", "idu"], selected?.idu ?? ""]);
  }

  useEffect(syncLayers, [basemap, layers, selected]);

  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 17, speed: 1.6, essential: true });
  }, [flyTo]);

  // Le thème n'affecte que l'UI ; les fonds IGN restent identiques.
  void resolvedTheme;

  // MapLibre impose `position: relative` sur son conteneur : on l'enveloppe dans un bloc absolu.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" data-testid="map" />
    </div>
  );
}
