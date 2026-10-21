import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/shell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Administración · LIFEXI",
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="adm"><p className="adm-load">Cargando</p></div>}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
