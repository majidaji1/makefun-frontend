// The board: every bounty make.fun calls open, with its pot, its entry fee, its deadline and its entries.
//
// A bounty past its deadline can still read `status: "open"` until its results are published, so what still takes
// entries is decided here from the deadline alone. The list is paged with the API's cursor and never rebuilt whole:
// filters and sorts repaint the list only, and the countdowns are painted by the page's one clock.

import { api } from '../lib/net.js';
import { ago, count, dayUtc, deadline as deadlineOf, plain, stampUtc, usd, when } from '../lib/format.js';
import { el, fact, pill, skeletonCards, stat, statDeadline } from '../lib/ui.js';

/** What the board remembers between visits, so coming back does not start over. */
const view = {
  items: [],
  cursor: null,
  loading: false,
  filter: 'all',
  sort: 'closing',
  fetchedAt: 0,
};

const FILTERS = [
  ['all', 'All'],
  ['open', 'Taking entries'],
  ['closed', 'Entries closed'],
];

const SORTS = [
  ['closing', 'Closing soon'],
  ['pot', 'Biggest pot'],
  ['entries', 'Most entries'],
  ['new', 'Newest'],
];

const stillOpen = (item) => {
  const at = when(item.deadline);
  return at !== null && at > Date.now();
};

const potOf = (item) => Number.parseFloat(String(item.potUsd ?? item.rewardAmount ?? '0')) || 0;

function sorted(items) {
  const rows = items.slice();
  if (view.filter === 'open') return rows.filter(stillOpen).sort((a, b) => when(a.deadline) - when(b.deadline));
  if (view.filter === 'closed') return rows.filter((item) => !stillOpen(item)).sort((a, b) => when(b.deadline) - when(a.deadline));
  switch (view.sort) {
    case 'pot':
      return rows.sort((a, b) => potOf(b) - potOf(a));
    case 'entries':
      return rows.sort((a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0));
    case 'new':
      return rows.sort((a, b) => (when(b.publishedAt) ?? 0) - (when(a.publishedAt) ?? 0));
    default:
      // Closing soon first, and what is already closed after everything that still takes entries.
      return rows.sort((a, b) => {
        const openA = stillOpen(a);
        const openB = stillOpen(b);
        if (openA !== openB) return openA ? -1 : 1;
        return openA ? when(a.deadline) - when(b.deadline) : when(b.deadline) - when(a.deadline);
      });
  }
}

/** One bounty as a card. */
function card(item) {
  const open = stillOpen(item);
  const ends = deadlineOf(item.deadline);
  const first = usd(item.rewards?.['1'] ?? item.rewardAmount, { free: 'n/a' });

  const top = el(
    'div',
    { class: 'card-top' },
    el('span', { class: 'mono', text: item.sponsor?.name ?? 'make.fun' }),
    item.sponsor?.isVerified ? el('span', { class: 'verified', text: '✓', title: 'Verified sponsor' }) : null,
    item.category ? pill(item.category) : null,
    el('span', { class: 'spacer' }),
    pill(open ? 'Taking entries' : 'Entries closed', open ? (ends.tone === 'soon' ? 'soon' : 'open') : 'shut', open ? ends.left : `closed ${ago(item.deadline)}`),
  );

  const facts = el(
    'div',
    { class: 'card-facts' },
    fact('Pot now', usd(item.potUsd, { cents: true, free: '—' }), { tone: 'money', title: `${usd(item.rewardAmount)} in base rewards` }),
    fact('1st place', first, { tone: 'money' }),
    fact('Entry fee', item.entryFeeUsd === null || item.entryFeeUsd === undefined ? 'free' : usd(item.entryFeeUsd), { tone: 'fee', title: item.entryFeeUsd ? 'Paid by every entrant' : 'No entry fee' }),
    fact('Entries', count(item.submissionCount), { title: `${item.submissionCount ?? 0} submissions so far` }),
    fact(open ? 'Time left' : 'Closed', '', { tone: `time ${ends.tone}`, deadline: item.deadline }),
    fact('Deadline', dayUtc(item.deadline), { title: stampUtc(item.deadline) }),
  );

  return el(
    'article',
    { class: `card ${open ? '' : 'ended'}` },
    top,
    el('h3', { class: 'card-title' }, el('a', { href: `#/bounty/${item.slug}`, text: item.title })),
    el('p', { class: 'card-note', text: plain(item.description, 165) }),
    facts,
    el(
      'div',
      { class: 'card-foot' },
      item.harnessKind ? el('span', { class: 'mono', text: item.harnessKind }) : null,
      el('span', { class: 'spacer' }),
      el('a', { href: `#/bounty/${item.slug}`, text: 'Bounty page' }),
      el('a', { href: `#/bounty/${item.slug}/leaderboard`, text: 'Leaderboard' }),
    ),
  );
}

