"use client";

import { useEffect } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useUi } from "@/lib/store";
import { MODULE_LIST } from "@/config/modules";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setModule, setBasemap, select, selected } = useUi();
  const { setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
      } else if (e.key === "Escape") {
        if (useUi.getState().paletteOpen) setPaletteOpen(false);
        else if (useUi.getState().selected) select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, setPaletteOpen]);

  if (!paletteOpen) return null;
  const run = (fn: () => void) => () => {
    fn();
    setPaletteOpen(false);
  };
  const item = "flex cursor-pointer items-center rounded-md px-3 py-2 text-sm aria-selected:bg-accent";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]" onMouseDown={() => setPaletteOpen(false)}>
      <Command className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl" onMouseDown={(e) => e.stopPropagation()} label="Palette de commandes">
        <Command.Input autoFocus placeholder="Que souhaitez-vous faire ?" className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none" />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">Aucune commande.</Command.Empty>
          <Command.Group heading="Modules" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1">
            {MODULE_LIST.map((m) => (
              <Command.Item key={m.id} className={item} onSelect={run(() => setModule(m.id))}>
                Module : {m.label}
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Affichage" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1">
            <Command.Item className={item} onSelect={run(() => setBasemap("plan"))}>Fond : Plan IGN</Command.Item>
            <Command.Item className={item} onSelect={run(() => setBasemap("satellite"))}>Fond : Satellite</Command.Item>
            <Command.Item className={item} onSelect={run(() => setTheme("dark"))}>Thème sombre</Command.Item>
            <Command.Item className={item} onSelect={run(() => setTheme("light"))}>Thème clair</Command.Item>
          </Command.Group>
          <Command.Group heading="Navigation" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1">
            <Command.Item className={item} onSelect={run(() => router.push("/crm"))}>CRM (pipeline, tâches, contacts)</Command.Item>
            <Command.Item className={item} onSelect={run(() => router.push("/courriers"))}>Courriers (modèles, historique)</Command.Item>
            <Command.Item className={item} onSelect={run(() => router.push("/etudes"))}>Études de zone</Command.Item>
            <Command.Item className={item} onSelect={run(() => router.push("/claude"))}>Connecter Claude (assistant IA)</Command.Item>
            {selected && <Command.Item className={item} onSelect={run(() => select(null))}>Fermer la fiche</Command.Item>}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
