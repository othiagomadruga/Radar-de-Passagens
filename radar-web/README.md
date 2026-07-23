# Site do Radar de Passagens

Cloudflare Worker que serve o formulário de cadastro, guarda as assinaturas em D1,
manda o relatório periódico por e-mail e dispara alerta imediato quando o preço cai.

A coleta de preços continua no GitHub Actions, na raiz deste repositório. O
`fast-flights` depende de bibliotecas nativas que não rodam em Worker, então a
divisão ficou assim:

```
Cloudflare Worker                     GitHub Actions (já no ar)
├─ site e formulário                  ├─ coleta os preços (Python)
├─ D1: assinaturas e histórico        └─ envia as observações via /api/observacoes
├─ /a/CODIGO: editar, pausar, cancelar
├─ alerta imediato quando o preço cai
└─ cron de hora em hora: relatórios vencidos
```

## Deploy

### 1. Conta e login

```bash
cd radar-web
npm install
npx wrangler login
```

### 2. Criar o banco

```bash
npx wrangler d1 create radar
```

Copie o `database_id` que ele devolve para o `wrangler.toml`, substituindo o
placeholder de zeros. Depois aplique o esquema:

```bash
npx wrangler d1 execute radar --remote --file=schema.sql
```

### 3. Conta de e-mail no Brevo

Crie a conta em [brevo.com](https://www.brevo.com), verifique um endereço remetente
em **Senders & IP**, e gere uma chave em **SMTP & API** → **API Keys**. O plano
gratuito envia 300 e-mails por dia, o que cobre bem esse uso.

### 4. Cadastrar os segredos

```bash
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put REMETENTE_EMAIL
npx wrangler secret put CODIGO_CONVITE
npx wrangler secret put RADAR_API_KEY
```

| Segredo | O que é |
|---------|---------|
| `BREVO_API_KEY` | chave da API do Brevo |
| `REMETENTE_EMAIL` | endereço verificado no Brevo, aparece como remetente |
| `CODIGO_CONVITE` | código exigido no cadastro, você escolhe |
| `RADAR_API_KEY` | senha compartilhada com o coletor, gere algo longo e aleatório |

### 5. Publicar

```bash
npx wrangler deploy
```

Anote a URL que ele imprime. Coloque-a como variável `SITE_URL` no `wrangler.toml`
(ela entra nos links dos e-mails) e publique de novo.

### 6. Ligar o coletor ao site

Nos Secrets do repositório no GitHub (`Settings` → `Secrets and variables` → `Actions`):

| Secret | Valor |
|--------|-------|
| `RADAR_API_URL` | a URL do Worker, por exemplo `https://radar-passagens.SEU.workers.dev` |
| `RADAR_API_KEY` | o mesmo valor cadastrado no Worker |

Sem esses dois o coletor continua funcionando normalmente, só ignora as assinaturas
do site e monitora apenas as rotas do `rotas.yaml`.

## Rodar local

```bash
npx wrangler d1 execute radar --local --file=schema.sql
npm run dev
```

Crie um `.dev.vars` (já está no `.gitignore`) com `CODIGO_CONVITE`, `RADAR_API_KEY`
e `REMETENTE_EMAIL`. Sem `BREVO_API_KEY` tudo funciona, exceto o envio: o erro
aparece no log e o cadastro é preservado, porque a página seguinte mostra o código
na tela e a pessoa não fica sem acesso.

O cron não dispara sozinho em ambiente local. Para testar o relatório:

```bash
curl -X POST http://127.0.0.1:8787/api/relatorios -H "x-radar-key: SUA_CHAVE"
```

## Endpoints

| Método | Rota | Quem usa |
|--------|------|----------|
| GET | `/` | formulário de cadastro |
| POST | `/assinar` | o formulário |
| GET | `/a/CODIGO` | página da assinatura |
| POST | `/a/CODIGO` | salvar, pausar ou cancelar |
| GET | `/api/rotas` | coletor, exige `x-radar-key` |
| POST | `/api/observacoes` | coletor, exige `x-radar-key` |
| POST | `/api/relatorios` | disparo manual do relatório |

## Decisões que valem explicar

**Link sem senha.** Quem tem o `/a/CODIGO` edita a assinatura. É o padrão de magic
link que serviços de newsletter usam, e evita cadastro de senha para uma ferramenta
que a pessoa vai abrir três vezes por ano. O código usa um alfabeto sem caracteres
confundíveis, porque ele vai por e-mail e alguém vai acabar digitando na mão.

**Alerta imediato mora no Worker, não no coletor.** É no Worker que o preço novo
encontra o histórico do assinante e o e-mail de contato. O coletor só entrega dados.

**Anti-ruído no alerta.** Cooldown de 6 horas por assinatura, e só re-alerta se cair
mais 5% abaixo do último alerta. Sem isso o assinante recebe dezenas de e-mails no
primeiro dia e marca tudo como spam.

**O cadastro sobrevive à falha de e-mail.** Se o Brevo estiver fora, a assinatura é
gravada mesmo assim e o código aparece na tela.
