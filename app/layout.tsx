import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LIFEXI 2026",
  description:
    "Liga de Fútbol de Ex Alumnos Ignacianos. Resultados, tabla, equipos e historial del torneo Junior Apertura 2026.",
  icons: {
    icon: "/img/logo-lifexi.webp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
