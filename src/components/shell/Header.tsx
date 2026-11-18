"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { BarChart3, Command, PanelLeft, KanbanSquare, LogOut, Mail, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { MODULE_LIST } from "@/config/modules";
import { useUi } from "@/lib/store";

export function Header() {
  const { resolvedTheme, setTheme } = useTheme();
  const { module, setModule, setPaletteOpen, toggleLeft } = useUi();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
      <Button variant="ghost" size="icon" aria-label="Afficher/masquer le panneau" title="Afficher/masquer le panneau" onClick={toggleLeft}>
        <PanelLeft />
      </Button>
      <Link href="/carte" aria-label="Carte VIGIE">
        <Logo />
      </Link>
      <nav className="ml-2 flex items-center gap-1 overflow-x-auto" aria-label="Modules métiers">
        {MODULE_LIST.map((m) => (
          <button
            key={m.id}
            onClick={() => setModule(m.id)}
            title={m.description}
            aria-pressed={module === m.id}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              module === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)} className="hidden gap-1.5 text-muted-foreground sm:inline-flex">
          <Command className="size-3.5" /> K
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Études de zone" title="Études de zone">
          <Link href="/etudes"><BarChart3 /></Link>
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Courriers" title="Courriers">
          <Link href="/courriers"><Mail /></Link>
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="CRM" title="CRM">
          <Link href="/crm"><KanbanSquare /></Link>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Se déconnecter" onClick={logout}>
          <LogOut />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Changer de thème" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden size-4 dark:block" />
          <Moon className="size-4 dark:hidden" />
        </Button>
      </div>
    </header>
  );
}
