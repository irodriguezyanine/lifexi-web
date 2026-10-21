"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";
import { AdminStore } from "@/components/admin/store";
import {
  IconBall,
  IconBook,
  IconCal,
  IconCard,
  IconCog,
  IconHome,
  IconImage,
  IconPeople,
  IconShield,
  IconStar,
  IconTable,
  IconUser,
} from "@/components/admin/icons";

const GROUPS = [
  {
    label: "Competencia",
    items: [
      { href: "/admin", label: "Inicio", icon: IconHome },
      { href: "/admin/partidos", label: "Partidos", icon: IconBall },
      { href: "/admin/fechas", label: "Fechas", icon: IconCal },
      { href: "/admin/tabla", label: "Tabla", icon: IconTable },
      { href: "/admin/goleadores", label: "Goleadores", icon: IconStar },
      { href: "/admin/fair-play", label: "Fair Play", icon: IconCard },
      { href: "/admin/sanciones", label: "Sanciones", icon: IconCard },
    ],
  },
  {
    label: "Clubes",
    items: [
      { href: "/admin/equipos", label: "Equipos", icon: IconShield },
      { href: "/admin/jugadores", label: "Jugadores", icon: IconPeople },
    ],
  },
  {
    label: "Liga",
    items: [
      { href: "/admin/home", label: "Portada", icon: IconHome },
      { href: "/admin/campeones", label: "Campeones", icon: IconStar },
      { href: "/admin/historia", label: "Historia", icon: IconBook },
      { href: "/admin/media", label: "Medios", icon: IconImage },
      { href: "/admin/ajustes", label: "Ajustes", icon: IconCog },
    ],
  },
];

function current(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="adm">
      <div className="adm-shell">
        <aside className="adm-side">
          <Link href="/admin" className="adm-brand">
            <img src="/img/logo-lifexi.png" alt="" width={42} height={42} />
            <span>
              <strong>LIFEXI</strong>
              <span>Match Center</span>
            </span>
          </Link>
          {GROUPS.map((group) => (
            <nav key={group.label} className="adm-nav" aria-label={group.label}>
              <p className="adm-k">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={current(pathname, item.href) ? "page" : undefined}
                  >
                    <Icon />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ))}
          <form action={logoutAction}>
            <button className="adm-btn ghost" type="submit">
              <IconUser />
              Salir
            </button>
          </form>
        </aside>
        <div className="adm-main">
          <AdminStore>{children}</AdminStore>
        </div>
      </div>
    </div>
  );
}
