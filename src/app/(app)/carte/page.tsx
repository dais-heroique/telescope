import { Suspense } from "react";
import type { Metadata } from "next";
import { MapWorkspace } from "@/components/shell/MapWorkspace";

export const metadata: Metadata = { title: "Carte" };

export default function CartePage() {
  return (
    <Suspense>
      <MapWorkspace />
    </Suspense>
  );
}
