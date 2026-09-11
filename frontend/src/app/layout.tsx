import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "DeFiLens — protocol risk ratings, verified on chain",
  description:
    "Submit a DeFi protocol. Five GenLayer validators independently fetch DeFi Llama, score it across five dimensions, and agree on the numbers before anything is written on chain.",
  openGraph: {
    title: "DeFiLens — know before you deposit",
    description:
      "An on-chain risk rating for any DeFi protocol, agreed by five independent validators and verifiable from its own evidence.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${jetbrains.variable} antialiased`}>
        {/* The header lives in the section layouts, not here: whether a page
            offers a wallet is decided on the SERVER by which route group it is
            in. Deciding it in the browser from usePathname() meant the
            prerendered HTML carried the wrong header until hydration corrected
            it — a wallet prompt and a chain id on the landing page, visible in
            view-source, in a first paint, and to anything that does not run JS. */}
        {children}
      </body>
    </html>
  );
}
