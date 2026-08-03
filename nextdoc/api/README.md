# NextDoc API 🔌

API própria do NextDoc — **zero dependências externas**. Usa só os módulos
nativos do Node.js (`http`, `fs`, `url`), então não existe `npm install` para
travar, não tem build nativo pra dar problema (como acontecia com o driver do
Oracle), e não tem versões de pacote pra ficarem desatualizadas.

Os dados ficam guardados em `data.json` — um "banco de dados de arquivo"
simples. Na primeira vez que o servidor roda, ele cria esse arquivo sozinho
com os dados de exemplo (mesmos usuários e documentos do modo demo).

## Rodando localmente

```bash
cd api
node server.js
```

Pronto — aparece `NextDoc API rodando em http://localhost:3000`. O frontend
(`index.html`) já detecta essa API sozinho quando ela está no ar (veja
`js/api.js`), sem precisar mexer em nada.

Quer trocar a porta?

```bash
PORT=8080 node server.js
```

## Hospedando de verdade (grátis, em minutos)

Como não tem dependências, praticamente qualquer serviço de hospedagem Node
funciona. Os mais simples:

### Render.com (recomendado)
1. Crie um repositório no GitHub com essa pasta `api/` dentro
2. No Render: **New → Web Service** → conecte o repositório
3. **Root Directory**: `api`
4. **Build Command**: (deixe em branco, não precisa de build)
5. **Start Command**: `node server.js`
6. Deploy — em ~1 minuto você tem uma URL tipo `https://seu-app.onrender.com`

### Railway.app
1. **New Project → Deploy from GitHub repo**
2. Aponte o **Root Directory** para `api`
3. Railway detecta o `Procfile`/`package.json` sozinho e já sobe

### Fly.io / qualquer VPS
Como é só `node server.js`, funciona em qualquer máquina com Node instalado —
inclusive um Raspberry Pi ou uma VPS de $5/mês.

## ⚠️ Uma limitação importante: persistência em disco

O `data.json` é gravado no sistema de arquivos do próprio servidor. Isso
funciona muito bem no Render/Railway/VPS (disco persiste entre requisições).
**Não funciona bem em hospedagem serverless** (como Vercel Functions ou AWS
Lambda), porque nesses ambientes o sistema de arquivos é apagado a cada
execução — os dados não sobreviveriam. Para esses casos, seria necessário
trocar `data.json` por um banco de verdade (ex: o caminho Oracle que já está
em `../database` e `../server`, ou algo como Postgres/SQLite gerenciado).

## Depois de conectar

Assim que a API estiver no ar (local ou hospedada), aponte o frontend para
ela editando a constante `BASE_URL` em `js/api.js`:

```js
const BASE_URL = "https://seu-app.onrender.com/api";
```

Faça login no site normalmente — se a API responder, você verá o toast
"✅ Backend conectado — dados sincronizados".
