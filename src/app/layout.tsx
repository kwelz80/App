import type { Metadata, Viewport } from "next";
import { AccessCodeDialog } from "@/components/AccessCodeDialog";
import { Footer, Header } from "@/components/SiteChrome";
import { APP_NAME } from "@/lib/tools";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: AI Homework Help & Study Tools`, template: `%s | ${APP_NAME}` },
  description:
    "Free AI homework helper, math solver, essay writer, flashcard and quiz maker, paraphraser, grammar checker, and citation generator.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <AccessCodeDialog />
      </body>
    </html>
  );
}
