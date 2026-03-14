type LogMeta = Record<string, unknown> & {
  trace_id?: string;
  scope?: string;
  event_type?: string;
};

function emit(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: LogMeta): void {
  const prefix = `[${level}] ${message}`;
  if (!meta) {
    const logger = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    logger(prefix);
    return;
  }
  const logger = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  logger(prefix, {
    ...meta,
    ts: new Date().toISOString()
  });
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  emit('INFO', message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  emit('WARN', message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  emit('ERROR', message, meta);
}
