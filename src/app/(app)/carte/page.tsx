import type { Metadata } from "next";
import { MapWorkspace } from "@/components/shell/MapWorkspace";

export const metadata: Metadata = { title: "Carte" };

export default function CartePage() {
  return <MapWorkspace />;
}
