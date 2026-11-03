import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronDown, ChevronUp, Sparkles, Zap, Coins, Touchpad as HandTap } from 'lucide-react';
import { Avatar } from './Avatar';

export interface BattleMVP {
  userId: string;
  uniqueId: string;
  nickname: string;
  profilePictureUrl: string;
  coinsPoints: number;      // Puntos por Monedas (Regalos)
  tapsPoints: number;       // Puntos por Taps / Me Gusta
  boosterPoints: number;    // Puntos multiplicados por Potenciadores / Retos de velocidad
  totalPoints: number;      // Monedas + Taps + Potenciadores
}

export interface BattleUser {
  userId: string;
  originalKey?: string;
  displayId: string;
  nickname?: string;
  profilePictureUrl?: string;
  score: number;
  teamId?: number;
  mvps?: BattleMVP[];
}

interface BattleUserMVPsProps {
  user: BattleUser;
  theme?: 'rose' | 'indigo' | 'amber' | 'emerald' | 'zinc';
  compact?: boolean;
}

const formatCompactNumber = (num: number) => {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace('.', ',') + 'k';
  return num.toLocaleString();
};

/**
 * Genera o normaliza los 7 MVPs con más aportes para la tarjeta del participante.
 * Si el usuario ya tiene 'mvps' asignados en tiempo real, los usa.
 * De lo contrario, genera un desglose coherente proporcional al score total.
 */
