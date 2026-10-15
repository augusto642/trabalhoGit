import type { Metadata } from "next";
import "./globals.css";
import { GitSimProvider } from "@/context/GitSimContext";
import { AppWrapper } from "@/components/AppWrapper";

export const metadata: Metadata = {
  title: "GitEdu Simulator - Aprenda Git, GitHub & VS Code na Prática",
  description: "Plataforma interativa para ensino de Git e GitHub com terminal simulado, editor web e painel do professor.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full bg-[#0d1117] text-white">
      <body className="min-h-full flex flex-col font-sans antialiased bg-[#0d1117]">
        <GitSimProvider>
          <AppWrapper>{children}</AppWrapper>
        </GitSimProvider>
      </body>
    </html>
  );
}
