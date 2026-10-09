import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";
import { PwaInstallProvider } from "@/components/PwaInstall";
import { ShortcutProvider } from "@/components/shortcuts";
import { AccountBoundary } from "@/state/account";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/**
 * Canonical origin. Deliberately the same origin the app is served from; set
 * SITE_URL at deploy time rather than trusting a Host header, so OG tags and
 * canonicals can never be pointed at a spoofed origin.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Revise — exam revision that knows what to do next",
  description:
    "WJEC A-level revision, Physics first: Revise tells you the one thing to do next — spaced repetition, exam-style practice with examiner marking, and a plan that rebuilds itself.",
  applicationName: "Revise",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Revise", statusBarStyle: "default" },
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Revise",
    title: "Revise — exam revision that knows what to do next",
    description:
      "WJEC A-level revision, Physics first: the one thing to do next, proven on trusted questions.",
    url: "/",
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Revise — exam revision that knows what to do next",
    description:
      "WJEC A-level revision, Physics first: the one thing to do next, proven on trusted questions.",
  },
  // This is an app, not a marketing site: only /welcome is meant to be indexed,
  // and only because it is the page that works without JavaScript.
  robots: { index: false, follow: true },
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
        {/* AccountBoundary resolves its profile in a client effect, so without
            JavaScript the app below never renders — only its "opening your
            profile" placeholder. This has to live outside that boundary to be
            visible at all. It points at /welcome, a static page that needs no JS. */}
        <noscript>
          <div style={{ maxWidth: "42rem", margin: "3rem auto", padding: "0 1.25rem", lineHeight: 1.6 }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Revise</h1>
            <p style={{ marginBottom: "0.75rem" }}>
              Revise stores your work on your own device and needs JavaScript to read it, so the
              revision app cannot start without it.
            </p>
            <p>
              <a href="/welcome">Read what Revise does, and what it cannot yet do, without JavaScript</a>.
            </p>
          </div>
        </noscript>
        <PwaInstallProvider>
          <AccountBoundary>
            <ShortcutProvider>
              <AppShell>{children}</AppShell>
            </ShortcutProvider>
          </AccountBoundary>
        </PwaInstallProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
