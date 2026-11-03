import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Trophy, Zap, MousePointerClick, Coins, Flame } from 'lucide-react';
import { Avatar } from './Avatar';

export interface BattleMVPContributor {
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  totalPoints: number;
  coins: number;        // Points from coins / gifts
  taps: number;         // Points from taps / double clicks / likes
  boosters: number;     // Points from multipliers, speed challenges & power-ups
}

interface ParticipantMvpSectionProps {
  participantName: string;
  participantDisplayId: string;
  mvps?: BattleMVPContributor[];
  accentColor?: 'rose' | 'indigo' | 'amber' | 'purple' | 'emerald';
}

const formatScore = (num: number): string => {
  if (num === undefined || num === null || isNaN(num)) return '0';
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace('.', ',') + 'M';
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const ParticipantMvpSection: React.FC<ParticipantMvpSectionProps> = ({
  participantName,
  participantDisplayId,
  mvps = [],
  accentColor = 'rose',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Take top 7 MVPs sorted by total points
  const sortedMvps = [...mvps].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 7);
  const top3Mvps = sortedMvps.slice(0, 3);

  const getAccentStyles = () => {
    switch (accentColor) {
      case 'indigo':
        return {
          border: 'border-indigo-500/30',
          bgHeader: 'bg-indigo-950/40',
          badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          buttonBg: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          activeDropdownBorder: 'border-indigo-500/40',
          textAccent: 'text-indigo-400',
        };
      case 'amber':
        return {
          border: 'border-amber-500/30',
          bgHeader: 'bg-amber-950/40',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          buttonBg: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30',
          activeDropdownBorder: 'border-amber-500/40',
          textAccent: 'text-amber-400',
        };
      case 'purple':
        return {
          border: 'border-purple-500/30',
          bgHeader: 'bg-purple-950/40',
          badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
          buttonBg: 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30',
          activeDropdownBorder: 'border-purple-500/40',
          textAccent: 'text-purple-400',
        };
      case 'emerald':
        return {
          border: 'border-emerald-500/30',
          bgHeader: 'bg-emerald-950/40',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          buttonBg: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          activeDropdownBorder: 'border-emerald-500/40',
          textAccent: 'text-emerald-400',
        };
      case 'rose':
      default:
        return {
          border: 'border-rose-500/30',
          bgHeader: 'bg-rose-950/40',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          buttonBg: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30',
          activeDropdownBorder: 'border-rose-500/40',
          textAccent: 'text-rose-400',
        };
    }
  };

  const styles = getAccentStyles();

  return (
    <div className="mt-2.5 pt-2 border-t border-zinc-800/60 w-full font-sans">
      {/* Top 3 MVPs row + Toggle Button */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Avatars Section */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 shrink-0 font-bold flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-400" /> Top MVPs:
          </span>

          <div className="flex items-center -space-x-2 overflow-hidden py-0.5 pl-1">
            {top3Mvps.length > 0 ? (
              top3Mvps.map((mvp, idx) => (
                <div
                  key={mvp.userId || mvp.uniqueId || idx}
                  className="relative group transition-transform hover:scale-110 hover:z-20"
                  title={`${mvp.nickname} (@${mvp.uniqueId}): ${formatScore(mvp.totalPoints)} pts`}
                >
                  <Avatar
                    src={mvp.profilePictureUrl}
                    name={mvp.nickname || mvp.uniqueId}
                    sizeClassName="w-7 h-7"
                    className={`border-2 shadow-md ${
                      idx === 0
                        ? 'border-amber-400 ring-1 ring-amber-400/50'
                        : idx === 1
                        ? 'border-zinc-300 ring-1 ring-zinc-300/40'
                        : 'border-amber-600 ring-1 ring-amber-600/30'
                    }`}
                  />
                  <span
                    className={`absolute -bottom-1 -right-1 text-[9px] font-mono font-black rounded-full px-1 py-0.2 leading-none shadow-sm ${
                      idx === 0
                        ? 'bg-amber-400 text-zinc-950'
                        : idx === 1
                        ? 'bg-zinc-300 text-zinc-950'
                        : 'bg-amber-700 text-white'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-1 text-[11px] text-zinc-500 italic pl-1">
                <span>Esperando aportes...</span>
              </div>
            )}
          </div>
        </div>

        {/* Button to show dropdown breakdown */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-xs ${styles.buttonBg}`}
        >
          <span className="whitespace-nowrap">
            Desglose 7 MVPs {sortedMvps.length > 0 ? `(${sortedMvps.length})` : ''}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {/* Desplegable con el desglose de los 7 MVPs */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className={`overflow-hidden rounded-xl border bg-zinc-950/90 p-3 shadow-xl ${styles.activeDropdownBorder}`}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Flame className={`w-4 h-4 ${styles.textAccent}`} />
                <h4 className="text-xs font-bold font-mono tracking-tight text-zinc-100 uppercase">
                  Top 7 MVPs — {participantName} (@{participantDisplayId})
                </h4>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Puntos reales en vivo
              </span>
            </div>

            {sortedMvps.length > 0 ? (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {sortedMvps.map((mvp, index) => {
                  return (
                    <div
                      key={mvp.userId || mvp.uniqueId || index}
                      className="bg-zinc-900/80 hover:bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/80 transition-colors flex flex-col gap-2"
                    >
                      {/* Top line: Rank, Avatar, Nickname & Total Points */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-5 h-5 flex items-center justify-center font-mono font-bold text-[10px] rounded-full shrink-0 ${
                              index === 0
                                ? 'bg-amber-400 text-zinc-950 shadow-sm'
                                : index === 1
                                ? 'bg-zinc-300 text-zinc-950 shadow-sm'
                                : index === 2
                                ? 'bg-amber-700 text-white shadow-sm'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            #{index + 1}
                          </span>

                          <Avatar
                            src={mvp.profilePictureUrl}
                            name={mvp.nickname || mvp.uniqueId}
                            sizeClassName="w-7 h-7"
                            className="border border-zinc-700 shrink-0"
                          />

                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-zinc-100 truncate leading-tight">
                              {mvp.nickname || mvp.uniqueId}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400 truncate leading-tight">
                              @{mvp.uniqueId}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 block">
                            {formatScore(mvp.totalPoints)} pts
                          </span>
                        </div>
                      </div>

                      {/* Detailed Breakdown: Coins, Taps, Speed Challenge / Boosters */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-zinc-800/50 text-[11px] font-mono">
                        {/* Monedas */}
                        <div className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/60 flex flex-col items-center justify-center text-center">
                          <div className="flex items-center gap-1 text-amber-400 text-[10px] font-bold">
                            <Coins className="w-3 h-3" />
                            <span>Monedas</span>
                          </div>
                          <span className="font-bold text-zinc-200 mt-0.5">
                            {formatScore(mvp.coins)}
                          </span>
                        </div>

                        {/* Taps / Toques */}
                        <div className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/60 flex flex-col items-center justify-center text-center">
                          <div className="flex items-center gap-1 text-indigo-400 text-[10px] font-bold">
                            <MousePointerClick className="w-3 h-3" />
                            <span>Taps</span>
                          </div>
                          <span className="font-bold text-zinc-200 mt-0.5">
                            {formatScore(mvp.taps)}
                          </span>
                        </div>

                        {/* Potenciadores & Retos de Velocidad */}
                        <div className="bg-zinc-950/60 p-1.5 rounded border border-zinc-800/60 flex flex-col items-center justify-center text-center">
                          <div className="flex items-center gap-1 text-purple-400 text-[10px] font-bold">
                            <Zap className="w-3 h-3" />
                            <span>Multiplicadores</span>
                          </div>
                          <span className="font-bold text-purple-300 mt-0.5">
                            {formatScore(mvp.boosters)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-zinc-500 text-xs font-mono">
                No hay aportes registrados para este participante en esta batalla.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
