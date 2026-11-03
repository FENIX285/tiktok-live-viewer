import { extractAvatarUrl } from "./eulerSocket";

export interface GiftRecordRef {
  coins: number;
  giftName?: string;
  timestamp?: number;
}

export interface ContributorBreakdown {
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  score: number;
  baseCoins: number;     // 🪙 Monedas Base: Puntos por regalos estándar
  bonusPoints: number;   // ⚡ Multiplicadores / Guante: Puntos extra (x2/x3 o golpe crítico)
  tapsPoints: number;    // 👆 Taps: Puntos por toques de pantalla (máximo 3 por usuario sin regalos)
  rank?: number;
}

/**
 * Correlates a user's total battle score with their gift event history
 * to separate Monedas Base, Bonus (Multiplicadores/Guante), and Taps.
 */
export function correlateUserScoreWithGifts(
  score: number,
  giftHistory?: GiftRecordRef[]
): { baseCoins: number; bonusPoints: number; tapsPoints: number } {
  if (!score || score <= 0) {
    return { baseCoins: 0, bonusPoints: 0, tapsPoints: 0 };
  }

  const recordedCoins = giftHistory && giftHistory.length > 0
    ? giftHistory.reduce((sum, g) => sum + (g.coins || 0), 0)
    : 0;

  if (recordedCoins === 0) {
    // Sin regalos asociados: hasta 3 taps por usuario, el resto bonus
    const tapsPoints = Math.min(score, 3);
    const bonusPoints = Math.max(0, score - tapsPoints);
    return {
      baseCoins: 0,
      bonusPoints,
      tapsPoints,
    };
  } else {
    // Con regalos asociados
    const baseCoins = Math.min(score, recordedCoins);
    const bonusPoints = Math.max(0, score - baseCoins);
    const tapsPoints = 0;
    return {
      baseCoins,
      bonusPoints,
      tapsPoints,
    };
  }
}

/**
 * Parses linkMicArmies event data and maps contributors for each streamer anchor ID.
 */
export function parseLinkMicArmiesContributors(
  data: any,
  giftersMap: Record<string, { history?: GiftRecordRef[]; totalCoins?: number }>
): Map<string, ContributorBreakdown[]> {
  const result = new Map<string, ContributorBreakdown[]>();
  if (!data || typeof data !== "object") return result;

  // TikTok linkMicArmies event sources
  const armytSources = [
    data.armies,
    data.teamArmies,
    data.team_armies,
    data.battleGroups,
    data.teams,
    data.battleItems,
    data.userArmies,
    data.ranks
  ];

  const processArmyList = (armies: any[]) => {
    if (!Array.isArray(armies)) return;

    armies.forEach((army: any) => {
      if (!army || typeof army !== "object") return;

      const hostId = (
        army.anchorIdStr ??
        army.anchorId ??
        army.userIdStr ??
        army.userId ??
        army.hostUserId ??
        army.hostId ??
        army.hostGroup ??
        army.id ??
        ""
      ).toString();

      const rawContributors = (
        army.contributors ||
        army.contributorsList ||
        army.userArmies ||
        army.ranks ||
        army.users ||
        army.members ||
        []
      );

      if (!Array.isArray(rawContributors)) return;

      const parsedContributors: ContributorBreakdown[] = [];

      rawContributors.forEach((c: any, index: number) => {
        if (!c || typeof c !== "object") return;

        const uObj = c.user || c.userInfo || c.user_info || c;
        const uId = (
          uObj.userIdStr ||
          uObj.userId ||
          uObj.id_str ||
          uObj.id ||
          uObj.uniqueId ||
          uObj.secUid ||
          c.userId ||
          `user_${index}`
        ).toString();

        const uniqueId = (
          uObj.uniqueId ||
          uObj.unique_id ||
          uObj.displayId ||
          uObj.display_id ||
          uId
        ).toString();

        const nickname = (
          uObj.nickname ||
          uObj.nick_name ||
          uniqueId ||
          "MVP"
        ).toString();

        const avatarUrl = extractAvatarUrl(uObj);

        const score = Number(
          c.score ??
          c.points ??
          c.coinCount ??
          c.giftScore ??
          c.value ??
          0
        );

        // Find matching gift history from giftersMap
        const gifterRecord = giftersMap[uId] || giftersMap[uniqueId] || Object.values(giftersMap).find(
          (g: any) => g.uniqueId?.toLowerCase() === uniqueId.toLowerCase()
        );

        const history = gifterRecord?.history || [];
        const breakdown = correlateUserScoreWithGifts(score, history);

        parsedContributors.push({
          userId: uId,
          uniqueId: uniqueId,
          nickname: nickname,
          profilePictureUrl: avatarUrl,
          score: score,
          baseCoins: breakdown.baseCoins,
          bonusPoints: breakdown.bonusPoints,
          tapsPoints: breakdown.tapsPoints,
          rank: index + 1
        });
      });

      // Sort contributors by total score descending
      parsedContributors.sort((a, b) => b.score - a.score);
      // Assign ranks 1..N
      parsedContributors.forEach((c, idx) => { c.rank = idx + 1; });

      if (hostId) {
        result.set(hostId.toLowerCase(), parsedContributors);
      }
    });
  };

  for (const src of armytSources) {
    if (Array.isArray(src)) {
      processArmyList(src);
    } else if (src && typeof src === "object") {
      processArmyList(Object.values(src));
    }
  }

  return result;
}

