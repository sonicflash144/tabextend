import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createOpenTabsView } from '../../src/ui/open-tabs-view.mjs';
import { createTabPresenter } from '../../src/ui/tab-presentation.mjs';
import { click, createPageDom } from '../helpers/dom.mjs';

let page;
let document;
let sidebar;
let list;

before(() => {
    page = createPageDom();
    document = page.document;
    sidebar = document.getElementById('sidebar');
    list = document.getElementById('open-tabs-list');
});

after(() => page.cleanup());

beforeEach(() => {
    list.replaceChildren();
    sidebar.classList.remove('collapsed');
});

function createView() {
    const calls = [];
    const record =
        name =>
        (...args) =>
            calls.push([name, ...args]);
    const view = createOpenTabsView(document, {
        list,
        sidebar,
        presenter: createTabPresenter({
            chrono: { parseDate: () => null, parse: () => [] }
        }),
        handlers: {
            onActivate: record('activate'),
            onClose: record('close'),
            onDragEnd: record('dragEnd'),
            onDragStart: record('dragStart'),
            onSelect: record('select')
        }
    });
    return { calls, view };
}

function openTabs() {
    return [
        {
            id: 7,
            title: 'Alpha',
            url: 'https://example.com/alpha',
            favIconUrl: 'https://example.com/icon.png',
            pinned: true
        },
        { id: 9, title: 'Beta', url: 'https://beta.test/page' }
    ];
}

test('requires a list element and a presenter', () => {
    assert.throws(() => createOpenTabsView(document, { presenter: {} }), /list element/);
    assert.throws(() => createOpenTabsView(document, { list }), /tab presenter/);
});

test('renders one row per open tab, in window order', () => {
    const { view } = createView();

    view.render(openTabs());

    const rows = Array.from(list.children);
    assert.deepEqual(
        rows.map(row => row.id),
        ['opentab-7', 'opentab-9']
    );
    assert.deepEqual(
        rows.map(row => row.querySelector('.tab-title').textContent),
        ['Alpha', 'Beta']
    );
    assert.deepEqual(
        rows.map(row => row.getAttribute('data-tab-id')),
        ['7', '9']
    );
    assert.deepEqual(
        rows.map(row => row.getAttribute('data-index')),
        ['0', '1']
    );
    assert.equal(rows[0].draggable, true);
});

test('a tab without an icon falls back to the favicon service', () => {
    const { view } = createView();

    view.render(openTabs());

    assert.equal(
        list.children[0].querySelector('img').getAttribute('src'),
        'https://example.com/icon.png'
    );
    assert.equal(
        list.children[1].querySelector('img').getAttribute('src'),
        'https://www.google.com/s2/favicons?domain=beta.test&sz=32'
    );
});

test('only pinned tabs show a pin over their favicon', () => {
    const { view } = createView();

    view.render(openTabs());

    const pinnedIndicator = list.children[0].querySelector('.pinned-tab-indicator');
    assert.ok(pinnedIndicator);
    assert.equal(pinnedIndicator.getAttribute('aria-label'), 'Pinned tab');
    assert.equal(list.children[1].querySelector('.pinned-tab-indicator'), null);
});

test('an unsafe icon url is dropped rather than rendered', () => {
    const { view } = createView();

    view.render([
        { id: 1, title: 'Odd', url: 'https://a.test', favIconUrl: 'javascript:alert(1)' }
    ]);

    assert.equal(list.children[0].querySelector('img').getAttribute('src'), null);
});

test('rows are marked collapsed while the sidebar is collapsed', () => {
    const { view } = createView();

    view.render(openTabs());
    assert.equal(list.children[0].classList.contains('collapsed'), false);

    sidebar.classList.add('collapsed');
    view.render(openTabs());
    assert.ok(Array.from(list.children).every(row => row.classList.contains('collapsed')));
});

test('rendering again replaces the previous rows', () => {
    const { view } = createView();

    view.render(openTabs());
    view.render([openTabs()[1]]);

    assert.deepEqual(
        Array.from(list.children).map(row => row.id),
        ['opentab-9']
    );
});

test('the close button, favicon, and title report what the user asked for', () => {
    const { calls, view } = createView();
    view.render(openTabs());
    const row = list.children[0];

    click(row.querySelector('.close-button'));
    click(row.querySelector('.tab-info-left'));
    click(row.querySelector('.tab-title'));

    assert.deepEqual(
        calls.map(call => call[0]),
        ['close', 'select', 'activate']
    );
    assert.equal(calls[0][1].id, 7);
    assert.equal(calls[1][1], row);
    assert.equal(calls[2][1].id, 7);
});

test('drag handlers are wired to every row', () => {
    const { calls, view } = createView();
    view.render(openTabs());

    list.children[0].dispatchEvent(new page.window.Event('dragstart'));
    list.children[1].dispatchEvent(new page.window.Event('dragend'));

    assert.equal(calls.filter(call => call[0] === 'dragStart').length, 1);
    assert.equal(calls.filter(call => call[0] === 'dragEnd').length, 1);
});

test('an empty window renders an empty list', () => {
    const { view } = createView();
    view.render(openTabs());

    view.render([]);

    assert.equal(list.children.length, 0);
});
