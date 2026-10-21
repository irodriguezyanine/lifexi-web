"use server";

import { readFile } from "fs/promises";
import { join } from "path";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicSrc } from "@/lib/media";
import { CHAMPION_FOTOS } from "@/lib/admin/champion-fotos";
import type { ChampionDossier, ChampionKind, ChampionShot, ChampionTeamOpt } from "@/lib/admin/types";

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

const BUCKET = "lifexi";
const KINDS: ChampionKind[] = ["oficial", "nooficial", "suspendido", "encurso"];

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function touchPublic() {
  revalidatePath("/");
  revalidatePath("/api/public/liga");
}

async function authed() {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

function asKind(value: string | null | undefined): ChampionKind {
  return KINDS.includes(value as ChampionKind) ? (value as ChampionKind) : "oficial";
}

export async function getChampionDossier(id: number): Promise<Result<ChampionDossier>> {
  if (!(await authed())) return fail("Sesión vencida");
  const tournamentId = Number(id);
  if (!Number.isFinite(tournamentId)) return fail("Torneo no encontrado");
  await ensureChampionPhotos();
  const sb = createAdminClient();
  const { data: row, error } = await sb.from("historical_tournaments").select("*").eq("id", tournamentId).maybeSingle();
  if (error || !row) return fail("Torneo no encontrado");
  const [teamsRes, mediaRes, allRes] = await Promise.all([
    sb.from("teams").select("id, name, is_dissolved").order("name"),
    sb
      .from("media")
      .select("id, kind, object_path, caption, sort_key, width, height, historical_tournament_id")
      .eq("historical_tournament_id", tournamentId)
      .in("kind", ["champion_photo", "champion_thumb"])
      .order("sort_key")
      .order("id"),
    sb.from("historical_tournaments").select("id, official_number, label, venue, kind").order("sort_order"),
  ]);
  const photos: ChampionShot[] = ((mediaRes.data ?? []) as {
    id: number;
    kind: "champion_photo" | "champion_thumb";
    object_path: string;
    caption: string | null;
    sort_key: string | null;
    width: number | null;
    height: number | null;
  }[]).map((item) => ({
    id: item.id,
    kind: item.kind,
    src: publicSrc(item.object_path) ?? item.object_path,
    path: item.object_path,
    caption: item.caption,
    sort_key: item.sort_key,
    width: item.width,
    height: item.height,
  }));
  const all = (allRes.data ?? []) as {
    id: number;
    official_number: number | null;
    label: string;
    venue: string | null;
    kind: string;
  }[];
  const venues = Array.from(new Set(all.map((item) => item.venue).filter((v): v is string => Boolean(v))));
  return {
    ok: true,
    data: {
      tournament: {
        id: row.id,
        official_number: row.official_number,
        label: row.label,
        venue: row.venue,
        notes: row.notes,
        kind: asKind(row.kind),
        champion_team_id: row.champion_team_id,
        runner_up_team_id: row.runner_up_team_id,
        runner_up_asterisk: Boolean(row.runner_up_asterisk),
        disqualified_team_id: row.disqualified_team_id,
        pitch_result: row.pitch_result,
        unofficial_winner_name: row.unofficial_winner_name,
        photo_note: row.photo_note,
        counts_as_final: Boolean(row.counts_as_final),
        sort_order: row.sort_order,
      },
      teams: (teamsRes.data ?? []) as ChampionTeamOpt[],
      photos,
      usedNumbers: all
        .filter((item) => item.id !== row.id && item.official_number != null)
        .map((item) => item.official_number as number),
      usedLabels: all.filter((item) => item.id !== row.id).map((item) => item.label),
      venues,
      currentId: all.find((item) => item.kind === "encurso")?.id ?? null,
    },
  };
}

export async function saveChampionMedia(input: {
  id?: number;
  historical_tournament_id: number;
  kind: "champion_photo" | "champion_thumb";
  object_path: string;
  caption?: string | null;
  cover?: boolean;
  width?: number | null;
  height?: number | null;
}): Promise<Result<{ id: number }>> {
  if (!(await authed())) return fail("Sesión vencida");
  const path = input.object_path.trim();
  if (!path) return fail("Falta la URL");
  const sb = createAdminClient();
  let id = input.id ?? null;
  if (id) {
    const { error } = await sb
      .from("media")
      .update({
        object_path: path,
        caption: input.caption ?? null,
        kind: input.kind,
        historical_tournament_id: input.historical_tournament_id,
        width: input.width ?? null,
        height: input.height ?? null,
      })
      .eq("id", id);
    if (error) return fail(error.message);
  } else if (input.kind === "champion_thumb") {
    const { data: existing } = await sb
      .from("media")
      .select("id")
      .eq("kind", "champion_thumb")
      .eq("historical_tournament_id", input.historical_tournament_id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await sb
        .from("media")
        .update({ object_path: path, caption: input.caption ?? null, width: input.width ?? null, height: input.height ?? null })
        .eq("id", existing.id);
      if (error) return fail(error.message);
      id = existing.id;
    }
  }
  if (!id) {
    const { count } = await sb
      .from("media")
      .select("id", { count: "exact", head: true })
      .eq("historical_tournament_id", input.historical_tournament_id)
      .eq("kind", input.kind);
    const { data, error } = await sb
      .from("media")
      .insert({
        kind: input.kind,
        object_path: path,
        caption: input.caption ?? null,
        historical_tournament_id: input.historical_tournament_id,
        width: input.width ?? null,
        height: input.height ?? null,
        sort_key: input.cover || (count ?? 0) === 0 ? "0" : String((count ?? 0) + 1),
        alt_text: input.kind === "champion_thumb" ? "Miniatura" : "Campeón",
      })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "No se pudo guardar");
    id = data.id;
  }
  if (!id) return fail("No se pudo guardar");
  if (input.cover) await promoteCover(sb, input.historical_tournament_id, id);
  touchPublic();
  return { ok: true, data: { id } };
}

