import { createMenuDropdown, createNotificationDot } from '../rendering.mjs';

/** Own the settings menu and release-notification interaction lifecycle. */
export function createSettingsMenuController(document, options) {
    const {
        button,
        menuController,
        releaseService,
        getTheme,
        toggleTheme,
        onExport,
        onImport,
        onOpenPage,
        onError = () => {}
    } = options;

    if (!button) throw new Error('A settings button is required.');
    if (!menuController || typeof menuController.open !== 'function') {
        throw new Error('A menu controller is required.');
    }
    if (!releaseService || typeof releaseService.load !== 'function') {
        throw new Error('A release service is required.');
    }

    function report(message, error) {
        onError(message, error);
    }

    async function start() {
        const releaseState = await releaseService.load();
        let whatsNewClicked = releaseState.whatsNewClicked;

        if (releaseState.isNewRelease) {
            button.appendChild(createNotificationDot(document));
        }

        button.addEventListener('click', () => {
            if (menuController.isOpen('settings', 'settings')) {
                menuController.closeAll();
                return;
            }

            const settingsNotification = document.querySelector(
                '.notification-circle:not(.inline-notification)'
            );
            if (settingsNotification) {
                settingsNotification.remove();
                releaseService
                    .acknowledgeRelease()
                    .catch(error => report('Could not save the installed release:', error));
            }

            let releaseNotesNotification = document.querySelector('.inline-notification');
            const closeAll = () => menuController.closeAll();
            const menuItems = [
                {
                    text: getTheme() === 'dark' ? 'Toggle Light Theme' : 'Toggle Dark Theme',
                    action: () => {
                        toggleTheme();
                        closeAll();
                    }
                },
                {
                    text: 'Export Data',
                    action: () => {
                        onExport();
                        closeAll();
                    }
                },
                {
                    text: 'Import Data',
                    action: () => {
                        onImport();
                        closeAll();
                    }
                },
                {
                    text: "What's New",
                    action: () => {
                        releaseNotesNotification?.remove();
                        onOpenPage('https://tabsmagic.com/releasenotes');
                        closeAll();
                        whatsNewClicked = true;
                        releaseService
                            .markWhatsNewClicked()
                            .catch(error =>
                                report('Could not save the release notes state:', error)
                            );
                    }
                },
                {
                    text: 'Feedback',
                    action: () => {
                        onOpenPage('https://tabsmagic.com/contact');
                        closeAll();
                    }
                }
            ];
            const settingsMenu = menuController.open('settings', 'settings', () =>
                createMenuDropdown(document, menuItems, button)
            );

            if (!whatsNewClicked) {
                const whatsNewButton = Array.from(
                    settingsMenu.querySelectorAll('button.menu-option')
                ).find(menuButton => menuButton.textContent.trim().startsWith("What's New"));

                if (whatsNewButton) {
                    releaseNotesNotification = createNotificationDot(document, { inline: true });
                    whatsNewButton.insertBefore(
                        releaseNotesNotification,
                        whatsNewButton.firstChild
                    );
                }
            }
        });

        return releaseState;
    }

    return { start };
}
