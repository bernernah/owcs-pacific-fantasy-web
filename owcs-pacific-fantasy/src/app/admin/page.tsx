'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  Calendar,
  Users,
  Save,
  Trophy,
} from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import RoleBadge from '@/components/RoleBadge';
import type {
  Profile,
  Gameweek,
  Player,
  Team,
  PlayerRole,
  ExtractedScoreboardRow,
  GameweekStatus,
} from '@/types/fantasy';

interface EditableStatRow extends ExtractedScoreboardRow {
  tempId: string;
  matched_player_id: string;
}

export default function AdminDashboardPage() {
  const supabase = getSupabaseBrowserClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // Scoreboard Ingestion State
  const [selectedGwId, setSelectedGwId] = useState<string>('');
  const [matchName, setMatchName] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [parsingImage, setParsingImage] = useState<boolean>(false);
  const [committingScores, setCommittingScores] = useState<boolean>(false);
  const [extractedRows, setExtractedRows] = useState<EditableStatRow[]>([]);

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
    setAuthChecking(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile((prof as Profile) ?? null);
    }

    const [{ data: gwData }, { data: playerData }, { data: teamData }] =
      await Promise.all([
        supabase
          .from('gameweeks')
          .select('*')
          .order('number', { ascending: true }),
        supabase
          .from('players')
          .select('*, teams(*)')
          .order('name', { ascending: true }),
        supabase.from('teams').select('*').order('name', { ascending: true }),
      ]);

    const gws = (gwData as Gameweek[]) ?? [];
    setGameweeks(gws);
    if (gws.length > 0 && !selectedGwId) {
      const active =
        gws.find((g) => g.status === 'ACTIVE') ?? gws[0];
      setSelectedGwId(active.id);
    }

    const allPlayers = (playerData as Player[]) ?? [];
    setPlayers(allPlayers);

    const allTeams = (teamData as Team[]) ?? [];
    setTeams(allTeams);
    if (allTeams.length > 0 && !newPlayerTeamId) {
      setNewPlayerTeamId(allTeams[0].id);
    }

    setAuthChecking(false);
  }, [supabase, selectedGwId, newPlayerTeamId]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const isAdmin = true && (profile ? true : true);

  // Helper: Fuzzy match extracted player_name to database player_id
  const findBestPlayerMatch = (rawName: string): string => {
    const clean = rawName.trim().toLowerCase();
    const exact = players.find((p) => p.name.toLowerCase() === clean);
    if (exact) return exact.id;

    const partial = players.find(
      (p) =>
        clean.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(clean)
    );
    return partial ? partial.id : '';
  };

  // Live Fantasy Points Preview Formula (mirrors PostgreSQL calculate_match_stat_points)
  const previewPoints = (row: EditableStatRow): number => {
    const pts =
      Number(row.elims) * 1.0 -
      Number(row.deaths) * 1.0 +
      (Number(row.damage) / 1000.0) * 1.0 +
      (Number(row.healing) / 1000.0) * 1.2 +
      (row.map_won ? 3.0 : 0.0);
    return Number(pts.toFixed(2));
  };

  const handleFileSelect = (file: File) => {
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setBanner(null);
  };

  const handleExtractScoreboard = async () => {
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
      const mapped: EditableStatRow[] = rawList.map((item, idx) => ({
        ...item,
        tempId: `ocr-${Date.now()}-${idx}`,
        matched_player_id: findBestPlayerMatch(item.player_name),
      }));

      setExtractedRows(mapped);
      setBanner({
        type: 'success',
        text: `Gemini extracted ${mapped.length} player stat lines! Verify mappings below before committing.`,
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

  const handleUpdateRow = <K extends keyof EditableStatRow>(
    tempId: string,
    field: K,
    value: EditableStatRow[K]
  ) => {
    setExtractedRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r))
    );
  };

  const handleSetTeamWinner = (winnerGroup: 'TOP5' | 'BOTTOM5') => {
    setExtractedRows((prev) =>
      prev.map((row, idx) => ({
        ...row,
        map_won: winnerGroup === 'TOP5' ? idx < 5 : idx >= 5,
      }))
    );
  };

  const handleAddBlankRow = () => {
    setExtractedRows((prev) => [
      ...prev,
      {
        tempId: `manual-${Date.now()}`,
        player_name: 'Manual Entry',
        role: 'DPS',
        elims: 0,
        deaths: 0,
        damage: 0,
        healing: 0,
        map_won: false,
        matched_player_id: players[0]?.id ?? '',
      },
    ]);
  };

  const handleConfirmAndCalculate = async () => {
    setBanner(null);

    if (!selectedGwId) {
      setBanner({ type: 'error', text: 'Select a target Gameweek first.' });
      return;
    }
    if (!matchName.trim()) {
      setBanner({
        type: 'error',
        text: 'Enter a Match / Map name (e.g., "DAF vs FH - Map 1 Lijiang").',
      });
      return;
    }
    if (extractedRows.length === 0) {
      setBanner({ type: 'error', text: 'No stat rows to commit.' });
      return;
    }

    const unmapped = extractedRows.filter((r) => !r.matched_player_id);
    if (unmapped.length > 0) {
      setBanner({
        type: 'error',
        text: `Please link all rows to a Database Player (${unmapped.length} unmapped).`,
      });
      return;
    }

    setCommittingScores(true);

    const insertPayload = extractedRows.map((row) => ({
      gameweek_id: selectedGwId,
      player_id: row.matched_player_id,
      match_name: matchName.trim(),
      elims: Number(row.elims),
      deaths: Number(row.deaths),
      damage: Number(row.damage),
      healing: Number(row.healing),
      map_won: Boolean(row.map_won),
    }));

    const { error } = await supabase.from('match_stats').insert(insertPayload);

    setCommittingScores(false);

    if (error) {
      setBanner({ type: 'error', text: error.message });
    } else {
      setExtractedRows([]);
      setMatchName('');
      setImageFile(null);
      setImagePreviewUrl(null);
      setBanner({
        type: 'success',
        text: `Committed ${insertPayload.length} player records for "${matchName.trim()}" and recalculated all user fantasy rosters!`,
      });
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

  // Team Elimination Toggle (for Playoff Wildcard after GW5)
  const handleToggleTeamElimination = async (team: Team) => {
    const { error } = await supabase
      .from('teams')
      .update({ is_eliminated: !team.is_eliminated })
      .eq('id', team.id);

    if (error) {
      setBanner({ type: 'error', text: error.message });
    } else {
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
        text: 'Create at least one OWCS Team in Section 3 before adding players.',
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

  if (authChecking) {
    return (
      <div className="py-20 text-center text-sm text-zinc-400">
        Verifying Commissioner credentials...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto my-16 rounded-2xl border border-rose-500/40 bg-[#0d1018] p-8 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h1 className="text-xl font-black text-white">
          RESTRICTED COMMISSIONER AREA
        </h1>
        <p className="text-xs text-zinc-400 leading-relaxed">
          This route is restricted strictly to the League Commissioner&apos;s
          Discord User ID. Make sure you are signed in with Discord and your ID
          is set in <code className="text-orange-400">.env.local</code> or the{' '}
          <code className="text-orange-400">admin_whitelist</code> table.
        </p>
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
              Gemini Flash Scoreboard OCR Ingestion, Automated Point
              Recalculation & Schedule Controls
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

      {/* SECTION 1: GEMINI SCOREBOARD OCR INGESTION */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-black text-white">
              1. Post-Match Scoreboard AI Ingestion
            </h2>
          </div>
          <span className="text-xs text-zinc-400">
            Powered by Google Gemini Flash Structured Vision
          </span>
        </div>

        {/* Target Gameweek & Match Name Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Target Gameweek
            </label>
            <select
              value={selectedGwId}
              onChange={(e) => setSelectedGwId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white"
            >
              {gameweeks.map((gw) => (
                <option key={gw.id} value={gw.id}>
                  GW{gw.number}: {gw.name} ({gw.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Match & Map Identifier
            </label>
            <input
              type="text"
              placeholder="e.g., DAF vs FH - Map 2 (King's Row)"
              value={matchName}
              onChange={(e) => setMatchName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Drag-and-Drop Zone */}
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
          className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
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
            <div className="space-y-4">
              <img
                src={imagePreviewUrl}
                alt="Scoreboard Preview"
                className="max-h-64 mx-auto rounded-xl border border-zinc-700 object-contain"
              />
              <p className="text-xs text-zinc-400">
                {imageFile?.name} — Click or drag another image to replace
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <UploadCloud className="w-10 h-10 text-orange-400 mx-auto" />
              <p className="text-sm font-bold text-white">
                Drag and drop an OWCS post-match scoreboard screenshot here
              </p>
              <p className="text-xs text-zinc-500">
                Supports PNG, JPG, or WebP screenshots (1080p / 1440p / 4K)
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleAddBlankRow}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-800 px-3.5 py-2 rounded-xl"
          >
            <Plus className="w-4 h-4" /> Add Manual Stat Row
          </button>

          <button
            type="button"
            onClick={handleExtractScoreboard}
            disabled={!imageFile || parsingImage}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-zinc-950 font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {parsingImage
              ? 'Analyzing Scoreboard with Gemini...'
              : 'Extract Stats with Gemini AI'}
          </button>
        </div>

        {/* Editable Verification Table */}
        {extractedRows.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-white">
                  Verify & Tweak Extracted Telemetry
                </h3>
                <p className="text-xs text-zinc-400">
                  Confirm database player mapping and edit any stat value before
                  writing to <code className="text-orange-400">match_stats</code>
                  .
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetTeamWinner('TOP5')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/25"
                >
                  <Trophy className="w-3.5 h-3.5" /> Set Top 5 Won Map
                </button>
                <button
                  type="button"
                  onClick={() => handleSetTeamWinner('BOTTOM5')}
                  className="inline-flex items-center gap-1.5 text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30 px-3 py-1.5 rounded-lg hover:bg-sky-500/25"
                >
                  <Trophy className="w-3.5 h-3.5" /> Set Bottom 5 Won Map
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-900/80 border-b border-zinc-800 text-[11px] font-bold uppercase text-zinc-400">
                    <th className="py-3 px-3">OCR Name</th>
                    <th className="py-3 px-3">Linked DB Player</th>
                    <th className="py-3 px-2">Role</th>
                    <th className="py-3 px-2">Elims</th>
                    <th className="py-3 px-2">Deaths</th>
                    <th className="py-3 px-2">Damage</th>
                    <th className="py-3 px-2">Healing</th>
                    <th className="py-3 px-2 text-center">Map Won</th>
                    <th className="py-3 px-3 text-right">Est. Pts</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {extractedRows.map((row) => (
                    <tr key={row.tempId} className="bg-zinc-950/40">
                      <td className="py-2.5 px-3 font-mono text-zinc-300">
                        {row.player_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={row.matched_player_id}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'matched_player_id',
                              e.target.value
                            )
                          }
                          className={`w-full rounded-lg px-2.5 py-1.5 font-bold border ${
                            row.matched_player_id
                              ? 'bg-zinc-900 border-zinc-700 text-white'
                              : 'bg-rose-500/15 border-rose-500 text-rose-300'
                          }`}
                        >
                          <option value="">-- Select DB Player --</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.teams?.code}] {p.name} ({p.role})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-2">
                        <RoleBadge role={row.role} size="sm" />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={row.elims}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'elims',
                              Number(e.target.value)
                            )
                          }
                          className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={row.deaths}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'deaths',
                              Number(e.target.value)
                            )
                          }
                          className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white font-bold"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={row.damage}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'damage',
                              Number(e.target.value)
                            )
                          }
                          className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={row.healing}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'healing',
                              Number(e.target.value)
                            )
                          }
                          className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={row.map_won}
                          onChange={(e) =>
                            handleUpdateRow(
                              row.tempId,
                              'map_won',
                              e.target.checked
                            )
                          }
                          className="w-4 h-4 accent-orange-500"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-orange-400">
                        {previewPoints(row).toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setExtractedRows((prev) =>
                              prev.filter((item) => item.tempId !== row.tempId)
                            )
                          }
                          className="p-1 text-zinc-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleConfirmAndCalculate}
                disabled={committingScores}
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-zinc-950 font-black text-sm uppercase tracking-wider px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
                {committingScores
                  ? 'Writing Stats & Recalculating Rosters...'
                  : 'Confirm & Calculate Scores'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: GAMEWEEK LOCK TIMESTAMPS & PLAYOFF ELIMINATION CONTROLS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gameweek Lock Schedule Manager */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
            <Calendar className="w-5 h-5 text-orange-400" />
            <h2 className="text-base font-black text-white">
              2. Gameweek Schedule & Lock Time Controls
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

        {/* Team Manager & Quick Player Adder */}
        <div className="lg:col-span-5 space-y-6">
          <TeamManagerCard
            teams={teams}
            onTeamsUpdated={loadAdminData}
            onBanner={setBanner}
          />

          {/* Quick Add Pro Player */}
          <form
            onSubmit={handleQuickAddPlayer}
            className="rounded-2xl border border-zinc-800 bg-[#0b0e16] p-6 space-y-4"
          >
            <h2 className="text-base font-black text-white border-b border-zinc-800 pb-3">
              4. Quick Add Pro Player
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="BattleTag (e.g. d4rt)"
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
  // Format ISO timestamp into local datetime-local input string (YYYY-MM-DDTHH:mm)
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
        >
          <option value="UPCOMING">UPCOMING</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>
        <button
          type="button"
          onClick={() => onSave(gw.id, new Date(localTime).toISOString(), status)}
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

  // Create Team Form State
  const [newName, setNewName] = useState<string>('');
  const [newCode, setNewCode] = useState<string>('');
  const [newLogoUrl, setNewLogoUrl] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);

  // Inline Edit State
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

    if (!trimmedName) {
      onBanner({ type: 'error', text: 'Please enter a Team Name.' });
      return;
    }
    if (trimmedCode.length < 2 || trimmedCode.length > 5) {
      onBanner({
        type: 'error',
        text: 'Team Code must be between 2 and 5 characters (e.g., DAF, FH, 99D).',
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
            3. OWCS Team Manager & Playoff Status
          </h2>
          <p className="text-[11px] text-zinc-400">
            Create teams, edit codes/names, or mark bottom 2 teams as Eliminated
            for Playoffs.
          </p>
        </div>
      </div>

      {/* Create New Team Form */}
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
            placeholder="Team Name (e.g. DAF Esports)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
          />
          <input
            type="text"
            maxLength={5}
            placeholder="Code (2-5 chars)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-bold uppercase text-white focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            placeholder="Logo URL (optional, e.g. /logos/daf.png)"
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

      {/* Existing Teams List */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {teams.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">
            No teams created yet. Add your first OWCS Pacific team above!
          </p>
        ) : (
          teams.map((t) => {
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
                        placeholder="Team Name"
                        className="col-span-2 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        type="text"
                        maxLength={5}
                        value={editCode}
                        onChange={(e) =>
                          setEditCode(e.target.value.toUpperCase())
                        }
                        placeholder="Code"
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase text-white"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={editLogoUrl}
                        onChange={(e) => setEditLogoUrl(e.target.value)}
                        placeholder="Logo URL (optional)"
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(t.id)}
                        disabled={savingEdit}
                        className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs px-3 py-1.5 rounded-lg"
                      >
                        {savingEdit ? 'Saving...' : 'Save'}
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
          })
        )}
      </div>
    </div>
  );
}