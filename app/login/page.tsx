import { Suspense } from "react";
import { LoginForm } from "./ui";
import "../admin/admin.css";
import "./login.css";

async function LoginInner({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const nextPath = typeof params.next === "string" && params.next.startsWith("/admin") ? params.next : "/admin";
  return <LoginForm error={error} nextPath={nextPath} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="adm adm-login">Cargando</div>}>
      <LoginInner searchParams={searchParams} />
    </Suspense>
  );
}
