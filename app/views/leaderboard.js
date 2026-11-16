// A bounty's leaderboard: every row the API ranks, drawn without putting every row in the page.
//
// Six thousand rows are a real answer here, so the table keeps a fixed row height and renders only the window the
// reader is looking at, between two spacers. Sorting, searching and the prize filter repaint that window alone; a
// row can be opened for the entrant's own profile, read from the profile endpoint it names.

import { api } from '../lib/net.js';
import { ago, count, dayUtc, grouped, plain, stampUtc, usd, when } from '../lib/format.js';
import { avatar, clear, el, kv, panel, pill, state, stat } from '../lib/ui.js';

const ROW_H = 46;
const HEAD_H = 40;
const BUFFER = 6;

const HEADERS = el('div', { class: 'lb-head' });

export default async function render(ctx) {
  const slug = ctx.route.slug;
  ctx.setTitle('Leaderboard · make.fun board');

  const root = el('div', { class: 'wrap' });
  const crumbs = el('div', { class: 'crumbs' }, el('a', { href: '#/', text: 'Board' }), el('span', { text: '/' }), el('a', { href: `#/bounty/${encodeURIComponent(slug)}`, text: slug }), el('span', { text: '/ leaderboard' }));
  const head = el('div', { class: 'page-head' });
  const body = el('div', {});
  root.append(crumbs, head, body);
  ctx.mount.append(root);
  body.append(el('div', { class: 'skeleton', style: 'height:260px' }));

  const data = await api(`/competitions/${encodeURIComponent(slug)}/leaderboard`, { signal: ctx.signal, fresh: ctx.fresh });
  if (ctx.signal.aborted) return;

  const all = Array.isArray(data.entries) ? data.entries : [];
  const columns = (Array.isArray(data.columns) ? data.columns : []).filter((column) => column.hidden !== true);
  const comp = typeof data.competition === 'object' && data.competition !== null ? data.competition : {};
  const phase = typeof data.phase === 'object' && data.phase !== null ? data.phase : null;
  const rankColumn = columns.find((column) => column.key === data.rank_key) ?? columns[0] ?? null;
  const label = comp.title ?? slug;
  ctx.setTitle(`${label} · leaderboard`);

  head.append(
    el(
      'div',
      { class: 'head-main' },
      el('div', { class: 'card-top' }, pill(data.title ?? 'Results', 'prize'), phase?.title ? pill(phase.title) : null, data.harness_kind ? pill(data.harness_kind) : null),
      el('h1', { text: `Leaderboard · ${label}` }),
      el('p', {
        class: 'lede',
        text: rankColumn === null
          ? 'Every entry this bounty ranks, in the order the API gives, with each column as make.fun computes it.'
          : `Ranked by ${rankColumn.title}${rankColumn.sorting === 'asc' ? ' (lower first)' : ' (higher first)'}. Every column is a figure make.fun computes; nothing here is estimated.`,
      }),
    ),
    el(
      'div',
      { class: 'head-side' },
      el(
        'div',
        { class: 'stats' },
        stat('Entries', count(all.length), 'ranked by the API'),
        stat('Prize eligible', String(all.filter((entry) => entry.prize_eligible === true).length), 'one place each', 'money'),
        phase?.ends_at ? stat('Phase ends', dayUtc(phase.ends_at), phase.scores ?? '') : null,
      ),
    ),
  );

  while (body.firstChild) body.removeChild(body.firstChild);

  // ── the tools above the table ───────────────────────────────────────────────

  const search = el('input', {
    type: 'search',
    id: 'lb-search',
    placeholder: 'Filter by handle or title',
    attrs: { 'aria-label': 'Filter by handle or title', autocomplete: 'off' },
    on: { input: () => apply() },
  });
  const prizes = el('input', { type: 'checkbox', id: 'lb-prizes', on: { change: () => apply() } });
  const countLine = el('span', { class: 'small muted' });
  const tools = el(
    'div',
    { class: 'board-tools' },
    el('div', { class: 'field' }, el('label', { for: 'lb-search', text: 'Find' }), search),
    el('div', { class: 'field' }, prizes, el('label', { for: 'lb-prizes', text: 'Only prize-eligible rows' })),
    countLine,
  );
  const table = el('div', { class: 'lb' });
  const scroller = el('div', { class: 'lb-view', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Leaderboard rows' } });
  const topPad = el('div', { attrs: { 'aria-hidden': 'true' } });
  const windowBox = el('div', {});
  const bottomPad = el('div', { attrs: { 'aria-hidden': 'true' } });
  // The column titles live inside the scroller and stick to its top, so they are never over a row's way.
  scroller.append(HEADERS, topPad, windowBox, bottomPad);
  table.append(scroller);
  const foot = el('div', { class: 'lb-foot' });
  const detail = el('aside', { class: 'lb-side' });

  /** The right-hand panel before a row is opened: what this board ranks by, and what a row opens. */
  function restingPanel() {
    clear(detail);
    detail.append(
      panel(
        'Entrant',
        el('p', { class: 'small muted', text: 'Open any row to read that entrant’s own record from the profile endpoint: competitions, prizes and wallet.' }),
        kv([
          ['Ranked by', rankColumn?.title ?? 'the API order'],
          ['Ties', data.tie_break?.title ?? null],
          ['Phase', phase?.title ?? null],
          ['Scores', phase?.scores ?? null],
          ['Counting rule', data.submission_rule ? String(data.submission_rule) : null],
          ['Harness', data.harness_kind ?? null],
        ]),
      ),
    );
  }

  body.append(
    panel(
      null,
      el(
        'div',
        { class: 'board-tools' },
        el('a', { class: 'btn', href: `#/bounty/${encodeURIComponent(slug)}`, text: 'Bounty page' }),
        el('a', { class: 'btn btn-ghost', href: `https://make.fun/bounty/${encodeURIComponent(slug)}/leaderboard`, rel: 'noopener', text: 'On make.fun' }),
        el('span', { class: 'spacer' }),
        data.submission_rule ? el('span', { class: 'mono muted', text: `counting rule · ${String(data.submission_rule)}` }) : null,
      ),
    ),
  );
  body.append(tools, el('div', { class: 'lb-layout' }, table, detail), foot);
  restingPanel();

  // ── sorting, filtering and the window ───────────────────────────────────────

  const stateful = {
    query: '',
    prizesOnly: false,
    sortKey: null,
    sortDir: 'desc',
    picked: null,
    top: 0,
  };
  let rows = all.slice();
  let lastWindow = '';

  const narrow = () => window.matchMedia('(max-width: 760px)').matches;

  const shownColumns = () => (narrow() ? columns.slice(0, 3) : columns);
  const template = () => {
    const cols = shownColumns();
    const tail = narrow() ? '' : ' 96px';
    return `52px minmax(164px, 2fr)${cols.map(() => ' minmax(72px, 1fr)').join('')}${tail}`;
  };

  function valueCell(entry, column) {
    const shown = entry.display?.[column.key];
    const raw = entry.values?.[column.key];
    const empty = raw === null || raw === undefined;
    const cell = el('span', { class: `lb-num ${empty ? 'dim' : ''}`, text: empty ? '—' : grouped(shown ?? raw) });
    const band = entry.interval;
    if (!empty && band && typeof band === 'object' && Number.isFinite(Number(band.low))) {
      cell.title = `90% interval ${Number(band.low).toPrecision(4)} – ${Number(band.high).toPrecision(4)}`;
    }
    return cell;
  }

  function rowNode(entry) {
    const eligible = entry.prize_eligible === true;
    const rank = el('span', {
      class: `lb-rank ${eligible ? 'wins' : ''}`,
      text: entry.ranked === false ? '—' : String(entry.rank ?? '—'),
      title: eligible ? `Prize-eligible: number ${entry.prize_rank ?? entry.rank} in the prize order` : 'Not prize-eligible',
    });
    const cells = [rank];
    const who = el('span', { class: 'lb-who' }, avatar(entry));
    who.append(el('a', { class: 't', href: `#/u/${encodeURIComponent(String(entry.handle))}`, text: entry.handle, on: { click: (event) => event.stopPropagation() } }));
    if (!narrow() && entry.title) who.append(el('span', { class: 's', text: `· ${plain(entry.title, 70)}` }));
    if (entry.house === true) who.append(pill('house', 'house'));
    if (entry.baseline === true) who.append(pill('baseline', 'plain'));
    cells.push(who);
    for (const column of shownColumns()) cells.push(valueCell(entry, column));
    if (!narrow()) cells.push(el('span', { class: 'lb-num dim', text: entry.received_at ? ago(entry.received_at) : '—' }));
    const node = el('div', { class: `lb-row ${eligible ? 'eligible' : ''} ${stateful.picked?.submission_id === entry.submission_id ? 'picked' : ''}` }, cells);
    node.style.gridTemplateColumns = template();
    node.addEventListener('click', () => void pick(entry));
    return node;
  }

  /** Draws only the rows in view, between spacers that keep the scrollbar honest. */
  function paintWindow() {
    // The sticky header takes the first 40px of the scroller's own box, so the window is one row lower.
    const first = Math.max(0, Math.floor(scroller.scrollTop / ROW_H) - BUFFER);
    const last = Math.min(rows.length, Math.ceil((scroller.scrollTop + scroller.clientHeight - HEAD_H) / ROW_H) + BUFFER);
    const key = `${first}:${last}:${stateful.sortKey}:${stateful.query}:${stateful.prizesOnly}:${stateful.picked?.submission_id ?? ''}:${rows.length}`;
    if (key === lastWindow) return;
    lastWindow = key;
    topPad.style.height = `${first * ROW_H}px`;
    bottomPad.style.height = `${Math.max(0, (rows.length - last) * ROW_H)}px`;
    clear(windowBox);
    const slice = rows.slice(first, last);
    if (slice.length === 0) {
      windowBox.append(el('div', { class: 'lb-empty', text: rows.length === 0 ? 'No row matches this filter.' : '' }));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const entry of slice) frag.append(rowNode(entry));
    windowBox.append(frag);
  }

  function paintHead() {
    clear(HEADERS);
    HEADERS.append(el('span', { class: 'lb-rank', text: '#' }));
    HEADERS.append(el('span', { text: 'Entrant' }));
    for (const column of shownColumns()) {
      const sorted = stateful.sortKey === column.key;
      HEADERS.append(
        el('button', {
          type: 'button',
          text: `${column.title}${sorted ? (stateful.sortDir === 'asc' ? ' ↑' : ' ↓') : ''}`,
          attrs: { 'data-sorted': String(sorted), title: `Sort by ${column.title}` },
          on: {
            click: () => {
              if (stateful.sortKey === column.key) stateful.sortDir = stateful.sortDir === 'asc' ? 'desc' : 'asc';
              else {
                stateful.sortKey = column.key;
                stateful.sortDir = column.sorting === 'asc' ? 'asc' : 'desc';
              }
              apply();
            },
          },
        }),
      );
    }
    if (!narrow()) HEADERS.append(el('span', { class: 'lb-num', text: 'Received' }));
    HEADERS.style.gridTemplateColumns = template();
  }

  /** Refilters, re-sorts and repaints the table's own nodes; the page around it stays as it is. */
  function apply() {
    stateful.query = search.value.trim().toLowerCase();
    stateful.prizesOnly = prizes.checked;
    const needle = stateful.query;
    rows = all.filter((entry) => {
      if (stateful.prizesOnly && entry.prize_eligible !== true) return false;
      if (needle === '') return true;
      return String(entry.handle ?? '').toLowerCase().includes(needle) || String(entry.title ?? '').toLowerCase().includes(needle);
    });
    if (stateful.sortKey !== null) {
      const key = stateful.sortKey;
      const dir = stateful.sortDir === 'asc' ? 1 : -1;
      rows = rows.slice().sort((a, b) => {
        const left = Number(a.values?.[key]);
        const right = Number(b.values?.[key]);
        if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
        if (!Number.isFinite(left)) return 1;
        if (!Number.isFinite(right)) return -1;
        return left === right ? 0 : (left - right) * dir;
      });
    }
    lastWindow = '';
    scroller.scrollTop = 0;
    paintHead();
    paintWindow();
    countLine.textContent = `${count(rows.length)} of ${count(all.length)} rows shown${stateful.prizesOnly ? ' · prize-eligible only' : ''}`;
  }

  // ── the entrant's own record, read when a row is opened ─────────────────────

  async function pick(entry) {
    stateful.picked = entry;
    lastWindow = '';
    paintWindow();
    clear(detail);
    detail.append(panel(entry.handle, el('div', { class: 'skeleton sk-line', style: 'width:60%' })));
    try {
      const profile = await api(`/profiles/${encodeURIComponent(String(entry.handle))}`, { signal: ctx.signal });
      if (stateful.picked !== entry) return;
      const record = profile.record ?? {};
      const card = el(
        'div',
        { class: 'pcard' },
        avatar(profile, 'lg'),
        el(
          'div',
          { class: 'who' },
          el('div', { class: 'h' }, el('a', { href: `#/u/${encodeURIComponent(String(profile.handle))}`, text: profile.display_name ?? `@${profile.handle}` })),
          el('div', { class: 'small muted', text: profile.bio ? plain(profile.bio, 160) : `joined ${stampUtc(profile.joined_at)}` }),
        ),
      );
      clear(detail);
      detail.append(
        panel(
          'Entrant',
          card,
          kv([
            ['Entered', record.competitions_entered ?? 0],
            ['Placed', record.competitions_placed ?? 0],
            ['Won', record.competitions_won ?? 0],
            ['Podium finishes', record.podium_finishes ?? 0],
            ['Best placement', record.best_placement ?? null],
            ['Prizes', usd(record.prize_usd)],
            ['Wallet', profile.wallet?.address ? el('span', { class: 'mono', text: String(profile.wallet.address).slice(0, 10) + '…' }) : null],
          ]),
          el(
            'p',
            { class: 'small muted' },
            el('a', { href: `#/u/${encodeURIComponent(String(profile.handle))}`, text: 'Full profile' }),
            ' · ',
            el('a', { href: `#/bounty/${encodeURIComponent(slug)}`, text: 'Bounty page' }),
          ),
        ),
      );
    } catch (error) {
      clear(detail);
      detail.append(panel(entry.handle, state({ title: 'No profile for this row', body: String(error?.message ?? error), tone: 'bad' })));
    }
  }

  function onScroll() {
    if (scroller.dataset.ticking === '1') return;
    scroller.dataset.ticking = '1';
    requestAnimationFrame(() => {
      scroller.dataset.ticking = '0';
      paintWindow();
    });
  }

  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener(
    'resize',
    () => {
      lastWindow = '';
      apply();
    },
    { passive: true },
  );

  scroller.style.setProperty('--row-h', `${ROW_H}px`);
  apply();

  const latest = all.reduce((newest, entry) => (when(entry.received_at) ?? 0) > newest ? when(entry.received_at) : newest, 0);
  foot.append(
    el('span', { text: `${all.length} rows · one window of ${Math.ceil(scroller.clientHeight / ROW_H)} drawn at a time` }),
    el('span', { class: 'muted', text: 'a green rank can take a prize; hover it for its place in the prize order' }),
    latest > 0 ? el('span', { text: `latest entry ${ago(new Date(latest).toISOString())}` }) : null,
    data.metrics_withheld === true ? el('span', { text: 'some metrics are withheld until the results are posted' }) : null,
  );
}
