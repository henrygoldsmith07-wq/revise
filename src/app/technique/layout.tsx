import type { Metadata } from "next";

// The page is a client component, so its metadata lives here. Read by AI
// agents that have already fetched the page; it changes nothing on screen.
export const metadata: Metadata = {
  other: {
    "ai-summary":
      "Revise exam technique drills: describe, explain and evaluate exercises and a 6-mark-style structure on a fictional context. They give structure signals only, never a mark.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
