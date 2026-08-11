// Desktop shell. Sovereign Scar runs unchanged inside it — no build step, no
// bundler, no source changes. This file only opens a window and points it at
// the game.
//
// WHY IT SERVES OVER LOOPBACK INSTEAD OF LOADING file://
//
// The obvious shell is `win.loadFile('index.html')`, and it does not work here.
// index.html is an ES-module document with an import map, and Chromium applies
// CORS to module scripts: over file:// every `import` is treated as a
// cross-origin request from an opaque origin and is blocked. The window would
// open on a black canvas with a console full of CORS errors, which reads as
// "the game is broken" rather than "the protocol is wrong".
//
// So the shell starts the project's OWN static server — scripts/serve.mjs, the
// same one `npm run serve` and the whole test harness use — on a loopback
// address and loads that. The game then runs under exactly the origin
// semantics it was written and tested against, which is also why localStorage
// saves behave the same as in the browser.
//
// Port 0 asks the OS for a free port. A fixed port would collide with a dev
// server the developer already has open on 8799, and would make two copies of
// the game refuse to start.

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Chromium's GPU sandbox and software-GL fallbacks vary a lot across Windows
// driver versions; leaving these to Electron's defaults is deliberate. If a
// machine turns out to need a switch, it belongs here with the reason.

let server = null;
let win = null;

/** Start the project's static server on an OS-assigned loopback port. */
async function startServer() {
    const serveUrl = pathToFileURL(path.join(__dirname, '..', 'scripts', 'serve.mjs'));
    const { createServer } = await import(serveUrl.href);
    const s = createServer();
    await new Promise((resolve, reject) => {
        s.once('error', reject);
        s.listen(0, '127.0.0.1', resolve);
    });
    server = s;
    return `http://127.0.0.1:${s.address().port}/`;
}

function buildMenu() {
    // A real menu bar, mostly so Quit and Fullscreen have discoverable homes.
    // View > Reload is kept because a WebGL context loss is recoverable by
    // reloading, and without this the player's only option is killing the app.
    const template = [
        {
            label: '&Game',
            submenu: [
                { role: 'reload', label: 'Reload' },
                { type: 'separator' },
                { role: 'quit', label: 'Quit' },
            ],
        },
        {
            label: '&View',
            submenu: [
                { role: 'togglefullscreen' },
                { type: 'separator' },
                { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'toggleDevTools' },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
    const url = await startServer();

    win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#04060c', // matches the boot overlay, so no white flash
        show: false,
        title: 'Sovereign Scar',
        webPreferences: {
            // The game is ordinary browser code and wants no Node at all.
            // Keeping the renderer sandboxed means a bug in game code cannot
            // reach the filesystem, which is the whole reason to set these
            // rather than leave them to defaults.
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            backgroundThrottling: false, // a paused render loop in a bg window looks like a hang
        },
    });

    // Show only once the first frame is ready, so the player never sees an
    // empty window while Chromium warms up.
    win.once('ready-to-show', () => win.show());

    // External links open in the real browser, never in the game window —
    // a navigated-away game window has no back button and looks like a crash.
    win.webContents.setWindowOpenHandler(({ url: target }) => {
        shell.openExternal(target);
        return { action: 'deny' };
    });

    await win.loadURL(url);
    win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
    buildMenu();
    try {
        await createWindow();
    } catch (e) {
        // Failing to start the server is the one fatal case, and a silent exit
        // would be indistinguishable from the app not launching at all.
        const { dialog } = require('electron');
        dialog.showErrorBox('Sovereign Scar could not start',
            String((e && e.stack) || e));
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (server) { try { server.close(); } catch (_) { /* already down */ } server = null; }
    // Windows and Linux quit with the last window; macOS convention is to stay
    // resident in the dock.
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (server) { try { server.close(); } catch (_) { /* already down */ } server = null; }
});
