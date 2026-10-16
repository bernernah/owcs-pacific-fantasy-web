'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Calendar,
  Users,
  Save,
  History,
  Edit3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import SpreadsheetStatGrid, {
  type PlayerGridStat,
} from '@/components/SpreadsheetStatGrid';
import type {
  Gameweek,
  Player,
  Team,
  PlayerRole,
  ExtractedScoreboardRow,
  GameweekStatus,
} from '@/types/fantasy';

interface MatchLogRow {
  id: string;
  gameweek_id: string;
  match_name: string;
  player_id: string;
  kills: number;
  deaths: number;
  damage: number;
  healing: number;
  map_won: boolean;
  calculated_points: number;
  created_at: string;
  players?: Player;
  gameweeks?: Gameweek;
}

interface GroupedMatchHistory {
  key: string;
  gameweek_id: string;
  gw_number: number;
  gw_name: string;
  match_name: string;
  created_at: string;
  logs: MatchLogRow[];
}

export default function AdminDashboardPage() {
  const supabase = getSupabaseBrowserClient();

  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchLogs, setMatchLogs] = useState<MatchLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Shared Target Gameweek & Match Identifier for AI + Spreadsheet Grid
  const [selectedGwId, setSelectedGwId] = useState<string>('');
  const [matchName, setMatchName] = useState<string>('');

  // Phase 3: Hybrid AI Pre-Fill State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [parsingImage, setParsingImage] = useState<boolean>(false);
  const [externalPrefill, setExternalPrefill] = useState<Record<
    string,
    Partial<PlayerGridStat>
  > | null>(null);
  const [unmappedOcrRows, setUnmappedOcrRows] = useState<
    ExtractedScoreboardRow[]
  >([]);

  // Phase 4: Match History State
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);
  const [deletingMatchKey, setDeletingMatchKey] = useState<string | null>(null);

  // Quick Add Player State
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerRole, setNewPlayerRole] = useState<PlayerRole>('DPS');
  const [newPlayerPrice, setNewPlayerPrice] = useState<string>('20.0');
  const [newPlayerTeamId, setNewPlayerTeamId] = useState<string>('');

  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);

    const [
      { data: gwData },
      { data: playerData },
      { data: teamData },
      { data: logsData },
    ] = await Promise.all([
      supabase
        .from('gameweeks')
        .select('*')
        .order('number', { ascending: true }),
      supabase
        .from('players')
        .select('*, teams(*)')
        .order('name', { ascending: true }),
      supabase.from('teams').select('*').order('name', { ascending: true }),
      supabase
        .from('match_logs')
        .select('*, players(*, teams(*)), gameweeks(*)')
        .order('created_at', { ascending: false }),
    ]);

    const gws = (gwData as Gameweek[]) ?? [];
    setGameweeks(gws);
    if (gws.length > 0 && !selectedGwId) {
      const active = gws.find((g) => g.status === 'ACTIVE') ?? gws[0];
      setSelectedGwId(active.id);
    }

    const allPlayers = (playerData as Player[]) ?? [];
    setPlayers(allPlayers);

    const allTeams = (teamData as Team[]) ?? [];
    setTeams(allTeams);
    if (allTeams.length > 0 && !newPlayerTeamId) {
      setNewPlayerTeamId(allTeams[0].id);
    }

    setMatchLogs((logsData as MatchLogRow[]) ?? []);
    setLoading(false);
  }, [supabase, selectedGwId, newPlayerTeamId]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Smart Fuzzy Player Matcher (handles case, clan tags, and 1/i, 2/z, 0/o OCR swaps)
  const findBestPlayerMatch = useCallback(
    (rawName: string): Player | null => {
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/1/g, 'i')
          .replace(/2/g, 'z')
          .replace(/0/g, 'o');

      const cleanRaw = rawName.trim().toLowerCase();
      const normRaw = normalize(rawName);

      // 1. Exact case-insensitive match
      const exact = players.find((p) => p.name.toLowerCase() === cleanRaw);
      if (exact) return exact;

      // 2. Normalized leet-speak match (e.g. "Spinel" -> "Sp1nel", "mushzoom" -> "mush2oom")
      const normMatch = players.find((p) => normalize(p.name) === normRaw);
      if (normMatch) return normMatch;

      // 3. Substring match
      const partial = players.find(
        (p) =>
          normRaw.includes(normalize(p.name)) ||
          normalize(p.name).includes(normRaw)
      );
      return partial ?? null;
    },
    [players]
  );

  const handleFileSelect = (file: File) => {
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setBanner(null);
  };

  // ==========================================================================
  // PHASE 3: HYBRID GEMINI AI -> PRE-FILL SPREADSHEET STAT GRID
  // ==========================================================================
  const handleExtractScoreboardToGrid = async () => {
    if (!imageFile) {
      setBanner({
        type: 'error',
        text: 'Please drop or select a scoreboard screenshot first.',
      });
      return;
    }

    setParsingImage(true);
    setBanner(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const res = await fetch('/api/parse-scoreboard', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse scoreboard.');
      }

      const rawList = (data.players as ExtractedScoreboardRow[]) ?? [];
      const nextPrefill: Record<string, Partial<PlayerGridStat>> = {};
      const unmapped: ExtractedScoreboardRow[] = [];
      const detectedTeamCodes = new Set<string>();

      for (const row of rawList) {
        const matchedPlayer = findBestPlayerMatch(row.player_name);
        if (matchedPlayer) {
          nextPrefill[matchedPlayer.id] = {
            player_id: matchedPlayer.id,
            included: true,
            kills: Number(row.elims) || 0,
            deaths: Number(row.deaths) || 0,
            damage: Number(row.damage) || 0,
            healing: Number(row.healing) || 0,
            map_won: Boolean(row.map_won),
          };
          if (matchedPlayer.teams?.code) {
            detectedTeamCodes.add(matchedPlayer.teams.code);
          }
        } else {
          unmapped.push(row);
        }
      }

      // Auto-suggest Match Name if blank and 2 teams were detected
      const codes = Array.from(detectedTeamCodes);
      if (!matchName.trim() && codes.length >= 2) {
        setMatchName(`${codes[0]} vs ${codes[1]}`);
      }

      setExternalPrefill(nextPrefill);
      setUnmappedOcrRows(unmapped);

      const matchedCount = Object.keys(nextPrefill).length;
      setBanner({
        type: 'success',
        text: `Gemini pre-filled ${matchedCount} players into the Spreadsheet Grid below! ${
          unmapped.length > 0
            ? `(${unmapped.length} unrecognized name(s) can be linked right below.)`
            : 'Verify the numbers and click Commit Match Stats.'
        }`,
      });
    } catch (err: unknown) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'OCR extraction failed.',
      });
    } finally {
      setParsingImage(false);
    }
  };

  // Manually assign an unrecognized OCR row into the Spreadsheet Grid
  const handleAssignUnmappedRow = (
    ocrRow: ExtractedScoreboardRow,
    targetPlayerId: string
  ) => {
    if (!targetPlayerId) return;

    setExternalPrefill((prev) => ({
      ...(prev ?? {}),
      [targetPlayerId]: {
        player_id: targetPlayerId,
        included: true,
        kills: Number(ocrRow.elims) || 0,
        deaths: Number(ocrRow.deaths) || 0,
        damage: Number(ocrRow.damage) || 0,
        healing: Number(ocrRow.healing) || 0,
        map_won: Boolean(ocrRow.map_won),
      },
    }));

    setUnmappedOcrRows((prev) =>
      prev.filter((r) => r.player_name !== ocrRow.player_name)
    );
  };

  // ==========================================================================
  // PHASE 4: MATCH HISTORY GROUPING, EDITING & SAFE DELETION
  // ==========================================================================
  const groupedMatches = useMemo<GroupedMatchHistory[]>(() => {
    const map: Record<string, GroupedMatchHistory> = {};

    for (const log of matchLogs) {
      const key = `${log.gameweek_id}::${log.match_name}`;
      if (!map[key]) {
        map[key] = {
          key,
          gameweek_id: log.gameweek_id,
          gw_number: log.gameweeks?.number ?? 1,
          gw_name: log.gameweeks?.name ?? 'Gameweek',
          match_name: log.match_name,
          created_at: log.created_at,
          logs: [],
        };
      }
      map[key].logs.push(log);
    }

    return Object.values(map).sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [matchLogs]);

  const handleLoadMatchIntoGrid = (group: GroupedMatchHistory) => {
    setSelectedGwId(group.gameweek_id);
    setMatchName(group.match_name);

    const prefill: Record<string, Partial<PlayerGridStat>> = {};
    for (const log of group.logs) {
      prefill[log.player_id] = {
        player_id: log.player_id,
        included: true,
        kills: Number(log.kills),
        deaths: Number(log.deaths),
        damage: Number(log.damage),
        healing: Number(log.healing),
        map_won: Boolean(log.map_won),
      };
    }

    setExternalPrefill(prefill);
    setBanner({
      type: 'success',
      text: `Loaded "${group.match_name}" (${group.logs.length} players) into the Spreadsheet Grid for editing.`,
    });
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  const handleDeleteMatch = async (group: GroupedMatchHistory) => {
    const confirmed = window.confirm(
      `Delete match "${group.match_name}" (GW${group.gw_number})? This will remove its ${group.logs.length} player stat records from match_logs and automatically recalculate all manager fantasy scores.`
    );
    if (!confirmed) return;

    setDeletingMatchKey(group.key);
    setBanner(null);

    const { error } = await supabase
      .from('match_logs')
      .delete()
      .eq('gameweek_id', group.gameweek_id)
      .eq('match_name', group.match_name);

    setDeletingMatchKey(null);

    if (error) {
      setBanner({ type: 'error', text: error.message });
    } else {
      setBanner({
        type: 'success',
        text: `Deleted "${group.match_name}" from match_logs and recalculated all affected manager totals!`,
      });
      loadAdminData();
    }
  };

  // Schedule & Gameweek Update Handler
  const handleUpdateGameweek = async (
    gwId: string,
    lockTimeIso: string,
    status: GameweekStatus
  ) => {
    const { error } = await supabase
      .from('gameweeks')
      .update({ lock_time: lockTimeIso, status })
      .eq('id', gwId);

    if (error) {
      setBanner({ type: 'error', text: error.message });
    } else {
      setBanner({
        type: 'success',
        text: 'Gameweek schedule & status updated.',
      });
      loadAdminData();
    }
  };

  // Quick Add Pro Player
  const handleQuickAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner(null);

    const targetTeamId = newPlayerTeamId || teams[0]?.id;

    if (!newPlayerName.trim()) {
      setBanner({
        type: 'error',
        text: 'Please enter a player BattleTag before clicking Add Player.',
      });
      return;
    }

    if (!targetTeamId) {
      setBanner({
        type: 'error',
        text: 'Create at least one OWCS Team in Section 4 before adding players.',
      });
      return;
    }

    const { error } = await supabase.from('players').insert({
      name: newPlayerName.trim(),
      role: newPlayerRole,
      price: Number(newPlayerPrice),
      team_id: targetTeamId,
      is_active: true,
    });

    if (error) {
      setBanner({ type: 'error', text: error.message });
    } else {
      setNewPlayerName('');
      setBanner({
        type: 'success',
        text: `Added player ${newPlayerName.trim()} to the market!`,
      });
      loadAdminData();
    }
  };

  if (loading && players.length === 0) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">
        Loading Commissioner Admin Hub...
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-r from-zinc-900 via-[#111522] to-zinc-950 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">
              OWCS COMMISSIONER ADMIN HUB
            </h1>
            <p className="text-xs text-zinc-400">
              Hybrid AI Scoreboard Pre-Fill, Arrow-Key Spreadsheet Ledger &
              Match History Controls
            </p>
          </div>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm font-bold ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          {banner.text}
        </div>
      )}

      {/* ====================================================================
          PHASE 3: HYBRID GEMINI AI SCREENSHOT PRE-FILLER
      ==================================================================== */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <div>
              <h2 className="text-lg font-black text-white">
                1. Hybrid AI Scoreboard Pre-Filler (Optional)
              </h2>
              <p className="text-xs text-zinc-400">
                Drop a screenshot here to automatically extract stats and
                pre-fill the Spreadsheet Grid below for verification.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const droppedFile = e.dataTransfer.files?.[0];
              if (droppedFile) handleFileSelect(droppedFile);
            }}
            className={`lg:col-span-8 relative rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
              isDragging
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
            }`}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />

            {imagePreviewUrl ? (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <img
                  src={imagePreviewUrl}
                  alt="Scoreboard Preview"
                  className="max-h-36 rounded-xl border border-zinc-700 object-contain"
                />
                <div className="text-left">
                  <p className="text-xs font-bold text-white">
                    {imageFile?.name}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Click or drag another screenshot to replace
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 py-2">
                <UploadCloud className="w-8 h-8 text-orange-400 mx-auto" />
                <p className="text-xs sm:text-sm font-bold text-white">
                  Drag & drop an OWCS scoreboard screenshot, or click to browse
                </p>
                <p className="text-[11px] text-zinc-500">
                  Extracts Kills, Deaths, Damage & Healing directly into the
                  Spreadsheet Grid below
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleExtractScoreboardToGrid}
              disabled={!imageFile || parsingImage}
              className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-3.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {parsingImage
                ? 'Extracting into Grid...'
                : 'Extract & Pre-Fill Spreadsheet'}
            </button>
            <p className="text-[11px] text-zinc-500 text-center">
              Nothing is saved to the database until you review the grid and
              click <strong className="text-zinc-300">Commit Match Stats</strong>.
            </p>
          </div>
        </div>

        {/* Unmapped OCR Row Resolver (if Gemini reads an unfamiliar nickname) */}
        {unmappedOcrRows.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-xs font-bold text-amber-300">
              Unrecognized Screenshot Names ({unmappedOcrRows.length}) — Select
              a Database Player to inject their stats into the grid:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {unmappedOcrRows.map((uRow) => (
                <div
                  key={uRow.player_name}
                  className="flex items-center justify-between gap-2 bg-zinc-950/80 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-white">
                      &ldquo;{uRow.player_name}&rdquo;
                    </span>
                    <span className="text-zinc-400 ml-2">
                      ({uRow.elims}K / {uRow.deaths}D / {uRow.damage} DMG /{' '}
                      {uRow.healing} H)
                    </span>
                  </div>
                  <select
                    defaultValue=""
                    onChange={(e) =>
                      handleAssignUnmappedRow(uRow, e.target.value)
                    }
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-bold text-white"
                  >
                    <option value="">Map to Player...</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.teams?.code}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          PHASE 2 & 3: ARROW-KEY SPREADSHEET STAT GRID
      ==================================================================== */}
      <SpreadsheetStatGrid
        gameweeks={gameweeks}
        teams={teams}
        players={players}
        selectedGwId={selectedGwId}
        onSelectGwId={setSelectedGwId}
        matchName={matchName}
        onChangeMatchName={setMatchName}
        externalPrefill={externalPrefill}
        onStatsCommitted={loadAdminData}
        onBanner={setBanner}
      />

      {/* ====================================================================
          PHASE 4: MATCH HISTORY LEDGER & SAFE DELETION
      ==================================================================== */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-orange-400" />
            <div>
              <h2 className="text-lg font-black text-white">
                3. Committed Match History Ledger
              </h2>
              <p className="text-xs text-zinc-400">
                Inspect individual matches in <code className="text-orange-400">match_logs</code>, load them back into the grid to edit, or safely delete a match to recalculate all manager scores.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-zinc-400">
            {groupedMatches.length} Committed Match(es)
          </span>
        </div>

        {groupedMatches.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
            No matches committed to <code className="text-zinc-400">match_logs</code> yet. Use the Spreadsheet Grid above to commit your first game!
          </div>
        ) : (
          <div className="space-y-3">
            {groupedMatches.map((group) => {
              const isExpanded = expandedMatchKey === group.key;
              const isDeleting = deletingMatchKey === group.key;

              return (
                <div
                  key={group.key}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div
                      onClick={() =>
                        setExpandedMatchKey(isExpanded ? null : group.key)
                      }
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30">
                        GW{group.gw_number}
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-white flex items-center gap-2">
                          {group.match_name}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </h3>
                        <p className="text-[11px] text-zinc-400">
                          {group.logs.length} Player Records • Committed{' '}
                          {new Date(group.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadMatchIntoGrid(group)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                        Load into Grid to Edit
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteMatch(group)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {isDeleting ? 'Deleting...' : 'Delete Match'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-3 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase text-zinc-500 border-b border-zinc-800">
                            <th className="py-2 px-2">Player</th>
                            <th className="py-2 px-2">Role</th>
                            <th className="py-2 px-2 text-right">Kills</th>
                            <th className="py-2 px-2 text-right">Deaths</th>
                            <th className="py-2 px-2 text-right">Damage</th>
                            <th className="py-2 px-2 text-right">Healing</th>
                            <th className="py-2 px-2 text-center">Won</th>
                            <th className="py-2 px-2 text-right text-orange-400">
                              Fantasy Pts
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {group.logs.map((log) => (
                            <tr key={log.id}>
                              <td className="py-2 px-2 font-bold text-white">
                                <span className="text-[10px] text-zinc-400 mr-1.5">
                                  [{log.players?.teams?.code ?? 'OWCS'}]
                                </span>
                                {log.players?.name ?? 'Unknown'}
                              </td>
                              <td className="py-2 px-2">
                                {log.players?.role && (
                                  <RoleBadge
                                    role={log.players.role}
                                    size="sm"
                                  />
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {log.kills}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-400">
                                {log.deaths}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {Number(log.damage).toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                {Number(log.healing).toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {log.map_won ? '✅' : '—'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-black text-orange-400">
                                {Number(log.calculated_points).toFixed(1)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ====================================================================
          SECTION 4 & 5: SCHEDULE CONTROLS, TEAM MANAGER & QUICK ADD PLAYER
      ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
            <Calendar className="w-5 h-5 text-orange-400" />
            <h2 className="text-base font-black text-white">
              4. Gameweek Schedule & Lock Time Controls
            </h2>
          </div>

          <div className="space-y-3">
            {gameweeks.map((gw) => (
              <GameweekRowEditor
                key={gw.id}
                gw={gw}
                onSave={handleUpdateGameweek}
              />
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <TeamManagerCard
            teams={teams}
            onTeamsUpdated={loadAdminData}
            onBanner={setBanner}
          />

          <form
            onSubmit={handleQuickAddPlayer}
            className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4"
          >
            <h2 className="text-base font-black text-white border-b border-zinc-800 pb-3">
              6. Quick Add Pro Player
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="BattleTag (e.g. sgy)"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
              />
              <select
                value={newPlayerRole}
                onChange={(e) => setNewPlayerRole(e.target.value as PlayerRole)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                <option value="TANK">TANK</option>
                <option value="DPS">DPS</option>
                <option value="SUPPORT">SUPPORT</option>
              </select>
              <select
                value={newPlayerTeamId}
                onChange={(e) => setNewPlayerTeamId(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                placeholder="Price ($M)"
                value={newPlayerPrice}
                onChange={(e) => setNewPlayerPrice(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-400 text-zinc-950 font-black text-xs uppercase tracking-wider py-2.5 rounded-xl"
            >
              + Add Player to Market
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function GameweekRowEditor({
  gw,
  onSave,
}: {
  gw: Gameweek;
  onSave: (id: string, lockTimeIso: string, status: GameweekStatus) => void;
}) {
  const toLocalInputString = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [localTime, setLocalTime] = useState<string>(
    toLocalInputString(gw.lock_time)
  );
  const [status, setStatus] = useState<GameweekStatus>(gw.status);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black text-white">
          GW{gw.number}: {gw.name}
        </p>
        <p className="text-[11px] text-zinc-400">
          Lineups auto-lock 15m prior to timestamp
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={localTime}
          onChange={(e) => setLocalTime(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as GameweekStatus)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white"
        />
        <button
          type="button"
          onClick={() =>
            onSave(gw.id, new Date(localTime).toISOString(), status)
          }
          className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-orange-500 hover:text-zinc-950 text-zinc-200 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </div>
  );
}

function TeamManagerCard({
  teams,
  onTeamsUpdated,
  onBanner,
}: {
  teams: Team[];
  onTeamsUpdated: () => void;
  onBanner: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const supabase = getSupabaseBrowserClient();

  const [newName, setNewName] = useState<string>('');
  const [newCode, setNewCode] = useState<string>('');
  const [newLogoUrl, setNewLogoUrl] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCode, setEditCode] = useState<string>('');
  const [editLogoUrl, setEditLogoUrl] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    onBanner(null);

    const trimmedName = newName.trim();
    const trimmedCode = newCode.trim().toUpperCase();
    const trimmedLogo = newLogoUrl.trim() || null;

    if (!trimmedName || trimmedCode.length < 2 || trimmedCode.length > 5) {
      onBanner({
        type: 'error',
        text: 'Team Name is required and Code must be 2–5 characters.',
      });
      return;
    }

    setCreating(true);
    const { error } = await supabase.from('teams').insert({
      name: trimmedName,
      code: trimmedCode,
      logo_url: trimmedLogo,
      is_eliminated: false,
    });
    setCreating(false);

    if (error) {
      onBanner({ type: 'error', text: error.message });
    } else {
      setNewName('');
      setNewCode('');
      setNewLogoUrl('');
      onBanner({
        type: 'success',
        text: `Created team ${trimmedName} (${trimmedCode})!`,
      });
      onTeamsUpdated();
    }
  };

  const startEditing = (team: Team) => {
    setEditingTeamId(team.id);
    setEditName(team.name);
    setEditCode(team.code);
    setEditLogoUrl(team.logo_url ?? '');
  };

  const handleSaveEdit = async (teamId: string) => {
    onBanner(null);
    const trimmedName = editName.trim();
    const trimmedCode = editCode.trim().toUpperCase();
    const trimmedLogo = editLogoUrl.trim() || null;

    if (!trimmedName || trimmedCode.length < 2 || trimmedCode.length > 5) {
      onBanner({
        type: 'error',
        text: 'Team Name is required and Code must be 2–5 characters.',
      });
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase
      .from('teams')
      .update({
        name: trimmedName,
        code: trimmedCode,
        logo_url: trimmedLogo,
      })
      .eq('id', teamId);
    setSavingEdit(false);

    if (error) {
      onBanner({ type: 'error', text: error.message });
    } else {
      setEditingTeamId(null);
      onBanner({
        type: 'success',
        text: `Updated team ${trimmedName} (${trimmedCode}).`,
      });
      onTeamsUpdated();
    }
  };

  const handleToggleEliminated = async (team: Team) => {
    onBanner(null);
    const { error } = await supabase
      .from('teams')
      .update({ is_eliminated: !team.is_eliminated })
      .eq('id', team.id);

    if (error) {
      onBanner({ type: 'error', text: error.message });
    } else {
      onTeamsUpdated();
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    const confirmed = window.confirm(
      `Delete "${team.name} (${team.code})"? Any players assigned to this team will also be removed.`
    );
    if (!confirmed) return;

    onBanner(null);
    const { error } = await supabase.from('teams').delete().eq('id', team.id);

    if (error) {
      onBanner({ type: 'error', text: error.message });
    } else {
      onBanner({
        type: 'success',
        text: `Deleted team ${team.name}.`,
      });
      onTeamsUpdated();
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-5">
      <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
        <Users className="w-5 h-5 text-orange-400" />
        <div>
          <h2 className="text-base font-black text-white">
            5. OWCS Team Manager & Playoff Status
          </h2>
          <p className="text-[11px] text-zinc-400">
            Create teams, edit codes/names, or mark bottom 2 teams as Eliminated
            for Playoffs.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleCreateTeam}
        className="rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-3.5 space-y-3"
      >
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400">
          + Create New OWCS Team
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="text"
            placeholder="Team Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
          />
          <input
            type="text"
            maxLength={5}
            placeholder="Code"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold uppercase text-white focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            placeholder="Logo URL (optional)"
            value={newLogoUrl}
            onChange={(e) => setNewLogoUrl(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-4 py-2 rounded-lg transition-all shrink-0"
          >
            {creating ? 'Adding...' : '+ Add Team'}
          </button>
        </div>
      </form>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {teams.map((t) => {
          const isEditing = editingTeamId === t.id;

          return (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5"
            >
              {isEditing ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                    <input
                      type="text"
                      maxLength={5}
                      value={editCode}
                      onChange={(e) =>
                        setEditCode(e.target.value.toUpperCase())
                      }
                      className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={editLogoUrl}
                      onChange={(e) => setEditLogoUrl(e.target.value)}
                      placeholder="Logo URL"
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(t.id)}
                      disabled={savingEdit}
                      className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs px-3 py-1.5 rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTeamId(null)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs px-2.5 py-1.5 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-zinc-800 text-orange-400 border border-zinc-700 shrink-0">
                      {t.code}
                    </span>
                    <span className="text-xs font-bold text-white truncate">
                      {t.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleEliminated(t)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors ${
                        t.is_eliminated
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {t.is_eliminated ? 'Eliminated' : 'Active'}
                    </button>

                    <button
                      type="button"
                      onClick={() => startEditing(t)}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteTeam(t)}
                      title="Delete Team"
                      className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}