export interface ActiveGlove {
  id: string;
  activatedByUserId: string; // User ID or Unique ID of person who activated it
  activatedByName: string;   // Nickname or username
  activatedByAvatar: string; // Avatar URL
  targetUserId: string;      // Participant in battle receiving the glove multiplier
  multiplier: number;        // Multiplier value (e.g. 5 for x5 glove)
  durationSeconds: number;   // Duration in seconds (default 30s)
  expiresAt: number;         // Timestamp in ms when glove expires
  stackCount?: number;       // How many gloves are currently active/stacked (e.g., x2, x3 gloves)
}

export interface SpeedChallenge {
  id: string;
  title: string;             // e.g., "Reto de Velocidad" / "Speed Challenge"
  durationSeconds: number;   // Duration (e.g., 30s or 60s)
  expiresAt: number;         // Timestamp in ms when challenge ends
  targetScore?: number;      // Goal points
  rewardText?: string;       // e.g. "Puntos x2" or "Bono de Victoria"
  active: boolean;
  activatedByName?: string;  // Avatar/Name who initiated it if applicable
  activatedByAvatar?: string;
  team1Goal?: number;
  team2Goal?: number;
  winnerTeamId?: number;
}

export type BattleMode = '1v1' | '2v1' | '1v2' | '2v2' | '3v1' | '1v3' | '1v1v1' | '1v1v1v1';

export type BattleResult = 
  | "In Progress" 
  | "Victory" 
  | "Defeat" 
  | "Draw" 
  | "Interrupted" 
  | "En curso" 
  | "Victoria" 
  | "Derrota" 
  | "Empate" 
  | "Interrumpido";

export interface BattleUser {
  userId: string;
  originalKey?: string;
  displayId: string;
  nickname?: string;
  profilePictureUrl?: string;
  score: number;
  teamId?: number; // 0 for Host/Team 1, 1 for Rival/Team 2, 2/3 for FFA
}

export interface BattleHistory {
  battleId: string;
  startTime: number;
  type: BattleMode | string;
  users: BattleUser[];
  result: BattleResult;
  duration?: number;
  startTimeMs?: number;
  speedChallenge?: SpeedChallenge | null;
  gloves?: ActiveGlove[];
}
