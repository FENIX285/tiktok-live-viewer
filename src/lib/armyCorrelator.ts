/**
 * Helper to process WebcastLinkMicArmies event and correlate user battle scores
 * with gift and tap history to derive Base Coins, Multipliers/Glove, and Taps breakdown.
 */

export interface RawArmyContributor {
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  profilePictureUrl?: string;
  avatarUrl?: string;
  score: number;
}

export interface ContributorBreakdown {
  rank: number;
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  totalScore: number;
  baseCoins: number;       // 🪙 Monedas Base: Puntos por regalos estándar
  multiplierBonus: number; // ⚡ Multiplicadores / Guante: Puntos extra por Speed Challenge (x2/x3) o Golpe Crítico
  tapsCoins: number;       // 👆 Taps: Puntos por toques de pantalla (máx 3 por usuario sin regalos)
  percentages: {
    base: number;
    multiplier: number;
    taps: number;
  };
}

export interface StreamerArmyContributors {
  streamerId: string;
  streamerName: string;
  totalArmyScore: number;
  contributors: ContributorBreakdown[];
}

/**
 * Correlates a list of raw contributors from linkMicArmies with gift & tap histories.
 * Calculates automatically: Monedas Base, Multiplicadores/Guante y Taps.
 */
export function correlateArmyContributors(
  rawContributors: RawArmyContributor[],
  giftersMap: Record<string, { totalCoins?: number; history?: Array<{ coins: number; isCombo?: boolean }> }> = {},
  likersMap: Record<string, { likes?: number }> = {}
): ContributorBreakdown[] {
  if (!rawContributors || rawContributors.length === 0) return [];

  const parsed = rawContributors.map((c, index) => {
    const key = (c.userId || c.uniqueId || `user_${index}`).toString();
    const uniqueId = (c.uniqueId || c.userId || `user_${index}`).toString();
    const nickname = c.nickname || c.uniqueId || `User ${index + 1}`;
    const avatar = c.profilePictureUrl || c.avatarUrl || '';
    const totalScore = Number(c.score || 0);

    // Look up gift record for base coins calculation
    const gifterData = giftersMap[key] || giftersMap[uniqueId] || Object.values(giftersMap).find(
      (g: any) => g.uniqueId?.toLowerCase() === uniqueId.toLowerCase()
    );

    // Look up likes/taps
    const likerData = likersMap[key] || likersMap[uniqueId] || Object.values(likersMap).find(
      (l: any) => l.uniqueId?.toLowerCase() === uniqueId.toLowerCase()
    );

    let recordedLikes = likerData?.likes ?? 0;
    
    // Taps logic: Max 3 points for screen taps per user without gifts, or up to 3 pts
    let baseCoins = 0;
    let tapsCoins = 0;
    let multiplierBonus = 0;

    if (totalScore <= 0) {
      return {
        rank: index + 1,
        userId: key,
        uniqueId,
        nickname,
        profilePictureUrl: avatar,
        totalScore: 0,
        baseCoins: 0,
        multiplierBonus: 0,
        tapsCoins: 0,
        percentages: { base: 0, multiplier: 0, taps: 0 }
      };
    }

    if (gifterData && (gifterData.totalCoins || 0) > 0) {
      // User sent gifts
      const userTotalCoins = gifterData.totalCoins || 0;
      
      // Calculate taps: user gets min(3, likes)
      tapsCoins = Math.min(3, recordedLikes);
      
      // Calculate base coins: cannot exceed totalScore minus taps
      const remainingForGifts = Math.max(0, totalScore - tapsCoins);
      baseCoins = Math.min(userTotalCoins, remainingForGifts);

      // Multipliers / Glove bonus: Any excess score over base gift coins + taps
      multiplierBonus = Math.max(0, totalScore - baseCoins - tapsCoins);
    } else {
      // User has no gifts recorded in history
      if (totalScore <= 3) {
        // 1 to 3 points without gifts are 100% screen taps
        tapsCoins = totalScore;
        baseCoins = 0;
        multiplierBonus = 0;
      } else {
        // Higher score without recorded gifts (e.g. from live stream events or speed boost)
        tapsCoins = Math.min(3, Math.max(1, recordedLikes));
        // Distribute remaining: ~70% base gifts, ~30% multiplier/bonus
        const remaining = totalScore - tapsCoins;
        baseCoins = Math.floor(remaining * 0.7);
        multiplierBonus = remaining - baseCoins;
      }
    }

    // Sanity adjustment: ensure sum equals totalScore
    const currentSum = baseCoins + multiplierBonus + tapsCoins;
    if (currentSum !== totalScore) {
      const diff = totalScore - currentSum;
      if (diff > 0) {
        multiplierBonus += diff;
      } else if (diff < 0) {
        if (baseCoins >= Math.abs(diff)) {
          baseCoins += diff;
        } else {
          baseCoins = 0;
          multiplierBonus = Math.max(0, totalScore - tapsCoins);
        }
      }
    }

    // Calculate exact percentage breakdown
    const pctBase = totalScore > 0 ? (baseCoins / totalScore) * 100 : 0;
    const pctMultiplier = totalScore > 0 ? (multiplierBonus / totalScore) * 100 : 0;
    const pctTaps = totalScore > 0 ? (tapsCoins / totalScore) * 100 : 0;

    return {
      rank: index + 1,
      userId: key,
      uniqueId,
      nickname,
      profilePictureUrl: avatar,
      totalScore,
      baseCoins,
      multiplierBonus,
      tapsCoins,
      percentages: {
        base: Math.round(pctBase * 10) / 10,
        multiplier: Math.round(pctMultiplier * 10) / 10,
        taps: Math.round(pctTaps * 10) / 10
      }
    };
  });

  // Sort descending by total score
  parsed.sort((a, b) => b.totalScore - a.totalScore);

  // Re-assign rank numbers
  return parsed.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/**
 * Extract contributors for all streamers from a WebcastLinkMicArmies / battle event
 */
export function processLinkMicArmiesEvent(
  eventData: any,
  giftersMap: Record<string, any> = {},
  likersMap: Record<string, any> = {}
): Record<string, ContributorBreakdown[]> {
  const result: Record<string, ContributorBreakdown[]> = {};
  if (!eventData) return result;

  // 1. Check if battleItems or armies exists
  const armList = eventData.armies || eventData.battleArmies || eventData.battleItems;
  if (armList && typeof armList === 'object') {
    Object.entries(armList).forEach(([streamerKey, armyData]: [string, any]) => {
      const rawList = armyData?.userArmies || armyData?.contributors || armyData?.list || armyData?.users || [];
      if (Array.isArray(rawList)) {
        const rawContributors: RawArmyContributor[] = rawList.map((u: any) => ({
          userId: (u.user?.userId || u.userId || u.id || '').toString(),
          uniqueId: (u.user?.uniqueId || u.user?.displayId || u.uniqueId || u.displayId || '').toString(),
          nickname: (u.user?.nickname || u.nickname || u.user?.uniqueId || '').toString(),
          profilePictureUrl: u.user?.avatarThumb?.urlList?.[0] || u.profilePictureUrl || u.avatarUrl || '',
          score: Number(u.score || u.points || u.coins || 0)
        }));
        result[streamerKey] = correlateArmyContributors(rawContributors, giftersMap, likersMap);
      }
    });
  }

  // 2. Check teamArmies structure
  if (Array.isArray(eventData.teamArmies)) {
    eventData.teamArmies.forEach((team: any, tIdx: number) => {
      const teamUsers = team.teamUsers || team.users || [];
      if (Array.isArray(teamUsers)) {
        teamUsers.forEach((tu: any) => {
          const streamerId = (tu.userIdStr || tu.userId || tu.hostId || `streamer_${tIdx}`).toString();
          const userArmies = tu.userArmies || tu.contributors || tu.armies || [];
          if (Array.isArray(userArmies)) {
            const rawContributors: RawArmyContributor[] = userArmies.map((u: any) => ({
              userId: (u.user?.userId || u.userId || u.id || '').toString(),
              uniqueId: (u.user?.uniqueId || u.user?.displayId || u.uniqueId || u.displayId || '').toString(),
              nickname: (u.user?.nickname || u.nickname || u.user?.uniqueId || '').toString(),
              profilePictureUrl: u.user?.avatarThumb?.urlList?.[0] || u.profilePictureUrl || u.avatarUrl || '',
              score: Number(u.score || u.points || u.coins || 0)
            }));
            result[streamerId] = correlateArmyContributors(rawContributors, giftersMap, likersMap);
          }
        });
      }
    });
  }

  return result;
}
