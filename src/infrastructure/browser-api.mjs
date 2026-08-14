import {
    createExtensionEventAdapter,
    createExtensionMethod
} from './chrome-primitives.mjs';
import { createStorageRepository } from './storage-repository.mjs';

/** Resolve the native WebExtension namespace and its asynchronous API style. */
export function resolveWebExtensionApi(scope = globalThis) {
    if (scope.browser) return { api: scope.browser, apiStyle: 'promise' };
    if (scope.chrome) return { api: scope.chrome, apiStyle: 'callback' };
    throw new Error('A WebExtension browser API is required.');
}

/** Build the browser-neutral API boundary used by both extension entry points. */
export function createBrowserApiAdapters(extensionApi, options = {}) {
    if (!extensionApi) throw new Error('A WebExtension browser API is required.');
    const apiStyle = options.apiStyle || 'callback';
    const methodOptions = { apiStyle };
    const runtime = extensionApi.runtime;
    const storageRepository = createStorageRepository(extensionApi, methodOptions);
    const supportsTabGroups = Boolean(
        extensionApi.tabs?.group && extensionApi.tabGroups?.update
    );

    return {
        capabilities: {
            tabGroups: supportsTabGroups
        },
        storage: {
            local: storageRepository,
            onChanged: storageRepository.onChanged
        },
        tabs: {
            get: createExtensionMethod(extensionApi.tabs, 'get', runtime, undefined, methodOptions),
            query: createExtensionMethod(extensionApi.tabs, 'query', runtime, [], methodOptions),
            create: createExtensionMethod(extensionApi.tabs, 'create', runtime, undefined, methodOptions),
            remove: createExtensionMethod(extensionApi.tabs, 'remove', runtime, undefined, methodOptions),
            update: createExtensionMethod(extensionApi.tabs, 'update', runtime, undefined, methodOptions),
            move: createExtensionMethod(extensionApi.tabs, 'move', runtime, undefined, methodOptions),
            group: createExtensionMethod(extensionApi.tabs, 'group', runtime, undefined, methodOptions),
            onUpdated: createExtensionEventAdapter(extensionApi.tabs?.onUpdated),
            onRemoved: createExtensionEventAdapter(extensionApi.tabs?.onRemoved),
            onMoved: createExtensionEventAdapter(extensionApi.tabs?.onMoved),
            onActivated: createExtensionEventAdapter(extensionApi.tabs?.onActivated)
        },
        tabGroups: {
            update: createExtensionMethod(
                extensionApi.tabGroups,
                'update',
                runtime,
                undefined,
                methodOptions
            )
        },
        contextMenus: {
            create: createExtensionMethod(extensionApi.contextMenus, 'create', runtime, undefined, methodOptions),
            update: createExtensionMethod(extensionApi.contextMenus, 'update', runtime, undefined, methodOptions),
            onClicked: createExtensionEventAdapter(extensionApi.contextMenus?.onClicked)
        },
        action: {
            onClicked: createExtensionEventAdapter(extensionApi.action?.onClicked)
        },
        runtime: {
            getManifest() {
                return runtime.getManifest();
            },
            onInstalled: createExtensionEventAdapter(runtime?.onInstalled)
        }
    };
}

export function createBrowserApiFromGlobal(scope = globalThis) {
    const resolved = resolveWebExtensionApi(scope);
    return createBrowserApiAdapters(resolved.api, { apiStyle: resolved.apiStyle });
}
