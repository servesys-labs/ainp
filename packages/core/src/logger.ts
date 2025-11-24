/**
 * AINP Core Structured Logger
 * JSON-formatted logging with levels and metadata
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level?: LogLevel;
  format?: 'json' | 'text';
  output?: 'stdout' | 'stderr';
  serviceName?: string;
}

export interface LogMetadata {
  [key: string]: unknown;
}

export class Logger {
  private level: LogLevel;
  private format: 'json' | 'text';
  private output: NodeJS.WriteStream;
  private serviceName: string;

  constructor(config: LoggerConfig = {}) {
    this.level = config.level ?? LogLevel.INFO;
    this.format = config.format ?? 'json';
    this.output = config.output === 'stderr' ? process.stderr : process.stdout;
    this.serviceName = config.serviceName ?? 'ainp-core';
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (level < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];

    if (this.format === 'json') {
      const logEntry = {
        timestamp,
        level: levelName,
        service: this.serviceName,
        message,
        ...metadata,
      };
      this.output.write(JSON.stringify(logEntry) + '\n');
    } else {
      const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
      this.output.write(
        `[${timestamp}] ${levelName} [${this.serviceName}] ${message}${metaStr}\n`
      );
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  child(metadata: LogMetadata): Logger {
    const childLogger = new Logger({
      level: this.level,
      format: this.format,
      output: this.output === process.stderr ? 'stderr' : 'stdout',
      serviceName: this.serviceName,
    });

    // Override log method to include parent metadata
    const originalLog = childLogger['log'].bind(childLogger);
    childLogger['log'] = (level: LogLevel, message: string, childMeta?: LogMetadata) => {
      originalLog(level, message, { ...metadata, ...childMeta });
    };

    return childLogger;
  }
}

// Default logger instance
export const logger = new Logger();
