/**
 * Logging utility for frontend tests and features
 * Shows detailed information about what's happening in the app
 */

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "debug";
  component: string;
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private isDevelopment = import.meta.env.DEV;

  /**
   * Get all logs collected so far
   */
  getLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Export logs as JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Export logs as CSV
   */
  exportCSV(): string {
    const headers = ["Timestamp", "Level", "Component", "Message", "Data"];
    const rows = this.logs.map((log) => [
      log.timestamp,
      log.level.toUpperCase(),
      log.component,
      log.message,
      log.data ? JSON.stringify(log.data) : "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    return csvContent;
  }

  /**
   * Log info level message
   */
  info(component: string, message: string, data?: any): void {
    this._log("info", component, message, data);
  }

  /**
   * Log success (feature working)
   */
  success(component: string, message: string, data?: any): void {
    this._log("success", component, message, data);
  }

  /**
   * Log warning
   */
  warn(component: string, message: string, data?: any): void {
    this._log("warning", component, message, data);
  }

  /**
   * Log error
   */
  error(component: string, message: string, data?: any): void {
    this._log("error", component, message, data);
  }

  /**
   * Log debug info (only in dev mode)
   */
  debug(component: string, message: string, data?: any): void {
    if (this.isDevelopment) {
      this._log("debug", component, message, data);
    }
  }

  /**
   * Internal logging method
   */
  private _log(
    level: LogEntry["level"],
    component: string,
    message: string,
    data?: any
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
    };

    this.logs.push(entry);

    // Also log to console with styling
    const colors = {
      info: "color: #0066cc",
      success: "color: #00aa00; font-weight: bold",
      warning: "color: #ff8800",
      error: "color: #cc0000; font-weight: bold",
      debug: "color: #666666",
    };

    const icon = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      debug: "🔍",
    };

    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[${timestamp}] ${icon[level]} [${component}] ${message}`,
      colors[level],
      data ? data : ""
    );
  }
}

// Global singleton
export const logger = new Logger();

// Make available globally for debugging in browser console
(window as any).logger = logger;
