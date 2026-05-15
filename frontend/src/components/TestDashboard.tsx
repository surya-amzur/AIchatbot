import React, { useState, useEffect } from "react";
import { logger } from "../utils/logger";
import { generateTestReport, displayReport, downloadReport } from "../utils/testReportGenerator";

interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "debug";
  component: string;
  message: string;
  data?: any;
}

export const TestDashboard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | LogEntry["level"]>("all");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Poll logger for updates
    const interval = setInterval(() => {
      setLogs([...logger.getLogs()]);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) => filter === "all" || log.level === filter);

  const levelCounts = {
    success: logs.filter((l) => l.level === "success").length,
    info: logs.filter((l) => l.level === "info").length,
    warning: logs.filter((l) => l.level === "warning").length,
    error: logs.filter((l) => l.level === "error").length,
  };

  const getLevelColor = (level: LogEntry["level"]): string => {
    switch (level) {
      case "success":
        return "#00aa00";
      case "error":
        return "#cc0000";
      case "warning":
        return "#ff8800";
      case "info":
        return "#0066cc";
      default:
        return "#666666";
    }
  };

  const getIcon = (level: LogEntry["level"]): string => {
    switch (level) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "info":
        return "ℹ️";
      case "debug":
        return "🔍";
    }
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          padding: "10px 16px",
          background: "#3557e6",
          color: "white",
          border: "none",
          borderRadius: "20px",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          zIndex: 9998,
          boxShadow: "0 4px 12px rgba(53, 87, 230, 0.4)",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        📊 Tests ({logs.length})
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        width: "100%",
        maxWidth: "600px",
        height: "100vh",
        maxHeight: "600px",
        background: "#1a1a2e",
        border: "1px solid #2a2a3e",
        borderRadius: "8px 8px 0 0",
        boxShadow: "-4px -4px 20px rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        color: "#e0e0e0",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #2a2a3e",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(135deg, #0f0f1e 0%, #2a2a3e 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "18px" }}>📊</span>
          <span style={{ fontWeight: "bold", fontSize: "14px" }}>Test Dashboard</span>
          <span style={{ fontSize: "12px", color: "#aaa", marginLeft: "8px" }}>
            {filteredLogs.length} logs
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={displayReport}
            style={{
              padding: "6px 12px",
              fontSize: "11px",
              background: "#3557e6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            title="View full report"
          >
            📋
          </button>
          <button
            onClick={downloadReport}
            style={{
              padding: "6px 12px",
              fontSize: "11px",
              background: "#2a2a3e",
              color: "#e0e0e0",
              border: "1px solid #3557e6",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            title="Download report"
          >
            📥
          </button>
          <button
            onClick={() => setIsVisible(false)}
            style={{
              padding: "6px 12px",
              fontSize: "11px",
              background: "transparent",
              color: "#aaa",
              border: "none",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          padding: "12px 16px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
          borderBottom: "1px solid #2a2a3e",
          fontSize: "12px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#00aa00", fontWeight: "bold" }}>{levelCounts.success}</div>
          <div style={{ color: "#aaa", fontSize: "10px" }}>Success</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#0066cc", fontWeight: "bold" }}>{levelCounts.info}</div>
          <div style={{ color: "#aaa", fontSize: "10px" }}>Info</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#ff8800", fontWeight: "bold" }}>{levelCounts.warning}</div>
          <div style={{ color: "#aaa", fontSize: "10px" }}>Warning</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#cc0000", fontWeight: "bold" }}>{levelCounts.error}</div>
          <div style={{ color: "#aaa", fontSize: "10px" }}>Error</div>
        </div>
      </div>

      {/* Filter */}
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid #2a2a3e",
          fontSize: "11px",
        }}
      >
        {(["all", "success", "info", "warning", "error"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "4px 12px",
              background: filter === f ? "#3557e6" : "#2a2a3e",
              color: "#e0e0e0",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
            }}
          >
            {f === "all" ? "All" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Logs */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "12px 16px",
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: "#666", fontSize: "12px", textAlign: "center", marginTop: "20px" }}>
            No logs yet. Run tests to see results.
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "8px",
                padding: "8px",
                background: "#2a2a3e",
                borderLeft: `3px solid ${getLevelColor(log.level)}`,
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span>{getIcon(log.level)}</span>
                <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: "9px" }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ color: "#3557e6", fontWeight: "bold" }}>[{log.component}]</span>
              </div>
              <div style={{ color: "#e0e0e0", marginLeft: "24px" }}>{log.message}</div>
              {log.data && (
                <div
                  style={{
                    marginLeft: "24px",
                    marginTop: "4px",
                    padding: "4px",
                    background: "#0f0f1e",
                    borderRadius: "2px",
                    fontSize: "9px",
                    fontFamily: "monospace",
                    color: "#00ff00",
                    overflow: "auto",
                    maxHeight: "80px",
                  }}
                >
                  <pre style={{ margin: 0 }}>{JSON.stringify(log.data, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #2a2a3e",
          fontSize: "10px",
          color: "#aaa",
          background: "#0f0f1e",
          textAlign: "center",
        }}
      >
        💡 Tip: Open browser DevTools (F12) Console to see real-time logs
      </div>
    </div>
  );
};

export default TestDashboard;
