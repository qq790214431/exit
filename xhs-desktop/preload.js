const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("get-state"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (patch) => ipcRenderer.invoke("save-config", patch),
  pickDir: () => ipcRenderer.invoke("pick-dir"),
  start: (opts) => ipcRenderer.invoke("start", opts),
  stop: () => ipcRenderer.invoke("stop"),
  runMode: (mode, opts) => ipcRenderer.invoke("run-mode", mode, opts),
  exportCsv: () => ipcRenderer.invoke("export-csv"),
  exportXlsx: () => ipcRenderer.invoke("export-xlsx"),
  importLinks: (text) => ipcRenderer.invoke("import-links", text),
  openDir: () => ipcRenderer.invoke("open-dir"),
  getTrend: (userId) => ipcRenderer.invoke("get-trend", userId),
  onLog: (cb) => ipcRenderer.on("log", (e, text) => cb(text)),
  onStatus: (cb) => ipcRenderer.on("status", (e, s) => cb(s)),
  onState: (cb) => ipcRenderer.on("state", (e, s) => cb(s))
});
