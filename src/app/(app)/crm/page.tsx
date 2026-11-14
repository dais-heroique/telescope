import type { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";

export const metadata: Metadata = { title: "CRM" };
export default function CrmPage() {
  return <CrmApp />;
}
