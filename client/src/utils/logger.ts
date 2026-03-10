type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private isProduction = import.meta.env.PROD;
  private debugMode = import.meta.env.VITE_DEBUG_MODE === 'true';

  private formatMessage(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry;
    
    let formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (context) {
      formattedMessage += ` | Context: ${JSON.stringify(context)}`;
    }
    
    if (error) {
      formattedMessage += ` | Error: ${error.message}`;
      if (error.stack) {
        formattedMessage += ` | Stack: ${error.stack}`;
      }
    }
    
    return formattedMessage;
  }

  private createEntry(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error
    };
  }

  private log(entry: LogEntry): void {
    const formattedMessage = this.formatMessage(entry);
    
    switch (entry.level) {
      case 'debug':
        if (this.isDevelopment || this.debugMode) {
          console.debug(formattedMessage, entry.context, entry.error);
        }
        break;
      case 'info':
        console.info(formattedMessage, entry.context, entry.error);
        break;
      case 'warn':
        console.warn(formattedMessage, entry.context, entry.error);
        break;
      case 'error':
        console.error(formattedMessage, entry.context, entry.error);
        break;
    }

    // In production, send errors to monitoring service
    if (this.isProduction && entry.level === 'error') {
      this.sendToMonitoring(entry);
    }
  }

  private async sendToMonitoring(entry: LogEntry): Promise<void> {
    try {
      // Send to error tracking service (e.g., Sentry, LogRocket, custom endpoint)
      await fetch('/api/v1/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: entry.level,
          message: entry.message,
          context: entry.context,
          stack: entry.error?.stack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: entry.timestamp
        })
      });
    } catch (monitoringError) {
      console.error('Failed to send log to monitoring service:', monitoringError);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    const entry = this.createEntry('debug', message, context);
    this.log(entry);
  }

  info(message: string, context?: Record<string, any>): void {
    const entry = this.createEntry('info', message, context);
    this.log(entry);
  }

  warn(message: string, context?: Record<string, any>): void {
    const entry = this.createEntry('warn', message, context);
    this.log(entry);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    const entry = this.createEntry('error', message, context, error);
    this.log(entry);
  }

  // Specialized logging methods
  api(method: string, url: string, status?: number, error?: Error): void {
    this.error(`API ${method} ${url} failed`, error, {
      method,
      url,
      status,
      type: 'api_failure'
    });
  }

  database(operation: string, table: string, error?: Error): void {
    this.error(`Database ${operation} on ${table} failed`, error, {
      operation,
      table,
      type: 'db_failure'
    });
  }

  mutation(type: string, entity: string, error?: Error): void {
    this.error(`Mutation ${type} failed for ${entity}`, error, {
      mutationType: type,
      entity,
      type: 'mutation_failure'
    });
  }

  routing(path: string, error?: Error): void {
    this.error(`Routing to ${path} failed`, error, {
      path,
      type: 'routing_failure'
    });
  }

  // Performance logging
  performance(operation: string, duration: number, context?: Record<string, any>): void {
    this.info(`Performance: ${operation} took ${duration}ms`, {
      ...context,
      operation,
      duration,
      type: 'performance'
    });
  }

  // User action logging
  userAction(action: string, context?: Record<string, any>): void {
    this.info(`User action: ${action}`, {
      ...context,
      action,
      type: 'user_action'
    });
  }
}

// Create singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (message: string, context?: Record<string, any>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, any>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, any>) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: Record<string, any>) => logger.error(message, error, context),
  api: (method: string, url: string, status?: number, error?: Error) => logger.api(method, url, status, error),
  database: (operation: string, table: string, error?: Error) => logger.database(operation, table, error),
  mutation: (type: string, entity: string, error?: Error) => logger.mutation(type, entity, error),
  routing: (path: string, error?: Error) => logger.routing(path, error),
  performance: (operation: string, duration: number, context?: Record<string, any>) => logger.performance(operation, duration, context),
  userAction: (action: string, context?: Record<string, any>) => logger.userAction(action, context)
};
