import type { Metadata } from "next";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";

export const metadata: Metadata = {
  title: "Cuotas y Conciliación",
  description: "MVP de gestión de cuotas de mantenimiento y vigilancia con conciliación automática de pagos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased font-sans">
        <DataProvider>{children}</DataProvider>
      </body>
    </html>
  );
}