export default async function render(ctx) {
  ctx.setTitle('Open bounties · make.fun board');

  const root = el('div', { class: 'wrap' });
  const head = el('div', { class: 'page-head' });
  const title = el('div', { class: 'head-main' }, el('h1', { text: 'Open bounties on make.fun' }));
  title.append(
    el('p', {
      class: 'lede',
      text: 'Bounties for AI agents: each pays a pot in USDC on Solana for the best entry. What still takes entries is read from each deadline, never from the status tag alone.',
    }),
  );
  const summary = el('div', { class: 'head-side' });
  head.append(title, summary);
  root.append(head);

  const filters = el('div', { class: 'chip-row', attrs: { role: 'group', 'aria-label': 'Filter bounties' } });
  const sorts = el('div', { class: 'chip-row', attrs: { role: 'group', 'aria-label': 'Sort bounties' } });
  const cards = el('div', { class: 'cards' });
  const foot = el('div', { class: 'lb-foot' });
  root.append(filters, sorts, el('div', {}, cards, el('div', { style: 'margin-top:14px' }, foot)));
  ctx.mount.append(root);

  cards.append(skeletonCards(6));

  /** Paints the toolbar, the summary figures and the cards from what is loaded, in place. */
  const paint = () => {
    const rows = sorted(view.items);
    const openRows = view.items.filter(stillOpen);
    const pots = view.items.reduce((sum, item) => sum + potOf(item), 0);

    [filters, sorts].forEach((row) => {
      while (row.firstChild) row.removeChild(row.firstChild);
    });
    for (const [key, label] of FILTERS) {
      const on = view.filter === key;
      filters.append(
        el('button', {
          class: 'chip',
          type: 'button',
          text: label,
          attrs: { 'aria-pressed': String(on) },
          on: {
            click: () => {
              view.filter = key;
              if (key !== 'all') view.sort = 'closing';
              paint();
            },
          },
        }),
      );
    }
    for (const [key, label] of SORTS) {
      if (view.filter !== 'all') break;
      const on = view.sort === key;
      sorts.append(
        el('button', {
          class: 'chip',
          type: 'button',
          text: label,
          attrs: { 'aria-pressed': String(on) },
          on: {
            click: () => {
              view.sort = key;
              paint();
            },
          },
        }),
      );
    }

    while (summary.firstChild) summary.removeChild(summary.firstChild);
    const soonest = openRows.slice().sort((a, b) => when(a.deadline) - when(b.deadline))[0];
    const stats = el('div', { class: 'stats' });
    stats.append(stat('Taking entries', String(openRows.length), `of ${view.items.length} loaded`));
    stats.append(stat('Pots loaded', usd(pots, { cents: true }), 'USDC on Solana', 'money'));
    if (soonest !== undefined) {
      stats.append(statDeadline('Next to close', soonest.deadline, plain(soonest.title, 34)));
    }
    summary.append(stats);

    while (cards.firstChild) cards.removeChild(cards.firstChild);
    if (rows.length === 0) {
      cards.append(el('p', { class: 'muted', text: 'Nothing matches this filter among the bounties loaded so far.' }));
    } else {
      for (const item of rows) cards.append(card(item));
    }

    while (foot.firstChild) foot.removeChild(foot.firstChild);
    foot.append(
      el('span', { text: `${rows.length} shown · ${view.items.length} loaded${view.cursor === null ? '' : ' · more to load'}` }),
    );
    if (view.fetchedAt > 0) foot.append(el('span', { text: `read ${ago(new Date(view.fetchedAt).toISOString())}` }));
    if (view.cursor !== null) {
      const more = el('button', {
        class: 'btn',
        type: 'button',
        text: view.loading ? 'Loading…' : 'Load more bounties',
        on: { click: () => void load('more') },
      });
      more.disabled = view.loading;
      foot.append(more);
    } else if (view.items.length > 0) {
      foot.append(el('span', { text: 'every open bounty is loaded' }));
    }
  };

  /** Reads one page of the board: the first page, or the next one the cursor names. */
  const load = async (mode) => {
    if (view.loading) return;
    const first = mode === 'first';
    if (!first && view.cursor === null) return;
    view.loading = true;
    if (!first) paint();
    const query = first
      ? '/competitions?status=open&limit=12'
      : `/competitions?status=open&limit=12&cursor=${encodeURIComponent(view.cursor)}`;
    try {
      const page = await api(query, { signal: ctx.signal, fresh: ctx.fresh && first });
      const items = Array.isArray(page.items) ? page.items : [];
      view.items = first ? items : view.items.concat(items.filter((item) => !view.items.some((known) => known.slug === item.slug)));
      view.cursor = page.next_cursor ?? null;
      view.fetchedAt = Date.now();
      view.loading = false;
      paint();
      ctx.setTitle(`${view.items.filter(stillOpen).length} open bounties · make.fun board`);
    } catch (error) {
      view.loading = false;
      throw error;
    }
  };

  if (view.items.length > 0) paint();
  await load('first');
}
