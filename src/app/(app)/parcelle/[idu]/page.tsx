import Link from "next/link";
import { ParcelDetail } from "@/components/parcelle/ParcelDetail";

export default async function ParcellePage({ params }: { params: Promise<{ idu: string }> }) {
  const { idu } = await params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6">
      <Link href={`/carte#map=18/0/0`} className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mb-2 mt-2 font-mono text-xl font-semibold">{idu.toUpperCase()}</h1>
      <ParcelDetail idu={idu.toUpperCase()} />
    </main>
  );
}
