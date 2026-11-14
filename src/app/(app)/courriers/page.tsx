import type { Metadata } from "next";
import { CourriersApp } from "@/components/courriers/CourriersApp";

export const metadata: Metadata = { title: "Courriers" };
export default function Page() {
  return <CourriersApp />;
}
