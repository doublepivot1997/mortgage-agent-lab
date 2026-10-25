import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./components/Nav";

export const metadata: Metadata = {
  title: { default: "Mortgage Agent Lab", template: "%s · Mortgage Agent Lab" },
  description:
    "A forward-deployed PM prototype: an AI lead-qualification agent for fictional mortgage lenders, reshaped per lender and tested with simulated borrowers and LLM-as-judge evals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
        <footer className="footer">
          <div className="container">
            <p>
              Portfolio prototype. Harborline Home Loans and Bayview Community Credit Union are fictional. All metrics come from
              simulated conversations or synthetic data, not real-world results. Compliance behavior is illustrative and is not legal
              guidance. No real calls or texts are sent.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
