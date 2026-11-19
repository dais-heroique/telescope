import type { Metadata } from "next";
import { ClaudeConnect } from "@/components/claude/ClaudeConnect";

export const metadata: Metadata = { title: "Connecter Claude" };
export default function Page() {
  return <ClaudeConnect />;
}
