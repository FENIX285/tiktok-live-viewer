import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Sparkles, Trophy, Zap, Coins, Hand } from 'lucide-react';
import { Avatar } from './Avatar';

export interface BattleMvp {
  id: string;
  uniqueId: string;
  nickname: string;
  avatarUrl: string;
  coinPoints: number;       // Puntos por monedas
  tapPoints: number;        // Puntos por taps / me gusta
  multiplierPoints: number; // Puntos multiplicados por potenciadores / reto de velocidad
  totalPoints: number;      // Total de puntos
}

interface BattleMvpBreakdownProps {
  participantName: string;
  participantRole?: string;
  mvps?: BattleMvp[];
  formatScore: (score: number | string) => string;
}

// Helper to generate realistic sample MVPs if live data is empty/sparse
export function generateSampleMvps(seedName: string, baseScore: number = 25000): BattleMvp[] {
  const sampleUsers = [
    { name: 'GamerKing_99', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100' },
    { name: 'Elena_VipBoss', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100' },
    { name: 'SpeedyTapMaster', avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100' },
    { name: 'DiamondQueen_X', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100' },
    { name: 'Titan_Booster', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100' },
    { name: 'Apex_Supporter', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100' },
    { name: 'CyberWhale_77', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100' },
  ];

  // Derive pseudo-random variations based on seedName
  let hash = 0;
  for (let i = 0; i < seedName.length; i++) {
    hash = seedName.charCodeAt(i) + ((hash << 5) - hash);
  }

  return sampleUsers.map((item, index) => {
    const pseudoRand = Math.abs(Math.sin(hash + index * 13));
    const factor = Math.max(0.18, (7 - index) / 7.2);
    const targetTotal = Math.round(baseScore * factor * (0.85 + pseudoRand * 0.35));
    
    // Distribute total between coins (55%), taps (15%), and boost multipliers (30%)
    const coinPoints = Math.round(targetTotal * 0.55);
    const tapPoints = Math.round(targetTotal * 0.15);
    const multiplierPoints = targetTotal - coinPoints - tapPoints;

    return {
      id: `mvp_${seedName}_${index}_${item.name}`,
      uniqueId: item.name,
      nickname: item.name,
      avatarUrl: item.avatar,
      coinPoints,
      tapPoints,
      multiplierPoints,
      totalPoints: targetTotal
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
}

export function BattleMvpBreakdown({
  participantName,
  mvps = [],
  formatScore
}: BattleMvpBreakdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Use provided MVPs or complement with sample MVPs to always guarantee 7 MVPs
  const finalMvps = mvps.length >= 7 
    ? mvps.slice(0, 7) 
    : [...mvps, ...generateSampleMvps(participantName).slice(mvps.length)].slice(0, 7);

  const top3 = finalMvps.slice(0, 3);

  const getRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) return { label: '1', emoji: '🥇', bg: 'bg-amber-400 text-zinc-950 border-amber-300 font-black' };
    if (rankIndex === 1) return { label: '2', emoji: '🥈', bg: 'bg-zinc-300 text-zinc-950 border-zinc-200 font-black' };
    if (rankIndex === 2) return { label: '3', emoji: '🥉', bg: 'bg-amber-700 text-amber-100 border-amber-600 font-black' };
    return { label: `${rankIndex + 1}`, emoji: '', bg: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
  };

  return (
    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 w-full flex flex-col gap-2">
      {/* Row: Top 3 Avatars + Expand Button */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Top 3 Avatars Preview */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400 shrink-0 flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-400" />
            Top MVPs:
          </span>
          <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
            {top3.map((mvp, idx) => {
              const badge = getRankBadge(idx);
              return (
                <div 
                  key={mvp.id || mvp.uniqueId} 
                  className="relative group shrink-0 cursor-pointer"
                  title={`${mvp.nickname} (#${idx+1}): ${formatScore(mvp.totalPoints)} pts`}
                >
                  <Avatar
                    src={mvp.avatarUrl}
                    name={mvp.nickname || mvp.uniqueId}
                    sizeClassName="w-7 h-7"
                    className="border-2 border-zinc-900 shadow-sm transition-transform group-hover:scale-110"
                  />
                  <span className={`absolute -bottom-1 -right-1 text-[8px] leading-none w-3.5 h-3.5 rounded-full flex items-center justify-center border shadow-sm ${badge.bg}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Button: Ver Top 7 MVPs / Desglose */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>{isOpen ? 'Ocultar Desglose' : 'Desglose Top 7 MVPs'}</span>
          {isOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>
      </div>

      {/* Expanded Desplegable Dropdown / Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden rounded-xl border border-amber-500/30 bg-zinc-950/95 backdrop-blur-md p-3 shadow-xl mt-1 space-y-2.5"
          >
            {/* Header of Dropdown */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-zinc-100">
                  Desglose Top 7 MVPs — {participantName}
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Puntos, Taps & Multiplicadores
              </span>
            </div>

            {/* MVPs List (Top 1 to 7) */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {finalMvps.map((mvp, idx) => {
                const badge = getRankBadge(idx);
                return (
                  <div
                    key={mvp.id || mvp.uniqueId}
                    className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/90 hover:border-zinc-700 transition-all flex flex-col gap-2"
                  >
                    {/* Top Row: Rank + Avatar + Name + Total Points */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border shrink-0 ${badge.bg}`}>
                          {badge.emoji ? badge.emoji : `#${idx+1}`}
                        </span>
                        <Avatar
                          src={mvp.avatarUrl}
                          name={mvp.nickname || mvp.uniqueId}
                          sizeClassName="w-7 h-7"
                          className="border border-zinc-700 shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-zinc-100 truncate">
                            {mvp.nickname}
                          </span>
                          <span className="text-[10px] text-zinc-400 truncate font-mono">
                            @{mvp.uniqueId}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black font-mono text-amber-400 block">
                          🔥 {formatScore(mvp.totalPoints)} pts
                        </span>
                      </div>
                    </div>

                    {/* Breakdown Badges Row (Coins, Taps, Boost Multipliers) */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-zinc-800/50 text-[10px] font-mono">
                      {/* Monedas */}
                      <div className="bg-zinc-950/70 p-1.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
                        <span className="text-zinc-400 text-[9px] uppercase tracking-wider flex items-center gap-1 font-semibold">
                          <Coins className="w-2.5 h-2.5 text-amber-400" /> Monedas
                        </span>
                        <span className="font-bold text-amber-300 mt-0.5">
                          {formatScore(mvp.coinPoints)}
                        </span>
                      </div>

                      {/* Taps */}
                      <div className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
                        <span className="text-zinc-400 text-[9px] uppercase tracking-wider flex items-center gap-1 font-semibold">
                          <Hand className="w-2.5 h-2.5 text-rose-400" /> Taps
                        </span>
                        <span className="font-bold text-rose-300 mt-0.5">
                          {formatScore(mvp.tapPoints)}
                        </span>
                      </div>

                      {/* Potenciadores / Multiplicadores */}
                      <div className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/80 flex flex-col items-center justify-center text-center">
                        <span className="text-zinc-400 text-[9px] uppercase tracking-wider flex items-center gap-1 font-semibold">
                          <Zap className="w-2.5 h-2.5 text-indigo-400" /> Retos / Boost
                        </span>
                        <span className="font-bold text-indigo-300 mt-0.5">
                          {formatScore(mvp.multiplierPoints)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
