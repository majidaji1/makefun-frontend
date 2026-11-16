// A public profile: who the handle is, what it has entered, what it has won, and where its prizes went.
//
// One read of /api/profiles/<handle> carries the record, every solution and every payout, so the page needs no
// second request. A handle make.fun does not know is answered with the not-found state rather than an empty page.

import { api } from '../lib/net.js';
import { ago, count, dayUtc, plain, short, stampUtc, usd, when } from '../lib/format.js';
import { avatar, backToBoard, el, kv, panel, pill, rowsTable, state, stat } from '../lib/ui.js';

const FIRST_SLICE = 25;

function nameLine(profile) {
  const line = el('div', { class: 'card-top' });
  line.append(el('span', { class: 'mono', text: `@${profile.handle}` }));
  if (profile.house === true) line.append(pill('house account', 'house'));
  if (profile.demo === true) line.append(pill('demo', 'plain'));
  if (profile.github_login) line.append(pill(`github ${profile.github_login}`, 'plain'));
  return line;
}

function solutionRow(solution) {
  const comp = solution.competition ?? {};
  const title = el('span', {});
  title.append(el('a', { href: `#/bounty/${encodeURIComponent(String(comp.slug))}`, text: solution.title || 'untitled entry' }));
  title.append(el('span', { class: 'muted small', text: ` · ${plain(comp.title ?? comp.slug, 90)}` }));
  if (comp.status) title.append(el('span', { class: 'muted small', text: ` · ${comp.status}` }));

  const score = solution.score?.column
    ? el('span', { class: 'tnum', title: solution.score.column.title, text: String(solution.score.display ?? solution.score.value ?? '—') })
    : el('span', { class: 'muted', text: '—' });

  const place = solution.placement === null || solution.placement === undefined
    ? solution.prize_usd
      ? pill(`prize ${usd(solution.prize_usd)}`, 'prize')
      : el('span', { class: 'muted small', text: 'not placed' })
    : pill(`#${solution.placement}`, Number(solution.placement) <= 3 ? 'prize' : 'plain');

  return [
    title,
    el('span', {}, score, el('span', { class: 'muted small', text: ` · ${ago(solution.entered_at)}` })),
    place,
  ];
}

