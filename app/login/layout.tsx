import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Login · LIFEXI",
  description: "Acceso a la administración LIFEXI.",
  applicationName: "LIFEXI",
  icons: {
    icon: "/img/logo-lifexi.png",
    apple: "/img/logo-lifexi.png",
  },
  appleWebApp: {
    capable: true,
    title: "LIFEXI",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b110e" },
    { media: "(prefers-color-scheme: light)", color: "#0b110e" },
  ],
};

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
