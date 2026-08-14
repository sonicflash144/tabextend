const RELEASE_KEYS = ['release', 'whatsNewClicked'];

/**
 * Decide what the settings menu should advertise for the installed version.
 * A newly installed release always re-offers its release notes.
 */
export function evaluateReleaseState(data = {}, version) {
    const previousVersion = data.release;
    const isNewRelease = previousVersion !== version;
    return {
        version,
        previousVersion,
        isNewRelease,
        whatsNewClicked: isNewRelease ? false : data.whatsNewClicked === true
    };
}

export function createReleaseService(options) {
    const { storage, runtime } = options;

    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
        throw new Error('A storage adapter with get and set methods is required.');
    }
    if (typeof runtime?.getManifest !== 'function') {
        throw new Error('A runtime adapter with getManifest is required.');
    }

    function installedVersion() {
        return runtime.getManifest().version;
    }

    async function load() {
        const data = await storage.get(RELEASE_KEYS);
        const state = evaluateReleaseState(data, installedVersion());
        if (state.isNewRelease) await storage.set({ whatsNewClicked: false });
        return state;
    }

    /** Record that the user has seen the new-release marker. */
    function acknowledgeRelease() {
        return storage.set({ release: installedVersion() });
    }

    function markWhatsNewClicked() {
        return storage.set({ whatsNewClicked: true });
    }

    return { acknowledgeRelease, load, markWhatsNewClicked };
}
