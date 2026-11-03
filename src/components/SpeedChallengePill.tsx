import React, { useState, useEffect } from 'react';
import { Zap, Flame, Gift, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { SpeedChallenge } from '../lib/speedChallenge';

interface SpeedChallengePillProps {
  challenge: SpeedChallenge | null;
  battleTimeRemaining?: string;
}

export const SpeedChallengePill: React.FC<SpeedChallengePillProps> = ({ challenge, battleTimeRemaining }) => {
  const [localSeconds, setLocalSeconds] = useState<number | null>(null);

  // Dynamic countdown calculation based on API endTime or remainingSeconds
  useEffect(() => {
    if (!challenge) {
      setLocalSeconds(null);
      return;
    }

    if (challenge.endTime) {
      const updateFromEndTime = () => {
        const remaining = Math.max(0, Math.ceil((challenge.endTime! - Date.now()) / 1000));
        setLocalSeconds(remaining);
      };
      updateFromEndTime();
      const timer = setInterval(updateFromEndTime, 1000);
      return () => clearInterval(timer);
    } else if (challenge.remainingSeconds !== undefined && challenge.remainingSeconds > 0) {
      const startTime = Date.now();
      const initialSeconds = challenge.remainingSeconds;
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, initialSeconds - elapsed);
        setLocalSeconds(remaining);
      }, 1000);
      return () => clearInterval(timer);
    } else if (challenge.duration && challenge.status === 'active') {
      const startTime = challenge.timestamp;
      const initialDuration = challenge.duration;
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, initialDuration - elapsed);
        setLocalSeconds(remaining);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setLocalSeconds(null);
    }
  }, [challenge]);

  // If there's no challenge event yet received from the API, show the listening pill indicator
  if (!challenge) {
    return (
      <div className="mt-4 flex items-center justify-center">
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-600/15 border border-orange-500/30 text-orange-200/90 shadow-sm backdrop-blur-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 font-mono">
            Reto de velocidad
          </span>
          <span className="text-zinc-600 font-bold">•</span>
          <span className="text-xs text-orange-200/80">
            Escuchando retos en tiempo real desde la API...
          </span>
        </div>
      </div>
    );
  }

  const isCompleted = challenge.status === 'completed';
  const isFailed = challenge.status === 'failed';
  const isActive = challenge.status === 'active';

  const hasProgress = challenge.target !== undefined && challenge.target > 0 && challenge.current !== undefined;
  const progressPct = hasProgress ? Math.min(100, Math.round(((challenge.current || 0) / challenge.target!) * 100)) : 0;

  return (
    <div className="mt-4 flex flex-col items-center justify-center">
      <div className={`w-full max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 rounded-2xl sm:rounded-full bg-gradient-to-r ${
        isCompleted 
          ? 'from-emerald-950/50 via-orange-950/30 to-amber-950/40 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
          : isFailed
          ? 'from-rose-950/50 via-orange-950/30 to-amber-950/40 border border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
          : 'from-orange-950/60 via-amber-900/40 to-orange-950/60 border border-orange-500/50 shadow-[0_0_25px_rgba(249,115,22,0.25)]'
      } backdrop-blur-md transition-all duration-300`}>
        
        {/* Left Side: Tag and Title / Prompt */}
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-zinc-950 font-black text-[11px] tracking-wider uppercase shrink-0 shadow-sm">
            {isActive ? (
              <Flame className="w-3.5 h-3.5 fill-current animate-bounce" />
            ) : isCompleted ? (
              <CheckCircle2 className="w-3.5 h-3.5 fill-current" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            <span>Reto de Velocidad</span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-orange-100 truncate flex items-center gap-1.5">
              {challenge.prompt || challenge.title || 'Reto de velocidad en curso'}
            </span>
            {challenge.reward && (
              <span className="text-[11px] text-amber-300 font-medium flex items-center gap-1 truncate">
                <Gift className="w-3 h-3 text-amber-400 shrink-0" />
                Recompensa: <strong className="text-amber-200">{challenge.reward}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Progress / Countdown / Status */}
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          {hasProgress && (
            <div className="flex items-center gap-2">
              <div className="w-24 sm:w-32 h-2.5 bg-zinc-950/70 rounded-full overflow-hidden border border-orange-500/30 p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-500 shadow-sm"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-orange-300">
                {challenge.current}/{challenge.target}
              </span>
            </div>
          )}

          {isActive && localSeconds !== null && localSeconds >= 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 font-mono text-xs font-bold shadow-inner">
              <Clock className="w-3.5 h-3.5 text-orange-400 animate-spin" style={{ animationDuration: '3s' }} />
              <span>{localSeconds}s</span>
            </div>
          )}

          {isCompleted && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> ¡Superado!
            </span>
          )}

          {isFailed && (
            <span className="px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs font-semibold">
              Finalizado
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
