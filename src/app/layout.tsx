import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/components/layout/react-query-provider";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/use-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Community Village Cooperative Directory",
  description:
    "Collaborative directory for members, sociocratic circles, shared skills, and the community loan library.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <ReactQueryProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <Toaster />
          </ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
