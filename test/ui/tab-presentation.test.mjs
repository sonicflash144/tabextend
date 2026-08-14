import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createTabPresenter,
    daysUntil,
    formatTabDate,
    parseNoteDate,
    presentTab,
    resolveColorClass,
    TAB_COLOR_CLASSES
} from '../../src/ui/tab-presentation.mjs';

const NOON = new Date('2026-08-13T12:00:00').getTime();

function at(day, hour = 9) {
    return new Date(2026, 7, day, hour).getTime();
}

test('palette classes pass through and legacy hex colours are mapped', () => {
    TAB_COLOR_CLASSES.forEach(colorClass => {
        assert.equal(resolveColorClass(colorClass), colorClass);
    });
    assert.equal(resolveColorClass('#ffc4c4'), 'tab-pink');
    assert.equal(resolveColorClass('#FFFFFF'), 'tab-default');
    assert.equal(resolveColorClass(undefined), 'tab-default');
});

test('day differences ignore the time of day', () => {
    assert.equal(daysUntil(at(13, 23), NOON), 0);
    assert.equal(daysUntil(at(13, 0), NOON), 0);
    assert.equal(daysUntil(at(14, 1), NOON), 1);
    assert.equal(daysUntil(at(12, 23), NOON), -1);
});

test('due dates read as relative names near today and as dates further out', () => {
    assert.deepEqual(formatTabDate(at(13), { now: NOON }), {
        formattedDate: 'Today',
        dateDisplayColor: '#058527'
    });
    assert.deepEqual(formatTabDate(at(14), { now: NOON }), {
        formattedDate: 'Tomorrow',
        dateDisplayColor: '#C76E00'
    });
    // Within the week, the weekday name is enough.
    assert.deepEqual(formatTabDate(at(16), { now: NOON }), {
        formattedDate: 'Sunday',
        dateDisplayColor: '#ababab'
    });
    assert.deepEqual(formatTabDate(at(25), { now: NOON }), {
        formattedDate: '08/25/26',
        dateDisplayColor: '#ababab'
    });
});

test('a passed due date is marked overdue, and no date shows nothing', () => {
    const overdue = formatTabDate(at(11), { now: NOON });
    assert.equal(overdue.dateDisplayColor, '#e63c30');
    assert.equal(overdue.formattedDate, '08/11/26');

    assert.deepEqual(formatTabDate(null, { now: NOON }), {
        formattedDate: '',
        dateDisplayColor: '#e63c30'
    });
});

function createChrono(matches = []) {
    return {
        parseDate(text) {
            const match = matches.find(candidate => text.includes(candidate.text));
            return match ? match.date : null;
        },
        parse(text) {
            const match = matches.find(candidate => text.includes(candidate.text));
            return match ? [{ text: match.text }] : [];
        }
    };
}

test('a due date is lifted out of the note text that gets stored', () => {
    const date = new Date(at(14));
    const chrono = createChrono([{ text: 'tomorrow', date }]);

    assert.deepEqual(parseNoteDate('call the vet tomorrow', { chrono }), {
        parsedDate: date,
        remainingNote: 'call the vet',
        detectedDateText: 'tomorrow'
    });
});

test('a note with no date is stored unchanged', () => {
    assert.deepEqual(parseNoteDate('just a note', { chrono: createChrono() }), {
        parsedDate: null,
        remainingNote: 'just a note',
        detectedDateText: ''
    });
});

test('escaped words are hidden from the date parser', () => {
    const date = new Date(at(14));
    const chrono = {
        parseDate: text => (text.includes('tomorrow') ? date : null),
        parse: () => []
    };

    // The parser never sees "\tomorrow", so no date is detected.
    assert.equal(parseNoteDate('read \\tomorrow', { chrono }).parsedDate, null);
});

test('a date the parser cannot locate in the raw note does not throw', () => {
    const date = new Date(at(14));
    const chrono = { parseDate: () => date, parse: () => [] };

    assert.deepEqual(parseNoteDate('  spaced note  ', { chrono }), {
        parsedDate: date,
        remainingNote: 'spaced note',
        detectedDateText: ''
    });
});

test('a stored tab is presented with safe urls, colour, note, and date', () => {
    const presented = presentTab(
        {
            id: 'alpha',
            title: 'Alpha',
            url: 'https://example.com/alpha',
            favIconUrl: 'https://example.com/icon.png',
            color: '#ebc4ff',
            note: 'line one<br>line two',
            parsedDate: at(13)
        },
        { now: NOON }
    );

    assert.deepEqual(presented, {
        navigableUrl: 'https://example.com/alpha',
        faviconUrl: 'https://example.com/icon.png',
        colorClass: 'tab-purple',
        noteDisplayText: 'line one\nline two',
        noteEditableText: 'line one\nline two',
        formattedDate: 'Today',
        dateDisplayColor: '#058527'
    });
});

test('unsafe stored urls are dropped rather than rendered', () => {
    const presented = presentTab(
        {
            id: 'alpha',
            url: 'javascript:alert(1)',
            favIconUrl: 'javascript:alert(1)',
            color: '#FFFFFF'
        },
        { now: NOON }
    );

    assert.equal(presented.navigableUrl, '');
    assert.equal(presented.faviconUrl, '');
});

test('the presenter binds the clock and parser once', () => {
    const date = new Date(at(14));
    const presenter = createTabPresenter({
        chrono: createChrono([{ text: 'tomorrow', date }]),
        now: () => NOON
    });

    assert.equal(presenter.present({ id: 'a', parsedDate: at(13) }).formattedDate, 'Today');
    assert.equal(presenter.formatDate(at(14)).formattedDate, 'Tomorrow');
    assert.equal(presenter.noteDisplayText('a<br>b'), 'a\nb');
    assert.equal(presenter.parseNote('ship tomorrow').remainingNote, 'ship');
});
