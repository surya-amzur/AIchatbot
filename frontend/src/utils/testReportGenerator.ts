import { logger, LogEntry } from "../utils/logger";

interface TestReport {
  timestamp: string;
  summary: {
    totalLogs: number;
    byLevel: Record<string, number>;
    byComponent: Record<string, number>;
    status: "PASS" | "FAIL" | "IN_PROGRESS";
  };
  logs: LogEntry[];
  htmlReport: string;
}

/**
 * Generate a comprehensive test report for manager presentation
 */
export function generateTestReport(): TestReport {
  const logs = logger.getLogs();

  // Count by level
  const byLevel: Record<string, number> = {
    success: 0,
    info: 0,
    warning: 0,
    error: 0,
    debug: 0,
  };

  // Count by component
  const byComponent: Record<string, number> = {};

  logs.forEach((log) => {
    byLevel[log.level]++;
    byComponent[log.component] = (byComponent[log.component] || 0) + 1;
  });

  // Determine overall status
  const status = byLevel.error > 0 ? "FAIL" : "PASS";

  const report: TestReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalLogs: logs.length,
      byLevel,
      byComponent,
      status,
    },
    logs,
    htmlReport: generateHTML(logs, byLevel, byComponent, status),
  };

  return report;
}

/**
 * Generate HTML report for browser viewing
 */
