import { createExtensionEventAdapter, createExtensionMethod } from './extension-primitives.mjs';
import { createStorageRepository } from './storage-repository.mjs';

/** Resolve the native WebExtension namespace and its asynchronous API style. */
export function resolveWebExtensionApi(scope = globalThis) {
    if (scope.browser) return { api: scope.browser, apiStyle: 'promise' };
    if (scope.chrome) return { api: scope.chrome, apiStyle: 'callback' };
    throw new Error('A WebExtension browser API is required.');
}

/**
 * Whether this browser lets an extension list and open `file://` URLs, which
 * only Chromium does. Chrome gates it further behind the per-extension "Allow
 * access to file URLs" setting that no manifest key can request, so even here
 * an individual open can still be refused and has to be reported.
 *
 * Firefox blocks opening a local file in a tab outright: the capability is
 * unimplemented rather than unrequested (Bugzilla 1617594, still open), so
 * declaring `file:///*` would only add an "Access local files on your
 * computer" permission to the listing without making the feature work. Safari
 * does not expose local files to a web extension at all. Anything
 * unrecognized is treated as unable, so local files stay hidden rather than
 * being listed and then failing to open.
 *
 * There is nothing on the API surface to feature-detect this from, so it
 * reads the user agent the way the page already picks its browser class.
 *
 * `chrome` carries Edge, Brave, Opera, and Vivaldi with it, since every one of
 * them keeps the `Chrome/` token. `chromium` is separate because it does not
 * contain that token as a substring, so a Chromium-branded build needs its own
 * alternative. `CriOS` is deliberately absent: Chrome on iOS is WebKit, which
 * neither runs this extension nor could open a local file for it.
 */
export function supportsFileUrls(userAgent = '') {
    return /chrome|chromium/.test(String(userAgent).toLowerCase());
}

/** Build the browser-neutral API boundary used by both extension entry points. */
export function createBrowserApiAdapters(extensionApi, options = {}) {
    if (!extensionApi) throw new Error('A WebExtension browser API is required.');
    const apiStyle = options.apiStyle || 'callback';
    const methodOptions = { apiStyle };
    const runtime = extensionApi.runtime;
    const storageRepository = createStorageRepository(extensionApi, methodOptions);
    const supportsTabGroups = Boolean(extensionApi.tabs?.group && extensionApi.tabGroups?.update);

    return {
        capabilities: {
            tabGroups: supportsTabGroups,
            fileUrls: supportsFileUrls(options.userAgent)
        },
        storage: {
            local: storageRepository,
            onChanged: storageRepository.onChanged
        },
        tabs: {
            get: createExtensionMethod(extensionApi.tabs, 'get', runtime, undefined, methodOptions),
            query: createExtensionMethod(extensionApi.tabs, 'query', runtime, [], methodOptions),
            create: createExtensionMethod(
                extensionApi.tabs,
                'create',
                runtime,
                undefined,
                methodOptions
            ),
            remove: createExtensionMethod(
                extensionApi.tabs,
                'remove',
                runtime,
                undefined,
                methodOptions
            ),
            update: createExtensionMethod(
                extensionApi.tabs,
                'update',
                runtime,
                undefined,
                methodOptions
            ),
            move: createExtensionMethod(
                extensionApi.tabs,
                'move',
                runtime,
                undefined,
                methodOptions
            ),
            group: createExtensionMethod(
                extensionApi.tabs,
                'group',
                runtime,
                undefined,
                methodOptions
            ),
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
            create: createExtensionMethod(
                extensionApi.contextMenus,
                'create',
                runtime,
                undefined,
                methodOptions
            ),
            update: createExtensionMethod(
                extensionApi.contextMenus,
                'update',
                runtime,
                undefined,
                methodOptions
            ),
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
    return createBrowserApiAdapters(resolved.api, {
        apiStyle: resolved.apiStyle,
        userAgent: scope.navigator?.userAgent || ''
    });
}
