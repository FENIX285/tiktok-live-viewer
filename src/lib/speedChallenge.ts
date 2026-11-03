export interface SpeedChallenge {
  battleId?: string;
  status: 'active' | 'completed' | 'failed' | 'waiting';
  title: string;
  prompt?: string;
  target?: number;
  current?: number;
  reward?: string;
  duration?: number;
  remainingSeconds?: number;
  endTime?: number;
  timestamp: number;
  sourceEvent?: string;
}

/**
 * Robust parser for TikTok LIVE / EulerStream Speed Challenge (Reto de velocidad) payloads.
 * Handles protobuf representations from WebcastLinkmicBattleTaskMessage, WebcastLinkMicBattleTask,
 * battleTask events, and embedded tasks inside WebcastLinkMicBattle / LinkMicArmies.
 */
export function parseSpeedChallenge(data: any, defaultBattleId?: string): SpeedChallenge | null {
  if (!data || typeof data !== 'object') return null;

  // Unwrap if nested in battleTask, task, or battleSetting
  const taskObj = data.task || data.battleTask || data.battle_task || data.taskUpdate || data.speedChallenge || data.battleSetting?.task || data.battleSetting?.battleTask || data;

  if (!taskObj || typeof taskObj !== 'object') return null;

  const rawBattleId = (data.battleId || taskObj.battleId || defaultBattleId || '').toString();

  // Task message type according to TikTok protobufs:
  // 1 = Task Start, 2 = Task Update/Progress, 3 = Task Settle/Success, 4 = Task Finish/End
  const messageType = Number(
    taskObj.taskMessageType ??
    taskObj.battleTaskMessageType ??
    data.taskMessageType ??
    data.battleTaskMessageType ??
    taskObj.stage ??
    data.stage ??
    0
  );

  const inner = taskObj.task || taskObj.challenge || taskObj;

  const current = Number(inner.current ?? inner.score ?? inner.progress ?? taskObj.current ?? 0);
  const target = Number(inner.target ?? inner.total ?? inner.goal ?? inner.targetScore ?? taskObj.target ?? 0);

  // Extract human-readable prompt or rule
  const rawPrompt = (
    inner.prompt ||
    inner.description ||
    inner.desc ||
    inner.title ||
    inner.rule ||
    taskObj.prompt ||
    taskObj.title ||
    taskObj.desc ||
    ''
  ).toString().trim();

  // Extract reward (Glove / Guante de poder, x2, x3, etc.)
  let reward = inner.reward || inner.bonus || inner.giftName || taskObj.reward || taskObj.bonus || '';
  if (reward && typeof reward === 'object') {
    reward = reward.name || reward.title || reward.giftName || reward.describe || JSON.stringify(reward);
  }
  const rewardStr = reward ? String(reward).trim() : undefined;

  // Duration and remaining time / countdown
  const duration = Number(inner.duration ?? taskObj.duration ?? inner.totalTime ?? 30);
  const rawRemaining = Number(inner.remainingTime ?? inner.countdown ?? taskObj.countdown ?? 0);
  
  let endTime: number | undefined;
  if (inner.finishTime || taskObj.finishTime || inner.endTime || taskObj.endTime) {
    const rawEnd = Number(inner.finishTime || taskObj.finishTime || inner.endTime || taskObj.endTime);
    if (!isNaN(rawEnd) && rawEnd > 0) {
      endTime = rawEnd < 10000000000 ? rawEnd * 1000 : rawEnd;
    }
  }

  let status: 'active' | 'completed' | 'failed' | 'waiting' = 'active';
  if (messageType === 3 || taskObj.settleResult === 1 || inner.isSuccess || inner.status === 3) {
    status = 'completed';
  } else if (messageType === 4 || taskObj.settleResult === 2 || inner.isFailed || inner.status === 4) {
    status = 'failed';
  } else if (messageType === 1 || messageType === 2 || current > 0 || target > 0 || duration > 0) {
    status = 'active';
  }

  return {
    battleId: rawBattleId,
    status,
    title: rawPrompt || 'Reto de velocidad',
    prompt: rawPrompt || (target > 0 ? `Objetivo: ${target} ${rewardStr ? 'para ganar ' + rewardStr : 'pts'}` : 'Reto de velocidad en curso'),
    target: target > 0 ? target : undefined,
    current: current >= 0 ? current : undefined,
    reward: rewardStr,
    duration: duration > 0 ? duration : 30,
    remainingSeconds: rawRemaining > 0 ? rawRemaining : undefined,
    endTime,
    timestamp: Date.now(),
    sourceEvent: data.type || 'WebcastLinkmicBattleTaskMessage'
  };
}
