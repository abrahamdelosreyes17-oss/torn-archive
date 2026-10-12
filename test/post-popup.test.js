// 1.3.6, the owner's asks of 2026-10-12: the forum post opens in a box where it can be changed and copied, the open
// post and the closed one both there whatever the shop says, the top line to copy by itself ("I need that Open thing
// again, just the open ... the green one"); a struck piece is red; the thread's link sits beside every warning; the
// TornW3B panel says when your list last changed and has "Update now".

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { archiveView } from '../src/core/view.js';
import { hubPage, hubPop, hubPostOf } from '../src/ui/hub-pages.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 12, 13, 20);
const MIN = 60000;
const KEYS = { limited: { set: true, ok: true }, full: { set: true, ok: true }, w3b: { set: true, ok: true } };
const UI = { page: 'dashboard', pane: 0, sel: null, trade: null, range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' };
const THREAD = { id: 16610597, forum: 10, title: '[B] Plushies and Flowers! 101% MV Always!', at: NOW };
const desk = (over = {}, busy = {}, server = null) => ({ view: archiveView(fixtureInput(NOW, { thread: THREAD, ...over })), keys: KEYS, usage: { torn: [], w3b: [], nowTorn: 0, nowW3b: 0, refused: 0 }, turns: { mode: 'alone', why: '', torn: 85, w3b: 80 }, busy: { w3b: false, receipt: null, ...busy }, notice: null, server, version: 'test' });
const page = (d, name, pane = 0) => hubPage(d, { ...UI, page: name, pane });
const panel = (html, k) => { const at = html.indexOf(`data-k="${k}"`); assert.ok(at >= 0, 'the panel ' + k); const end = html.indexOf('<div class="panel', at); return html.slice(at, end < 0 ? html.length : end); };

test('My prices: the thread panel is short - what the post says, which you copied last, and the two posts to open; the post itself is in the box', () => {
    const d = desk();
    const html = panel(page(d, 'prices'), 'thread');
    assert.ok(html.includes('data-act="pop" data-v="post" data-id="open">Open post</button>'));
    assert.ok(html.includes('data-act="pop" data-v="post" data-id="closed">Closed post</button>'));
    assert.ok(html.includes('forums.php#/p=threads&amp;f=10&amp;t=16610597'), 'your thread, to go and paste');
    assert.ok(!html.includes('post-view'), 'the whole post is no longer poured into the page');
    assert.ok(!html.includes('OPEN FOR TRADES'));
    assert.ok(html.includes('The open post names <b>101%</b>'));
    assert.ok(html.includes('You have not copied a post from here yet.'));
    const copied = panel(page(desk({ posted: { ...d.view.prices.forum.says, at: NOW - 30 * MIN } }), 'prices'), 'thread');
    assert.ok(copied.includes('You last copied the open one on 12 Oct, 12:50 TCT.'), copied);
});

test('the box: the open post and the closed post, each with its title, the post to change, and the top line to copy alone', () => {
    const d = desk();
    assert.equal(d.view.prices.open, true);
    const open = hubPop(d, { ...UI, pop: { kind: 'post', id: 'open' } });
    assert.ok(open.includes('value="[OPEN] Buying Plushies &amp; Flowers · 101% of market value"'));
    assert.ok(open.includes('id="pop-post" contenteditable="true"') && open.includes('data-which="open"'));
    assert.ok(open.includes(d.view.prices.forum.html), 'the post as it is copied');
    assert.ok(open.includes('this is the post for now.'));
    for (const act of ['post-copy', 'post-top', 'post-title', 'post-reset', 'pop-close']) assert.ok(open.includes(`data-act="${act}"`), act);
    assert.ok(open.includes('forums.php#/p=threads&amp;f=10&amp;t=16610597'));
    const closed = hubPop(d, { ...UI, pop: { kind: 'post', id: 'closed' } });
    assert.ok(closed.includes('value="[CLOSED] Buying Plushies &amp; Flowers · back soon"'));
    assert.ok(closed.includes('CLOSED FOR NOW') && !closed.includes('OPEN FOR TRADES'));
    assert.ok(closed.includes('this is the post for when you close.'));
    assert.equal(hubPostOf(d, 'closed'), d.view.prices.forum.other);
    assert.equal(hubPostOf(d, 'open'), d.view.prices.forum);
    // Closed, the two change places.
    const shut = desk({ settings: { ...fixtureInput(NOW).settings, open: false } });
    assert.equal(hubPostOf(shut, 'closed'), shut.view.prices.forum);
    assert.ok(hubPop(shut, { ...UI, pop: { kind: 'post', id: 'open' } }).includes('this is the post for when you open.'));
});

test('a struck piece is red in the post, and the dashboard\'s warning opens the post, where your thread\'s link is', () => {
    // Nothing copied yet, and a piece held over its target: the post strikes it, and the thread is behind.
    const base = fixtureInput(NOW);
    const d = desk({ held: (id) => (Number(id) === 258 ? 5000 : base.held(id)) });
    const f = d.view.prices.forum;
    assert.ok(f.says.struck.length >= 1);
    assert.ok(f.html.includes('<font color="#f85149"><s>'), 'red, word and line');
    assert.ok(f.behind && f.behind.strike.length >= 1);
    const dash = page(d, 'dashboard');
    assert.ok(dash.includes('<b>Update your forum post.</b>'));
    assert.ok(dash.includes('data-act="pop" data-v="post" data-id="open">The post</button>'));
    // One button in that row: with two, its words ran over the row under it at 1366 px with the menu pinned.
    assert.equal(dash.split('forums.php#/p=threads').length, 1, 'the row has the one press');
    assert.ok(hubPop(d, { ...UI, pop: { kind: 'post', id: 'open' } }).includes('forums.php#/p=threads&amp;f=10&amp;t=16610597'), 'the thread, beside the copy buttons');
    assert.ok(panel(page(d, 'prices'), 'thread').includes('class="btn go" data-act="pop" data-v="post" data-id="open"'), 'the post to copy is the lit one');
    assert.ok(hubPop(d, { ...UI, pop: { kind: 'post', id: 'open' } }).includes('<b>Your thread is behind.</b>'));
});

test('the TornW3B panel: when your list last changed, "Update now", a refusal or a check under it, and what the server holds', () => {
    const none = panel(page(desk(), 'prices'), 'w3b');
    assert.ok(none.includes('Not changed from here yet.'));
    assert.ok(none.includes('data-act="w3b" data-v="update">Update now</button>'));
    const ch = { at: NOW - 35 * MIN, by: 'by itself', text: '3 set, 1 taken off' };
    const html = panel(page(desk({}, { changed: ch, wrote: { ...ch, ok: true } }), 'prices'), 'w3b');
    assert.ok(html.includes('Last changed <b>12 Oct, 12:45 TCT</b>'), html);
    assert.ok(html.includes('· by itself · 3 set, 1 taken off'));
    assert.ok(!html.includes('Refused') && !html.includes('Checked'));
    const refused = panel(page(desk({}, { changed: ch, wrote: { at: NOW - 5 * MIN, ok: false, by: 'your press', text: 'TornW3B answered 400' } }), 'prices'), 'w3b');
    assert.ok(refused.includes('Last changed <b>12 Oct, 12:45 TCT</b>'), 'a refusal does not hide when it last changed');
    assert.ok(refused.includes('<b>Refused</b> 13:15 TCT, on your press: TornW3B answered 400.'));
    const same = panel(page(desk({}, { changed: ch, wrote: { at: NOW - MIN, ok: true, same: true, by: 'your press', text: 'it already matches your rate' } }), 'prices'), 'w3b');
    assert.ok(same.includes('Checked 13:19 TCT on your press: nothing to change, it already matches your rate.'));
    assert.ok(panel(page(desk({}, { w3b: true }), 'prices'), 'w3b').includes('disabled>Updating</button>'));
    const served = panel(page(desk({}, {}, { on: true, level: 'ok', now: 'On.', ownAt: NOW - 2 * MIN }), 'prices'), 'w3b');
    assert.ok(served.includes('The shared server holds these prices for Torn Bids'), served);
    // A key that is not the one marked as the server's owner's: the server did not keep the list, and it says so.
    const notKept = panel(page(desk({}, {}, { on: true, level: 'ok', now: 'On.', ownAt: NOW - 2 * MIN, ownKept: false }), 'prices'), 'w3b');
    assert.ok(notKept.includes("The shared server keeps one price list, its owner's: yours is not held there."), notKept);
    assert.ok(!notKept.includes('holds these prices'));
});
