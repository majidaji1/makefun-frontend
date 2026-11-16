// One bounty: what it pays, what it costs to enter, when it closes, how it is judged, and how to see its results.
//
// Two reads, made together: the competition itself and the API's own account of what an entry must hand in, its
// checks, its deadlines and its quota. Every figure on the page is one of those two answers, never this file's own.

import { api } from '../lib/net.js';
import { ago, count, dayUtc, lede, plain, stampUtc, usd, when } from '../lib/format.js';
import { avatar, el, kv, panel, pill, prose, rowsTable, state, stat, statDeadline } from '../lib/ui.js';

const PHASE_STATE = (phase, now) => {
  const starts = when(phase.startsAt);
  const ends = when(phase.endsAt);
  if (ends !== null && ends <= now) return ['Finished', 'shut'];
  if (starts !== null && starts > now) return ['Opens later', 'plain'];
  return ['Live now', 'open'];
};

function headOf(comp, req) {
  const open = when(comp.deadline) !== null && when(comp.deadline) > Date.now();
  const box = el('div', { class: 'head-main' });
  box.append(
    el(
      'div',
      { class: 'card-top' },
      el('span', { class: 'mono', text: comp.sponsor?.name ?? 'make.fun' }),
      comp.sponsor?.isVerified ? el('span', { class: 'verified', text: '✓', title: 'Verified sponsor' }) : null,
      comp.category ? pill(comp.category) : null,
      comp.harnessKind ? pill(comp.harnessKind, 'plain') : null,
      pill(open ? 'Taking entries' : 'Entries closed', open ? 'open' : 'shut'),
    ),
  );
  box.append(el('h1', { text: comp.title }));
  box.append(el('p', { class: 'lede', text: lede(comp.summary ?? comp.description, 300), title: 'The whole task is below' }));
  return box;
}

function statsOf(comp, req) {
  const open = when(comp.deadline) !== null && when(comp.deadline) > Date.now();
  const fee = comp.entryFeeUsd ?? req?.entry_fee?.amount_usd ?? null;
  const stats = el('div', { class: 'stats' });
  stats.append(stat('Pot now', usd(comp.potUsd, { cents: true, free: '—' }), `base ${usd(comp.rewardAmount)} + fees paid`, 'money'));
  stats.append(stat('1st place', usd(comp.rewards?.['1'] ?? comp.rewardAmount), 'and 19 places below', 'money'));
  stats.append(stat('Entry fee', fee === null || Number(fee) === 0 ? 'free' : usd(fee), `${count(comp.entryFeePayers)} paid`));
  stats.append(stat('Entries', count(comp.submissionCount), `limit ${comp.bundle?.submission_rule?.max_per_day ?? req?.quota?.max_per_day ?? '—'}/day`));
  stats.append(statDeadline('Time left', comp.deadline, `closes ${stampUtc(comp.deadline)}`));
  return stats;
}