export async function saveChampionCaption(input: { id: number; caption: string | null }): Promise<Result> {
  if (!(await authed())) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb.from("media").update({ caption: input.caption }).eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function setChampionCover(input: { tournamentId: number; mediaId: number }): Promise<Result> {
  if (!(await authed())) return fail("Sesión vencida");
  const sb = createAdminClient();
  await promoteCover(sb, input.tournamentId, input.mediaId);
  touchPublic();
  return { ok: true };
}

export async function setChampionKind(input: {
  id: number;
  kind: "champion_photo" | "champion_thumb";
}): Promise<Result> {
  if (!(await authed())) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { data: row } = await sb.from("media").select("historical_tournament_id").eq("id", input.id).maybeSingle();
  if (!row?.historical_tournament_id) return fail("Foto no encontrada");
  if (input.kind === "champion_thumb") {
    const { data: prev } = await sb
      .from("media")
      .select("id")
      .eq("kind", "champion_thumb")
      .eq("historical_tournament_id", row.historical_tournament_id)
      .neq("id", input.id);
    if (prev?.length) {
      await Promise.all(prev.map((item) => sb.from("media").update({ kind: "champion_photo", sort_key: "5" }).eq("id", item.id)));
    }
  }
  const { error } = await sb.from("media").update({ kind: input.kind, sort_key: input.kind === "champion_thumb" ? "0" : "5" }).eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function deleteChampionMedia(input: { id: number }): Promise<Result> {
  if (!(await authed())) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { error } = await sb.from("media").delete().eq("id", input.id);
  if (error) return fail(error.message);
  touchPublic();
  return { ok: true };
}

export async function uploadChampionPhoto(formData: FormData): Promise<Result<{ url: string; id: number }>> {
  if (!(await authed())) return fail("Sesión vencida");
  const tournamentId = Number(formData.get("tournamentId"));
  const file = formData.get("file");
  const asThumb = String(formData.get("thumb") ?? "") === "1";
  const caption = String(formData.get("caption") ?? "").trim() || null;
  if (!Number.isFinite(tournamentId) || !(file instanceof File)) return fail("Falta la foto");
  if (file.size > 3_500_000) return fail("La foto pasa de 3,5 MB");
  const type = file.type || "image/jpeg";
  if (!type.startsWith("image/")) return fail("El archivo no es una imagen");
  const sb = createAdminClient();
  await sb.storage.createBucket(BUCKET, { public: true }).then(
    () => undefined,
    () => undefined,
  );
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "jpg";
  const folder = asThumb ? "thumbs" : "photos";
  const path = `champions/${tournamentId}/${folder}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, { contentType: type, upsert: true });
  if (error) return fail(error.message);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;
  if (!url) return fail("No se obtuvo la URL");
  const saved = await saveChampionMedia({
    historical_tournament_id: tournamentId,
    kind: asThumb ? "champion_thumb" : "champion_photo",
    object_path: url,
    caption,
    cover: !asThumb,
  });
  if (!saved.ok) return saved;
  if (!saved.data) return fail("No se pudo guardar");
  return { ok: true, data: { url, id: saved.data.id } };
}

export async function ensureChampionPhotos(): Promise<Result<{ inserted: number }>> {
  if (!(await authed())) return fail("Sesión vencida");
  const sb = createAdminClient();
  const { count } = await sb.from("media").select("id", { count: "exact", head: true }).eq("kind", "champion_photo");
  if ((count ?? 0) >= Object.keys(CHAMPION_FOTOS).length - 2) {
    return { ok: true, data: { inserted: 0 } };
  }
  const { data: tournaments } = await sb.from("historical_tournaments").select("id, label, photo_note").order("sort_order");
  const { data: existing } = await sb
    .from("media")
    .select("id, kind, object_path, historical_tournament_id")
    .in("kind", ["champion_photo", "champion_thumb"]);
  const have = new Set(
    ((existing ?? []) as { kind: string; historical_tournament_id: number | null }[])
      .filter((row) => row.historical_tournament_id)
      .map((row) => `${row.kind}:${row.historical_tournament_id}`),
  );
  await sb.storage.createBucket(BUCKET, { public: true }).then(
    () => undefined,
    () => undefined,
  );
  let inserted = 0;
  for (const row of (tournaments ?? []) as { id: number; label: string; photo_note: string | null }[]) {
    const seed = CHAMPION_FOTOS[row.label];
    if (!seed) continue;
    const caption = seed.caption ?? row.photo_note ?? null;
    for (const slot of [
      { kind: "champion_photo" as const, rel: seed.photo, w: seed.w, h: seed.h, sort: "0" },
      { kind: "champion_thumb" as const, rel: seed.thumb, w: Math.round(seed.w / 4), h: Math.round(seed.h / 4), sort: "0" },
    ]) {
      if (have.has(`${slot.kind}:${row.id}`)) continue;
      const stored = await storePublicImage(sb, row.id, slot.kind, slot.rel);
      const { error } = await sb.from("media").insert({
        kind: slot.kind,
        object_path: stored,
        caption: slot.kind === "champion_photo" ? caption : null,
        historical_tournament_id: row.id,
        width: slot.w,
        height: slot.h,
        sort_key: slot.sort,
        alt_text: row.label,
      });
      if (!error) {
        inserted += 1;
        have.add(`${slot.kind}:${row.id}`);
      }
    }
    if (caption && !row.photo_note) {
      await sb.from("historical_tournaments").update({ photo_note: caption }).eq("id", row.id);
    }
  }
  if (inserted) touchPublic();
  return { ok: true, data: { inserted } };
}

async function storePublicImage(
  sb: ReturnType<typeof createAdminClient>,
  tournamentId: number,
  kind: "champion_photo" | "champion_thumb",
  rel: string,
) {
  const local = await readLocal(rel);
  if (!local) return rel.startsWith("/") ? rel : `/${rel}`;
  const ext = (rel.split(".").pop() || "webp").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "webp";
  const folder = kind === "champion_thumb" ? "thumbs" : "photos";
  const path = `champions/${tournamentId}/${folder}/seed.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, local, {
    contentType: ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp",
    upsert: true,
  });
  if (error) return rel.startsWith("/") ? rel : `/${rel}`;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || (rel.startsWith("/") ? rel : `/${rel}`);
}

async function readLocal(rel: string) {
  const clean = rel.replace(/^\/+/, "");
  try {
    return await readFile(join(process.cwd(), "public", clean));
  } catch {
    return null;
  }
}

async function promoteCover(sb: ReturnType<typeof createAdminClient>, tournamentId: number, mediaId: number) {
  const { data } = await sb
    .from("media")
    .select("id")
    .eq("kind", "champion_photo")
    .eq("historical_tournament_id", tournamentId)
    .order("id");
  const rows = (data ?? []) as { id: number }[];
  await Promise.all(
    rows.map((row, index) =>
      sb
        .from("media")
        .update({ sort_key: row.id === mediaId ? "0" : String(index + 1) })
        .eq("id", row.id),
    ),
  );
}
