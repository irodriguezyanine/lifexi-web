import { Suspense } from "react";
import { MatchDesk } from "@/components/admin/match-desk";

async function Desk({ id }: { id: string }) {
  return <MatchDesk matchId={Number(id)} />;
}

export default async function Page({ params }: PageProps<"/admin/partidos/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="adm-load">Cargando partido…</p>}>
      <Desk id={id} />
    </Suspense>
  );
}
