import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createOpenFailureReporter,
    LOCAL_FILE_ACCESS_MESSAGE,
    LOCAL_FILE_UNSUPPORTED_MESSAGE,
    openFailureMessage
} from '../../src/ui/open-failure.mjs';

test('explains nothing when no local file was involved', () => {
    assert.equal(openFailureMessage(['https://example.com']), null);
    assert.equal(openFailureMessage(['https://example.com'], { canOpenFileUrls: true }), null);
    assert.equal(openFailureMessage([]), null);
    assert.equal(openFailureMessage(undefined), null);
});

test('names the file-access setting only where the browser has one', () => {
    const urls = ['file:///home/notes.html'];

    assert.equal(openFailureMessage(urls, { canOpenFileUrls: true }), LOCAL_FILE_ACCESS_MESSAGE);
    assert.match(LOCAL_FILE_ACCESS_MESSAGE, /Allow access to file URLs/);

    // Firefox and Safari have no such toggle, so pointing at one would send
    // the user looking for something that does not exist.
    assert.equal(
        openFailureMessage(urls, { canOpenFileUrls: false }),
        LOCAL_FILE_UNSUPPORTED_MESSAGE
    );
    assert.equal(openFailureMessage(urls), LOCAL_FILE_UNSUPPORTED_MESSAGE);
    assert.match(LOCAL_FILE_UNSUPPORTED_MESSAGE, /not supported on this browser/);
    assert.doesNotMatch(LOCAL_FILE_UNSUPPORTED_MESSAGE, /Allow access to file URLs/);
});

test('explains a mixed batch whenever any of it was a local file', () => {
    const urls = ['https://example.com', 'FILE:///C:/notes.html'];

    assert.equal(openFailureMessage(urls, { canOpenFileUrls: true }), LOCAL_FILE_ACCESS_MESSAGE);
    assert.equal(openFailureMessage(urls), LOCAL_FILE_UNSUPPORTED_MESSAGE);
});

test('treats an absent capability as unable rather than assuming a setting', () => {
    const urls = ['file:///home/notes.html'];

    // The capability is read off the API boundary, where an unrecognised
    // browser reports undefined; only an explicit true names the setting.
    assert.equal(
        openFailureMessage(urls, { canOpenFileUrls: undefined }),
        LOCAL_FILE_UNSUPPORTED_MESSAGE
    );
    assert.equal(openFailureMessage(urls, {}), LOCAL_FILE_UNSUPPORTED_MESSAGE);
});

function createReporter(options = {}) {
    const alerts = [];
    const logged = [];
    const reporter = createOpenFailureReporter({
        showAlert: message => alerts.push(message),
        logError: (message, error) => logged.push([message, error.message]),
        ...options
    });
    return { alerts, logged, reporter };
}

test('requires somewhere to show an alert', () => {
    assert.throws(() => createOpenFailureReporter({}), /alert function is required/);
});

test('alerts immediately outside a batch', () => {
    const { alerts, logged, reporter } = createReporter();

    reporter.report('Could not open:', new Error('refused'), ['file:///a.html']);

    assert.deepEqual(alerts, [LOCAL_FILE_UNSUPPORTED_MESSAGE]);
    assert.deepEqual(logged, [['Could not open:', 'refused']]);
});

test('a batch explains many refused tabs once but logs every one', async () => {
    const { alerts, logged, reporter } = createReporter({ canOpenFileUrls: true });

    // Five local files dragged onto the open-tab list are refused one at a
    // time; five modal alerts would each have to be dismissed in turn.
    await reporter.batch(async () => {
        for (const name of ['a', 'b', 'c', 'd', 'e']) {
            reporter.report('Could not reopen:', new Error(`refused ${name}`), [
                `file:///${name}.html`
            ]);
        }
    });

    assert.deepEqual(alerts, [LOCAL_FILE_ACCESS_MESSAGE]);
    assert.equal(logged.length, 5);
});

test('a batch holds its explanation until the work has finished', async () => {
    const { alerts, reporter } = createReporter();
    const order = [];

    const result = await reporter.batch(async () => {
        reporter.report('Could not reopen:', new Error('refused'), ['file:///a.html']);
        // The board is still being updated, so nothing may block yet.
        assert.deepEqual(alerts, []);
        order.push('work');
        return 'done';
    });

    assert.equal(result, 'done');
    assert.deepEqual(order, ['work']);
    assert.deepEqual(alerts, [LOCAL_FILE_UNSUPPORTED_MESSAGE]);
});

test('a batch still explains itself when the work throws', async () => {
    const { alerts, reporter } = createReporter();

    await assert.rejects(
        reporter.batch(async () => {
            reporter.report('Could not reopen:', new Error('refused'), ['file:///a.html']);
            throw new Error('drop failed');
        }),
        /drop failed/
    );

    assert.deepEqual(alerts, [LOCAL_FILE_UNSUPPORTED_MESSAGE]);
});

test('a batch says nothing when no refusal needed explaining', async () => {
    const { alerts, logged, reporter } = createReporter();

    await reporter.batch(async () => {
        reporter.report('Could not open:', new Error('offline'), ['https://example.com']);
    });

    assert.deepEqual(alerts, []);
    assert.deepEqual(logged, [['Could not open:', 'offline']]);
});

test('a nested batch does not flush the outer one early', async () => {
    const { alerts, reporter } = createReporter();

    await reporter.batch(async () => {
        await reporter.batch(async () => {
            reporter.report('Could not reopen:', new Error('refused'), ['file:///a.html']);
        });
        // The inner batch finished, but the drop as a whole has not.
        assert.deepEqual(alerts, []);
        reporter.report('Could not reopen:', new Error('refused'), ['file:///b.html']);
    });

    assert.deepEqual(alerts, [LOCAL_FILE_UNSUPPORTED_MESSAGE]);
});

test('each batch gets its own explanation rather than repeating a stale one', async () => {
    const { alerts, reporter } = createReporter();

    await reporter.batch(async () => {
        reporter.report('Could not reopen:', new Error('refused'), ['file:///a.html']);
    });
    await reporter.batch(async () => {
        reporter.report('Could not open:', new Error('offline'), ['https://example.com']);
    });

    assert.deepEqual(alerts, [LOCAL_FILE_UNSUPPORTED_MESSAGE]);
});
