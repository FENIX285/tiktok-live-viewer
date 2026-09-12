// TikTok gift database & pricing resolver
// Differentiates between 'Rose' (1 coin) vs 'Rosa' (10 coins), 'Doughnut' (30 coins), etc.

export interface GiftMetadata {
  name: string;
  coins: number;
}

export const KNOWN_TIKTOK_GIFTS: Record<string, number> = {
  // 1 Coin gifts
  "rose": 1,
  "tiktok": 1,
  "heart": 1,
  "ice cream cone": 1,
  "finger heart": 5,
  "panda": 5,
  "mic": 5,
  "hi": 5,
  "love you": 5,
  "cotton candy": 10,
  "rosa": 10, // Specifically 'Rosa' (10 coins) vs 'Rose' (1 coin)
  "confetti": 100,
  "doughnut": 30,
  "donut": 30,
  "dona": 30,
  "rosquilla": 30,
  "butterfly": 169,
  "sunglasses": 199,
  "heart me": 1,
  "mini speaker": 1,
  "little crown": 99,
  "paper crane": 99,
  "corgi": 299,
  "duck": 199,
  "cap": 99,
  "money gun": 500,
  "swan": 699,
  "train": 899,
  "travel with you": 999,
  "whale diving": 2150,
  "galaxy": 1000,
  "tiktok universe": 34999,
  "lion": 29999,
  "leon": 29999,
  "sports car": 7000,
  "auto deportivo": 7000,
  "fireworks": 1088,
  "interstellar": 10000,
  "dragon": 26999,
  "phoenix": 25999,
  "falcon": 10999,
  "castle": 20000,
  "planet": 15000,
  "boxing gloves": 299,
  "guantes de boxeo": 299,
  "crown": 9999,
  "corona": 9999,
  "perfume": 20,
  "star": 99,
  "estrella": 99,
  "disco ball": 1000,
  "weights": 1,
  "weights / pesas": 1,
  "pesas": 1,
  "football": 1,
  "futbol": 1,
  "tennis": 1,
  "coffee": 1,
  "cafe": 1,
  "lollipop": 10,
  "paleta": 10,
  "chupetin": 10,
};

export function resolveGiftCoins(giftName: string, rawCoins?: number): number {
  if (rawCoins && rawCoins > 0) {
    // If rawCoins is 1, but the gift is a known higher value gift like Doughnut (30) or Rosa (10),
    // verify if rawCoins was just a default fallback (1)
    const normalized = (giftName || "").trim().toLowerCase();
    const exactName = (giftName || "").trim();
    
    // Exact match for "Rosa" vs "Rose"
    if (exactName === "Rosa") {
      return 10;
    }
    if (exactName.toLowerCase() === "rose") {
      return 1;
    }

    if (KNOWN_TIKTOK_GIFTS[normalized] && rawCoins === 1 && KNOWN_TIKTOK_GIFTS[normalized] > 1) {
      return KNOWN_TIKTOK_GIFTS[normalized];
    }
    return rawCoins;
  }

  const normalized = (giftName || "").trim().toLowerCase();
  const exactName = (giftName || "").trim();
  
  if (exactName === "Rosa") {
    return 10;
  }
  if (exactName.toLowerCase() === "rose") {
    return 1;
  }

  if (KNOWN_TIKTOK_GIFTS[normalized]) {
    return KNOWN_TIKTOK_GIFTS[normalized];
  }

  return 1;
}
