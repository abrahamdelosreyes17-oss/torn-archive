import test from 'node:test';
import assert from 'node:assert/strict';
import { boxTwins } from '../src/sources/dom/sets-pages.js';
import { writeInputs } from '../src/sources/dom/fill.js';

// 1.3.8 - Torn's money box as it really stands (the vault, a trade's Add Money, the Item Market's buy row; read on
// the real pages 2026-10-12): div.input-money-group > span.input-money-symbol > input.wai-btn[type=button] (Torn's
// "$" button, the FIRST input of the group and one you can see), input.input-money[type=text] and its hidden twin.
// Torn's own script listens on the TEXT box: only "input" heard there gives the number its commas and turns
// WITHDRAW / Buy on. Until 1.3.8 the "$" button was the one told.

if (!globalThis.KeyboardEvent) globalThis.KeyboardEvent = class extends Event {};

class FakeInput {
    constructor(type, group) {
        this.type = type;
        this.group = group;
        this.kept = '';
        this.heard = [];
    }
    get value() { return this.kept; }
    set value(v) { this.kept = String(v); }
    getAttribute(name) { return name === 'type' ? this.type : null; }
    closest(sel) { return sel === '.input-money-group' ? this.group : null; }
    getClientRects() { return this.type === 'hidden' ? [] : [{}]; }
    dispatchEvent(e) { this.heard.push(e.type); return true; }
}

function moneyBox() {
    const all = [];
    const group = { querySelectorAll: () => all };
    const dollar = new FakeInput('button', group);
    const text = new FakeInput('text', group);
    const hidden = new FakeInput('hidden', group);
    all.push(dollar, text, hidden);
    return { dollar, text, hidden };
}

test('a money box of Torn\'s: the "$" button in it is no box - the number goes into the text box and its twin, and the text box is the one told', () => {
    const { dollar, text, hidden } = moneyBox();
    assert.deepEqual(boxTwins(text), [text, hidden], 'the "$" button is not handed over');
    writeInputs(boxTwins(text), '12311972');
    assert.deepEqual([text.value, hidden.value, dollar.value], ['12311972', '12311972', '']);
    assert.deepEqual(text.heard, ['input', 'change', 'keyup'], 'Torn\'s script on the text box hears it: WITHDRAW / Buy turn on');
    assert.deepEqual([dollar.heard, hidden.heard], [[], []]);
});

test('a button handed to writeInputs by anyone is left alone, and never the one told', () => {
    const { dollar, text, hidden } = moneyBox();
    writeInputs([dollar, text, hidden], '500000');
    assert.deepEqual([dollar.value, text.value, hidden.value], ['', '500000', '500000']);
    assert.deepEqual([dollar.heard, text.heard], [[], ['input', 'change', 'keyup']]);
    // Nothing but a button: nothing is written, nothing is told.
    const lone = new FakeInput('button', null);
    writeInputs([lone], '5');
    assert.deepEqual([lone.value, lone.heard], ['', []]);
});

test('a box with no group around it is its own twin', () => {
    const lone = new FakeInput('text', null);
    assert.deepEqual(boxTwins(lone), [lone]);
    assert.deepEqual(boxTwins(null), []);
});
