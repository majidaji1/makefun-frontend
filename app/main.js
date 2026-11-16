// The shell and the router: four hash routes, each with its own URL, back button and deep link.
//
//   #/                          the board of open bounties
//   #/bounty/<slug>             one bounty
//   #/bounty/<slug>/leaderboard its leaderboard
//   #/u/<handle>                a public profile
//
// A route's code is pulled in with its own literal import() the first time it is opened, so the first load carries
// the board alone, and every later route is one conditional API read.

import { module_, netStats, onNet } from './lib/net.js';
import { ago } from './lib/format.js';
import { backToBoard, clear, el, failed, startClock, state } from './lib/ui.js';

const VIEWS = {
  board: () => import('./views/board.js'),
  bounty: () => import('./views/bounty.js'),
  leaderboard: () => import('./views/leaderboard.js'),
  profile: () => import('./views/profile.js'),
};

const mount = document.getElementById('main');
const netLabel = document.getElementById('net');
const refreshButton = document.getElementById('refresh');
const boardLink = document.querySelector('[data-nav="board"]');

let shown = 0;
let currentRoute = null;

/** The route a hash names. Anything unrecognized is a route of its own, so a bad link says so rather than guessing. */
function parseRoute(hash) {
  const parts = String(hash ?? '')
    .replace(/^#/, '')
    .split('/')
    .filter((part) => part !== '')
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  if (parts.length === 0) return { name: 'board', key: 'board' };
  if (parts[0] === 'bounty' && parts.length === 2) return { name: 'bounty', key: `bounty/${parts[1]}`, slug: parts[1] };
  if (parts[0] === 'bounty' && parts.length === 3 && parts[2] === 'leaderboard') {
    return { name: 'leaderboard', key: `board/${parts[1]}`, slug: parts[1] };
  }
  if (parts[0] === 'u' && parts.length === 2) return { name: 'profile', key: `u/${parts[1]}`, handle: parts[1] };
  return { name: 'notfound', key: `notfound/${parts.join('/')}` };
}

function notFound(route) {
  return state({
    title: 'No such route',
    body: `This app answers #/, #/bounty/<slug>, #/bounty/<slug>/leaderboard and #/u/<handle>. The link asked for “#/${route.key}”.`,
    action: backToBoard(),
  });
}

/** Runs one route: new document nodes, one abortable read set, and the screenshot hook around the data it shows. */
async function show(route, options = {}) {
  const run = ++shown;
  const controller = new AbortController();
  currentRoute = route;
  window.__shotReady = false;

  document.title = 'make.fun bounty board';
  if (boardLink !== null) {
    if (route.name === 'board') boardLink.setAttribute('aria-current', 'page');
    else boardLink.removeAttribute('aria-current');
  }

  const loader = VIEWS[route.name];
  clear(mount);
  if (loader === undefined) {
    mount.append(notFound(route));
    window.__shotReady = true;
    return;
  }

  const retry = () => void show(route, { fresh: true });
  const context = {
    route,
    mount,
    signal: controller.signal,
    fresh: options.fresh === true,
    setTitle: (title) => {
      if (run === shown) document.title = title;
    },
  };

  try {
    const render = await module_(loader);
    if (run !== shown) return;
    await render(context);
  } catch (error) {
    if (error?.name === 'AbortError' || run !== shown) return;
    clear(mount);
    mount.append(failed(error, retry));
  } finally {
    if (run === shown) {
      window.__shotReady = true;
      mount.dataset.route = route.name;
    }
  }
}

/** The header's own line: how many reads this session made and how many answers came back unchanged. */
function paintNet(snapshot = null) {
  const stats = netStats();
  const reused = stats.hits + stats.revalidated;
  const words = stats.requests === 0 ? 'no reads yet' : `${stats.requests} read${stats.requests === 1 ? '' : 's'} · ${reused} reused`;
  const tail = snapshot !== null && snapshot.lastAt > 0 ? ` · ${ago(new Date(stats.lastAt).toISOString())}` : '';
  netLabel.textContent = `${words}${tail}`;
  netLabel.title = `${stats.requests} GETs to make.fun, ${stats.revalidated} answered 304, ${stats.hits} served from memory`;
  netLabel.dataset.tone = snapshot !== null && snapshot.kind === 'revalidated' ? 'hit' : '';
}

refreshButton.addEventListener('click', () => {
  if (currentRoute === null) return;
  refreshButton.disabled = true;
  setTimeout(() => {
    refreshButton.disabled = false;
  }, 600);
  void show(currentRoute, { fresh: true });
});

window.addEventListener('hashchange', () => {
  const route = parseRoute(window.location.hash);
  if (currentRoute !== null && route.key === currentRoute.key) return;
  window.scrollTo({ top: 0, behavior: 'auto' });
  void show(route);
});

onNet(paintNet);
startClock();
paintNet();
void show(parseRoute(window.location.hash));