function generateHTML(
  logs: LogEntry[],
  byLevel: Record<string, number>,
  byComponent: Record<string, number>,
  status: string
): string {
  const statusColor = status === "PASS" ? "#00aa00" : "#cc0000";
  const statusEmoji = status === "PASS" ? "✅" : "❌";

  const levelSummary = Object.entries(byLevel)
    .map(
      ([level, count]) => `
    <div class="stat-box">
      <div class="stat-level" style="color: ${getLevelColor(level)}">${level.toUpperCase()}</div>
      <div class="stat-count">${count}</div>
    </div>
  `
    )
    .join("");

  const componentSummary = Object.entries(byComponent)
    .map(
      ([component, count]) => `
    <tr>
      <td>${component}</td>
      <td>${count}</td>
    </tr>
  `
    )
    .join("");

  const logsHTML = logs
    .map(
      (log) => `
    <div class="log-entry log-${log.level}">
      <div class="log-header">
        <span class="log-icon">${getLogIcon(log.level)}</span>
        <span class="log-time">${log.timestamp}</span>
        <span class="log-component">[${log.component}]</span>
        <span class="log-level">${log.level.toUpperCase()}</span>
      </div>
      <div class="log-message">${log.message}</div>
      ${log.data ? `<div class="log-data"><pre>${JSON.stringify(log.data, null, 2)}</pre></div>` : ""}
    </div>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Frontend Test Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%);
      color: #e0e0e0;
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: #1a1a2e;
      border-radius: 8px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #0f0f1e 0%, #2a2a3e 100%);
      padding: 40px;
      border-bottom: 2px solid #3557e6;
    }

    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .status-badge {
      background: ${statusColor};
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 14px;
    }

    .header p {
      color: #aaa;
      font-size: 14px;
    }

    .summary-section {
      padding: 40px;
      border-bottom: 1px solid #2a2a3e;
    }

    .summary-section h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #3557e6;
    }

    .stat-boxes {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }

    .stat-box {
      background: #2a2a3e;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      border-left: 4px solid #3557e6;
    }

    .stat-level {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .stat-count {
      font-size: 28px;
      font-weight: bold;
    }

    .component-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    .component-table th,
    .component-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #2a2a3e;
    }

    .component-table th {
      background: #2a2a3e;
      font-weight: bold;
      color: #3557e6;
    }

    .logs-section {
      padding: 40px;
    }

    .logs-section h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #3557e6;
    }

    .log-entry {
      background: #2a2a3e;
      border-left: 4px solid #3557e6;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .log-entry:hover {
      background: #333343;
      box-shadow: 0 4px 12px rgba(53, 87, 230, 0.2);
    }

    .log-entry.log-success {
      border-left-color: #00aa00;
    }

    .log-entry.log-error {
      border-left-color: #cc0000;
    }

    .log-entry.log-warning {
      border-left-color: #ff8800;
    }

    .log-entry.log-info {
      border-left-color: #0066cc;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .log-icon {
      font-size: 16px;
    }

    .log-time {
      color: #aaa;
      font-family: monospace;
    }

    .log-component {
      color: #3557e6;
      font-weight: bold;
    }

    .log-level {
      color: #aaa;
      text-transform: uppercase;
      font-size: 11px;
    }

    .log-message {
      color: #e0e0e0;
      font-size: 14px;
      margin-left: 32px;
    }

    .log-data {
      margin: 10px 0 0 32px;
      background: #0f0f1e;
      border-radius: 4px;
      overflow: auto;
    }

    .log-data pre {
      padding: 12px;
      font-size: 12px;
      color: #00ff00;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .footer {
      padding: 20px 40px;
      background: #0f0f1e;
      border-top: 1px solid #2a2a3e;
      color: #aaa;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .export-buttons {
      display: flex;
      gap: 10px;
    }

    button {
      background: #3557e6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }

    button:hover {
      background: #2a45cc;
    }

    @media (max-width: 768px) {
      .header {
        padding: 20px;
      }

      .header h1 {
        font-size: 24px;
      }

      .summary-section,
      .logs-section {
        padding: 20px;
      }

      .stat-boxes {
        grid-template-columns: repeat(2, 1fr);
      }

      .footer {
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        ${statusEmoji} Frontend Test Report
        <span class="status-badge">${status}</span>
      </h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-section">
      <h2>📊 Test Summary</h2>
      <div class="stat-boxes">
        ${levelSummary}
      </div>

      <h3 style="margin-top: 30px; margin-bottom: 15px; color: #aaa; font-size: 14px;">Tests by Component</h3>
      <table class="component-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Tests</th>
          </tr>
        </thead>
        <tbody>
          ${componentSummary}
        </tbody>
      </table>
    </div>

    <div class="logs-section">
      <h2>📝 Detailed Logs</h2>
      ${logsHTML}
    </div>

    <div class="footer">
      <div>
        <strong>Total Logs:</strong> ${logs.length} |
        <strong>Duration:</strong> ${calculateDuration(logs)}
      </div>
      <div class="export-buttons">
        <button onclick="downloadJSON()">📥 JSON</button>
        <button onclick="downloadCSV()">📥 CSV</button>
        <button onclick="window.print()">🖨️ Print</button>
      </div>
    </div>
  </div>

  <script>
    function downloadJSON() {
      const data = ${JSON.stringify(logs)};
      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2)));
      element.setAttribute('download', 'test-report-' + new Date().getTime() + '.json');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }

    function downloadCSV() {
      const data = ${JSON.stringify(logs)};
      const headers = ['Timestamp', 'Level', 'Component', 'Message'];
      const rows = data.map(log => [
        log.timestamp,
        log.level,
        log.component,
        log.message.replace(/"/g, '""')
      ]);

      let csv = headers.map(h => \`"\${h}"\`).join(',') + '\\n';
      csv += rows.map(row => row.map(cell => \`"\${cell}"\`).join(',')).join('\\n');

      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
      element.setAttribute('download', 'test-report-' + new Date().getTime() + '.csv');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  </script>
</body>
</html>
  `;
}

/**
 * Get color for log level
 */
function getLevelColor(level: string): string {
  const colors: Record<string, string> = {
    success: "#00aa00",
    error: "#cc0000",
    warning: "#ff8800",
    info: "#0066cc",
    debug: "#666666",
  };
  return colors[level] || "#e0e0e0";
}

/**
 * Get emoji icon for log level
 */
function getLogIcon(level: string): string {
  const icons: Record<string, string> = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    debug: "🔍",
  };
  return icons[level] || "•";
}

/**
 * Calculate total test duration
 */
function calculateDuration(logs: LogEntry[]): string {
  if (logs.length < 2) return "N/A";

  const first = new Date(logs[0].timestamp);
  const last = new Date(logs[logs.length - 1].timestamp);
  const duration = last.getTime() - first.getTime();

  return `${duration}ms`;
}

/**
 * Download report as HTML file
 */
export function downloadReport(): void {
  const report = generateTestReport();
  const element = document.createElement("a");
  element.setAttribute("href", "data:text/html;charset=utf-8," + encodeURIComponent(report.htmlReport));
  element.setAttribute("download", `test-report-${new Date().getTime()}.html`);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

/**
 * Display report in new window/tab
 */
export function displayReport(): void {
  const report = generateTestReport();
  const reportWindow = window.open("", "_blank");
  if (reportWindow) {
    reportWindow.document.write(report.htmlReport);
    reportWindow.document.close();
  }
}
