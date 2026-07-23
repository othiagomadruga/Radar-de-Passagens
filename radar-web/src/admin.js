// Painel do dono: todos os e-mails cadastrados, rotas e desempenho dos envios.
//
// Protegido por uma senha unica (segredo ADMIN_SENHA). Nao ha cadastro de
// usuarios porque so existe um dono. A senha viaja num cookie HttpOnly, e a
// comparacao e feita em tempo constante para nao vazar o valor por timing.

import { brl, dataBR, esc, pagina, respostaHTML } from "./ui.js";

const COOKIE = "radar_admin";

function comparaSegura(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function lerCookie(req, nome) {
  const bruto = req.headers.get("cookie") || "";
  for (const parte of bruto.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function ehAdmin(req, env) {
  if (!env.ADMIN_SENHA) return false;
  return comparaSegura(lerCookie(req, COOKIE) || "", env.ADMIN_SENHA);
}

function paginaLogin(erro = "") {
  return pagina(
    "Painel",
    `<h1>Painel do administrador</h1>
     <p class="sub">Area restrita.</p>
     ${erro ? `<div class="erro" style="margin-top:20px">${esc(erro)}</div>` : ""}
     <form method="post" action="/admin">
       <div class="campo" style="margin-top:22px"><label for="senha">Senha</label>
         <input id="senha" name="senha" type="password" required autocomplete="current-password"></div>
       <button type="submit">Entrar</button>
     </form>`
  );
}

const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

function cartaoNumero(rotulo, valor, detalhe = "") {
  return `<div class="cartao" style="flex:1;min-width:132px">
    <div class="meta" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;
      font-weight:600">${esc(rotulo)}</div>
    <div style="font-size:26px;font-weight:680;letter-spacing:-.02em;margin-top:4px">${valor}</div>
    ${detalhe ? `<div class="meta" style="font-size:12px;margin-top:2px">${detalhe}</div>` : ""}
  </div>`;
}

export async function painelAdmin(env, url) {
  const resumo = await env.DB.prepare(
    `SELECT COUNT(*) AS rotas, COUNT(DISTINCT email) AS pessoas,
     SUM(ativa) AS ativas FROM assinaturas`
  ).first();
  const envios = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN aberturas>0 THEN 1 ELSE 0 END) AS abertos,
     SUM(CASE WHEN cliques>0 THEN 1 ELSE 0 END) AS clicados FROM envios`
  ).first();

  const { results: pessoas } = await env.DB.prepare(
    `SELECT a.email,
            COUNT(*) AS rotas,
            SUM(a.ativa) AS ativas,
            MIN(a.criada_em) AS desde,
            (SELECT COUNT(*) FROM envios e WHERE e.email = a.email) AS envios,
            (SELECT COUNT(*) FROM envios e WHERE e.email = a.email AND e.aberturas > 0) AS abertos,
            (SELECT COUNT(*) FROM envios e WHERE e.email = a.email AND e.cliques > 0) AS clicados
     FROM assinaturas a GROUP BY a.email ORDER BY rotas DESC, desde DESC`
  ).all();

  const { results: rotas } = await env.DB.prepare(
    `SELECT a.id, a.email, a.origem, a.destino, a.ida, a.volta, a.ativa, a.periodicidade,
            (SELECT MIN(o.preco) FROM observacoes o WHERE o.assinatura_id = a.id) AS minimo,
            (SELECT COUNT(*) FROM observacoes o WHERE o.assinatura_id = a.id) AS leituras
     FROM assinaturas a ORDER BY a.criada_em DESC LIMIT 60`
  ).all();

  const { results: ultimos } = await env.DB.prepare(
    `SELECT tipo, email, assunto, enviado_em, aberturas, cliques, aberto_em
     FROM envios ORDER BY enviado_em DESC LIMIT 25`
  ).all();

  const linhasPessoas = (pessoas || [])
    .map((p) => `<tr>
      <td>${esc(p.email)}</td>
      <td style="text-align:center">${p.ativas}/${p.rotas}</td>
      <td style="text-align:center">${p.envios}</td>
      <td style="text-align:center">${p.abertos} <span class="meta">(${pct(p.abertos, p.envios)}%)</span></td>
      <td style="text-align:center">${p.clicados} <span class="meta">(${pct(p.clicados, p.envios)}%)</span></td>
    </tr>`)
    .join("") || `<tr><td colspan="5" class="meta">Nenhum cadastro ainda.</td></tr>`;

  const linhasRotas = (rotas || [])
    .map((r) => `<tr>
      <td><a href="/a/${esc(r.id)}">${esc(r.origem)}-${esc(r.destino)}</a></td>
      <td class="meta">${dataBR(r.ida)}${r.volta ? " a " + dataBR(r.volta) : ""}</td>
      <td class="meta">${esc(r.email)}</td>
      <td style="text-align:center">${r.ativa ? "ativa" : "<span class='meta'>pausada</span>"}</td>
      <td style="text-align:right">${r.minimo != null ? brl(r.minimo) : "<span class='meta'>-</span>"}</td>
      <td style="text-align:right" class="meta">${r.leituras}</td>
    </tr>`)
    .join("") || `<tr><td colspan="6" class="meta">Nenhuma rota ainda.</td></tr>`;

  const linhasEnvios = (ultimos || [])
    .map((e) => `<tr>
      <td class="meta">${dataBR(e.enviado_em)} ${String(e.enviado_em).slice(11, 16)}</td>
      <td>${esc(e.tipo)}</td>
      <td class="meta">${esc(e.email)}</td>
      <td style="text-align:center">${e.aberturas > 0
        ? `<span style="color:var(--ok);font-weight:600">abriu</span>`
        : `<span class="meta">nao</span>`}</td>
      <td style="text-align:center">${e.cliques > 0
        ? `<span style="color:var(--ok);font-weight:600">${e.cliques}</span>`
        : `<span class="meta">0</span>`}</td>
    </tr>`)
    .join("") || `<tr><td colspan="5" class="meta">Nenhum envio ainda.</td></tr>`;

  const tabela = (cabecalho, corpo) => `
    <div style="overflow-x:auto;margin-top:12px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;

  return pagina(
    "Painel do administrador",
    `<style>
       table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;
         color:var(--suave);font-weight:600;padding:0 10px 8px 0;white-space:nowrap}
       table td{padding:9px 10px 9px 0;border-top:1px solid var(--borda);vertical-align:top}
       .painel-num{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
     </style>
     <h1>Painel</h1>
     <p class="sub">Visao geral de quem esta cadastrado e como os e-mails estao performando.</p>

     <div class="painel-num">
       ${cartaoNumero("Pessoas", resumo?.pessoas ?? 0, "e-mails distintos")}
       ${cartaoNumero("Rotas", resumo?.rotas ?? 0, `${resumo?.ativas ?? 0} ativas`)}
       ${cartaoNumero("E-mails", envios?.total ?? 0, "enviados")}
       ${cartaoNumero("Aberturas", `${pct(envios?.abertos ?? 0, envios?.total ?? 0)}%`,
          `${envios?.abertos ?? 0} de ${envios?.total ?? 0}`)}
       ${cartaoNumero("Cliques", `${pct(envios?.clicados ?? 0, envios?.total ?? 0)}%`,
          `${envios?.clicados ?? 0} de ${envios?.total ?? 0}`)}
     </div>

     <h2>Pessoas cadastradas</h2>
     ${tabela(
       "<th>E-mail</th><th>Rotas</th><th>Envios</th><th>Abriu</th><th>Clicou</th>",
       linhasPessoas
     )}

     <h2>Rotas</h2>
     ${tabela(
       "<th>Trecho</th><th>Datas</th><th>E-mail</th><th>Situacao</th><th>Menor</th><th>Leituras</th>",
       linhasRotas
     )}

     <h2>Ultimos envios</h2>
     ${tabela("<th>Quando</th><th>Tipo</th><th>Para</th><th>Abriu</th><th>Cliques</th>", linhasEnvios)}

     <div class="cartao" style="margin-top:26px">
       <div class="meta" style="font-size:12px;line-height:1.6">
         <strong>Como ler a taxa de abertura.</strong> O Gmail serve as imagens por um proxy
         proprio e as busca sozinho, o que infla a contagem. Quem bloqueia imagens nunca
         aparece, o que reduz. O clique e o sinal confiavel: so acontece se alguem clicou.
       </div>
     </div>

     <form method="post" action="/admin/sair" style="margin-top:22px">
       <button type="submit" class="secundario">Sair do painel</button>
     </form>`
  );
}

export function entrarAdmin(senha, env, seguro) {
  if (!env.ADMIN_SENHA || !comparaSegura(senha, env.ADMIN_SENHA)) {
    return respostaHTML(paginaLogin("Senha incorreta."), 401);
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: "/admin",
      "set-cookie": `${COOKIE}=${encodeURIComponent(env.ADMIN_SENHA)}; Path=/; HttpOnly; ` +
        `SameSite=Strict; Max-Age=604800${seguro ? "; Secure" : ""}`,
    },
  });
}

export function sairAdmin() {
  return new Response(null, {
    status: 303,
    headers: { location: "/admin", "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` },
  });
}

export const telaLogin = () => respostaHTML(paginaLogin());
