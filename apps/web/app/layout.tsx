import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AmplifyProvider } from "../components/amplify-provider";
import "./globals.css";
import "@aws-amplify/ui-react/styles.css";

export const metadata: Metadata = {
  title: "Agents Cloud — Command center",
  description: "Delegate outcomes to autonomous AI teams. Track every run, artifact, and approval."
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
