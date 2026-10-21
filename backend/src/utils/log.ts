// One JSON line per entry, carrying the Lambda request id and route, so CloudWatch Logs Insights can filter on them.
// The first 8 characters of the request id are the "ref" a caller sees in a 500 (utils/defineHandler.ts).
type Fields = Record<string, unknown>;

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = Exclude<keyof typeof LEVELS, 'silent'>;

let context: { requestId?: string; route?: string } = {};

// A Lambda handles one event at a time, so the running invocation's context can live in the module
export function setLogContext(next: { requestId?: string; route?: string }): void {
  context = next;
}

export const requestRef = (): string => (context.requestId ?? '').slice(0, 8);

function write(level: Level, msg: string, fields?: Fields): void {
  const min = LEVELS[(process.env.LOG_LEVEL as keyof typeof LEVELS) ?? 'info'] ?? LEVELS.info;
  if (LEVELS[level] < min) return;
  const extra = fields && Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v]),
  );
  const line = JSON.stringify({ level, msg, ...context, ...extra });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};
