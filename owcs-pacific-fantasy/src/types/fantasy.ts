export type PlayerRole = 'TANK' | 'DPS' | 'SUPPORT';
export type GameweekStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED';

export interface Profile {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  is_eliminated: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  name: string;
  role: PlayerRole;
  price: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
  teams?: Team; // Joined team relation
}

export interface Gameweek {
  id: string;
  number: number;
  name: string;
  lock_time: string;
  is_playoffs: boolean;
  status: GameweekStatus;
  created_at: string;
}

export interface UserRoster {
  id: string;
  user_id: string;
  gameweek_id: string;
  tank_id: string | null;
  dps1_id: string | null;
  dps2_id: string | null;
  sup1_id: string | null;
  sup2_id: string | null;
  captain_id: string | null;
  points_earned: number;
  transfers_used: number;
  created_at: string;
  updated_at: string;
}

export interface MatchStat {
  id: string;
  gameweek_id: string;
  player_id: string;
  match_name: string;
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

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  gw_points: number;
  total_points: number;
}

export interface PlayerSeasonStat {
  player_id: string;
  player_name: string;
  role: PlayerRole;
  price: number;
  is_active: boolean;
  team_id: string;
  team_name: string;
  team_code: string;
  is_eliminated: boolean;
  maps_played: number;
  total_elims: number;
  total_deaths: number;
  total_damage: number;
  total_healing: number;
  maps_won: number;
  total_fantasy_points: number;
  avg_points_per_map: number;
}

export interface ExtractedScoreboardRow {
  player_name: string;
  role: PlayerRole;
  elims: number;
  deaths: number;
  damage: number;
  healing: number;
  map_won: boolean;
}

export interface Profile {
  id: string;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  personal_budget: number;
  created_at: string;
}

export interface Fixture {
  id: string;
  gameweek_id: string;
  team_a: string;
  team_b: string;
  match_time: string;
  created_at: string;
  team_a_team?: Team;
  team_b_team?: Team;
  gameweeks?: Gameweek;
}

export interface PriceChangeRow {
  out_player_id: string;
  out_player_name: string;
  out_team_code: string;
  out_old_price: number;
  out_gw_points: number;
  out_expected_score: number;
  out_difference: number;
  out_price_delta: number;
  out_new_price: number;
}