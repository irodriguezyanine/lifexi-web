"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { IconChevL } from "@/components/admin/icons";

const KEY = "lifexi_admin_nav";

function readStack(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50)));
}

export function fallbackPath(pathname: string) {
  const clean = pathname.replace(/\/$/, "") || "/";
  if (clean === "/login") return "/";
  if (clean === "/admin") return "/admin";
  const i = clean.lastIndexOf("/");
  return i <= 0 ? "/admin" : clean.slice(0, i) || "/admin";
}

export function AdminBack() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    const stack = readStack();
    const i = stack.lastIndexOf(pathname);
    if (i >= 0) writeStack(stack.slice(0, i + 1));
    else {
      stack.push(pathname);
      writeStack(stack);
    }
  }, [pathname]);

  function goBack() {
    if (pathname === "/login") {
      router.replace("/");
      return;
    }
    const stack = readStack();
    if (stack[stack.length - 1] === pathname) stack.pop();
    const prev = stack[stack.length - 1];
    writeStack(stack);
    if (prev && prev !== pathname) {
      router.replace(prev);
      return;
    }
    const parent = fallbackPath(pathname);
    if (parent !== pathname) {
      router.replace(parent);
      return;
    }
    if (window.history.length > 1) router.back();
  }

  return (
    <div className="adm-backbar">
      <button type="button" className="adm-back" title="Volver" aria-label="Volver" onClick={goBack}>
        <IconChevL />
      </button>
    </div>
  );
}