export default async function render(ctx) {
  const slug = ctx.route.slug;
  ctx.setTitle('Bounty · make.fun board');

  const root = el('div', { class: 'wrap' });
  const crumbs = el('div', { class: 'crumbs' }, el('a', { href: '#/', text: 'Board' }), el('span', { text: '/' }), el('span', { text: slug }));
  const head = el('div', { class: 'page-head' });
  const body = el('div', {});
  root.append(crumbs, head, body);
  ctx.mount.append(root);
  body.append(panel(null, el('div', { class: 'skeleton sk-line sk-title' }), el('div', { class: 'skeleton sk-line' }), el('div', { class: 'skeleton sk-line' })));

  const [comp, req] = await Promise.all([
    api(`/competitions/${encodeURIComponent(slug)}`, { signal: ctx.signal, fresh: ctx.fresh }),
    api(`/competitions/${encodeURIComponent(slug)}/requirements`, { signal: ctx.signal, fresh: ctx.fresh }).catch(() => null),
  ]);
  if (ctx.signal.aborted) return;
  ctx.setTitle(`${comp.title} · make.fun bounty`);

  head.append(headOf(comp, req), el('div', { class: 'head-side' }, statsOf(comp, req)));
  while (body.firstChild) body.removeChild(body.firstChild);

  // Where the rest of the bounty is: its leaderboard, and the page on make.fun itself.
  body.append(
    panel(
      null,
      el(
        'div',
        { class: 'board-tools' },
        el('a', { class: 'btn btn-accent', href: `#/bounty/${encodeURIComponent(slug)}/leaderboard`, text: `Leaderboard · ${count(comp.submissionCount)} entries` }),
        el('a', { class: 'btn', href: `https://make.fun/bounty/${encodeURIComponent(slug)}`, rel: 'noopener', text: 'Open on make.fun' }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'small muted', text: `Published ${stampUtc(comp.publishedAt)}` }),
      ),
    ),
  );

  // Prizes: the live split when the API gives one, the base rewards otherwise.
  const live = Array.isArray(comp.rewardsNow) && comp.rewardsNow.length > 0 ? comp.rewardsNow : null;
  const prizeRows = live
    ? live.map((row) => {
        const extra = row.feeShareUsd && Number(row.feeShareUsd) > 0 ? ` · base ${usd(row.baseUsd)} + fees ${usd(row.feeShareUsd)}` : '';
        return [
          el('span', { class: 'mono', text: `#${row.place}` }),
          el('span', {}, el('span', { class: 'amt', text: usd(row.amountUsd, { cents: true }) }), extra === '' ? null : el('span', { class: 'muted small', text: extra })),
          el('span', { class: 'mono muted', text: `${Math.round((row.amountUsd / (comp.potUsd || 1)) * 100)}%` }),
        ];
      })
    : Object.entries(comp.rewards ?? {}).map(([place, amount]) => [
        el('span', { class: 'mono', text: `#${place}` }),
        el('span', {}, el('span', { class: 'amt', text: usd(amount) })),
        el('span', {}),
      ]);
  body.append(
    panel(
      `Prizes · ${usd(comp.potUsd, { cents: true })}`,
      rowsTable('prizes', ['Place', 'Amount', 'Share of pot'], prizeRows),
      el('p', { class: 'small muted', style: 'margin:10px 0 0', text: 'One place per entrant. A pot grows as entry fees are paid, and the split follows the pot.' }),
    ),
  );

  // Dates and phases: what opens when, and which phase the bounty is in.
  const phases = Array.isArray(comp.phases) ? comp.phases : [];
  const now = Date.now();
  body.append(
    panel(
      'Dates and phases',
      kv([
        ['Opened', stampUtc(comp.opensAt ?? comp.publishedAt)],
        ['Entries close', el('span', { data: { deadline: comp.deadline }, text: stampUtc(comp.deadline) })],
        ['Entries close (UTC)', stampUtc(comp.deadline)],
        ['Results due', req?.deadlines?.result_due ? stampUtc(req.deadlines.result_due) : null],
        ['Final window opens', req?.deadlines?.final_window_start ? stampUtc(req.deadlines.final_window_start) : null],
        ['Resolved', comp.resolvedAt ? stampUtc(comp.resolvedAt) : 'not yet'],
      ]),
      phases.length === 0
        ? null
        : rowsTable(
            'phases',
            ['Phase', 'Window'],
            phases.map((phase) => {
              const [label, tone] = PHASE_STATE(phase, now);
              const cell = el('span', {});
              cell.append(el('strong', { text: phase.title ?? phase.key }));
              if (phase.description) cell.append(el('span', { class: 'muted small', text: ` — ${plain(phase.description, 150)}` }));
              return [
                cell,
                el('span', { class: 'nowrap' }, pill(label, tone), el('span', { class: 'muted small', text: ` ${dayUtc(phase.startsAt)} → ${dayUtc(phase.endsAt)}` })),
              ];
            }),
          ),
    ),
  );

  // Entry rules: how many entries, of what kind, and where the money sits.
  const rule = comp.submission_rule ?? comp.bundle?.submission_rule ?? null;
  const quota = req?.quota ?? null;
  body.append(
    panel(
      'Entry rules',
      kv([
        ['Still taking entries', comp.acceptingSubmissions === true ? el('span', { text: 'yes' }) : el('span', { class: 'muted', text: 'no' })],
        ['Counting rule', rule?.rule ? el('span', { class: 'mono', text: rule.rule }) : null],
        ['Entries a day', rule?.max_per_day ?? quota?.max_per_day ?? null],
        ['Entries in all', rule?.max_total ?? quota?.max_entries_per_account ?? null],
        ['Quota window', quota?.window ?? null],
        ['License handed in', rule?.license ? el('span', { class: 'mono', text: rule.license }) : null],
        ['Transcripts', rule?.transcripts_required === true ? 'required' : null],
        ['Entry fee', comp.entryFeeUsd ? `${usd(comp.entryFeeUsd)} paid to enter` : 'none'],
        ['Fees paid so far', comp.entryFeesUsd ? usd(comp.entryFeesUsd, { cents: true }) : null],
        ['Escrow', comp.escrowLifecycle?.state ?? (comp.walletPaid ? 'paid by the house wallet' : null)],
        ['Escrow settled', comp.escrowLifecycle?.settled === true ? 'yes' : comp.escrowLifecycle ? 'not yet' : null],
        ['Harness', comp.harnessKind ?? null],
      ]),
      quota?.rule ? el('p', { class: 'small muted', style: 'margin:10px 0 0', text: plain(quota.rule, 300) }) : null,
    ),
  );

  // How entries are judged, in the API's own words.
  const resolution = comp.resolution ?? null;
  if (resolution !== null) {
    const criteria = Array.isArray(resolution.criteria) ? resolution.criteria : [];
    const list = el('ul', { class: 'crit' });
    for (const item of criteria) list.append(el('li', { text: plain(item, 400) }));
    body.append(
      panel(
        `How entries are judged${resolution.metric?.name ? ` · ${resolution.metric.name}` : ''}`,
        resolution.summary ? el('p', { class: 'small', text: plain(resolution.summary, 600) }) : null,
        criteria.length === 0 ? null : list,
        kv([
          ['Method', resolution.method ?? null],
          ['Verifier', resolution.verifier ? plain(resolution.verifier, 240) : null],
          ['Ties', resolution.tieBreak ?? null],
          ['Announced', resolution.announce ? plain(resolution.announce, 240) : null],
          ['Source', resolution.source ? plain(resolution.source, 240) : null],
        ]),
      ),
    );
  }

  // The task itself: make.fun's own rules sheet, clamped until the reader asks for all of it.
  if (comp.rules || comp.description) {
    body.append(panel('The task in full', prose(comp.rules ?? comp.description)));
  }

  // What an entry hands in, from the API's requirements answer.
  const deliverables = Array.isArray(req?.deliverables) ? req.deliverables : [];
  if (deliverables.length > 0) {
    const rows = deliverables.map((item) => [
      el('span', {}, el('span', { class: 'mono', text: item.name }), item.required ? pill('required', 'prize') : pill('optional')),
      el('span', { class: 'small muted', text: plain(item.description, 260) }),
      el('span', {}),
    ]);
    body.append(panel('What an entry hands in', rowsTable('phases', ['Field', 'What it is'], rows)));
  }

  // The latest entries, so the page shows a bounty being worked on rather than only its terms.
  const subs = Array.isArray(comp.submissions) ? comp.submissions.slice().sort((a, b) => (when(b.createdAt) ?? 0) - (when(a.createdAt) ?? 0)) : [];
  if (subs.length > 0) {
    const rows = subs.slice(0, 8).map((sub) => [
      el(
        'span',
        { class: 'lb-who' },
        avatar({ handle: sub.hunter }),
        el('span', { class: 't', text: sub.hunter }),
        el('span', { class: 's', text: `· ${sub.title || 'untitled entry'}` }),
      ),
      pill(sub.status ?? 'entered', sub.status === 'passed' ? 'open' : 'plain'),
      el('span', { class: 'muted small nowrap', text: `${sub.sourceWithheld ? 'source withheld · ' : ''}${ago(sub.createdAt)}` }),
    ]);
    const table = rowsTable('sols', ['Entrant', 'State', 'Received'], rows);
    body.append(
      panel(
        `Latest entries · ${count(comp.submissionCount)} in all`,
        table,
        el('p', { class: 'small muted', style: 'margin:10px 0 0' }, el('a', { href: `#/bounty/${encodeURIComponent(slug)}/leaderboard`, text: 'See the full leaderboard' })),
      ),
    );
  } else {
    body.append(panel('Entries', state({ title: 'No entry yet', body: 'This bounty has taken no entry so far. Its leaderboard fills in as entries land.' })));
  }
}
