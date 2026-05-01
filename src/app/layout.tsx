import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lakebridge Capital",
  description: "Deal lifecycle platform for Lakebridge Capital / Land Advisors Organization.",
};

// ClerkProvider wrapping goes here once real Clerk keys are provisioned.
// With placeholder publishable keys the Clerk SDK throws at init, so we keep
// the provider out for now. Add it once NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is real:
//
//   import { ClerkProvider } from "@clerk/nextjs";
//   return (
//     <ClerkProvider>
//       <html ...>...</html>
//     </ClerkProvider>
//   );

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="bg-brand-bg text-brand-ink min-h-full">{children}</body>
    </html>
  );
}