/**
 * Generates sample contributors for demo/testing when live WebSocket data is quiet.
 */
export function generateSampleContributors(
  streamerName: string,
  streamerScore: number
): ContributorBreakdown[] {
  if (!streamerScore || streamerScore <= 0) return [];

  const sampleUsers = [
    { name: "ApexGifter", id: "apex_99", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80" },
    { name: "CyberDragon", id: "dragon_mvp", avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80" },
    { name: "LunaStar", id: "luna_sparkle", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80" },
    { name: "ViperKing", id: "viper_striker", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80" },
    { name: "NovaGlow", id: "nova_live", avatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&auto=format&fit=crop&q=80" },
    { name: "TitanTap", id: "titan_tapper", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" },
    { name: "MysticGlove", id: "mystic_glove", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80" },
    { name: "BlazeShield", id: "blaze_shield", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80" },
    { name: "EchoRunner", id: "echo_run", avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80" },
    { name: "QuantumTap", id: "q_tap_master", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80" },
  ];

  let remaining = streamerScore;
  const count = Math.min(sampleUsers.length, streamerScore > 1000 ? 10 : streamerScore > 100 ? 6 : 3);
  const result: ContributorBreakdown[] = [];

  for (let i = 0; i < count; i++) {
    const user = sampleUsers[i];
    let share = 0;
    if (i === count - 1) {
      share = remaining;
    } else {
      share = Math.max(1, Math.floor(remaining * (0.45 / (i * 0.5 + 1))));
      remaining -= share;
    }

    if (share <= 0) continue;

    // Simulate realistic breakdown:
    let baseCoins = 0;
    let bonusPoints = 0;
    let tapsPoints = 0;

    if (share <= 3) {
      tapsPoints = share;
    } else {
      // e.g. 60% base coins, 40% speed challenge glove multipliers
      baseCoins = Math.floor(share * 0.65);
      bonusPoints = share - baseCoins;
    }

    result.push({
      userId: `user_${user.id}`,
      uniqueId: user.id,
      nickname: user.name,
      profilePictureUrl: user.avatar,
      score: share,
      baseCoins: baseCoins,
      bonusPoints: bonusPoints,
      tapsPoints: tapsPoints,
      rank: i + 1,
    });
  }

  return result.sort((a, b) => b.score - a.score);
}
