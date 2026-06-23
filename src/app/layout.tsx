import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SaveStoreInit } from "./components/SaveStoreInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "【フクエス】福岡に特化したメンズエステポータルサイト",
  description:
    "博多・天神・北九州・久留米など福岡全域から、口コミ評価の高い人気サロンをご紹介。あなたとお店をマッチングします。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SaveStoreInit />
        {children}
      </body>
    </html>
  );
}
