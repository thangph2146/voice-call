/**
 * Logger utility for the Voice Call application
 * Supports multiple log levels and can be extended for server logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown> | string | number | boolean | null;
  source?: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private currentLevel = LogLevel.INFO;
  private listeners: ((logs: LogEntry[]) => void)[] = [];

  constructor() {
    // Only access localStorage in the browser
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        // Load log level from environment or localStorage
        const savedLevel = localStorage.getItem('logLevel');
        if (savedLevel) {
          this.currentLevel = parseInt(savedLevel) as LogLevel;
        }

        // Load logs from localStorage if available
        const savedLogs = localStorage.getItem('appLogs');
        if (savedLogs) {
          try {
            const parsedLogs: unknown = JSON.parse(savedLogs);
            if (Array.isArray(parsedLogs)) {
              this.logs = parsedLogs.map(raw => {
                const obj = raw as Partial<LogEntry> & { timestamp?: string };
                return {
                  id: obj.id || crypto.randomUUID(),
                  timestamp: obj.timestamp ? new Date(obj.timestamp) : new Date(),
                  level: typeof obj.level === 'number' ? obj.level : LogLevel.INFO,
                  message: typeof obj.message === 'string' ? obj.message : '',
                  data: obj.data ?? null,
                  source: obj.source,
                } as LogEntry;
              });
            }
          } catch (error) {
            console.warn('Failed to load saved logs:', error);
          }
        }
      } catch (error) {
        console.warn('Logger initialization (localStorage) failed:', error);
      }
    }
  }

  private createLogEntry(level: LogLevel, message: string, data?: LogEntry['data'], source?: string): LogEntry {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      level,
      message,
      data,
      source
    };
  }

  private addLog(entry: LogEntry) {
    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Save to localStorage
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('appLogs', JSON.stringify(this.logs));
      } catch (error) {
        console.warn('Failed to save logs to localStorage:', error);
      }
    }

    // Notify listeners
    this.listeners.forEach(listener => listener([...this.logs]));

    // Also log to console
    this.logToConsole(entry);
  }

  private logToConsole(entry: LogEntry) {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelName}]`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.data || '');
        break;
    }
  }

  debug(message: string, data?: LogEntry['data'], source?: string) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      this.addLog(this.createLogEntry(LogLevel.DEBUG, message, data, source));
    }
  }

  info(message: string, data?: LogEntry['data'], source?: string) {
    if (this.currentLevel <= LogLevel.INFO) {
      this.addLog(this.createLogEntry(LogLevel.INFO, message, data, source));
    }
  }

  warn(message: string, data?: LogEntry['data'], source?: string) {
    if (this.currentLevel <= LogLevel.WARN) {
      this.addLog(this.createLogEntry(LogLevel.WARN, message, data, source));
    }
  }

  error(message: string, data?: LogEntry['data'], source?: string) {
    if (this.currentLevel <= LogLevel.ERROR) {
      this.addLog(this.createLogEntry(LogLevel.ERROR, message, data, source));
    }
  }

  // Utility methods
  setLevel(level: LogLevel) {
    this.currentLevel = level;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('logLevel', level.toString()); } catch {}
    }
    this.info(`Log level changed to ${LogLevel[level]}`, null, 'Logger');
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try { localStorage.removeItem('appLogs'); } catch {}
    }
    this.listeners.forEach(listener => listener([]));
    this.info('Logs cleared', null, 'Logger');
  }

  // Subscribe to log changes
  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Performance logging
  time(label: string) {
    console.time(label);
    this.debug(`Timer started: ${label}`, null, 'Performance');
  }

  timeEnd(label: string) {
    console.timeEnd(label);
    this.debug(`Timer ended: ${label}`, null, 'Performance');
  }

  // Network request logging
  logRequest(url: string, method: string, data?: LogEntry['data']) {
    this.info(`HTTP ${method} ${url}`, data, 'Network');
  }

  logResponse(url: string, status: number, data?: LogEntry['data']) {
    const level = status >= 400 ? LogLevel.ERROR : LogLevel.DEBUG;
    this.addLog(this.createLogEntry(level, `HTTP Response ${status} ${url}`, data, 'Network'));
  }

  // Speech recognition logging
  logSpeechStart() {
    this.info('Speech recognition started', null, 'SpeechRecognition');
  }

  logSpeechResult(text: string, isFinal: boolean) {
    this.debug(`Speech result: "${text}" (${isFinal ? 'final' : 'interim'})`, null, 'SpeechRecognition');
  }

  logSpeechError(error: string) {
    this.error(`Speech recognition error: ${error}`, null, 'SpeechRecognition');
  }

  // Gemini API logging
  logGeminiRequest(prompt: string) {
    this.info('Gemini API request', { prompt: prompt.substring(0, 100) + '...' }, 'GeminiAPI');
  }

  logGeminiResponse(response: string) {
    this.debug('Gemini API response', { response: response.substring(0, 100) + '...' }, 'GeminiAPI');
  }

  logGeminiError(error: unknown) {
    this.error('Gemini API error', typeof error === 'string' ? error : (error as Error)?.message || 'unknown', 'GeminiAPI');
  }
}

// Create singleton instance
export const logger = new Logger();

// Export utility functions for easy access
export const log = {
  debug: (message: string, data?: LogEntry['data'], source?: string) => logger.debug(message, data, source),
  info: (message: string, data?: LogEntry['data'], source?: string) => logger.info(message, data, source),
  warn: (message: string, data?: LogEntry['data'], source?: string) => logger.warn(message, data, source),
  error: (message: string, data?: LogEntry['data'], source?: string) => logger.error(message, data, source),
};
