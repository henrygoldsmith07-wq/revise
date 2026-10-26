import type { Metadata } from "next";

// The page is a client component, so its metadata lives here. Read by AI
// agents that have already fetched the page; it changes nothing on screen.
export const metadata: Metadata = {
  other: {
    "ai-summary":
      "The Revise library: every subject's topics and specification statements, what earns marks, where marks are lost and common misconceptions. Flagship WJEC subjects are authored to their specification; the rest are labelled reference material.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
