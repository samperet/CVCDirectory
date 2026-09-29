import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/components/layout/react-query-provider";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/ui/use-toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "CVC Directory",
  description:
    "Collaborative directory for members, sociocratic circles, shared skills, and the community loan library.",
  applicationName: "CVC Directory",
  manifest: "/manifest.json",
  icons: {
    icon: "/CVC.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // Installed on an iPhone's home screen, open as an app rather than in Safari.
  appleWebApp: { capable: true, title: "CVC", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#97cf8a",
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
