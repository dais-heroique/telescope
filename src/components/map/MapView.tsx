"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import { baseStyle } from "@/lib/map/styles";
import { addVigieLayers, setGeoJson, setVigieTiles, syncVigieLayers } from "@/lib/map/vigie-layers";
import { circlePolygon, haversine } from "@/lib/parcelle/geo";
import { encodeFilters } from "@/lib/filters";
import { useUi } from "@/lib/store";

const START: [number, number] = [6.1294, 45.8992]; // Annecy : vue de départ à la toute première ouverture
const VIEW_KEY = "vigie:view";

/** Dernière vue de la carte (centre + zoom), restaurée à la réouverture quand l'adresse n'en porte pas. */
function savedView(): { c: [number, number]; z: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as { c?: [number, number]; z?: number } | null;
    if (v && Array.isArray(v.c) && v.c.length === 2 && v.c.every(Number.isFinite) && Number.isFinite(v.z)) return { c: v.c, z: v.z! };
  } catch { /* stockage indisponible */ }
  return null;
}

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
      center: (!location.hash.includes("map=") && savedView()?.c) || START,
      zoom: (!location.hash.includes("map=") && savedView()?.z) || 13,
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

    // ── Emprise visible → store (liste de résultats) ──
    let vpTimer: ReturnType<typeof setTimeout> | undefined;
    const pushViewport = () => {
      const b = map.getBounds();
      useUi.getState().setViewport({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    map.on("moveend", () => {
      try {
        const c = map.getCenter();
        localStorage.setItem(VIEW_KEY, JSON.stringify({ c: [Number(c.lng.toFixed(5)), Number(c.lat.toFixed(5))], z: Number(map.getZoom().toFixed(2)) }));
      } catch { /* stockage indisponible */ }
      clearTimeout(vpTimer);
      vpTimer = setTimeout(pushViewport, 350);
    });

    // ── Outils de dessin : polygone, cercle, isochrone ──
    const draw = { pts: [] as [number, number][], center: null as [number, number] | null, hover: null as [number, number] | null };
    const drawDraft = () => {
      const dm = useUi.getState().drawMode;
      const feats: GeoJSON.Feature[] = [];
      if (dm === "polygon" && draw.pts.length) {
        const pts = draw.hover ? [...draw.pts, draw.hover] : draw.pts;
        feats.push({ type: "Feature", properties: {}, geometry: pts.length >= 3 ? { type: "Polygon", coordinates: [[...pts, pts[0]]] } : { type: "LineString", coordinates: pts } });
        for (const p of draw.pts) feats.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } });
      }
      if (dm === "circle" && draw.center && draw.hover) {
        feats.push({ type: "Feature", properties: {}, geometry: circlePolygon(draw.center, haversine(draw.center, draw.hover)) });
        feats.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: draw.center } });
      }
      setGeoJson(map, "draft", { type: "FeatureCollection", features: feats });
    };
    const resetDraw = () => {
      draw.pts = [];
      draw.center = null;
      draw.hover = null;
      drawDraft();
    };
    const finishPolygon = () => {
      if (draw.pts.length >= 3) useUi.getState().setZone({ type: "Polygon", coordinates: [[...draw.pts, draw.pts[0]]] });
      resetDraw();
    };
    const pushSectors = (secs: ReturnType<typeof useUi.getState>["sectors"]) =>
      setGeoJson(map, "sectors", {
        type: "FeatureCollection",
        features: secs.map((x) => ({ type: "Feature", properties: { color: x.color, label: `${x.name}${x.assignedTo ? ` · ${x.assignedTo.split("@")[0]}` : ""}` }, geometry: x.polygon })),
      });
    const unsubDraw = useUi.subscribe((s, prev) => {
      if (s.drawMode !== prev.drawMode) {
        resetDraw();
        map.getCanvas().style.cursor = s.drawMode ? "crosshair" : "";
        if (s.drawMode) map.doubleClickZoom.disable();
        else map.doubleClickZoom.enable();
      }
      if (s.finishNonce !== prev.finishNonce && s.drawMode === "polygon") finishPolygon();
      if (s.sectors !== prev.sectors && readyRef.current) pushSectors(s.sectors);
      if (s.leftOpen !== prev.leftOpen) setTimeout(() => map.resize(), 50);
      if (s.zone !== prev.zone && readyRef.current) {
        setGeoJson(map, "zone", { type: "FeatureCollection", features: s.zone ? [{ type: "Feature", properties: {}, geometry: s.zone }] : [] });
        if (s.zone && !prev.zone) {
          const pts = s.zone.coordinates[0];
          const b = new maplibregl.LngLatBounds(pts[0] as [number, number], pts[0] as [number, number]);
          pts.forEach((p) => b.extend(p as [number, number]));
          map.fitBounds(b, { padding: 80, maxZoom: 17, duration: 600 });
        }
      }
    });
    const onKey = (e: KeyboardEvent) => {
      const dm = useUi.getState().drawMode;
      if (!dm) return;
      if (e.key === "Escape") useUi.getState().setDrawMode(null);
      if (e.key === "Enter" && dm === "polygon") finishPolygon();
    };
    window.addEventListener("keydown", onKey);
    // Double-clic = terminer le polygone (le 2ᵉ clic du double-clic a ajouté un doublon qu'on retire)
    map.on("dblclick", () => {
      if (useUi.getState().drawMode !== "polygon") return;
      draw.pts.pop();
      finishPolygon();
    });
    map.on("mousemove", (e) => {
      if (!useUi.getState().drawMode) return;
      draw.hover = [e.lngLat.lng, e.lngLat.lat];
      drawDraft();
    });
    const handleDrawClick = async (e: MapLayerMouseEvent) => {
      const dm = useUi.getState().drawMode;
      const here: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (dm === "polygon") {
        if (draw.pts.length >= 3) {
          const first = map.project(draw.pts[0]);
          if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) return finishPolygon();
        }
        draw.pts.push(here);
        drawDraft();
      } else if (dm === "circle") {
        if (!draw.center) {
          draw.center = here;
        } else {
          const r = haversine(draw.center, here);
          if (r >= 30) useUi.getState().setZone(circlePolygon(draw.center, r));
          resetDraw();
        }
      } else if (dm === "isochrone") {
        const { mode, minutes } = useUi.getState().iso;
        map.getCanvas().style.cursor = "progress";
        try {
          const r = await fetch(`/api/isochrone?lon=${here[0]}&lat=${here[1]}&mode=${mode}&minutes=${minutes}`);
          if (r.ok) useUi.getState().setZone(((await r.json()) as { geometry: GeoJSON.Polygon }).geometry);
          else alert("Isochrone indisponible pour le moment.");
        } finally {
          map.getCanvas().style.cursor = useUi.getState().drawMode ? "crosshair" : "";
        }
      }
    };

    map.on("load", () => {
      addVigieLayers(map, encodeFilters(useUi.getState().filters));
      readyRef.current = true;
      sync();
      pushViewport();
      pushSectors(useUi.getState().sectors);
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
      if (useUi.getState().drawMode) return void handleDrawClick(e as MapLayerMouseEvent);
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
      unsubDraw();
      window.removeEventListener("keydown", onKey);
      clearTimeout(vpTimer);
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