export default async function render(ctx) {
  const handle = ctx.route.handle;
  ctx.setTitle(`@${handle} · make.fun profile`);

  const root = el('div', { class: 'wrap' });
  const crumbs = el('div', { class: 'crumbs' }, el('a', { href: '#/', text: 'Board' }), el('span', { text: '/' }), el('span', { text: `u/${handle}` }));
  const head = el('div', { class: 'page-head' });
  const body = el('div', {});
  root.append(crumbs, head, body);
  ctx.mount.append(root);
  body.append(el('div', { class: 'skeleton', style: 'height:220px' }));

  let profile;
  try {
    profile = await api(`/profiles/${encodeURIComponent(handle)}`, { signal: ctx.signal, fresh: ctx.fresh });
  } catch (error) {
    if (ctx.signal.aborted) return;
    if (error?.status === 404) {
      while (body.firstChild) body.removeChild(body.firstChild);
      body.append(
        state({
          title: `No profile for @${handle}`,
          body: 'make.fun answers 404 for that handle: it has not entered anything under it, or the link has a typo.',
          action: backToBoard(),
        }),
      );
      return;
    }
    throw error;
  }
  if (ctx.signal.aborted) return;

  const record = profile.record ?? {};
  const solutions = Array.isArray(profile.solutions) ? profile.solutions : [];
  const payouts = Array.isArray(profile.payouts) ? profile.payouts : [];

  ctx.setTitle(`${profile.display_name ?? `@${profile.handle}`} · make.fun profile`);

  head.append(
    el(
      'div',
      { class: 'head-main' },
      nameLine(profile),
      el('h1', { text: profile.display_name ?? `@${profile.handle}` }),
      el('p', { class: 'lede', text: plain(profile.bio, 320) || `On make.fun since ${dayUtc(profile.joined_at)}. ${solutions.length} entries on the record.` }),
      el(
        'p',
        { class: 'small muted' },
        el('span', { text: `Joined ${stampUtc(profile.joined_at)}` }),
        profile.wallet?.address ? el('span', { text: ` · wallet ` }) : null,
        profile.wallet?.address ? el('span', { class: 'mono', text: short(profile.wallet.address, 5) }) : null,
        profile.wallet?.explorer_url ? el('span', { text: ' ' }) : null,
        profile.wallet?.explorer_url ? el('a', { href: profile.wallet.explorer_url, rel: 'noopener', text: 'explorer' }) : null,
      ),
    ),
    el('div', { class: 'head-side' }, avatar(profile, 'lg')),
  );

  while (body.firstChild) body.removeChild(body.firstChild);

  body.append(
    panel(
      'Record',
      el(
        'div',
        { class: 'stats' },
        stat('Entered', count(record.competitions_entered ?? 0), 'competitions'),
        stat('Placed', count(record.competitions_placed ?? 0), 'in the prizes', 'money'),
        stat('Won', count(record.competitions_won ?? 0), '1st places'),
        stat('Podiums', count(record.podium_finishes ?? 0), 'top three'),
        stat('Prize money', usd(record.prize_usd, { free: '$0' }), 'USDC on Solana', 'money'),
        record.best_placement ? stat('Best placement', `#${record.best_placement}`, 'highest finish') : null,
      ),
      kv([
        ['Other placements', record.other_placements ?? null],
        ['Payouts on the record', payouts.length > 0 ? String(payouts.length) : null],
        ['Profile URL', el('span', { class: 'mono', text: `/u/${profile.handle}` })],
      ]),
    ),
  );

  // Entries, newest first, drawn in slices so a long record never lands all at once.
  const listBox = el('div', {});
  const more = el('button', { class: 'btn', type: 'button', text: `Show all ${solutions.length} entries` });
  let shown = 0;
  const draw = (upto) => {
    const slice = solutions.slice(shown, upto);
    if (slice.length === 0) return;
    listBox.append(rowsTable('sols', shown === 0 ? ['Entry', 'Score', 'Placement'] : null, slice.map(solutionRow)));
    shown = upto;
    if (shown >= solutions.length) more.remove();
    else more.textContent = `Show ${Math.min(FIRST_SLICE, solutions.length - shown)} more of ${solutions.length}`;
  };

  if (solutions.length > 0) {
    more.addEventListener('click', () => draw(shown + FIRST_SLICE));
    body.append(panel(`Entries · ${count(solutions.length)}`, listBox, solutions.length > FIRST_SLICE ? el('p', { style: 'margin:10px 0 0' }, more) : null));
    draw(FIRST_SLICE);
  } else {
    body.append(panel('Entries', state({ title: 'No entry yet', body: 'This account has not entered a bounty under this handle.' })));
  }

  if (payouts.length > 0) {
    const rows = payouts
      .slice()
      .sort((a, b) => (when(b.paid_at) ?? 0) - (when(a.paid_at) ?? 0))
      .map((payout) => [
        el('span', {}, el('a', { href: `#/bounty/${encodeURIComponent(String(payout.competition?.slug))}`, text: payout.competition?.title ?? payout.competition?.slug ?? 'a bounty' }), el('span', { class: 'muted small', text: ` · ${payout.place ? `place #${payout.place} · ` : ''}${dayUtc(payout.paid_at)}` })),
        el('span', {}, el('span', { class: 'amt', text: usd(payout.amount_usd, { cents: true }) })),
        el('span', { class: 'nowrap small' }, payout.explorer_url ? el('a', { href: payout.explorer_url, rel: 'noopener', text: 'transaction' }) : el('span', { class: 'muted', text: payout.source ?? 'paid' })),
      ]);
    body.append(
      panel(`Prizes paid · ${usd(payouts.reduce((sum, payout) => sum + Number.parseFloat(payout.amount_usd ?? '0'), 0), { cents: true })}`, rowsTable('sols', ['Bounty', 'Amount', 'Proof'], rows)),
    );
  }
}
