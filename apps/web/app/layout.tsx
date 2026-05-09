import type { Metadata } from "next";
import { AmplifyProvider } from "../components/amplify-provider";
import "./globals.css";
import "@aws-amplify/ui-react/styles.css";

export const metadata: Metadata = {
  title: "Agents Cloud",
  description: "Web command center for autonomous agent teams."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
