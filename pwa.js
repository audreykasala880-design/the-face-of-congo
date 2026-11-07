if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

const installButtons = document.querySelectorAll('[data-install-app]');
let pendingInstall;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  pendingInstall = event;
  installButtons.forEach((button) => { button.hidden = false; });
});

installButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    if (!pendingInstall) return;
    await pendingInstall.prompt();
    await pendingInstall.userChoice;
    pendingInstall = null;
    installButtons.forEach((installButton) => { installButton.hidden = true; });
  });
});

window.addEventListener('appinstalled', () => {
  pendingInstall = null;
  installButtons.forEach((button) => { button.hidden = true; });
});