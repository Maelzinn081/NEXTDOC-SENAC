// NextDoc · Adaptador da API (opcional)
// Se um backend (api/server.js OU server/server.js com Oracle) estiver
// rodando em localhost:3000 (ou na URL configurada abaixo), o app detecta
// automaticamente e passa a sincronizar com ele, mantendo o IndexedDB como
// cache local. Se o backend não estiver disponível, o app continua
// funcionando 100% com o IndexedDB (modo simples).

const SecureAPI = (function () {
  const BASE_URL = "http://localhost:3000/api";
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
      const res = await withTimeout(fetch(BASE_URL + "/health"), 1500);
      available = res.ok;
    } catch {
      available = false;
    }
    return available;
  }

  async function call(path, options, timeoutMs) {
    const res = await withTimeout(fetch(BASE_URL + path, options), timeoutMs || 8000);
    if (!res.ok) throw new Error("API error " + res.status);
    return res.json();
  }
  const jsonHeaders = {"Content-Type":"application/json"};

  return {
    isAvailable,
    login:          (username, password) => call("/login", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username, password }) }),
    signup:         (username, password, email) => call("/signup", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username, password, email }) }),

    getDocs:        (username) => call("/docs?username=" + encodeURIComponent(username)),
    getTrash:       (username) => call("/trash?username=" + encodeURIComponent(username)),
    getActivity:    (username) => call("/activity?username=" + encodeURIComponent(username)),
    getStorage:     (username) => call("/storage?username=" + encodeURIComponent(username)),

    // arquivo real vai em base64 no corpo (fileData) — timeout maior por poder ser um payload grande
    createDoc:      (username, name, folder, sizeMb, visibility, fileData, fileType) =>
                      call("/docs", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username, name, folder, sizeMb, visibility, fileData, fileType }) }, 20000),
    renameMoveDoc:  (username, id, name, folder) => call("/docs/" + id, { method: "PUT", headers: jsonHeaders, body: JSON.stringify({ username, name, folder }) }),
    trashDoc:       (username, id) => call("/docs/" + id + "/trash", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username }) }),
    restoreDoc:     (username, id) => call("/docs/" + id + "/restore", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ username }) }),
    deleteForever:  (username, id) => call("/docs/" + id, { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ username }) }),

    // solicitações de acesso
    listAccessRequests:   () => call("/access-requests"),
    createAccountRequest: (username) => call("/access-requests", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ kind: "conta", requester: username }) }),
    createDocRequest:     (username, docId, docName) => call("/access-requests", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ kind: "documento", requester: username, docId, docName }) }),
    resolveRequest:       (reqId, status) => call("/access-requests/" + reqId, { method: "PUT", headers: jsonHeaders, body: JSON.stringify({ status }) })
  };
})();
