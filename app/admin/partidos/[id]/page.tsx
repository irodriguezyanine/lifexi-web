import { Suspense } from "react";
import { MatchDesk } from "@/components/admin/match-desk";

async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchDesk matchId={Number(id)} />;
}

export default function Page({ params }: PageProps<"/admin/partidos/[id]">) {
  return (
    <Suspense fallback={<p className="adm-load">Cargando partido…</p>}>
      <Desk params={params} />
    </Suspense>
  );
}
