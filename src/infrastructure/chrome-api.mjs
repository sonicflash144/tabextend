import {
    createChromeEventAdapter,
    createChromeMethod
} from './chrome-primitives.mjs';
import { createStorageRepository } from './storage-repository.mjs';

/** Build the complete dependency-injected browser API boundary. */
export function createChromeApiAdapters(chromeApi) {
    if (!chromeApi) throw new Error('Chrome extension API is required.');
    const runtime = chromeApi.runtime;
    const storageRepository = createStorageRepository(chromeApi);

    return {
        storage: {
            local: storageRepository,
            onChanged: storageRepository.onChanged
        },
        tabs: {
            get: createChromeMethod(chromeApi.tabs, 'get', runtime, undefined),
            query: createChromeMethod(chromeApi.tabs, 'query', runtime, []),
            create: createChromeMethod(chromeApi.tabs, 'create', runtime, undefined),
            remove: createChromeMethod(chromeApi.tabs, 'remove', runtime, undefined),
            update: createChromeMethod(chromeApi.tabs, 'update', runtime, undefined),
            move: createChromeMethod(chromeApi.tabs, 'move', runtime, undefined),
            group: createChromeMethod(chromeApi.tabs, 'group', runtime, undefined),
            onUpdated: createChromeEventAdapter(chromeApi.tabs?.onUpdated),
            onRemoved: createChromeEventAdapter(chromeApi.tabs?.onRemoved),
            onMoved: createChromeEventAdapter(chromeApi.tabs?.onMoved),
            onActivated: createChromeEventAdapter(chromeApi.tabs?.onActivated)
        },
        tabGroups: {
            update: createChromeMethod(chromeApi.tabGroups, 'update', runtime, undefined)
        },
        contextMenus: {
            create: createChromeMethod(chromeApi.contextMenus, 'create', runtime, undefined),
            update: createChromeMethod(chromeApi.contextMenus, 'update', runtime, undefined),
            onClicked: createChromeEventAdapter(chromeApi.contextMenus?.onClicked)
        },
        action: {
            onClicked: createChromeEventAdapter(chromeApi.action?.onClicked)
        },
        runtime: {
            getManifest() {
                return runtime.getManifest();
            },
            onInstalled: createChromeEventAdapter(runtime?.onInstalled)
        }
    };
}
