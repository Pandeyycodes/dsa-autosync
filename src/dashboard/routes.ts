import { useEffect, useState } from 'react';
import { Activity, Blocks, FolderGit2, LayoutGrid, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export type RouteId = 'overview' | 'activity' | 'repository' | 'platforms' | 'general';

export interface RouteDef {
  id: RouteId;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: 'Workspace' | 'Settings';
}

export const ROUTES: RouteDef[] = [
  { id: 'overview', label: 'Overview', title: 'Overview', description: 'Your synchronized solutions at a glance.', icon: LayoutGrid, group: 'Workspace' },
  { id: 'activity', label: 'Activity', title: 'Activity', description: 'Every detected submission: uploaded, pending, ignored and failed.', icon: Activity, group: 'Workspace' },
  { id: 'repository', label: 'Repository', title: 'Repository', description: 'GitHub connection and where your solutions are committed.', icon: FolderGit2, group: 'Settings' },
  { id: 'platforms', label: 'Platforms', title: 'Platforms & languages', description: 'Choose which platforms and languages CodeSync syncs.', icon: Blocks, group: 'Settings' },
  { id: 'general', label: 'General', title: 'General', description: 'Sync behaviour, duplicates, README content and notifications.', icon: SlidersHorizontal, group: 'Settings' },
];

const ALIASES: Record<string, RouteId> = { submissions: 'activity' };
const isRoute = (v: string): v is RouteId => ROUTES.some((r) => r.id === v);

export function parseHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  if (isRoute(id)) return id;
  return ALIASES[id] ?? 'overview';
}

/** Minimal hash router — deep-linkable from the popup (dashboard.html#/general). */
export function useHashRoute(): [RouteId, (id: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = (id: RouteId) => {
    if (parseHash(window.location.hash) !== id) window.location.hash = `/${id}`;
    setRoute(id);
  };
  return [route, navigate];
}
