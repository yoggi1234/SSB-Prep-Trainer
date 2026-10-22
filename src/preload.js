'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),

  listAttempts: () => ipcRenderer.invoke('attempts:list'),
  addAttempt: (attempt) => ipcRenderer.invoke('attempt:add', attempt),
  deleteAttempt: (id) => ipcRenderer.invoke('attempt:delete', id),
  clearAttempts: () => ipcRenderer.invoke('attempts:clear'),

  listTatImages: () => ipcRenderer.invoke('tat:images'),
  pickTatImages: () => ipcRenderer.invoke('tat:pick'),
  clearTatImages: () => ipcRenderer.invoke('tat:clearImages'),

  // The bin: a picture removed from the test is kept here, not lost.
  tatBin: () => ipcRenderer.invoke('tat:bin'),
  tatRemove: (payload) => ipcRenderer.invoke('tat:remove', payload),
  tatRestore: (id) => ipcRenderer.invoke('tat:restore', id),
  tatPurge: (id) => ipcRenderer.invoke('tat:purge', id),
  tatEmptyBin: () => ipcRenderer.invoke('tat:emptyBin'),
  tatGoneCount: () => ipcRenderer.invoke('tat:goneCount'),
  tatGoneList: () => ipcRenderer.invoke('tat:goneList'),
  tatResurrect: (id) => ipcRenderer.invoke('tat:resurrect', id),
  tatResetGone: () => ipcRenderer.invoke('tat:resetGone'),

  // Bundled public-domain picture library, and a small online top-up.
  tatLibrary: () => ipcRenderer.invoke('tat:library'),
  tatClassic: () => ipcRenderer.invoke('tat:classic'),
  tatOnline: (opts) => ipcRenderer.invoke('tat:online', opts),

  // Lecturette: bundled topics in the 3-minute SSB pattern + hot topics.
  lecturesList: () => ipcRenderer.invoke('lectures:list'),
  lecturesHot: () => ipcRenderer.invoke('lectures:hot'),
  // Current points per topic. Cached on disk for three months, so the panel
  // still fills in when the machine is offline.
  lecturesLive: (opts) => ipcRenderer.invoke('lectures:live', opts),
  lecturesLiveStatus: () => ipcRenderer.invoke('lectures:liveStatus'),
  // A cached batch of headlines, so a WAT word can show one real news example.
  newsIndex: (opts) => ipcRenderer.invoke('news:index', opts),

  // Online features. Everything is off-by-default-safe: the main process owns
  // the network (the page itself can never fetch), and each call returns a
  // fallback the UI can use instead of failing.
  onlineStatus: () => ipcRenderer.invoke('online:status'),
  onlineProbe: () => ipcRenderer.invoke('net:probe'),
  onlineMeaning: (w) => ipcRenderer.invoke('online:meaning', w),
  onlineWords: (opts) => ipcRenderer.invoke('online:words', opts),

  // Plain meanings and model sentences for the built-in WAT words.
  watHints: () => ipcRenderer.invoke('wat:hints'),
  // Negative / Positive / Neutral action verbs, with their offline meanings.
  connectors: () => ipcRenderer.invoke('connectors:list'),

  // Diagnostics and the on-disk log (for debugging and handover).
  logTail: (n) => ipcRenderer.invoke('log:tail', n),
  logAppend: (scope, msg) => ipcRenderer.invoke('log:append', scope, msg),
  logOpenFolder: () => ipcRenderer.invoke('log:openFolder'),
  diagInfo: () => ipcRenderer.invoke('diag:info'),
  diagSave: () => ipcRenderer.invoke('diag:save'),

  // News digest engine (separate Python tool, own folder, own data).
  digestStatus: () => ipcRenderer.invoke('digest:status'),
  digestRun: (payload) => ipcRenderer.invoke('digest:run', payload),
  digestCancel: () => ipcRenderer.invoke('digest:cancel'),
  digestFiles: () => ipcRenderer.invoke('digest:files'),
  digestOpen: (name) => ipcRenderer.invoke('digest:open', name),
  digestPickPdfs: () => ipcRenderer.invoke('digest:pickPdfs'),
  digestConfigGet: () => ipcRenderer.invoke('digest:config:get'),
  digestConfigSet: (patch) => ipcRenderer.invoke('digest:config:set', patch),
  onDigestLog: (fn) => {
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on('digest:log', h);
    return () => ipcRenderer.removeListener('digest:log', h);
  },
  onDigestDone: (fn) => {
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on('digest:done', h);
    return () => ipcRenderer.removeListener('digest:done', h);
  },
  onDigestStarted: (fn) => {
    const h = (_e, payload) => fn(payload);
    ipcRenderer.on('digest:started', h);
    return () => ipcRenderer.removeListener('digest:started', h);
  },

  exportText: (payload) => ipcRenderer.invoke('export:text', payload),
  // Whole practice history as CSV or JSON, through a save dialog in main.
  attemptsExport: (format) => ipcRenderer.invoke('attempts:export', format),
  keepAwake: (on) => ipcRenderer.invoke('power:block', on),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),

  // Word library (offline dictionary shipped with the app)
  dictInfo: () => ipcRenderer.invoke('dict:info'),
  dictGet: (word) => ipcRenderer.invoke('dict:get', word),
  dictSearch: (opts) => ipcRenderer.invoke('dict:search', opts),
  dictSentiment: (opts) => ipcRenderer.invoke('dict:sentiment', opts),
  dictRandom: (opts) => ipcRenderer.invoke('dict:random', opts)
});
