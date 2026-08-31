const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("get-state"),
  pickDir: () => ipcRenderer.invoke("pick-dir"),
  start: (opts) => ipcRenderer.invoke("start", opts),
  stop: () => ipcRenderer.invoke("stop"),
  exportCsv: () => ipcRenderer.invoke("export-csv"),
  openDir: () => ipcRenderer.invoke("open-dir"),
  onLog: (cb) => ipcRenderer.on("log", (e, text) => cb(text)),
  onStatus: (cb) => ipcRenderer.on("status", (e, s) => cb(s)),
  onState: (cb) => ipcRenderer.on("state", (e, s) => cb(s))
});
