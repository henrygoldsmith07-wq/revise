import type { Metadata } from "next";

// The page is a client component, so its metadata lives here. Read by AI
// agents that have already fetched the page; it changes nothing on screen.
export const metadata: Metadata = {
  other: {
    "ai-summary":
      "Revise lessons: one taught checkpoint per specification statement, WJEC A-level Physics first, with an explanation, a worked example, a check and an exam-style task. Not yet teacher-reviewed.",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
