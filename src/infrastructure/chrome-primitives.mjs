function copyRuntimeError(runtime) {
    const lastError = runtime && runtime.lastError;
    return lastError ? new Error(lastError.message || String(lastError)) : null;
}

export function createChromeMethod(target, methodName, runtime, errorResult) {
    if (!target || typeof target[methodName] !== 'function') {
        return (...args) => {
            const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
            const error = new Error(`Chrome API method is unavailable: ${methodName}`);
            if (callback) {
                callback(errorResult, error);
                return undefined;
            }
            return Promise.reject(error);
        };
    }

    return (...args) => {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        if (callback) {
            try {
                target[methodName](...args, result => {
                    const error = copyRuntimeError(runtime);
                    callback(error ? errorResult : result, error);
                });
            } catch (error) {
                callback(errorResult, error);
            }
            return undefined;
        }

        return new Promise((resolve, reject) => {
            try {
                target[methodName](...args, result => {
                    const error = copyRuntimeError(runtime);
                    if (error) reject(error);
                    else resolve(result);
                });
            } catch (error) {
                reject(error);
            }
        });
    };
}

export function createChromeEventAdapter(event) {
    if (!event) {
        return {
            addListener() {},
            removeListener() {},
            hasListener() { return false; }
        };
    }
    return {
        addListener(listener, ...args) {
            return event.addListener(listener, ...args);
        },
        removeListener(listener) {
            return event.removeListener?.(listener);
        },
        hasListener(listener) {
            return event.hasListener?.(listener) ?? false;
        }
    };
}
