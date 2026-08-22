import { createExtensionEventAdapter, createExtensionMethod } from './extension-primitives.mjs';

/**
 * Storage boundary used by both extension entry points. Methods support the
 * historical callback form and return promises when no callback is supplied.
 */
export function createStorageRepository(extensionApi, options = {}) {
    if (!extensionApi?.storage?.local) {
        throw new Error('WebExtension storage.local is required.');
    }
    const local = extensionApi.storage.local;
    const runtime = extensionApi.runtime;

    return {
        get: createExtensionMethod(local, 'get', runtime, {}, options),
        set: createExtensionMethod(local, 'set', runtime, undefined, options),
        remove: createExtensionMethod(local, 'remove', runtime, undefined, options),
        clear: createExtensionMethod(local, 'clear', runtime, undefined, options),
        onChanged: createExtensionEventAdapter(extensionApi.storage.onChanged)
    };
}
