import test from 'node:test';
import assert from 'node:assert/strict';

import { ownBazaarPage } from '../src/sources/route.js';
/* ============================================================ own bazaar */

test('own bazaar: bazaar.php with no userId and #/add or #/manage', () => {
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php#/add'), 'add');
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php#/manage'), 'manage');
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php#/Add'), 'add');
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php?#/manage'), 'manage');
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php#/'), null, 'your storefront');
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php#/personalize'), null);
    assert.equal(ownBazaarPage('https://www.torn.com/bazaar.php?userId=123#/add'), null, "someone else's bazaar");
    assert.equal(ownBazaarPage('https://www.torn.com/page.php?sid=ItemMarket#/add'), null);
    assert.equal(ownBazaarPage(''), null);
});

/* =============================================================== history */

const H = 60 * 60 * 1000;
const D = 24 * H;

/** Just enough of a DOM for the graph: attributes and children are recorded. */
function fakeDocument() {
    const make = (tag) => {
        const node = { tag, attrs: {}, children: [], textContent: '' };
        node.setAttribute = (k, v) => (node.attrs[k] = v);
        node.appendChild = (c) => node.children.push(c);
        node.addEventListener = () => {};
        node.style = {};
        return node;
    };
    return { createElementNS: (_ns, tag) => make(tag), createElement: make };
}

import { readWholeNumber } from '../src/core/parse.js';
test('a quantity box reads whole numbers only, and never drops a stray letter', () => {
    assert.equal(readWholeNumber('25'), 25);
    assert.equal(readWholeNumber(' 1,000 '), 1000);
    assert.equal(readWholeNumber('1 000'), 1000, 'a space is a thousands gap (the old /[,s]/ typo dropped "s" instead)');
    for (const bad of ['abc', '-3', '5m', '2.5', '', null, '25s']) assert.equal(readWholeNumber(bad), null, String(bad));
});
