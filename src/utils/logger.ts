/**
 * Log levels for the testing library
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  prefix: string;
  enabled: boolean;
  colors: boolean;
}

/**
 * Simple logger for NestTestKit
 */
export class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      prefix: '[NestTestKit]',
      enabled: true,
      colors: true,
      ...config,
    };
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.log('ERROR', message, args, '\x1b[31m'); // Red
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.log('WARN', message, args, '\x1b[33m'); // Yellow
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log('INFO', message, args, '\x1b[36m'); // Cyan
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.log('DEBUG', message, args, '\x1b[90m'); // Gray
    }
  }

  success(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.log('SUCCESS', message, args, '\x1b[32m'); // Green
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.config.enabled && level <= this.config.level;
  }

  private log(level: string, message: string, args: any[], color: string): void {
    const timestamp = new Date().toISOString();
    const colorCode = this.config.colors ? color : '';
    const resetCode = this.config.colors ? '\x1b[0m' : '';
    
    const formattedMessage = `${colorCode}${this.config.prefix} [${level}] ${timestamp} - ${message}${resetCode}`;
    
    if (level === 'ERROR') {
      console.error(formattedMessage, ...args);
    } else if (level === 'WARN') {
      console.warn(formattedMessage, ...args);
    } else {
      console.log(formattedMessage, ...args);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    return new Logger({
      ...this.config,
      prefix: `${this.config.prefix}[${context}]`,
    });
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger({
  level: process.env.NEST_TEST_KIT_LOG_LEVEL 
    ? parseInt(process.env.NEST_TEST_KIT_LOG_LEVEL) 
    : LogLevel.WARN,
  enabled: process.env.NEST_TEST_KIT_LOGGING !== 'false',
});

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
    logger.debug(`⏱️  Started: ${label}`);
  }

  end(): number {
    const duration = Date.now() - this.startTime;
    logger.debug(`⏱️  Completed: ${this.label} (${duration}ms)`);
    return duration;
  }

  static async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const timer = new PerformanceTimer(label);
    try {
      const result = await fn();
      timer.end();
      return result;
    } catch (error) {
      timer.end();
      throw error;
    }
  }
} 