import { app, BrowserWindow, session, shell } from "electron";
import path from "node:path";
import { runMigrations } from "../db/migrate";
import { getDbPath } from "../services/paths";
import { registerIpcHandlers } from "../ipc/registerHandlers";
import { applyContentSecurityPolicy, buildAllowedOrigins } from "./security";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// Un solo processo/finestra alla volta: evita istanze duplicate della app
// (e quindi due finestre) se l'utente la rilancia mentre è già aperta, e
// previene che due processi aprano lo stesso database SQLite in parallelo.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "StudyForge",
    backgroundColor: "#171e2c",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    // Inoltra i log della console del renderer allo stdout del main process:
    // utile per diagnosticare una pagina bianca/grigia senza dover aprire
    // manualmente i DevTools.
    win.webContents.on("console-message", (event) => {
       
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
       
      console.error(`[renderer] did-fail-load ${errorCode} ${errorDescription} — ${validatedURL}`);
    });
  }

  // Impedisce l'apertura di nuove finestre/popup dal renderer; i link esterni
  // vengono aperti nel browser di sistema invece che dentro l'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const isDevServer = isDev && url.startsWith("http://localhost:5173");
    const isAppFile = url.startsWith("file://");
    if (!isDevServer && !isAppFile) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (isDev) {
    void win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  applyContentSecurityPolicy(session.defaultSession, isDev);

  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, "drizzle")
    : path.join(__dirname, "../../drizzle");
  runMigrations(getDbPath(), migrationsFolder);

  mainWindow = createWindow();
  registerIpcHandlers({
    getAllowedOrigins: () => buildAllowedOrigins(isDev),
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
