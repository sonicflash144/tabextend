import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createMenuController } from '../../src/ui/controllers/menu-controller.mjs';
import { createSettingsMenuController } from '../../src/ui/controllers/settings-menu-controller.mjs';
import { click, createPageDom } from '../helpers/dom.mjs';

let page;
let document;

before(() => {
    page = createPageDom();
    document = page.document;
});

after(() => page.cleanup());

beforeEach(() => {
    document.querySelectorAll('.test-settings, .options-menu').forEach(element => element.remove());
});

function createHarness(releaseState = {}) {
    const calls = [];
    const button = document.createElement('button');
    button.classList.add('test-settings');
    document.body.appendChild(button);
    const releaseService = {
        async load() {
            calls.push(['load']);
            return {
                isNewRelease: false,
                whatsNewClicked: true,
                ...releaseState
            };
        },
        async acknowledgeRelease() {
            calls.push(['acknowledgeRelease']);
        },
        async markWhatsNewClicked() {
            calls.push(['markWhatsNewClicked']);
        }
    };
    const record =
        name =>
        (...args) =>
            calls.push([name, ...args]);
    const controller = createSettingsMenuController(document, {
        button,
        menuController: createMenuController(),
        releaseService,
        getTheme: () => releaseState.theme || 'light',
        toggleTheme: record('toggleTheme'),
        onExport: record('export'),
        onImport: record('import'),
        onOpenPage: record('openPage'),
        onError: record('error')
    });
    return { button, calls, controller };
}

function menuButton(label) {
    return Array.from(document.querySelectorAll('.menu-option')).find(button =>
        button.textContent.includes(label)
    );
}

test('requires the settings button, menu controller, and release service', () => {
    assert.throws(() => createSettingsMenuController(document, {}), /settings button/);
    assert.throws(
        () => createSettingsMenuController(document, { button: document.createElement('button') }),
        /menu controller/
    );
});

test('a new release shows a notification and acknowledges it when opened', async () => {
    const { button, calls, controller } = createHarness({
        isNewRelease: true,
        whatsNewClicked: false
    });

    await controller.start();
    assert.ok(button.querySelector('.notification-circle'));

    click(button);

    assert.equal(button.querySelector('.notification-circle'), null);
    assert.ok(calls.some(call => call[0] === 'acknowledgeRelease'));
    assert.ok(menuButton("What's New").querySelector('.inline-notification'));
});

test('the settings menu delegates theme, export, and import actions', async () => {
    const { button, calls, controller } = createHarness({ theme: 'dark' });
    await controller.start();

    click(button);
    assert.ok(menuButton('Toggle Light Theme'));
    click(menuButton('Toggle Light Theme'));
    assert.deepEqual(calls.at(-1), ['toggleTheme']);

    click(button);
    click(menuButton('Export Data'));
    assert.deepEqual(calls.at(-1), ['export']);

    click(button);
    click(menuButton('Import Data'));
    assert.deepEqual(calls.at(-1), ['import']);
});

test("What's New opens the release page, records the click, and removes its marker", async () => {
    const { button, calls, controller } = createHarness({ whatsNewClicked: false });
    await controller.start();
    click(button);

    const whatsNew = menuButton("What's New");
    assert.ok(whatsNew.querySelector('.inline-notification'));
    click(whatsNew);

    assert.ok(
        calls.some(
            call => call[0] === 'openPage' && call[1] === 'https://tabsmagic.com/releasenotes'
        )
    );
    assert.ok(calls.some(call => call[0] === 'markWhatsNewClicked'));
    assert.equal(document.querySelector('.inline-notification'), null);
});

test('clicking the settings button again closes its open menu', async () => {
    const { button, controller } = createHarness();
    await controller.start();

    click(button);
    assert.ok(document.querySelector('.options-menu'));
    click(button);
    assert.equal(document.querySelector('.options-menu'), null);
});
