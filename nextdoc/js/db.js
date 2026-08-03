// NextDoc · Camada de persistência local (IndexedDB)
// Funciona 100% sozinho, sem precisar de nenhum backend/Oracle rodando.
// Guarda docs, lixeira, compartilhados e log de atividades no navegador,
// então os dados sobrevivem a fechar a aba/reiniciar o navegador.
//
// Observação: dentro do preview embutido do claude.ai (iframe sandboxed)
// o IndexedDB pode não persistir entre sessões. Rodando localmente (abrindo
// o index.html direto ou via Live Server no VS Code) funciona normalmente,
// pois aí é o navegador "de verdade" do seu computador.

const SecureDB = (function () {
  const DB_NAME = "nextdoc_db";
  const DB_VERSION = 1;
  const STORES = ["docs", "trash", "shared", "activity", "meta"];
  let dbInstance = null;

  function open() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB não é suportado neste navegador."));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("docs"))     db.createObjectStore("docs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("trash"))    db.createObjectStore("trash", { keyPath: "id" });
        if (!db.objectStoreNames.contains("shared"))   db.createObjectStore("shared", { keyPath: "id" });
        if (!db.objectStoreNames.contains("activity")) db.createObjectStore("activity", { keyPath: "idx", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta"))     db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function getAll(storeName) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function put(storeName, value) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function remove(storeName, key) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function clear(storeName) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  function bulkPut(storeName, values) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      values.forEach(v => store.put(v));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }

  async function getMeta(key) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readonly");
        const req = tx.objectStore("meta").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
        req.onerror = () => reject(req.error);
      });
    } catch { return undefined; }
  }

  function setMeta(key, value) {
    return put("meta", { key, value });
  }

  return { open, getAll, put, remove, clear, bulkPut, getMeta, setMeta, STORES };
})();
