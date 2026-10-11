// The points book and the mug check, after the whole-app read of 2026-10-11: a typed "what a point cost you" took
// the sales off twice, and the mug check went wrong once the oldest money rows were let go.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mugCheck } from '../src/core/books.js';
import { listPrice } from '../src/core/points.js';
import { archiveView } from '../src/core/view.js';
import { engineEmpty, settleMugs } from '../src/engine/state.js';
import { fixtureInput } from './fixture-view.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 11, 19, 0);

test('"what a point cost you": with a cost typed, the book ends at the points you hold - a sale is taken off once', () => {
    // You had 1,000 points. Sets made 300 more; you sold 500. Torn says you hold 800.
    const book = [
        { id: 'm1', t: NOW - 3 * DAY, kind: 'made', points: 300, each: 30000 },
        { id: 's1', t: NOW - 2 * DAY, kind: 'sold', points: 500, each: 31000 },
    ];
    const base = fixtureInput(NOW);
    const input = { ...base, book, money: { ...base.money, points: 800 } };
    // No cost typed: the 300 made are sold, the other 200 sold were yours before and count for nothing.
    const plain = archiveView(input);
    assert.equal(plain.points.book.left, 0);
    assert.equal(plain.points.before, 800);
    assert.equal(plain.points.book.sold, 300);
    // $20,000 typed: 1,000 open the book, 300 come in, 500 go out at the average - 800 left, as Torn says.
    const typed = archiveView({ ...input, settings: { ...input.settings, beforeEach: 20000 } });
    assert.equal(typed.points.book.left, 800, 'until 1.2.3 this said 600: the 200 already gone were taken again');
    assert.equal(typed.points.book.sold, 500);
    const avg = (1000 * 20000 + 300 * 30000) / 1300;
    assert.equal(typed.points.book.cost, Math.round(800 * avg));
    assert.equal(typed.points.book.profitSold, Math.round(500 * (31000 - avg)));
});

test('a points price that others already list at: they sell before you, and are counted so', () => {
    const p = listPrice([{ cost: 30899, qty: 50 }, { cost: 30900, qty: 4000 }, { cost: 30650, qty: 100 }], 'wall');
    assert.equal(p.price, 30899, '$1 under the wall');
    assert.equal(p.ahead, 150, 'the 50 already listed at $30,899 are ahead of you too');
});

test('the mug check once old money rows are let go: a sale from before the record is not "on hand" for good', () => {
    // A sale ten days ago, banked the same hour. A mug today, long after, with no points money on hand.
    const sales = [{ id: 's1', t: NOW - 10 * DAY, got: 5000000 }];
    const bank = { t: NOW - 10 * DAY + 600000, amount: 5000000 };
    const mugs = [{ id: 'm1', t: NOW - HOUR, by: 'A', taken: 400000 }];
    assert.equal(mugCheck(sales, mugs, [bank]).counted, 0, 'with the deposit on record: nothing counted');
    // The deposit's row has been let go (the record keeps so many): the record now begins three days ago.
    const from = NOW - 3 * DAY;
    assert.equal(mugCheck(sales, mugs, [{ t: from, amount: 1 }]).counted, 400000, 'what went wrong: the old sale reads as never banked');
    assert.equal(mugCheck(sales, mugs, [{ t: from, amount: 1 }], from).counted, 0, 'the record\'s start said: the old sale is not on hand');
    // A sale inside the record still counts.
    const fresh = [...sales, { id: 's2', t: NOW - 2 * HOUR, got: 300000 }];
    assert.equal(mugCheck(fresh, mugs, [{ t: from, amount: 1 }], from).counted, 300000);
});

test('a mug\'s verdict is kept once it cannot change, and stands when the rows it was judged by are gone', () => {
    const sale = { id: 's1', t: NOW - 5 * DAY, got: 900000 };
    const mug = { id: 'm1', t: NOW - 5 * DAY + 660000, by: 'A', taken: 612000 };
    const judged = mugCheck([sale], [mug], []);
    assert.equal(judged.counted, 612000);
    // The engine keeps it.
    const S = engineEmpty();
    S.ledger = { ...S.ledger, mugs: [{ id: 'm1', t: mug.t, who: '', taken: 612000 }, { id: 'm2', t: NOW - 60000, who: '', taken: 5 }] };
    S.log = { ...S.log, until: NOW };
    assert.equal(settleMugs(S, [...judged.rows, { id: 'm2', counted: 5, onHand: 5, saleId: null, after: 0 }], NOW), true);
    assert.deepEqual(S.ledger.mugs[0].kept, { counted: 612000, onHand: 900000, saleId: 's1', after: 660000 });
    assert.equal(S.ledger.mugs[1].kept, undefined, 'a mug of a minute ago may still change: the log is read up to it, not an hour past');
    assert.equal(settleMugs(S, judged.rows, NOW), false, 'kept once');
    // Later the sale lies before the record's start: judged afresh it would be nothing; kept, it stands.
    const from = NOW - 2 * DAY;
    assert.equal(mugCheck([sale], [mug], [], from).counted, 0);
    const later = mugCheck([sale], [{ ...mug, kept: S.ledger.mugs[0].kept }], [], from);
    assert.equal(later.counted, 612000);
    assert.equal(later.rows[0].saleId, 's1');
    // A verdict is not kept while the log has not been read up to the mug.
    const T = engineEmpty();
    T.ledger = { ...T.ledger, mugs: [{ id: 'm1', t: mug.t, who: '', taken: 612000 }] };
    T.log = { ...T.log, until: mug.t - 1000 };
    assert.equal(settleMugs(T, judged.rows, NOW), false);
});
