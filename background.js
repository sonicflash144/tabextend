import { createBackgroundService } from './src/application/background-service.mjs';
import { createBackgroundTabQueue } from './src/application/background-tab-queue.mjs';
import { createBrowserApiFromGlobal } from './src/infrastructure/browser-api.mjs';

const browserApi = createBrowserApiFromGlobal(globalThis);

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

const backgroundService = createBackgroundService({
    browserApi,
    queue: createBackgroundTabQueue({
        storage: browserApi.storage.local,
        idFactory: generateUniqueId
    }),
    onError: error => {
        console.error('Background workflow failed:', error);
    }
});

backgroundService.start();
