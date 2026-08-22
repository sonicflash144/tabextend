import { isFileUrl, resolveFaviconUrl } from '../domain/browser-tabs.mjs';
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

/**
 * A local file reports no favicon and has no host to look one up by, so the
 * view draws this icon in the slot instead. Only its name travels, so the
 * icon stays part of the shared set and follows the theme, and nothing is
 * written to storage: tabs saved before local files were supported get it too.
 */
export const LOCAL_FILE_ICON = 'file';

const OVERDUE_DATE_CLASS = 'date-overdue';
const TODAY_DATE_CLASS = 'date-today';
const TOMORROW_DATE_CLASS = 'date-tomorrow';
const LATER_DATE_CLASS = 'date-later';

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
        return { formattedDate: '', dateDisplayClass: OVERDUE_DATE_CLASS };
    }

    const { now = Date.now() } = options;
    const date = new Date(parsedDate);
    const diffDays = daysUntil(date, now);
    let formattedDate;
    let dateDisplayClass = LATER_DATE_CLASS;

    if (diffDays === 0) {
        formattedDate = 'Today';
        dateDisplayClass = TODAY_DATE_CLASS;
    } else if (diffDays === 1) {
        formattedDate = 'Tomorrow';
        dateDisplayClass = TOMORROW_DATE_CLASS;
    } else if (diffDays >= 2 && diffDays <= 7) {
        formattedDate = WEEKDAY_NAMES[date.getDay()];
    } else {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        formattedDate = `${month}/${day}/${year}`;
    }

    if (diffDays < 0) dateDisplayClass = OVERDUE_DATE_CLASS;

    return { formattedDate, dateDisplayClass };
}

/**
 * Read a due date out of note text. Escaped words are hidden from the parser,
 * and the matched words are lifted out of the note that gets stored.
 */
export function parseNoteDate(note, options) {
    const { chrono, now = () => new Date() } = options;
    const searchable = note.replace(/\\\w+/g, '');
    const parsedDate = chrono.parseDate(searchable, now(), { forwardDate: true });
    const detectedDateText = parsedDate ? (chrono.parse(note)[0]?.text ?? '') : '';
    const remainingNote = parsedDate ? note.replace(detectedDateText, '').trim() : note;
    return { parsedDate, remainingNote, detectedDateText };
}

/**
 * The tab's own icon when it has one that can render, and otherwise the name
 * of the icon to draw in its place. Naming an icon rather than building one
 * keeps this module free of the DOM.
 */
function faviconFor(tab, candidate) {
    const faviconUrl = safeImageUrl(candidate);
    if (faviconUrl) return { faviconUrl, faviconFallback: null };
    return {
        faviconUrl: '',
        faviconFallback: isFileUrl(tab?.url) ? LOCAL_FILE_ICON : null
    };
}

/** Everything a stored tab contributes to its view, with nothing DOM-bound. */
export function presentTab(tab, options = {}) {
    const { now = Date.now() } = options;
    return {
        navigableUrl: safePageUrl(tab.url),
        ...faviconFor(tab, tab.favIconUrl),
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
    return faviconFor(tab, resolveFaviconUrl(tab));
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
        parseNote: note =>
            parseNoteDate(note, {
                chrono,
                now: () => new Date(now())
            })
    };
}
