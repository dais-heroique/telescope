import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { MODULE_LIST } from "@/config/modules";

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sources">Sources</Link>
          </Button>
          <Button asChild size="sm" variant="beacon">
            <Link href="/carte">Ouvrir la carte</Link>
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Prospection immobilière · data publique</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Toute la donnée immobilière publique française, sur une seule carte.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          Repérez les biens susceptibles d&apos;être vendus, détectez les opportunités, écrivez aux propriétaires et suivez votre prospection — sans quitter la carte.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg" variant="beacon">
            <Link href="/carte">Explorer la carte</Link>
          </Button>
        </div>
        <section className="mt-20 grid gap-4 sm:grid-cols-2" aria-label="Modules">
          {MODULE_LIST.map((m) => (
            <div key={m.id} className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">{m.label}</h2>
              <p className="text-sm text-muted-foreground">{m.short}</p>
              <p className="mt-2 text-sm">{m.description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
