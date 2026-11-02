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

/** Links to the hunters on this device that belong to a campaign. */
export function campaignHunterLinks(hunters: HunterLink[], campaignId: string | null, cls = 'btn small'): string {
  return hunters.map((h, i) => (campaignId && h.campaignId === campaignId
    ? `<a class="${cls}" href="${import.meta.env.BASE_URL}hunters/?hunter=${encodeURIComponent(h.id)}">${esc(hunterName(h, i))}</a>`
    : '')).join('');
}

export type Tool = 'hunters' | 'campaign' | 'fight';

const TOOLS: [Tool, string][] = [['hunters', 'Hunter'], ['campaign', 'Campaign'], ['fight', 'Fight']];

/** The tools with saved data on this device, read once when the page opens. */
const used = new Set<string>(Object.keys(await exportAll().catch(() => ({}))));

/** Where a tool link goes instead of the tool's page, e.g. a hunter's campaign. */
export type ToolLinks = Partial<Record<Tool, string>>;

/** The tools to switch between from `tool`'s page: none unless this device uses more than one. */
export function switchTools(tool: Tool, links: ToolLinks = {}): { tool: Tool; name: string; href: string }[] {
  const shown = TOOLS.filter(([t]) => t === tool || used.has(t));
  return shown.length > 1
    ? shown.map(([t, name]) => ({ tool: t, name, href: links[t] ?? `${import.meta.env.BASE_URL}${t}/` }))
    : [];
}

/** The page's top bar. On a tool page, links to the other tools if this device uses more than one. */
export function topbar(where: string, tool?: Tool, links: ToolLinks = {}): string {
  const warning = storageWarning();
  const shown = tool ? switchTools(tool, links) : [];
  const nav = shown.length
    ? `<nav class="switch" aria-label="Tools">${shown.map((x) =>
      `<a href="${x.href}"${x.tool === tool ? ' aria-current="page"' : ''}>${x.name}</a>`).join('')}</nav>`
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
