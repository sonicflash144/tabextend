import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createStateStorageService } from '../../src/application/state-storage.mjs';
import { applyDrop } from '../../src/domain/drop-operations.mjs';
import { createStateStore } from '../../src/domain/state.mjs';
import { createBoardView } from '../../src/ui/board-view.mjs';
import { createTabPresenter } from '../../src/ui/tab-presentation.mjs';
import { createDragController } from '../../src/ui/controllers/drag-controller.mjs';
import { createDeletionArea, createNewColumnIndicator } from '../../src/ui/rendering.mjs';
import { createPageDom, dragEvent, setRect, stackRects } from '../helpers/dom.mjs';

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

beforeEach(() => {
    document.getElementById('columns-container').replaceChildren();
    document
        .querySelectorAll('#deletion-area, .drop-indicator-container')
        .forEach(node => node.remove());
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createStorage(initial = {}) {
    const values = clone(initial);
    return {
        values,
        async get(keys) {
            if (keys === null || keys === undefined) return clone(values);
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
                requested.filter(key => key in values).map(key => [key, clone(values[key])])
            );
        },
        async set(updates) {
            Object.assign(values, clone(updates));
        }
    };
}

/** The page's own rendering pass, as `displaySavedTabs` performs it. */
function renderState(state) {
    return createBoardView(document, {
        container: document.getElementById('columns-container'),
        presenter: createTabPresenter({
            chrono: { parseDate: () => null, parse: () => [] },
            now: () => Date.parse('2026-08-13T12:00:00Z')
        }),
        nextFallbackEmoji: () => '🍎'
    }).render(state);
}

function renderedColumns() {
    return Array.from(document.querySelectorAll('#columns-container .column')).map(column => ({
        id: column.id,
        title: column.querySelector('.column-title-text').textContent,
        items: Array.from(column.children)
            .filter(child => child.classList.contains('tab-item'))
            .map(child => child.id)
    }));
}

function storedState() {
    return {
        savedTabs: [
            { id: 'alpha', title: 'Alpha', url: 'https://example.com/alpha' },
            { id: 'beta', title: 'Beta', url: 'https://example.com/beta' }
        ],
        columnState: [
            {
                id: 'column-1',
                title: 'Research',
                minimized: false,
                emoji: '📚',
                tabIds: ['tab-alpha', 'tab-beta']
            }
        ]
    };
}

function createService(initial = {}) {
    const storage = createStorage(initial);
    const stateStore = createStateStore();
    let counter = 0;
    return {
        storage,
        stateStore,
        service: createStateStorageService({
            storage,
            stateStore,
            idFactory: () => `generated-${++counter}`,
            now: () => 1755000000000
        })
    };
}

test('stored data is rendered into columns and tabs on startup', async () => {
    const { service } = createService(storedState());

    const result = await service.initialize();
    renderState(result.state);

    assert.deepEqual(renderedColumns(), [
        {
            id: 'column-1',
            title: 'Research',
            items: ['tab-alpha', 'tab-beta']
        }
    ]);
    assert.equal(document.querySelector('#tab-alpha .tab-title').textContent, 'Alpha');
    assert.equal(document.getElementById('column-1').dataset.emoji, '📚');
});

test('a subgroup written by an older release renders its previews and tabs', async () => {
    const legacy = storedState();
    legacy.columnState[0].tabIds = [['group-1', 'tab-alpha', 'tab-beta', 'Reading', false]];
    const { service } = createService(legacy);

    const result = await service.initialize();
    renderState(result.state);

    const subgroup = document.getElementById('group-1');
    assert.ok(subgroup.classList.contains('subgroup-item'));
    assert.equal(subgroup.querySelector('.subgroup-title-text').textContent, 'Reading');
    assert.equal(subgroup.querySelectorAll('.subgroup-favicon').length, 2);
    assert.equal(subgroup.querySelectorAll('.expanded-tabs .tab-item').length, 2);
    assert.deepEqual(renderedColumns()[0].items, ['group-1']);
});

test('a change written by another page re-renders the columns', async () => {
    const { service, storage } = createService(storedState());
    renderState((await service.initialize()).state);

    // Another new tab page adds a column and moves a tab into it.
    storage.values.columnState = [
        { id: 'column-1', title: 'Research', minimized: false, emoji: '📚', tabIds: ['tab-alpha'] },
        { id: 'column-2', title: 'Later', minimized: false, tabIds: ['tab-beta'] }
    ];
    const synchronized = await service.synchronize({
        columnState: { newValue: storage.values.columnState }
    });

    assert.equal(synchronized.type, 'state');
    renderState(synchronized.state);
    assert.deepEqual(renderedColumns(), [
        { id: 'column-1', title: 'Research', items: ['tab-alpha'] },
        { id: 'column-2', title: 'Later', items: ['tab-beta'] }
    ]);
});

test('a tab queued by the background worker appears and the queue is cleared', async () => {
    const { service, storage } = createService(storedState());
    renderState((await service.initialize()).state);

    const queued = {
        id: 'gamma',
        title: 'Gamma',
        url: 'https://example.com/gamma',
        note: 'selected text'
    };
    storage.values.bgTabs = [queued];
    const synchronized = await service.synchronize({
        bgTabs: { oldValue: [], newValue: [queued] }
    });

    assert.equal(synchronized.type, 'background-tabs');
    assert.equal(synchronized.consumedBackgroundTabs, 1);
    renderState(synchronized.state);

    assert.deepEqual(renderedColumns()[0].items, ['tab-alpha', 'tab-beta', 'tab-gamma']);
    assert.equal(document.querySelector('#tab-gamma .tab-title').textContent, 'Gamma');
    assert.deepEqual(storage.values.bgTabs, []);
    assert.equal(storage.values.savedTabs.find(tab => tab.id === 'gamma').note, 'selected text');
});

test('an unchanged background queue does not disturb the page', async () => {
    const { service } = createService(storedState());
    await service.initialize();

    const synchronized = await service.synchronize({
        bgTabs: { oldValue: [], newValue: [] }
    });

    assert.equal(synchronized, null);
});

test('dragging a tab onto another writes a subgroup that renders back', async () => {
    const { service, stateStore, storage } = createService(storedState());
    renderState((await service.initialize()).state);

    const deletionArea = createDeletionArea(document);
    const newColumnIndicator = createNewColumnIndicator(document);
    const columnsContainer = document.getElementById('columns-container');
    columnsContainer.appendChild(newColumnIndicator);
    setRect(document.getElementById('sidebar'), { top: 12, height: 800, left: 0, width: 200 });
    setRect(document.getElementById('space-container'), {
        top: 64,
        height: 700,
        left: 220,
        width: 780
    });
    setRect(columnsContainer, { top: 64, height: 700, left: 220, width: 780 });
    setRect(deletionArea, { top: 900, height: 60, left: 0, width: 1000 });
    setRect(newColumnIndicator, { top: 64, height: 700, left: 1000, width: 60 });

    const controller = createDragController(document, {
        columnsContainer,
        getDeletionArea: () => deletionArea,
        getNewColumnIndicator: () => newColumnIndicator,
        requestFrame: () => 0,
        cancelFrame: () => {}
    });

    const rows = ['tab-alpha', 'tab-beta'].map(id => document.getElementById(id));
    stackRects(rows, { top: 100, height: 40, left: 240, width: 300 });
    controller.handleTabDragStart(dragEvent('dragstart', rows[0]));

    // Rest the pointer in the middle of the second tab to group onto it.
    const descriptor = controller.resolveDrop(
        dragEvent('drop', document.getElementById('column-1'), { data: 'tab-alpha', clientY: 160 })
    );
    assert.deepEqual(descriptor.item, { type: 'tab', tabId: 'beta' });

    const nextState = applyDrop(stateStore.getState(), {
        dragged: descriptor.dragged,
        target: { type: 'item', item: descriptor.item },
        groupIdFactory: () => 'group-new'
    });
    await service.persist(nextState);
    renderState(stateStore.getState());

    // The page shows one subgroup holding both tabs...
    assert.deepEqual(renderedColumns()[0].items, ['group-new']);
    assert.deepEqual(
        Array.from(document.querySelectorAll('#group-new .expanded-tabs .tab-item')).map(t => t.id),
        ['tab-beta', 'tab-alpha']
    );
    // ...and storage keeps the legacy nested-array shape older releases read,
    // with the new group expanded so the user can see what they just made.
    assert.deepEqual(storage.values.columnState[0].tabIds, [
        ['group-new', 'tab-beta', 'tab-alpha', 'New Group', true]
    ]);
});
