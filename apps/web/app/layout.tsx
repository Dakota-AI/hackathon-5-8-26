import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AmplifyProvider } from "../components/amplify-provider";
import "@aws-amplify/ui-react/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agents Cloud — Command center",
  description: "Delegate outcomes to autonomous AI teams. Track every run, artifact, and approval.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="font-sans antialiased bg-app-bg text-app-text">
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
