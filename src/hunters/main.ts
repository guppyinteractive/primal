import '../shared/wire.css';
import './hunters.css';
import { DISCLAIMER, esc, hunterName, newId, topbar } from '../shared/util';
import { load, save } from '../shared/store';
import { protectIfInstalled } from '../shared/persist';
import { oneTab } from '../shared/tabs';
import { registerWorker } from '../shared/install';
import { backUpEverything, backUpPart, backupRowHtml, currentStatus, type Message } from '../shared/backup';
import { RESOURCES, RESOURCE_KINDS, type ResourceKind } from '../shared/game';
import { resourceIcon } from '../shared/icons';

const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;

interface Hunter {
  id: string;
  /** The campaign this hunter plays in, or null. Ignored if that campaign isn't on this device. */
  campaignId: string | null;
  player: string;
  hunterClass: string;
  /** Skill tree: [tier 1 gained, tier 2 gained] for rows A–E. */
  skills: [boolean, boolean][];
  counts: Record<ResourceKind, number[]>;
  notes: string;
}

interface Saved {
  hunters: Hunter[];
  current: number;
}

function newHunter(): Hunter {
  return {
    id: newId(),
    campaignId: null,
    player: '',
    hunterClass: '',
    skills: ROWS.map(() => [false, false] as [boolean, boolean]),
    counts: {
      materials: RESOURCES.materials.names.map(() => 0),
      plants: RESOURCES.plants.names.map(() => 0),
      elements: RESOURCES.elements.names.map(() => 0),
    },
    notes: '',
  };
}

const root = document.getElementById('app')!;
await oneTab(); // before loading, so an inactive tab never saves
const state = await load<Saved>('hunters', { hunters: [newHunter()], current: 0 });
/** A link from a campaign or fight opens that hunter. */
const linked = new URLSearchParams(location.search).get('hunter');
if (linked && state.hunters.some((x) => x.id === linked)) state.current = state.hunters.findIndex((x) => x.id === linked);
if (linked) history.replaceState(null, '', location.pathname);
/** The campaigns on this device, to choose from (read once; the campaign tracker owns them). */
const campaignRecord = await load<{ campaigns: { id: string; name: string }[]; current: string } | null>('campaign', null);
const campaigns = campaignRecord?.campaigns ?? [];
/** The hunter's campaign, if it's on this device. */
const campaignOf = (h: Hunter) => campaigns.find((x) => x.id === h.campaignId) ?? null;

/** The outcome of the last backup. */
let message: Message | null = null;
let status = await currentStatus();

const hunter = () => state.hunters[state.current];
const persist = () => void save('hunters', state);

function render(): void {
  const h = hunter();
  const tabs = state.hunters.map((x, i) =>
    `<button class="toggle" aria-pressed="${i === state.current}" data-act="pick" data-i="${i}">${esc(hunterName(x, i))}</button>`).join('');
  const campaign = campaignOf(h);
  const campaignField = campaigns.length ? `
            <label class="field"><span class="label">Campaign</span>
              <select data-act="campaign">
                <option value="">None</option>
                ${campaigns.map((x, i) => `<option value="${esc(x.id)}" ${x === campaign ? 'selected' : ''}>${esc(x.name.trim() || `Campaign ${i + 1}`)}</option>`).join('')}
              </select></label>` : '';

  const skills = ROWS.map((r, i) => `
    <div class="skill-row">
      <span class="mid">${r}</span>
      <button class="toggle" aria-pressed="${h.skills[i][0]}" data-act="skill" data-row="${i}" data-tier="0">${r}1</button>
      <span class="note" aria-hidden="true">→</span>
      <button class="toggle" aria-pressed="${h.skills[i][1]}" data-act="skill" data-row="${i}" data-tier="1" ${h.skills[i][0] ? '' : 'disabled'}>${r}2</button>
    </div>`).join('');

  const resources = RESOURCE_KINDS.map((kind) => `
    <section class="box">
      <div class="label">${RESOURCES[kind].title}</div>
      <div class="slots">
        ${RESOURCES[kind].names.map((name, i) => {
          const n = h.counts[kind][i] ?? 0;
          return `
          <div class="counter">
            <span class="name">${resourceIcon(name)}${esc(name)}</span>
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="-1" aria-label="One less ${esc(name)}" ${n ? '' : 'disabled'}>−</button>
            <span class="n">${n}</span>
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="1" aria-label="One more ${esc(name)}">+</button>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('');

  root.innerHTML = `
    ${topbar('Hunter tracker', 'hunters', { campaignId: campaign?.id ?? campaignRecord?.current, hunters: state.hunters, hunterId: h.id })}
    <main class="page hunters">
      <nav class="row tabs">${tabs}<button class="btn quiet small" data-act="add">+ Hunter</button></nav>
      <div class="cols">
        <div class="col">
          <section class="box who">
            <label class="field"><span class="label">Player name</span>
              <input data-field="player" value="${esc(h.player)}" autocomplete="off"></label>
            <label class="field"><span class="label">Class</span>
              <input data-field="hunterClass" value="${esc(h.hunterClass)}" autocomplete="off"></label>
            ${campaignField}
          </section>
          <section class="box">
            <div class="label">Skill tree</div>
            <p class="note">Mark each step when you've gained those cards. Step 2 opens once you have step 1.</p>
            <div class="skills">${skills}</div>
          </section>
        </div>
        <div class="col">
          ${resources}
        </div>
      </div>
      <section class="box">
        <label class="field"><span class="label">Notes</span>
          <textarea data-field="notes" rows="4">${esc(h.notes)}</textarea></label>
      </section>
      ${backupRowHtml('<button class="btn small" data-act="backup">Back up this hunter</button>', status, message)}
      ${state.hunters.length > 1 ? '<div class="row"><button class="btn alert small" data-act="remove">Remove this hunter</button></div>' : ''}
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', async (ev) => {
  const t = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const h = hunter();
  message = null;
  switch (t.dataset.act) {
    case 'backup':
    case 'backup-all':
      message = t.dataset.act === 'backup' ? await backUpPart('hunter', h) : await backUpEverything();
      status = await currentStatus();
      render();
      return;
    case 'pick': state.current = Number(t.dataset.i); break;
    case 'add': state.hunters.push(newHunter()); state.current = state.hunters.length - 1; break;
    case 'remove':
      state.hunters.splice(state.current, 1);
      state.current = Math.max(0, state.current - 1);
      break;
    case 'skill': {
      const row = h.skills[Number(t.dataset.row)];
      const tier = Number(t.dataset.tier);
      if (tier === 1 && !row[0]) break; // step 2 needs step 1
      row[tier] = !row[tier];
      if (!row[0]) row[1] = false; // giving up step 1 also clears step 2
      break;
    }
    case 'count': {
      const list = h.counts[t.dataset.kind as ResourceKind];
      const i = Number(t.dataset.i);
      list[i] = Math.max(0, list[i] + Number(t.dataset.d));
      break;
    }
    default: return;
  }
  persist();
  render();
});

root.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement;
  if (el.dataset.act === 'campaign') {
    hunter().campaignId = el.value || null;
    persist();
    render(); // the top bar follows
  }
});

// Text fields save as you type without re-rendering (keeps focus and the keyboard open).
root.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
  if (el.dataset.field) {
    (hunter() as unknown as Record<string, string>)[el.dataset.field] = el.value;
    persist();
  }
});

void protectIfInstalled();
registerWorker();
render();
