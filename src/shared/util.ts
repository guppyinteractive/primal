// Small helpers shared by every page.

import { exportAll, storageWarning } from './store';

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Not crypto.randomUUID(), which needs https and the dev server is plain http. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** A hunter as other pages see them: enough to name and link them. */
export interface HunterLink { id: string; player: string; hunterClass: string; campaignId: string | null }

/** How a hunter is named on buttons: player, else class, else their place in the list. */
export const hunterName = (h: { player: string; hunterClass: string }, i: number) =>
  h.player.trim() || h.hunterClass.trim() || `Hunter ${i + 1}`;

export type Tool = 'hunters' | 'campaign' | 'fight';

const TOOLS: [Tool, string][] = [['hunters', 'Hunter'], ['campaign', 'Campaign'], ['fight', 'Fight']];

/** The tools with saved data on this device, read once when the page opens. */
const used = new Set<string>(Object.keys(await exportAll().catch(() => ({}))));

/** What the page is showing, so the tool links can go to the same campaign and its hunters. */
export interface SwitchContext {
  /** The campaign in view, if it's on this device. */
  campaignId?: string | null;
  /** This device's hunters; those in the campaign, and the one shown, are linked by name in place of Hunter. */
  hunters?: HunterLink[];
  /** The hunter shown on the hunter tracker. */
  hunterId?: string;
}

export interface ToolLink { tool: Tool; name: string; href: string; current: boolean }

/** The links between tools from `tool`'s page: none unless this device uses more than one. */
export function switchTools(tool: Tool, ctx: SwitchContext = {}): ToolLink[] {
  const base = import.meta.env.BASE_URL;
  const shown = TOOLS.filter(([t]) => t === tool || used.has(t));
  if (shown.length < 2) return [];
  const { campaignId = null, hunters = [] } = ctx;
  return shown.flatMap(([t, name]): ToolLink[] => {
    if (t === 'hunters') {
      const named = hunters.flatMap((h, i) => ((campaignId && h.campaignId === campaignId) || (tool === t && h.id === ctx.hunterId) ? [{
        tool: t, name: hunterName(h, i), href: `${base}hunters/?hunter=${encodeURIComponent(h.id)}`,
        current: tool === t && h.id === ctx.hunterId,
      }] : []));
      if (named.length) return named;
    }
    const href = t === 'campaign' && campaignId ? `${base}campaign/?campaign=${encodeURIComponent(campaignId)}` : `${base}${t}/`;
    return [{ tool: t, name, href, current: tool === t }];
  });
}

/** The page's top bar. On a tool page, links to the other tools if this device uses more than one. */
export function topbar(where: string, tool?: Tool, ctx: SwitchContext = {}): string {
  const warning = storageWarning();
  const shown = tool ? switchTools(tool, ctx) : [];
  const nav = shown.length
    ? `<nav class="switch" aria-label="Tools">${shown.map((x) =>
      `<a href="${x.href}"${x.current ? ' aria-current="page"' : ''}>${esc(x.name)}</a>`).join('')}</nav>`
    : `<span class="where">${esc(where)}</span>`;
  return `
    <header class="topbar">
      <a href="${import.meta.env.BASE_URL}">PRIMAL TOOLS</a>
      ${nav}
    </header>
    ${warning ? `<p class="storage-warning" role="alert">${esc(warning)}</p>` : ''}`;
}

export const DISCLAIMER = `
  <footer class="disclaimer">
    Unofficial fan-made tool. Not affiliated with or endorsed by the publisher of <em>Primal: The Awakening</em>.
  </footer>`;

/** Keep the screen on while a page is in use, where the browser allows it. */
export function keepAwake(): void {
  const request = async () => {
    try {
      await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } })
        .wakeLock?.request('screen');
    } catch {
      // Not supported or refused; nothing to do.
    }
  };
  document.addEventListener('click', request, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request();
  });
}
