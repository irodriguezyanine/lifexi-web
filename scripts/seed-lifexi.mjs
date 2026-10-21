import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractSitio() {
  const html = readFileSync(resolve(root, "public/sitio.html"), "utf8");
  const start = html.indexOf("// --- DATOS ---");
  const end = html.indexOf("\nfunction posiciones(");
  if (start < 0 || end < 0) throw new Error("No se pudo recortar el bloque de datos de sitio.html");
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(html.slice(start, end), sandbox);
  const needed = [
    "EQUIPOS",
    "LOGOS",
    "CAMPEONES",
    "DISUELTOS",
    "LOGOS_HIST",
    "FOTOS_HISTORIA",
    "FOTOS_ESTRELLA",
    "PLANTELES",
    "FOTOS",
    "FECHAS",
    "FALTAN",
    "JUGADORES",
    "PLANILLAS",
    "SANCIONES",
    "ESTRELLAS",
    "tablaHasta",
  ];
  for (const key of needed) {
    if (sandbox[key] == null) throw new Error(`Falta ${key} al extraer sitio.html`);
  }
  return sandbox;
}

function calendar(data) {
  const byN = new Map();
  for (const f of data.FECHAS) {
    byN.set(f.n, {
      n: f.n,
      dia: f.dia ?? null,
      sitio: f.sitio ?? f.n,
      partidos: f.p.map((g) => ({
        hora: g[0],
        cancha: g[1],
        local: g[2],
        visita: g[3],
        gl: g[4],
        gv: g[5],
      })),
    });
  }
  for (const f of data.FALTAN) {
    if (byN.has(f.n)) continue;
    byN.set(f.n, {
      n: f.n,
      dia: f.dia ?? null,
      sitio: f.n,
      partidos: f.p.map((g) => ({
        hora: g[0],
        cancha: "",
        local: g[1],
        visita: g[2],
        gl: null,
        gv: null,
      })),
    });
  }
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

function matchStatus(fechaN, gl, gv) {
  if (gl != null && gv != null) return "played";
  if (fechaN <= 14) return "pending";
  return "scheduled";
}

function asAppearance(entry) {
  const row = typeof entry === "number" ? [entry, 0, 0, 0, 0] : entry;
  return {
    source_index: row[0],
    goals: row[1] ?? 0,
    yellows: row[2] ?? 0,
    reds: row[3] ?? 0,
    own_goals: row[4] ?? 0,
  };
}

async function insertRows(sb, table, rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function one(sb, table, payload) {
  const { data, error } = await sb.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data.id;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }

  const data = extractSitio();
  const fechas = calendar(data);
  const rueda2 = 10;
  const sinFinal = new Set(["2017 Apertura", "2017 Clausura"]);
  const fundadores = new Set([
    "Diablos Rojos",
    "Iñigo",
    "Loyola",
    "Manresa",
    "Pamplona",
    "Patroncitos",
    "Pocuro",
    "Urrestilla",
  ]);

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: resetError } = await sb.rpc("reset_competition_data");
  if (resetError) throw new Error(`reset_competition_data: ${resetError.message}`);

  const leagueId = await one(sb, "leagues", {
    slug: "lifexi",
    name: "LIFEXI",
    full_name: "Liga de fútbol de ex alumnos ignacianos",
    founded_year: 1992,
    founder_name: "Francisco Salazar",
    authorized_by: "P. Juan Díaz S.J.",
    founding_venue: "Colegio San Ignacio El Bosque",
    inaugural_match_on: "1992-10-11",
    inaugural_home: "Manresa",
    inaugural_away: "Pamplona",
    inaugural_kicker: "Alberto Villarreal",
    categories_split_year: 2006,
    logo_path: "img/logo-lifexi.png",
    source_name: "lifexi.refereepro.com",
    source_updated_at: "2026-10-18T15:43:00-03:00",
    notes: {
      no_final_labels: [...sinFinal],
      tiebreakers: ["goal_difference", "fair_play", "goals_for", "head_to_head", "draw"],
      fair_play: {
        yellow: -1,
        red: -4,
        half_wo: -6,
        full_wo: -12,
        double_yellow_counts_as_red_only: true,
      },
    },
  });

  const categoryId = await one(sb, "categories", {
    league_id: leagueId,
    slug: "junior",
    name: "Junior",
  });

  const names = new Set(data.EQUIPOS);
  for (const row of data.CAMPEONES) {
    if (row.c) names.add(row.c);
    if (row.s) names.add(row.s);
    if (row.dq) names.add(row.dq);
    if (row.ganador) names.add(row.ganador);
  }
  for (const name of Object.keys(data.LOGOS_HIST)) names.add(name);
  for (const name of data.DISUELTOS) names.add(name);
  for (const name of fundadores) names.add(name);

  const teamRows = [...names].sort((a, b) => a.localeCompare(b, "es")).map((name) => ({
    league_id: leagueId,
    slug: slugify(name),
    name,
    short_name: name,
    is_dissolved: data.DISUELTOS.includes(name),
    is_founding_team: fundadores.has(name),
  }));
  await insertRows(sb, "teams", teamRows);

  const { data: teams, error: teamsError } = await sb.from("teams").select("id, name, slug");
  if (teamsError) throw new Error(teamsError.message);
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const teamId = (name) => {
    const row = teamByName.get(name);
    if (!row) throw new Error(`Equipo no encontrado: ${name}`);
    return row.id;
  };

  const seasonId = await one(sb, "seasons", {
    league_id: leagueId,
    category_id: categoryId,
    year: 2026,
    slug: "2026-apertura",
    name: "Apertura 2026",
    label: "2026",
    kind: "apertura",
    status: "in_progress",
    venue: "Cancha de Pasto Club AT Chicureo N",
    second_round_from: rueda2,
    total_matchdays: fechas[fechas.length - 1].n,
    published_through_matchday: data.FECHAS.length,
  });

  await insertRows(
    sb,
    "season_teams",
    data.EQUIPOS.map((name, source_index) => ({
      season_id: seasonId,
      team_id: teamId(name),
      source_index,
    })),
  );

  await insertRows(
    sb,
    "players",
    data.JUGADORES.map((j, source_index) => ({
      season_id: seasonId,
      team_id: teamId(data.EQUIPOS[j[0]]),
      full_name: j[1],
      source_index,
    })),
    400,
  );

  const { data: players, error: playersError } = await sb
    .from("players")
    .select("id, source_index")
    .eq("season_id", seasonId);
  if (playersError) throw new Error(playersError.message);
  const playerByIndex = new Map(players.map((p) => [p.source_index, p.id]));

  await insertRows(
    sb,
    "matchdays",
    fechas.map((f) => ({
      season_id: seasonId,
      number: f.n,
      played_on: f.dia,
      round_number: f.n < rueda2 ? 1 : 2,
      league_site_number: f.sitio,
    })),
  );

  const { data: matchdays, error: mdError } = await sb
    .from("matchdays")
    .select("id, number")
    .eq("season_id", seasonId);
  if (mdError) throw new Error(mdError.message);
  const matchdayByN = new Map(matchdays.map((m) => [m.number, m.id]));

  const matchRows = [];
  for (const f of fechas) {
    f.partidos.forEach((g, sort_order) => {
      const source_key = `${f.n}:${g.local}:${g.visita}`;
      const motmIdx = data.ESTRELLAS[source_key];
      matchRows.push({
        season_id: seasonId,
        matchday_id: matchdayByN.get(f.n),
        sort_order,
        kickoff_time: g.hora || null,
        pitch: g.cancha ? String(g.cancha) : null,
        home_team_id: teamId(data.EQUIPOS[g.local]),
        away_team_id: teamId(data.EQUIPOS[g.visita]),
        home_goals: g.gl,
        away_goals: g.gv,
        status: matchStatus(f.n, g.gl, g.gv),
        motm_player_id: motmIdx == null ? null : playerByIndex.get(motmIdx),
        source_key,
      });
    });
  }
  await insertRows(sb, "matches", matchRows);

  const { data: matches, error: matchesError } = await sb
    .from("matches")
    .select("id, source_key")
    .eq("season_id", seasonId);
  if (matchesError) throw new Error(matchesError.message);
  const matchByKey = new Map(matches.map((m) => [m.source_key, m.id]));

  const appearances = [];
  for (const [key, sides] of Object.entries(data.PLANILLAS)) {
    const match_id = matchByKey.get(key);
    if (!match_id) throw new Error(`Planilla sin partido: ${key}`);
    const motmIdx = data.ESTRELLAS[key];
    const [, homeIdx, awayIdx] = key.split(":").map(Number);
    sides.forEach((side, lado) => {
      const team_id = teamId(data.EQUIPOS[lado === 0 ? homeIdx : awayIdx]);
      for (const entry of side) {
        const a = asAppearance(entry);
        appearances.push({
          match_id,
          player_id: playerByIndex.get(a.source_index),
          team_id,
          is_home: lado === 0,
          goals: a.goals,
          yellows: a.yellows,
          reds: a.reds,
          own_goals: a.own_goals,
          is_motm: a.source_index === motmIdx,
        });
      }
    });
  }
  await insertRows(sb, "match_appearances", appearances, 400);

  await insertRows(
    sb,
    "published_sanctions",
    data.SANCIONES.map((row, sort_order) => ({
      season_id: seasonId,
      player_id: playerByIndex.get(row[0]),
      detail: row[1],
      sanction: row[2],
      sort_order,
    })),
  );

  const tournamentRows = data.CAMPEONES.map((row, sort_order) => ({
    league_id: leagueId,
    category_id: categoryId,
    season_id: row.t === "2026" ? seasonId : null,
    official_number: row.n,
    label: row.t,
    venue: row.lugar || null,
    notes: row.nota || null,
    kind: row.tipo,
    champion_team_id: row.c ? teamId(row.c) : null,
    runner_up_team_id: row.s ? teamId(row.s) : null,
    runner_up_asterisk: Boolean(row.ast),
    disqualified_team_id: row.dq ? teamId(row.dq) : null,
    pitch_result: row.cancha || null,
    unofficial_winner_name: row.ganador || null,
    photo_note: row.fotoNota || null,
    counts_as_final: row.tipo === "oficial" && Boolean(row.c) && !sinFinal.has(row.t),
    sort_order,
  }));
  await insertRows(sb, "historical_tournaments", tournamentRows);

  const { data: tournaments, error: tError } = await sb
    .from("historical_tournaments")
    .select("id, label")
    .eq("league_id", leagueId);
  if (tError) throw new Error(tError.message);
  const tournamentByLabel = new Map(tournaments.map((t) => [t.label, t.id]));

  const media = [
    {
      kind: "league_logo",
      object_path: "img/logo-lifexi.png",
      width: 192,
      height: 192,
      caption: "LIFEXI",
    },
  ];

  data.EQUIPOS.forEach((name, i) => {
    const [width, height, object_path] = data.LOGOS[i];
    media.push({
      kind: "team_logo",
      object_path,
      width,
      height,
      team_id: teamId(name),
      sort_key: String(i),
    });
    const plantel = data.PLANTELES[i];
    if (plantel) {
      media.push({
        kind: "squad_photo",
        object_path: plantel[2],
        width: plantel[0],
        height: plantel[1],
        caption: plantel[3] || null,
        team_id: teamId(name),
        sort_key: String(i),
      });
    }
  });

  for (const [name, logo] of Object.entries(data.LOGOS_HIST)) {
    media.push({
      kind: "team_logo",
      object_path: logo[2],
      width: logo[0],
      height: logo[1],
      team_id: teamId(name),
      sort_key: name,
    });
  }

  for (const [label, foto] of Object.entries(data.FOTOS)) {
    const historical_tournament_id = tournamentByLabel.get(label) ?? null;
    media.push({
      kind: "champion_photo",
      object_path: foto[2],
      width: foto[0],
      height: foto[1],
      historical_tournament_id,
      sort_key: label,
    });
    media.push({
      kind: "champion_thumb",
      object_path: foto[3],
      width: foto[0],
      height: foto[1],
      historical_tournament_id,
      sort_key: label,
    });
  }

  const historyCaptions = {
    inaugural: "Partido Inaugural: Manresa vs Pamplona",
    copa: "Copa LIFEXI",
    tabla: "Campeones y Goleadores",
  };
  for (const [key, foto] of Object.entries(data.FOTOS_HISTORIA)) {
    media.push({
      kind: "history_photo",
      object_path: foto[2],
      width: foto[0],
      height: foto[1],
      caption: historyCaptions[key] || key,
      sort_key: key,
    });
  }

  for (const [key, foto] of Object.entries(data.FOTOS_ESTRELLA)) {
    const match_id = matchByKey.get(key);
    if (!match_id) throw new Error(`Foto estrella sin partido: ${key}`);
    media.push({
      kind: "motm_photo",
      object_path: foto[2],
      width: foto[0],
      height: foto[1],
      match_id,
      sort_key: key,
    });
  }

  await insertRows(sb, "media", media, 200);

  await insertRows(sb, "league_history_entries", [
    {
      league_id: leagueId,
      sort_order: 1,
      is_lead: true,
      body: "LIFEXI, liga de fútbol de ex alumnos ignacianos, fue fundada el año 1992 por Francisco Salazar, en el Colegio San Ignacio El Bosque, siendo autorizada por el Rector del Colegio, P. Juan Díaz S.J. El partido inaugural se realizó el día 11 de octubre de ese año, entre los equipos Manresa y Pamplona, dando el puntapié inicial el señor Alberto Villarreal. En el año 2006 se dividió en 2 categorías, junior y senior.",
    },
    {
      league_id: leagueId,
      sort_order: 2,
      is_lead: false,
      body: "Los equipos fundadores son: Diablos Rojos, Iñigo, Loyola, Manresa, Pamplona, Patroncitos, Pocuro y Urrestilla.",
    },
    {
      league_id: leagueId,
      sort_order: 3,
      is_lead: false,
      body: "En sus inicios se entregaba la misma copa cada año, que el campeón debía devolver al año siguiente, pero quedaba una placa con el nombre del campeón, además de los goleadores.",
    },
    {
      league_id: leagueId,
      sort_order: 4,
      is_lead: false,
      body: "En un principio se jugó en la cancha del “Palacio del Deporte” que era de pasto (7 jugadores por equipo), luego la misma Liga cooperó en el financiamiento para convertirla en pasto sintético. A partir del segundo semestre del año 1996 se comenzó a usar la cancha del estadio, con el actual formato de media cancha con 9 jugadores por equipo. Hasta el año 2006 se jugaron campeonatos anuales, pero en formato primera rueda en un año y segunda en el siguiente. Tradicionalmente eran 12 equipos, de los cuales el primero pasaba directo a la final y los 8 siguientes se eliminaban en play off. Entre 2007 y 2015 se jugó campeonato largo, pero en año calendario, a partir de 2016 se empezó con el sistema de dos campeonatos por años, con play off donde clasifican los 4 primeros a Copa de Oro (o campeón LIFEXI) y los 4 siguientes a Copa de Plata, excepto 2017 que fue por puntos. Hasta el año 2019 se jugó regularmente en el SIEB, aunque cada vez hubo más dificultades con ciertas fechas y se tenía que arrendar alguna cancha en otro lado para poder terminar los campeonatos.",
    },
    {
      league_id: leagueId,
      sort_order: 5,
      is_lead: false,
      body: "El año 2020 se suspendió el campeonato por la pandemia del COVID y ya no se volvió al SIEB. En el segundo semestre de 2021 se jugó una Copa Covid, que no fue obligatoria para los equipos, en canchas sintéticas de San Carlos de Apoquindo. En el año 2022 se toma la decisión de que vuelva la Liga, pero ya en otra sede, que fue la Universidad Los Andes, donde se jugó hasta el año 2023. En 2024 y 2025 se jugó en la COF y en 2026 se traslada a el Club AT Chicureo Norte.",
    },
  ]);

  const counts = {};
  for (const table of [
    "teams",
    "players",
    "matchdays",
    "matches",
    "match_appearances",
    "published_sanctions",
    "historical_tournaments",
    "media",
    "league_history_entries",
  ]) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table} count: ${error.message}`);
    counts[table] = count;
  }

  const { count: playedCount, error: playedError } = await sb
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "played");
  if (playedError) throw new Error(playedError.message);

  const { count: pendingCount, error: pendingError } = await sb
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  if (pendingError) throw new Error(pendingError.message);

  const { count: scheduledCount, error: scheduledError } = await sb
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("status", "scheduled");
  if (scheduledError) throw new Error(scheduledError.message);

  assert(counts.players === data.JUGADORES.length, `Jugadores: ${counts.players} vs ${data.JUGADORES.length}`);
  assert(counts.matchdays === fechas.length, `Fechas: ${counts.matchdays} vs ${fechas.length}`);
  assert(counts.matches === matchRows.length, `Partidos: ${counts.matches} vs ${matchRows.length}`);
  assert(counts.match_appearances === appearances.length, "Planillas incompletas");
  assert(counts.published_sanctions === data.SANCIONES.length, "Sanciones incompletas");
  assert(counts.historical_tournaments === data.CAMPEONES.length, "Historial incompleto");
  assert(playedCount === Object.keys(data.PLANILLAS).length, `Jugados ${playedCount} vs planillas`);
  assert(pendingCount === 1, `Debería haber 1 pendiente, hay ${pendingCount}`);
  assert(scheduledCount === 8, `Debería haber 8 por jugar, hay ${scheduledCount}`);

  const { data: scoreCheck, error: scoreError } = await sb.from("v_match_calendar").select(
    "source_key, home_goals, away_goals, status",
  ).eq("season_id", seasonId).eq("status", "played");
  if (scoreError) throw new Error(scoreError.message);

  const appRows = [];
  {
    const pageSize = 500;
    let from = 0;
    for (;;) {
      const { data, error } = await sb
        .from("match_appearances")
        .select("match_id, is_home, goals, own_goals, matches!inner(source_key, season_id)")
        .eq("matches.season_id", seasonId)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      appRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }

  const scored = new Map();
  for (const row of appRows) {
    const key = row.matches.source_key;
    const cur = scored.get(key) || { home: 0, away: 0 };
    if (row.is_home) {
      cur.home += row.goals;
      cur.away += row.own_goals;
    } else {
      cur.away += row.goals;
      cur.home += row.own_goals;
    }
    scored.set(key, cur);
  }
  for (const m of scoreCheck) {
    const s = scored.get(m.source_key);
    assert(s, `Sin planilla de goles: ${m.source_key}`);
    assert(
      s.home === m.home_goals && s.away === m.away_goals,
      `Marcador vs planilla ${m.source_key}: ${s.home}-${s.away} vs ${m.home_goals}-${m.away_goals}`,
    );
  }

  const jsTable = data.tablaHasta(data.FECHAS.length);
  const { data: dbTable, error: tableError } = await sb.rpc("season_standings", {
    p_season_id: seasonId,
    p_through: data.FECHAS.length,
  });
  if (tableError) throw new Error(`season_standings: ${tableError.message}`);
  assert(dbTable.length === jsTable.length, "La tabla no tiene 9 equipos");
  for (let i = 0; i < jsTable.length; i++) {
    const js = jsTable[i];
    const db = dbTable[i];
    assert(
      db.team_name === js.nombre &&
        db.pts === js.pts &&
        db.pj === js.pj &&
        db.gf === js.gf &&
        db.gc === js.gc &&
        db.fp === js.fp &&
        db.dg === js.dg,
      `Tabla distinta en ${i + 1}: ${db.team_name} ${db.pts} vs ${js.nombre} ${js.pts}`,
    );
  }

  const { data: playerStats, error: psError } = await sb
    .from("v_player_season_stats")
    .select("source_index, matches_played, goals, yellows, reds, motm")
    .eq("season_id", seasonId);
  if (psError) throw new Error(psError.message);
  const statsByIndex = new Map(playerStats.map((p) => [p.source_index, p]));
  const motmCount = new Map();
  for (const idx of Object.values(data.ESTRELLAS)) {
    motmCount.set(idx, (motmCount.get(idx) || 0) + 1);
  }
  for (let i = 0; i < data.JUGADORES.length; i++) {
    const j = data.JUGADORES[i];
    const s = statsByIndex.get(i);
    assert(s, `Falta estadística del jugador ${i}`);
    assert(s.matches_played === j[2], `PJ ${j[1]} #${i}: ${s.matches_played} vs ${j[2]}`);
    assert(s.goals === j[3], `Goles ${j[1]} #${i}: ${s.goals} vs ${j[3]}`);
    assert(s.reds === j[5], `Rojas ${j[1]} #${i}: ${s.reds} vs ${j[5]}`);
    assert(s.motm === (motmCount.get(i) || 0), `Estrellas ${j[1]} #${i}: ${s.motm} vs ${motmCount.get(i) || 0}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        season: "Apertura 2026",
        counts: {
          ...counts,
          played: playedCount,
          pending: pendingCount,
          scheduled: scheduledCount,
        },
        table_leader: dbTable[0].team_name,
        table_leader_pts: dbTable[0].pts,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