export function getOrGenerateMVPs(user: BattleUser): BattleMVP[] {
  if (user.mvps && user.mvps.length > 0) {
    return [...user.mvps].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 7);
  }

  const score = user.score || 0;
  
  // Lista de avatares / nombres realistas de la comunidad para la simulación de MVPs de batalla
  const sampleContributors = [
    { name: 'Alex_Gifter', id: 'alex_mvp', pic: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80' },
    { name: 'DragonKing_99', id: 'dragon_king', pic: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80' },
    { name: 'StarGazer_TikTok', id: 'stargazer', pic: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80' },
    { name: 'TitanSender', id: 'titan_sender', pic: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80' },
    { name: 'Luna_Gifts', id: 'luna_gifts', pic: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80' },
    { name: 'ViperTap_X', id: 'viper_tap', pic: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80' },
    { name: 'PhoenixBoost', id: 'phoenix_b', pic: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=120&q=80' },
  ];

  // Distribución porcentual aproximada para los 7 MVPs
  const percentages = [0.42, 0.24, 0.14, 0.08, 0.05, 0.04, 0.03];

  return sampleContributors.map((c, idx) => {
    const rawTotal = Math.round(score > 0 ? score * percentages[idx] : (1000 - idx * 120));
    // Desglose en Monedas (~65%), Taps (~10%), Potenciadores (~25%)
    const coins = Math.round(rawTotal * 0.65);
    const taps = Math.round(rawTotal * 0.10);
    const booster = rawTotal - (coins + taps);

    return {
      userId: `${c.id}_${user.userId || 'user'}`,
      uniqueId: c.id,
      nickname: c.name,
      profilePictureUrl: c.pic,
      coinsPoints: Math.max(0, coins),
      tapsPoints: Math.max(0, taps),
      boosterPoints: Math.max(0, booster),
      totalPoints: Math.max(1, rawTotal),
    };
  });
}

export function BattleUserMVPs({ user, theme = 'rose', compact = false }: BattleUserMVPsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const mvps = getOrGenerateMVPs(user);
  const top3 = mvps.slice(0, 3);
  const top7 = mvps.slice(0, 7);

  const themeStyles = {
    rose: {
      border: 'border-rose-500/30',
      bg: 'bg-rose-950/30',
      text: 'text-rose-300',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      button: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30',
      accent: 'text-rose-400',
    },
    indigo: {
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-950/30',
      text: 'text-indigo-300',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      button: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      accent: 'text-indigo-400',
    },
    amber: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-950/30',
      text: 'text-amber-300',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      button: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30',
      accent: 'text-amber-400',
    },
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-950/30',
      text: 'text-emerald-300',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      button: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      accent: 'text-emerald-400',
    },
    zinc: {
      border: 'border-zinc-700/50',
      bg: 'bg-zinc-900/40',
      text: 'text-zinc-300',
      badge: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      button: 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border-zinc-700',
      accent: 'text-zinc-400',
    },
  }[theme];

  const rankBadges = [
    { border: 'ring-2 ring-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]', label: '🥇 MVP #1', badgeBg: 'bg-amber-400 text-zinc-950 font-black' },
    { border: 'ring-2 ring-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.4)]', label: '🥈 MVP #2', badgeBg: 'bg-slate-300 text-zinc-950 font-black' },
    { border: 'ring-2 ring-amber-700 shadow-[0_0_8px_rgba(180,83,9,0.4)]', label: '🥉 MVP #3', badgeBg: 'bg-amber-700 text-amber-100 font-black' },
  ];

  return (
    <div className="mt-3 pt-2.5 border-t border-zinc-800/70 w-full space-y-2.5">
      {/* Fila con los 3 Avatares de los MVPs con más aportes y el botón del desplegable */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Avatares Top 3 MVPs */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 mr-1 flex items-center gap-1">
            <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Top</span> MVPs:
          </span>

          <div className="flex items-center -space-x-1 sm:-space-x-0.5">
            {top3.map((mvp, idx) => {
              const badge = rankBadges[idx];
              return (
                <div 
                  key={mvp.userId || idx} 
                  className="relative group transition-transform hover:z-10 hover:scale-110 cursor-pointer"
                  title={`#${idx + 1} MVP: ${mvp.nickname} (@${mvp.uniqueId}) - ${mvp.totalPoints.toLocaleString()} pts`}
                >
                  <Avatar
                    src={mvp.profilePictureUrl}
                    name={mvp.nickname}
                    sizeClassName={compact ? 'w-6 h-6' : 'w-7 h-7 sm:w-8 sm:h-8'}
                    className={`${badge.border} transition-all`}
                  />
                  <span className={`absolute -bottom-1 -right-1 text-[8px] px-1 py-0.2 rounded-full font-mono ${badge.badgeBg}`}>
                    #{idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botón para abrir/cerrar el desplegable con el desglose de los 7 MVPs */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${themeStyles.button} cursor-pointer shrink-0`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Ver Desglose (7 MVPs)</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Desplegable animado con el desglose completo de los 7 MVPs */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-md p-3 space-y-2.5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5 uppercase font-mono tracking-wider">
                <Trophy className="w-4 h-4 text-amber-400" />
                Desglose Top 7 MVPs — {user.nickname || user.displayId || 'Participante'}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Total: {user.score ? user.score.toLocaleString() : '0'} pts
              </span>
            </div>

            {/* Lista detallada de los 7 MVPs con monedas, taps y multiplicadores por potenciador */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {top7.map((mvp, idx) => (
                <div
                  key={mvp.userId || idx}
                  className="p-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-zinc-800/50 transition-colors"
                >
                  {/* Avatar + Nombre + Rango */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-6 h-6 flex items-center justify-center font-mono font-bold text-[10px] rounded-full shrink-0
                      ${idx === 0 ? 'bg-amber-400 text-zinc-950 font-black' : 
                        idx === 1 ? 'bg-slate-300 text-zinc-950 font-black' : 
                        idx === 2 ? 'bg-amber-700 text-white font-black' : 
                        'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                      #{idx + 1}
                    </div>

                    <Avatar
                      src={mvp.profilePictureUrl}
                      name={mvp.nickname}
                      sizeClassName="w-8 h-8"
                      className="border border-zinc-700 shrink-0 shadow-xs"
                    />

                    <div className="min-w-0 flex flex-col">
                      <span className="text-xs font-bold text-zinc-100 truncate leading-tight">
                        {mvp.nickname}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 truncate leading-tight">
                        @{mvp.uniqueId}
                      </span>
                    </div>
                  </div>

                  {/* Desglose de Puntos: Monedas, Taps, Potenciador y Total */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end shrink-0 text-[11px] font-mono">
                    {/* Monedas */}
                    <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 text-amber-300" title="Puntos por Monedas de Regalos">
                      <Coins className="w-3 h-3 text-amber-400" />
                      <span>{formatCompactNumber(mvp.coinsPoints)}</span>
                    </div>

                    {/* Taps */}
                    <div className="flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 text-rose-300" title="Puntos por Taps / Me Gusta">
                      <HandTap className="w-3 h-3 text-rose-400" />
                      <span>{formatCompactNumber(mvp.tapsPoints)}</span>
                    </div>

                    {/* Potenciadores / Retos de Velocidad */}
                    <div className="flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20 text-purple-300" title="Puntos multiplicados por Potenciador / Reto de Velocidad (2x / 3x)">
                      <Zap className="w-3 h-3 text-purple-400" />
                      <span>+{formatCompactNumber(mvp.boosterPoints)}</span>
                    </div>

                    {/* Total acumulado */}
                    <div className="flex items-center gap-1 bg-emerald-500/15 px-2.5 py-1 rounded border border-emerald-500/30 text-emerald-300 font-bold shadow-xs">
                      <span>{mvp.totalPoints.toLocaleString()} pts</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
