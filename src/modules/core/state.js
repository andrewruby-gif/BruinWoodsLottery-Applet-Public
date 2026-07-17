export const STORAGE_KEY = "lottery-app-state";

const ROOT_KEYS = ["families", "config", "results"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

function formatTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function createEmptyState() {
  return { families: [], config: {}, results: [] };
}

export function validateState(candidate) {
  const errors = [];

  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ["State must be an object."] };
  }

  const keys = Object.keys(candidate).sort();
  const expectedKeys = [...ROOT_KEYS].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    errors.push("State must contain only families, config, and results.");
  }
  if (!Array.isArray(candidate.families)) errors.push("families must be an array.");
  if (!isPlainObject(candidate.config)) errors.push("config must be an object.");
  if (!Array.isArray(candidate.results)) errors.push("results must be an array.");

  return { valid: errors.length === 0, errors };
}

export function assertValidState(candidate) {
  const validation = validateState(candidate);
  if (!validation.valid) {
    throw new TypeError(`Invalid lottery state: ${validation.errors.join(" ")}`);
  }
  return candidate;
}

export function loadState(storage = localStorage, storageKey = STORAGE_KEY) {
  const raw = storage.getItem(storageKey);
  if (!raw) return createEmptyState();

  try {
    const parsed = JSON.parse(raw);
    assertValidState(parsed);
    return clone(parsed);
  } catch (error) {
    console.warn("Ignoring invalid local lottery state.", error);
    return createEmptyState();
  }
}

export function saveState(nextState, storage = localStorage, storageKey = STORAGE_KEY) {
  assertValidState(nextState);
  const snapshot = clone(nextState);
  storage.setItem(storageKey, JSON.stringify(snapshot));
  return snapshot;
}

export function hasResults(state) {
  assertValidState(state);
  return state.results.length > 0;
}

export function discardResults(state, storage = localStorage, storageKey = STORAGE_KEY) {
  assertValidState(state);
  return saveState({
    families: clone(state.families),
    config: clone(state.config),
    results: []
  }, storage, storageKey);
}

export function exportData(state, documentRef = document, urlRef = URL, now = new Date()) {
  assertValidState(state);
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });
  const url = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `lottery-backup-${formatTimestamp(now)}.json`;
  anchor.click();
  urlRef.revokeObjectURL(url);
}

export function importData(file, options = {}) {
  const {
    storage = localStorage,
    storageKey = STORAGE_KEY,
    reload = () => window.location.reload()
  } = options;

  if (!(file instanceof Blob)) {
    return Promise.reject(new TypeError("Select a JSON backup file to import."));
  }

  return file.text().then(text => {
    const importedState = JSON.parse(text);
    assertValidState(importedState);
    saveState(importedState, storage, storageKey);
    reload();
  });
}

export function createStateStore(options = {}) {
  const storage = options.storage || localStorage;
  const storageKey = options.storageKey || STORAGE_KEY;
  let state = loadState(storage, storageKey);

  function commit(nextState) {
    state = saveState(nextState, storage, storageKey);
    return getState();
  }

  function getState() {
    return clone(state);
  }

  function getLotteryInputs() {
    return freeze(clone({
      families: state.families,
      config: state.config
    }));
  }

  return {
    getState,
    getLotteryInputs,
    hasResults: () => hasResults(state),
    replaceBaseData(families, config) {
      if (hasResults(state)) {
        throw new Error("Discard lottery results before changing families or configuration.");
      }
      return commit({ families: clone(families), config: clone(config), results: [] });
    },
    replaceResults(results) {
      if (!Array.isArray(results)) throw new TypeError("results must be an array.");
      return commit({
        families: clone(state.families),
        config: clone(state.config),
        results: clone(results)
      });
    },
    discardResults() {
      state = discardResults(state, storage, storageKey);
      return getState();
    },
    exportData: (documentRef, urlRef, now) => exportData(state, documentRef, urlRef, now),
    importData(file, importOptions = {}) {
      return importData(file, {
        storage,
        storageKey,
        ...importOptions
      });
    }
  };
}
