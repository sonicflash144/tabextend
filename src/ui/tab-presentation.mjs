import { resolveFaviconUrl } from '../domain/browser-tabs.mjs';
import {
    legacyNoteToDisplayText,
    legacyNoteToEditableText,
    safeImageUrl,
    safePageUrl
} from '../security/content.mjs';
import { getColorClass } from './rendering.mjs';

export const TAB_COLOR_CLASSES = [
    'tab-default',
    'tab-pink',
    'tab-yellow',
    'tab-blue',
    'tab-purple'
];

const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
];

const OVERDUE_COLOR = '#e63c30';
const TODAY_COLOR = '#058527';
const TOMORROW_COLOR = '#C76E00';
const LATER_COLOR = '#ababab';

/** Stored colours may already be a palette class or a legacy hex value. */
export function resolveColorClass(color) {
    return TAB_COLOR_CLASSES.includes(color) ? color : getColorClass(color);
}

/** Whole days from today to the given date, negative once it has passed. */
export function daysUntil(date, now = Date.now()) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** The reminder badge: a relative name when it is near, a date when it is not. */
export function formatTabDate(parsedDate, options = {}) {
    if (!parsedDate) {
        return { formattedDate: '', dateDisplayColor: OVERDUE_COLOR };
    }

    const { now = Date.now() } = options;
    const date = new Date(parsedDate);
    const diffDays = daysUntil(date, now);
    let formattedDate;
    let dateDisplayColor = LATER_COLOR;

    if (diffDays === 0) {
        formattedDate = 'Today';
        dateDisplayColor = TODAY_COLOR;
    } else if (diffDays === 1) {
        formattedDate = 'Tomorrow';
        dateDisplayColor = TOMORROW_COLOR;
    } else if (diffDays >= 2 && diffDays <= 7) {
        formattedDate = WEEKDAY_NAMES[date.getDay()];
    } else {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        formattedDate = `${month}/${day}/${year}`;
    }

    if (diffDays < 0) dateDisplayColor = OVERDUE_COLOR;

    return { formattedDate, dateDisplayColor };
}

/**
 * Read a due date out of note text. Escaped words are hidden from the parser,
 * and the matched words are lifted out of the note that gets stored.
 */
export function parseNoteDate(note, options) {
    const { chrono, now = () => new Date() } = options;
    const searchable = note.replace(/\\\w+/g, '');
    const parsedDate = chrono.parseDate(searchable, now(), { forwardDate: true });
    const detectedDateText = parsedDate ? chrono.parse(note)[0]?.text ?? '' : '';
    const remainingNote = parsedDate
        ? note.replace(detectedDateText, '').trim()
        : note;
    return { parsedDate, remainingNote, detectedDateText };
}

/** Everything a stored tab contributes to its view, with nothing DOM-bound. */
export function presentTab(tab, options = {}) {
    const { now = Date.now() } = options;
    return {
        navigableUrl: safePageUrl(tab.url),
        faviconUrl: safeImageUrl(tab.favIconUrl),
        colorClass: resolveColorClass(tab.color),
        noteDisplayText: legacyNoteToDisplayText(tab.note),
        noteEditableText: legacyNoteToEditableText(tab.note),
        ...formatTabDate(tab.parsedDate, { now })
    };
}

/**
 * An open browser tab, which carries no stored decoration of its own and
 * falls back to the favicon service when the browser reports no icon.
 */
export function presentOpenTab(tab) {
    return { faviconUrl: safeImageUrl(resolveFaviconUrl(tab)) };
}

/**
 * The presentation the views ask for, with the clock and date parser bound
 * once. `chrono` is injected so the view layer never imports the parser.
 */
export function createTabPresenter(options = {}) {
    const { chrono, now = () => Date.now() } = options;

    return {
        present: tab => presentTab(tab, { now: now() }),
        presentOpen: presentOpenTab,
        formatDate: parsedDate => formatTabDate(parsedDate, { now: now() }),
        noteDisplayText: legacyNoteToDisplayText,
        parseNote: note => parseNoteDate(note, {
            chrono,
            now: () => new Date(now())
        })
    };
}
