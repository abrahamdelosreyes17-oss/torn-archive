import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMoneyInput } from '../src/core/parse.js';
/*
 * The reported bug: Market chip on, $1m cash, and nothing showed - though
 * cheap under-value items existed. Discovery ranked by profit PER ITEM, so it
 * only ever fetched the $200m items, and the cash cap then hid all of them.
 */
function market() {
    const byId = new Map();
    const summary = [];
    for (let i = 1; i <= 30; i++) {
        byId.set('p' + i, { id: 'p' + i, name: 'Pricey' + i, sellPrice: null, marketValue: 200e6 });
        summary.push({ itemId: 'p' + i, lowestPrice: 150e6 });
    }
    for (let i = 1; i <= 10; i++) {
        byId.set('c' + i, { id: 'c' + i, name: 'Cheap' + i, sellPrice: null, marketValue: 100000 });
        summary.push({ itemId: 'c' + i, lowestPrice: 80000 - i });
    }
    return { index: { byId }, summary };
}

test('money input: digits, commas, $, and shorthand read as people mean them; junk is rejected', () => {
    assert.equal(parseMoneyInput('1234567'), 1234567);
    assert.equal(parseMoneyInput('$1,234,567'), 1234567);
    assert.equal(parseMoneyInput('1m'), 1e6);
    assert.equal(parseMoneyInput('1.5M'), 1.5e6);
    assert.equal(parseMoneyInput('$1,000,000'), 1e6);
    assert.equal(parseMoneyInput('500k'), 5e5);
    assert.equal(parseMoneyInput('2b'), 2e9);
    assert.equal(parseMoneyInput('1kk'), 1e6);
    assert.equal(parseMoneyInput('1 million'), 1e6);
    assert.equal(parseMoneyInput('lots'), null);
    assert.equal(parseMoneyInput('12x'), null);
    assert.equal(parseMoneyInput(''), null);
});
