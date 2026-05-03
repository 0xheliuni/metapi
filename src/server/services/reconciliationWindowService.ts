export type ReconciliationScopeType = 'hour' | 'day';

export type ReconciliationWindow = {
  scopeType: ReconciliationScopeType;
  windowStart: string;
  windowEnd: string;
};

function startOfHour(date: Date): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function resolveReconciliationWindow(input: {
  scopeType?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
}): ReconciliationWindow {
  const scopeType: ReconciliationScopeType = String(input.scopeType || 'day') === 'hour' ? 'hour' : 'day';
  const parsedEnd = typeof input.windowEnd === 'string' && input.windowEnd.trim()
    ? new Date(input.windowEnd)
    : new Date();
  if (Number.isNaN(parsedEnd.getTime())) throw new Error('windowEnd 无效');

  const rawStart = typeof input.windowStart === 'string' && input.windowStart.trim()
    ? new Date(input.windowStart)
    : null;
  if (rawStart && Number.isNaN(rawStart.getTime())) throw new Error('windowStart 无效');

  const normalizedEnd = scopeType === 'hour' ? startOfHour(parsedEnd) : startOfDay(parsedEnd);
  const normalizedStart = rawStart
    ? (scopeType === 'hour' ? startOfHour(rawStart) : startOfDay(rawStart))
    : (() => {
      const base = new Date(normalizedEnd);
      if (scopeType === 'hour') {
        base.setUTCHours(base.getUTCHours() - 1);
      } else {
        base.setUTCDate(base.getUTCDate() - 1);
      }
      return base;
    })();

  if (normalizedStart.getTime() >= normalizedEnd.getTime()) {
    throw new Error('windowStart 必须早于 windowEnd');
  }

  return {
    scopeType,
    windowStart: normalizedStart.toISOString(),
    windowEnd: normalizedEnd.toISOString(),
  };
}
