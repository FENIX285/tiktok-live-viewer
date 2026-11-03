import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Trophy, Flame, Zap, ShieldAlert, Sparkles, Swords, User } from 'lucide-react';
import { BattleHistory, BattleUser, ActiveGlove, SpeedChallenge } from '../types/battle';
import { Avatar } from './Avatar';

interface BattleInProgressProps {
  battle: BattleHistory;
  formatScore: (score: number | string) => string;
  formatBattleTime: (battle: BattleHistory) => string;
  onActivateTestGlove?: (targetUserId: string, activatorName?: string, activatorAvatar?: string) => void;
  onActivateTestSpeedChallenge?: () => void;
}

export const BattleInProgress: React.FC<BattleInProgressProps> = ({
  battle,
  formatScore,
  formatBattleTime,
  onActivateTestGlove,
  onActivateTestSpeedChallenge,
}) => {
  const [now, setNow] = useState(Date.now());

  // Update timers every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const type = battle.type || '1v1';
  const isFFA = type === '1v1v1v1' || type === '1v1v1';
  const isTeamMatch = type === '2v2' || type === '3v1' || type === '1v3' || type === '2v1' || type === '1v2' || (type.includes('v') && type !== '1v1' && !isFFA);

  const team1Users = isTeamMatch
    ? battle.users.filter(u => u && (u.teamId === 0 || (u.teamId === undefined && (u === battle.users[0] || (type === '2v2' && battle.users.indexOf(u) === 1) || (type === '3v1' && battle.users.indexOf(u) < 3)))))
    : [battle.users[0]].filter(Boolean);

  const team2Users = isTeamMatch
    ? battle.users.filter(u => u && (u.teamId === 1 || (!team1Users.includes(u) && u !== battle.users[0])))
    : battle.users.slice(1).filter(Boolean);

  const team1Score = team1Users.reduce((sum, u) => sum + (u?.score || 0), 0);
  const team2Score = team2Users.reduce((sum, u) => sum + (u?.score || 0), 0);

  // Calculate point difference & leader
  let pointDiff = 0;
  let leaderLabel = '';
  let isTie = false;

  if (isTeamMatch) {
    pointDiff = Math.abs(team1Score - team2Score);
    if (team1Score > team2Score) leaderLabel = 'Equipo Anfitrión';
    else if (team2Score > team1Score) leaderLabel = 'Equipo Rival';
    else isTie = true;
  } else if (isFFA) {
    const sortedByScore = [...(battle.users || [])].filter(Boolean).sort((a, b) => (b?.score || 0) - (a?.score || 0));
    const top1 = sortedByScore[0];
    const top2 = sortedByScore[1];
    const score1 = top1?.score || 0;
    const score2 = top2?.score || 0;
    pointDiff = score1 - score2;
    if (score1 > score2) leaderLabel = top1?.nickname || top1?.displayId || 'Líder';
    else isTie = true;
  } else {
    const score1 = battle.users[0]?.score || 0;
    const score2 = battle.users[1]?.score || 0;
    pointDiff = Math.abs(score1 - score2);
    if (score1 > score2) leaderLabel = battle.users[0]?.nickname || battle.users[0]?.displayId || 'Anfitrión';
    else if (score2 > score1) leaderLabel = battle.users[1]?.nickname || battle.users[1]?.displayId || 'Rival';
    else isTie = true;
  }

  // Active gloves filtering (not expired)
  const activeGloves = (battle.gloves || []).filter(g => g.expiresAt > now);

  // Active Speed Challenge checking
  const speedChallenge = battle.speedChallenge && battle.speedChallenge.expiresAt > now ? battle.speedChallenge : null;

  // Format seconds into MM:SS or SSs
  const formatTimerSeconds = (expiresAt: number) => {
    const diffSec = Math.max(0, Math.ceil((expiresAt - now) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to render active gloves for a given user
  const renderUserGloves = (user: BattleUser) => {
    if (!user) return null;
    const userGloves = activeGloves.filter(
      g => g.targetUserId === user.userId || g.targetUserId === user.displayId || g.targetUserId === user.originalKey
    );

    if (userGloves.length === 0) return null;

    // Group or stack gloves if multiple exist
    const totalGloveCount = userGloves.reduce((acc, g) => acc + (g.stackCount || 1), 0);
    const maxExpiry = Math.max(...userGloves.map(g => g.expiresAt));

    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        className="mt-2 p-2 rounded-lg bg-gradient-to-r from-amber-950/80 via-yellow-950/60 to-amber-900/80 border border-amber-500/50 shadow-lg shadow-amber-900/20"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base animate-bounce">🥊</span>
            <div className="min-w-0">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1">
                {totalGloveCount > 1 ? `${totalGloveCount} Guantes Activos` : 'Guante de Potencia'}
                <span className="bg-amber-400 text-zinc-950 text-[9px] px-1 py-0.2 rounded font-black">x5</span>
              </span>
              {/* Show avatar and nickname of who activated it */}
              <div className="flex items-center gap-1 mt-0.5">
                {userGloves.map((g, idx) => (
                  <div key={g.id || idx} className="flex items-center gap-1 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-amber-500/30">
                    <Avatar 
                      src={g.activatedByAvatar} 
                      name={g.activatedByName} 
                      sizeClassName="w-4 h-4" 
                      className="border border-amber-400/50 shrink-0 text-[8px]" 
                    />
                    <span className="text-[10px] text-amber-200 font-medium truncate max-w-[80px]">
                      {g.activatedByName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-amber-500/20 px-2 py-1 rounded border border-amber-400/40 font-mono text-xs font-black text-amber-300 shrink-0 shadow-inner">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>{formatTimerSeconds(maxExpiry)}</span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="p-5 border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-indigo-950/30">
      {/* Header Info */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
          </span>
          <div>
            <h4 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Batalla en Curso <span className="text-xs bg-rose-500/20 text-rose-300 font-mono px-2.5 py-0.5 rounded border border-rose-500/30 font-bold">{type}</span>
            </h4>
            <p className="text-xs text-zinc-400">
              {isTeamMatch ? 'Batalla por equipos sincronizada en tiempo real' : isFFA ? `Todos contra todos (${type})` : 'Batalla 1 vs 1 en tiempo real'}
            </p>
          </div>
        </div>

        {/* Difference & Leader Badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 bg-zinc-900/90 px-3.5 py-2 rounded-lg border border-zinc-800 shadow-md">
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">Diferencia:</span>
              <span className="text-base font-black font-mono text-emerald-400">
                +{formatScore(pointDiff)} <span className="text-xs font-normal text-emerald-400/80">pts</span>
              </span>
            </div>
            {!isTie ? (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 truncate max-w-[160px]" title={`${leaderLabel} va liderando`}>
                👑 {leaderLabel}
              </span>
            ) : (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                ⚖️ Empate
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Speed Challenge Banner (Reto de Velocidad) */}
      <AnimatePresence>
        {speedChallenge ? (
          <motion.div 
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="mt-4 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border-2 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)] flex flex-col sm:flex-row items-center justify-between gap-3 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-zinc-950 font-black shadow-md shrink-0">
                <Zap className="w-6 h-6 fill-zinc-950 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                    ⚡ {speedChallenge.title || 'RETO DE VELOCIDAD ACTIVO'}
                  </span>
                  <span className="text-[10px] font-bold bg-amber-400 text-zinc-950 px-2 py-0.5 rounded-full uppercase">
                    {speedChallenge.rewardText || 'MULTI x2'}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-0.5">
                  El primer participante o equipo en alcanzar la meta gana el bonus de velocidad.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 relative z-10 shrink-0">
              {speedChallenge.targetScore && (
                <div className="text-right hidden sm:block">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Meta de Puntos</span>
                  <span className="text-sm font-black font-mono text-amber-300">{formatScore(speedChallenge.targetScore)} pts</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-zinc-950/80 px-3.5 py-1.5 rounded-lg border border-amber-500/50 shadow-inner">
                <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-base font-black font-mono text-amber-300">
                  {formatTimerSeconds(speedChallenge.expiresAt)}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Global Active Gloves Banner Summary if gloves are active */}
      {activeGloves.length > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-lg">🥊</span>
            <span className="font-bold text-amber-300">
              {activeGloves.length} {activeGloves.length === 1 ? 'Guante Activado' : 'Guantes Activados'} en la Batalla
            </span>
            <span className="text-zinc-400 text-[11px] hidden sm:inline">
              (Multiplicador x5 / Golpe Crítico activo)
            </span>
          </div>
          <span className="font-mono text-amber-400 text-[11px] font-bold">
            {activeGloves.length} participante(s) con potenciador
          </span>
        </div>
      )}

      {/* Comparative Progress Bar */}
      {(() => {
        if (isFFA) {
          const total = (battle.users || []).reduce((sum, u) => sum + (u?.score || 0), 0);
          const colors = [
            'bg-gradient-to-r from-rose-500 to-pink-500', 
            'bg-gradient-to-r from-indigo-500 to-indigo-600', 
            'bg-gradient-to-r from-amber-500 to-amber-600', 
            'bg-gradient-to-r from-emerald-500 to-emerald-600'
          ];
          return (
            <div className="mt-4 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 space-y-2">
              <div className="h-5 w-full bg-zinc-800/90 rounded-md overflow-hidden flex shadow-inner">
                {(battle.users || []).map((u, i) => {
                  const defaultPct = (battle.users || []).length > 0 ? 100 / battle.users.length : 25;
                  const userScore = u?.score || 0;
                  const pct = total > 0 ? (userScore / total) * 100 : defaultPct;
                  return (
                    <div 
                      key={u?.userId || i} 
                      className={`${colors[i % colors.length]} h-full flex items-center justify-center px-1 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden transition-all duration-500`} 
                      style={{ width: `${pct}%` }}
                      title={`@${u?.displayId || 'usuario'}: ${pct.toFixed(1)}%`}
                    >
                      {pct >= 8 ? (
                        <span className="drop-shadow-sm leading-none">{pct.toFixed(1)}%</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-rose-400 font-bold">Anfitrión</span>
                <div className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20 text-amber-300 font-mono text-xs font-bold shadow-sm">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>{formatBattleTime(battle)}</span>
                </div>
                <span className="text-indigo-400 font-bold">Rivales</span>
              </div>
            </div>
          );
        } else {
          const score1 = isTeamMatch ? team1Score : (battle.users[0]?.score || 0);
          const score2 = isTeamMatch ? team2Score : (battle.users[1]?.score || 0);
          const total = score1 + score2;
          const pct1 = total > 0 ? (score1 / total) * 100 : 50;
          const pct2 = 100 - pct1;

          return (
            <div className="mt-4 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 space-y-2">
              <div className="h-5 w-full bg-zinc-800/90 rounded-md overflow-hidden flex shadow-inner">
                <div 
                  className="bg-gradient-to-r from-rose-500 to-pink-500 h-full flex items-center justify-center px-1.5 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden transition-all duration-500" 
                  style={{ width: `${pct1}%` }}
                  title={`${isTeamMatch ? 'Equipo Anfitrión' : 'Anfitrión'}: ${pct1.toFixed(1)}%`}
                >
                  {pct1 >= 8 ? (
                    <span className="drop-shadow-sm leading-none">{pct1.toFixed(1)}%</span>
                  ) : null}
                </div>

                <div 
                  className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full flex items-center justify-center px-1.5 text-white font-mono font-bold text-[11px] whitespace-nowrap overflow-hidden flex-1 transition-all duration-500"
                  title={`${isTeamMatch ? 'Equipo Rival' : 'Rival'}: ${pct2.toFixed(1)}%`}
                >
                  {pct2 >= 8 ? (
                    <span className="drop-shadow-sm leading-none">{pct2.toFixed(1)}%</span>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-rose-400 font-bold tracking-wide">{isTeamMatch ? 'Equipo Anfitrión' : 'Anfitrión'}</span>
                <div className="flex items-center gap-1.5 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20 text-amber-300 font-mono text-xs font-bold shadow-sm">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>{formatBattleTime(battle)}</span>
                </div>
                <span className="text-indigo-400 font-bold tracking-wide">{isTeamMatch ? 'Equipo Rival' : 'Rival'}</span>
              </div>
            </div>
          );
        }
      })()}

      {/* Rendering Team Match (2v2, 3v1, 1v3, 2v1, 1v2) */}
      {isTeamMatch && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {/* Team 1 (Host Team) */}
          <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between border-b border-rose-500/20 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    Equipo Anfitrión
                  </span>
                  {team1Score > team2Score && (
                    <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      +{formatScore(pointDiff)} pts
                    </span>
                  )}
                </div>
                <span className="text-xl font-black font-mono text-rose-300">{formatScore(team1Score)}</span>
              </div>

              <div className="space-y-2.5">
                {team1Users.map((u, i) => (
                  <div key={u?.userId || i} className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar 
                          src={u?.profilePictureUrl} 
                          name={u?.nickname || u?.displayId || 'Usuario'} 
                          sizeClassName="w-8 h-8" 
                          className="border border-rose-500/40 text-xs font-mono shrink-0 shadow-sm" 
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-zinc-100 block truncate">{u?.nickname || u?.displayId || 'Usuario'}</span>
                          <span className="text-[10px] text-zinc-400 block truncate">@{u?.displayId || 'user'}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-sm text-rose-300 block">{formatScore(u?.score || 0)}</span>
                      </div>
                    </div>

                    {/* Active Gloves for this participant */}
                    {renderUserGloves(u)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Team 2 (Rival Team) */}
          <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-mono text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                    Equipo Rival
                  </span>
                  {team2Score > team1Score && (
                    <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      +{formatScore(pointDiff)} pts
                    </span>
                  )}
                </div>
                <span className="text-xl font-black font-mono text-indigo-300">{formatScore(team2Score)}</span>
              </div>

              <div className="space-y-2.5">
                {team2Users.map((u, i) => (
                  <div key={u?.userId || i} className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar 
                          src={u?.profilePictureUrl} 
                          name={u?.nickname || u?.displayId || 'Usuario'} 
                          sizeClassName="w-8 h-8" 
                          className="border border-indigo-500/40 text-xs font-mono shrink-0 shadow-sm" 
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-zinc-100 block truncate">{u?.nickname || u?.displayId || 'Usuario'}</span>
                          <span className="text-[10px] text-zinc-400 block truncate">@{u?.displayId || 'user'}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-sm text-indigo-300 block">{formatScore(u?.score || 0)}</span>
                      </div>
                    </div>

                    {/* Active Gloves for this participant */}
                    {renderUserGloves(u)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rendering Free-For-All (1v1v1 / 1v1v1v1) */}
      {isFFA && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(battle.users || []).map((u, i) => {
            const isLeader = (u?.nickname || u?.displayId) === leaderLabel;
            return (
              <div key={u?.userId || i} className={`p-3.5 rounded-xl border flex flex-col justify-between ${i === 0 ? 'bg-rose-950/30 border-rose-500/40' : 'bg-zinc-900/70 border-zinc-800'}`}>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar 
                        src={u?.profilePictureUrl} 
                        name={u?.nickname || u?.displayId || 'Usuario'} 
                        sizeClassName="w-8 h-8" 
                        className="border border-zinc-700 text-xs font-mono shrink-0" 
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-zinc-100 block truncate">{u?.nickname || u?.displayId || 'Usuario'}</span>
                        <span className="text-[10px] text-zinc-400 block truncate">@{u?.displayId || 'user'}</span>
                      </div>
                    </div>
                    {isLeader && !isTie && (
                      <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                        👑 Líder
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-800/60 flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">{i === 0 ? 'Anfitrión' : `Jugador ${i+1}`}</span>
                    <span className={`text-lg font-black font-mono ${i === 0 ? 'text-rose-400' : 'text-indigo-400'}`}>{formatScore(u?.score || 0)}</span>
                  </div>
                </div>

                {/* Active Gloves for this FFA participant */}
                {renderUserGloves(u)}
              </div>
            );
          })}
        </div>
      )}

      {/* Rendering Standard 1v1 */}
      {!isTeamMatch && !isFFA && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {/* Host */}
          <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-500/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar 
                    src={battle.users[0]?.profilePictureUrl} 
                    name={battle.users[0]?.nickname || battle.users[0]?.displayId || 'Anfitrión'} 
                    sizeClassName="w-10 h-10" 
                    className="border border-rose-500/40 text-xs font-mono shrink-0" 
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 block uppercase font-mono tracking-wider">Anfitrión</span>
                      {(battle.users[0]?.score || 0) > (battle.users[1]?.score || 0) && (
                        <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          +{formatScore(pointDiff)} pts
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-rose-300 block truncate">{battle.users[0]?.nickname || battle.users[0]?.displayId || 'Anfitrión'}</span>
                    <span className="text-[11px] text-zinc-400 block truncate">@{battle.users[0]?.displayId || 'host'}</span>
                  </div>
                </div>
                <span className="text-2xl font-black font-mono text-rose-300 shrink-0">{formatScore(battle.users[0]?.score || 0)}</span>
              </div>
            </div>

            {/* Active Gloves */}
            {battle.users[0] && renderUserGloves(battle.users[0])}
          </div>

          {/* Rival */}
          <div className="bg-indigo-950/20 p-4 rounded-xl border border-indigo-500/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar 
                    src={battle.users[1]?.profilePictureUrl} 
                    name={battle.users[1]?.nickname || battle.users[1]?.displayId || 'Rival'} 
                    sizeClassName="w-10 h-10" 
                    className="border border-indigo-500/40 text-xs font-mono shrink-0" 
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 block uppercase font-mono tracking-wider">Rival</span>
                      {(battle.users[1]?.score || 0) > (battle.users[0]?.score || 0) && (
                        <span className="text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          +{formatScore(pointDiff)} pts
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-indigo-300 block truncate">{battle.users[1]?.nickname || battle.users[1]?.displayId || 'Rival'}</span>
                    <span className="text-[11px] text-zinc-400 block truncate">@{battle.users[1]?.displayId || 'rival'}</span>
                  </div>
                </div>
                <span className="text-2xl font-black font-mono text-indigo-300 shrink-0">{formatScore(battle.users[1]?.score || 0)}</span>
              </div>
            </div>

            {/* Active Gloves */}
            {battle.users[1] && renderUserGloves(battle.users[1])}
          </div>
        </div>
      )}
    </div>
  );
};
