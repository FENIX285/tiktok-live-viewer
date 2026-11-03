import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Trophy, Zap, Coins, Hand, Sparkles } from 'lucide-react';
import { Avatar } from './Avatar';
import { ContributorBreakdown } from '../lib/armyCorrelator';

interface StreamerContributorsProps {
  streamerName: string;
  contributors: ContributorBreakdown[];
  compact?: boolean;
}

const formatPoints = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace('.', ',') + 'k';
  return num.toLocaleString();
};

export const StreamerContributors: React.FC<StreamerContributorsProps> = ({
  streamerName,
  contributors,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!contributors || contributors.length === 0) {
    return (
      <div className="mt-2.5 p-2 bg-zinc-950/40 rounded-lg border border-zinc-800/40 text-center text-xs text-zinc-500 italic">
        Sin contribuyentes aún
      </div>
    );
  }

  // Top 3 MVPs for visible header row
  const top3 = contributors.slice(0, 3);
  // Next MVPs for accordion menu (ranks 1 to 10 or positions 4 to 10)
  const remaining7 = contributors.slice(3, 10);
  const fullTop10 = contributors.slice(0, 10);

  return (
    <div className="mt-3 w-full bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3 shadow-md overflow-hidden">
      {/* Top 3 Visible Row */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5 font-mono">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            Top 3 MVPs
          </span>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
            {contributors.length} contribuyentes
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {top3.map((mvp, idx) => {
            // Border styles for 1º, 2º, 3º
            const isGold = idx === 0;
            const isSilver = idx === 1;
            const isBronze = idx === 2;

            const ringStyle = isGold
              ? 'border-2 border-amber-400 ring-2 ring-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.4)]'
              : isSilver
              ? 'border-2 border-slate-300 ring-2 ring-slate-300/30 shadow-[0_0_8px_rgba(203,213,225,0.3)]'
              : 'border-2 border-amber-700 ring-2 ring-amber-700/30 shadow-[0_0_8px_rgba(180,83,9,0.3)]';

            const badgeBg = isGold
              ? 'bg-amber-400 text-zinc-950 font-black'
              : isSilver
              ? 'bg-slate-300 text-zinc-950 font-black'
              : 'bg-amber-700 text-amber-100 font-black';

            return (
              <div
                key={mvp.userId || idx}
                className="flex flex-col items-center bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60 relative group hover:bg-zinc-800/60 transition-all"
              >
                {/* Metallic Rank Badge */}
                <div className="relative mb-1">
                  <Avatar
                    src={mvp.profilePictureUrl}
                    name={mvp.nickname || mvp.uniqueId}
                    sizeClassName="w-8 h-8 sm:w-9 sm:h-9"
                    className={`${ringStyle} rounded-full transition-transform group-hover:scale-105`}
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shadow-sm font-mono ${badgeBg}`}
                  >
                    {idx + 1}
                  </span>
                </div>

                <span className="text-[11px] font-bold text-zinc-200 truncate w-full text-center leading-tight">
                  {mvp.nickname}
                </span>
                <span className="text-[9px] text-zinc-400 font-mono truncate w-full text-center">
                  @{mvp.uniqueId}
                </span>

                <div className="mt-1 flex items-center gap-1 font-mono text-[10px] font-extrabold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  <span>🪙 {formatPoints(mvp.totalScore)}</span>
                </div>
              </div>
            );
          })}
          {top3.length < 3 &&
            Array.from({ length: 3 - top3.length }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-zinc-900/20 border border-dashed border-zinc-800 text-[10px] text-zinc-600 font-mono italic min-h-[72px]"
              >
                Vacío
              </div>
            ))}
        </div>

        {/* Interactive Toggle Button [ ▼ ] */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="mt-1 w-full py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/80 rounded-lg text-zinc-300 hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm group"
        >
          <span className="text-[11px] font-semibold tracking-wide text-zinc-300 group-hover:text-amber-300">
            {isOpen ? 'Ocultar Desglose MVPs' : 'Ver Desglose de Puntos (Monedas / Bonus / Taps)'}
          </span>
          <span className="p-0.5 rounded bg-zinc-800 group-hover:bg-amber-500/20 text-zinc-400 group-hover:text-amber-300 transition-colors">
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        </button>
      </div>

      {/* Accordion Menu / Dropdown List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="border-t border-zinc-800/80 mt-3 pt-3 space-y-2.5"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Desglose Top 10 MVPs
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Puestos 1 al {fullTop10.length}
              </span>
            </div>

            {/* List of MVPs with segmented score breakdown */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {fullTop10.map((item) => {
                const total = item.totalScore || 1;
                const basePct = item.percentages.base;
                const multPct = item.percentages.multiplier;
                const tapsPct = item.percentages.taps;

                return (
                  <div
                    key={item.userId}
                    className="p-2.5 bg-zinc-900/80 border border-zinc-800/80 rounded-lg hover:border-zinc-700/80 transition-all space-y-2"
                  >
                    {/* User Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                          #{item.rank}
                        </span>
                        <Avatar
                          src={item.profilePictureUrl}
                          name={item.nickname || item.uniqueId}
                          sizeClassName="w-7 h-7"
                          className="border border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0 flex flex-col">
                          <span className="text-xs font-bold text-zinc-200 truncate leading-tight">
                            {item.nickname}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono truncate leading-tight">
                            @{item.uniqueId}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-black text-amber-300 block">
                          {formatPoints(item.totalScore)} pts
                        </span>
                      </div>
                    </div>

                    {/* Multi-Segmented Point Breakdown Bar */}
                    <div className="space-y-1">
                      <div className="h-3.5 w-full bg-zinc-950 rounded-md overflow-hidden flex border border-zinc-800/80 p-0.5 shadow-inner">
                        {/* 🪙 Monedas Base Segment */}
                        {item.baseCoins > 0 && (
                          <div
                            className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-xs transition-all duration-300 flex items-center justify-center text-[8px] font-mono font-bold text-zinc-950 overflow-hidden"
                            style={{ width: `${basePct}%` }}
                            title={`🪙 Monedas Base: ${item.baseCoins.toLocaleString()} pts (${basePct}%)`}
                          >
                            {basePct >= 15 ? `${basePct}%` : ''}
                          </div>
                        )}

                        {/* ⚡ Multiplicadores / Guante Segment */}
                        {item.multiplierBonus > 0 && (
                          <div
                            className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full rounded-xs transition-all duration-300 flex items-center justify-center text-[8px] font-mono font-bold text-white overflow-hidden"
                            style={{ width: `${multPct}%` }}
                            title={`⚡ Multiplicadores / Guante: ${item.multiplierBonus.toLocaleString()} pts (${multPct}%)`}
                          >
                            {multPct >= 15 ? `${multPct}%` : ''}
                          </div>
                        )}

                        {/* 👆 Taps Segment */}
                        {item.tapsCoins > 0 && (
                          <div
                            className="bg-gradient-to-r from-rose-400 to-pink-500 h-full rounded-xs transition-all duration-300 flex items-center justify-center text-[8px] font-mono font-bold text-white overflow-hidden"
                            style={{ width: `${tapsPct}%` }}
                            title={`👆 Taps: ${item.tapsCoins.toLocaleString()} pts (${tapsPct}%)`}
                          >
                            {tapsPct >= 15 ? `${tapsPct}%` : ''}
                          </div>
                        )}
                      </div>

                      {/* Detailed Labels with exact coin/points count */}
                      <div className="grid grid-cols-3 gap-1 pt-0.5 text-[10px] font-mono">
                        <div
                          className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 truncate"
                          title="Monedas Base (Regalos Estándar)"
                        >
                          <Coins className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            Base: <strong className="font-extrabold">{formatPoints(item.baseCoins)}</strong>
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-1 text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 truncate"
                          title="Multiplicadores / Golpe Crítico / Guante"
                        >
                          <Zap className="w-3 h-3 shrink-0 text-cyan-400 animate-pulse" />
                          <span className="truncate">
                            Bonus: <strong className="font-extrabold">{formatPoints(item.multiplierBonus)}</strong>
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-1 text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 truncate"
                          title="Taps de Pantalla (máx 3 por usuario sin regalos)"
                        >
                          <Hand className="w-3 h-3 shrink-0 text-rose-400" />
                          <span className="truncate">
                            Taps: <strong className="font-extrabold">{item.tapsCoins}</strong>
                          </span>
                        </div>
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
};
