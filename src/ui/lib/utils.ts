export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function openDashboard(section?: string): void {
  const hash = section ? `#/${section}` : '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.tabs?.create) {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${hash}`) });
    window.close();
  } else {
    window.open(`dashboard.html${hash}`, '_blank');
  }
}
