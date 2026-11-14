import type { Metadata } from "next";
import { EtudesApp } from "@/components/etudes/EtudesApp";

export const metadata: Metadata = { title: "Études de zone" };
export default function Page() {
  return <EtudesApp />;
}
