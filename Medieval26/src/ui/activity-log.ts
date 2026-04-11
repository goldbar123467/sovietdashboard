import type { LogEntry } from '../types';

const MAX_LOG_ENTRIES = 20;

export function renderActivityLog(log: LogEntry[], container: HTMLElement): void {
  const recent = log.slice(-MAX_LOG_ENTRIES).reverse();

  if (recent.length === 0) {
    container.innerHTML = '<div class="hint">No activity yet</div>';
    return;
  }

  container.innerHTML = recent.map(entry => {
    const typeClass = `log-type-${entry.type}`;
    return `<div class="activity-entry ${typeClass}">
      <span class="activity-day">Day ${entry.day}</span>
      <span class="activity-text">${entry.text}</span>
    </div>`;
  }).join("");
}
