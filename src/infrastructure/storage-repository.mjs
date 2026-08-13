import {
    createChromeEventAdapter,
    createChromeMethod
} from './chrome-primitives.mjs';

/**
 * Storage boundary used by both extension entry points. Methods support the
 * historical callback form and return promises when no callback is supplied.
 */
export function createStorageRepository(chromeApi) {
    if (!chromeApi?.storage?.local) {
        throw new Error('chrome.storage.local is required.');
    }
    const local = chromeApi.storage.local;
    const runtime = chromeApi.runtime;

    return {
        get: createChromeMethod(local, 'get', runtime, {}),
        set: createChromeMethod(local, 'set', runtime, undefined),
        remove: createChromeMethod(local, 'remove', runtime, undefined),
        clear: createChromeMethod(local, 'clear', runtime, undefined),
        onChanged: createChromeEventAdapter(chromeApi.storage.onChanged)
    };
}
