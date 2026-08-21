import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ShortcutProvider } from "@/components/shortcuts";
import { StoreProvider } from "@/state/store";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Revise — exam revision that knows what to do next",
  description:
    "Evidence-based A-level revision: FSRS spaced repetition, exam-style practice with examiner marking, weak-topic detection and a plan that rebuilds itself.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Revise", statusBarStyle: "default" },
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

// The theme is applied before paint so a dark-mode user never sees a white
// flash. It runs ahead of React and is overridden by the stored preference
// once the store has loaded.
const THEME_BOOTSTRAP = `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var s=localStorage.getItem('revise.theme');if(s==='dark'||(s!=='light'&&d)){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale is read from localStorage on the client (AppShell hydrates it);
  // the html lang stays en-GB for the SSR shell. A future step can make this
  // dynamic via a cookie + middleware when i18n leaves scaffolding.
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <StoreProvider>
          <ShortcutProvider>
            <AppShell>{children}</AppShell>
          </ShortcutProvider>
        </StoreProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
