/**
 * Structured server logger with timestamping, configurable log levels,
 * and contextual subsystem tagging (HTTP, MUSIC, PUZZLE, WS, STORE).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

const currentLevelName = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const currentLevel = LOG_LEVELS[currentLevelName] ?? LOG_LEVELS.info;

const isColorSupported = Boolean(
  process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== 'dumb'
);

const COLORS = isColorSupported ? {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
} : {
  reset: '',
  dim: '',
  cyan: '',
  green: '',
  yellow: '',
  red: '',
  magenta: '',
  blue: '',
};

function formatTimestamp() {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel) {
  return LOG_LEVELS[level] >= currentLevel;
}

export const logger = {
  debug(category: string, message: string, ...meta: unknown[]) {
    if (!shouldLog('debug')) return;
    const ts = COLORS.dim + formatTimestamp() + COLORS.reset;
    const cat = COLORS.cyan + `[${category.toUpperCase()}]` + COLORS.reset;
    console.log(`${ts} ${COLORS.blue}[DEBUG]${COLORS.reset} ${cat} ${message}`, ...meta);
  },

  info(category: string, message: string, ...meta: unknown[]) {
    if (!shouldLog('info')) return;
    const ts = COLORS.dim + formatTimestamp() + COLORS.reset;
    const cat = COLORS.green + `[${category.toUpperCase()}]` + COLORS.reset;
    console.log(`${ts} ${COLORS.green}[INFO]${COLORS.reset} ${cat} ${message}`, ...meta);
  },

  warn(category: string, message: string, ...meta: unknown[]) {
    if (!shouldLog('warn')) return;
    const ts = COLORS.dim + formatTimestamp() + COLORS.reset;
    const cat = COLORS.yellow + `[${category.toUpperCase()}]` + COLORS.reset;
    console.warn(`${ts} ${COLORS.yellow}[WARN]${COLORS.reset} ${cat} ${message}`, ...meta);
  },

  error(category: string, message: string, ...meta: unknown[]) {
    if (!shouldLog('error')) return;
    const ts = COLORS.dim + formatTimestamp() + COLORS.reset;
    const cat = COLORS.red + `[${category.toUpperCase()}]` + COLORS.reset;
    console.error(`${ts} ${COLORS.red}[ERROR]${COLORS.reset} ${cat} ${message}`, ...meta);
  },

  /**
   * HTTP request logging matching standard format with extended context
   */
  http(method: string, path: string, status: number, latencyMs: number, details = '') {
    if (!shouldLog('info')) return;
    const statusColor = status >= 500 ? COLORS.red : status >= 400 ? COLORS.yellow : COLORS.green;
    const suffix = details ? ` ${COLORS.dim}(${details})${COLORS.reset}` : '';
    console.log(`[API] ${method} ${path} -> ${statusColor}${status}${COLORS.reset} (${latencyMs}ms)${suffix}`);
  },

  /**
   * WebSocket event logging
   */
  ws(event: string, details = '') {
    if (!shouldLog('info')) return;
    console.log(`[WS] ${event}${details ? ` ${details}` : ''}`);
  },

  /**
   * Music harvesting diagnostics
   */
  harvest(source: string, count: number, latencyMs: number, query = '') {
    if (!shouldLog('info')) return;
    const qStr = query ? ` for "${query}"` : '';
    logger.info('harvest', `${source} returned ${count} candidate tracks${qStr} in ${latencyMs}ms`);
  },

  /**
   * Rejection sampling breakdown
   */
  sampling(total: number, accepted: number, clueStats: { title?: number; artist?: number; keyword?: number }, rejections: Record<string, number>) {
    if (!shouldLog('info')) return;
    const clueBreakdown = `${clueStats.title || 0} Title, ${clueStats.artist || 0} Artist, ${clueStats.keyword || 0} Keyword`;
    const rejList = Object.entries(rejections)
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(', ') || 'none';
    logger.info('sampling', `Evaluated ${total} tracks -> ${accepted} accepted (${clueBreakdown}) | Filtered: ${rejList}`);
  },

  /**
   * Live crossword layout generation metrics
   */
  puzzle(title: string, wordsPlaced: number, targetWords: number, gridSize: string, latencyMs: number) {
    if (!shouldLog('info')) return;
    logger.info('crossword', `Layout generated for "${title}": ${wordsPlaced}/${targetWords} words placed across ${gridSize} in ${latencyMs}ms`);
  },

  /**
   * Live puzzle token lifecycle
   */
  store(action: string, token: string | null | undefined, details = '') {
    if (!shouldLog('debug')) return;
    logger.debug('store', `Token ${action}: ${token ? `${token.slice(0, 8)}...` : ''} ${details}`);
  }
};
