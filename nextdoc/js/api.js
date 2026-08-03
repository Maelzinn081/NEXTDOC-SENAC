// NextDoc · Adaptador da API Oracle (opcional)
// Se o backend Node.js (server/server.js) estiver rodando em localhost:3000,
// o app detecta automaticamente e passa a usar o Oracle como fonte de dados,
// mantendo o IndexedDB como cache local. Se o backend não estiver disponível,
// o app continua funcionando 100% com o IndexedDB (modo simples).

const SecureAPI = (function () {
  const BASE_URL = "https://nextdoc-api-xxxx.onrender.com/api";
  let available = null; // null = ainda não checado

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  async function isAvailable() {
    if (available !== null) return available;
    try {
      const res = await withTimeout(fetch(BASE_URL + "/health"), 800);
      available = res.ok;
    } catch {
      available = false;
    }
    return available;
  }

  async function call(path, options) {
    const res = await withTimeout(fetch(BASE_URL + path, options), 4000);
    if (!res.ok) throw new Error("API error " + res.status);
    return res.json();
  }

  return {
    isAvailable,
    login:          (username, password) => call("/login", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username, password }) }),
    getDocs:        (username) => call("/docs?username=" + encodeURIComponent(username)),
    getTrash:       (username) => call("/trash?username=" + encodeURIComponent(username)),
    getShared:      (username) => call("/shared?username=" + encodeURIComponent(username)),
    getActivity:    (username) => call("/activity?username=" + encodeURIComponent(username)),
    getStorage:     (username) => call("/storage?username=" + encodeURIComponent(username)),
    createDoc:      (username, name, folder, sizeMb) => call("/docs", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username, name, folder, sizeMb }) }),
    renameMoveDoc:  (username, id, name, folder) => call("/docs/" + id, { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username, name, folder }) }),
    trashDoc:       (username, id) => call("/docs/" + id + "/trash", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username }) }),
    restoreDoc:     (username, id) => call("/docs/" + id + "/restore", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username }) }),
    deleteForever:  (username, id) => call("/docs/" + id, { method: "DELETE", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ username }) })
  };
})();
