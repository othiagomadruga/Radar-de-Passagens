// Radar de Passagens: site de cadastro, API do coletor e cron do relatorio.
//
// Divisao de trabalho: este Worker cuida do site, do banco e do e-mail.
// A coleta de precos continua no GitHub Actions, porque o fast-flights depende
// de bibliotecas nativas que nao rodam em Worker.

import { ehAdmin, entrarAdmin, painelAdmin, sairAdmin, telaLogin } from "./admin.js";
import {
  assuntoAlerta, assuntoRelatorio, enviarEmail, montarAlerta, montarAvisos,
  montarBoasVindas, montarPainel, montarRelatorio,
} from "./email.js";
import { linksCompra } from "./links.js";
import { brl, dataBR, esc, pagina, paginaMensagem, respostaHTML } from "./ui.js";

const PERIODICIDADES = {
  diario: { horas: 24, texto: "diario" },
  semanal: { horas: 24 * 7, texto: "semanal" },
  quinzenal: { horas: 24 * 15, texto: "quinzenal" },
  mensal: { horas: 24 * 30, texto: "mensal" },
};

// Alfabeto sem caracteres confundiveis (sem O/0, I/1, S/5), porque o codigo
// vai em e-mail e alguem vai acabar digitando na mao.
const ALFABETO = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";

function gerarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const agoraISO = () => new Date().toISOString();

// ---------------------------------------------------------------- validacao

const RE_IATA = /^[A-Z]{3}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validar(d) {
  const erros = [];
  if (!RE_EMAIL.test(d.email || "")) erros.push("E-mail invalido.");
  if (!RE_IATA.test(d.origem || "")) erros.push("Origem deve ser o codigo IATA com 3 letras, por exemplo GRU.");
  if (!RE_IATA.test(d.destino || "")) erros.push("Destino deve ser o codigo IATA com 3 letras, por exemplo LIS.");
  if (d.origem === d.destino) erros.push("Origem e destino nao podem ser iguais.");
  if (!RE_DATA.test(d.ida || "")) erros.push("Data de ida invalida.");
  if (d.volta && !RE_DATA.test(d.volta)) erros.push("Data de volta invalida.");
  if (d.volta && d.volta < d.ida) erros.push("A volta nao pode ser antes da ida.");
  if (d.ida && d.ida < agoraISO().slice(0, 10)) erros.push("A data de ida ja passou.");
  if (!PERIODICIDADES[d.periodicidade]) erros.push("Periodicidade invalida.");
  if (d.flex_dias < 0 || d.flex_dias > 3) erros.push("A flexibilidade vai de 0 a 3 dias.");
  if (d.teto != null && (isNaN(d.teto) || d.teto <= 0)) erros.push("Teto invalido.");
  return erros;
}

function lerFormulario(fd) {
  const limpa = (k) => String(fd.get(k) ?? "").trim();
  const teto = limpa("teto").replace(/[^\d,.]/g, "").replace(".", "").replace(",", ".");
  return {
    email: limpa("email").toLowerCase(),
    origem: limpa("origem").toUpperCase(),
    destino: limpa("destino").toUpperCase(),
    ida: limpa("ida"),
    volta: limpa("volta") || null,
    flex_dias: parseInt(limpa("flex_dias") || "0", 10) || 0,
    teto: teto ? parseFloat(teto) : null,
    periodicidade: limpa("periodicidade") || "semanal",
  };
}

// ------------------------------------------------------------------ paginas

function campoRota(d = {}, comEmail = true) {
  const sel = (v, alvo) => (v === alvo ? " selected" : "");
  return `
  ${comEmail ? `<div class="campo"><label for="email">Seu e-mail</label>
    <input id="email" name="email" type="email" required value="${esc(d.email || "")}"
      placeholder="voce@exemplo.com">
    <div class="dica">E para onde vai o relatorio e o link de edicao.</div></div>` : ""}
  <div class="linha">
    <div class="campo"><label for="origem">Origem</label>
      <input id="origem" name="origem" required maxlength="3" value="${esc(d.origem || "")}"
        placeholder="GRU" style="text-transform:uppercase">
      <div class="dica">Codigo do aeroporto, 3 letras.</div></div>
    <div class="campo"><label for="destino">Destino</label>
      <input id="destino" name="destino" required maxlength="3" value="${esc(d.destino || "")}"
        placeholder="LIS" style="text-transform:uppercase"></div>
  </div>
  <div class="linha">
    <div class="campo"><label for="ida">Ida</label>
      <input id="ida" name="ida" type="date" required value="${esc(d.ida || "")}"></div>
    <div class="campo"><label for="volta">Volta</label>
      <input id="volta" name="volta" type="date" value="${esc(d.volta || "")}">
      <div class="dica">Deixe vazio para somente ida.</div></div>
  </div>
  <div class="linha">
    <div class="campo"><label for="flex_dias">Flexibilidade</label>
      <select id="flex_dias" name="flex_dias">
        <option value="0"${sel(String(d.flex_dias ?? 0), "0")}>datas exatas</option>
        <option value="1"${sel(String(d.flex_dias), "1")}>mais ou menos 1 dia</option>
        <option value="2"${sel(String(d.flex_dias), "2")}>mais ou menos 2 dias</option>
        <option value="3"${sel(String(d.flex_dias), "3")}>mais ou menos 3 dias</option>
      </select>
      <div class="dica">Flexibilizar aumenta muito a chance de achar promocao.</div></div>
    <div class="campo"><label for="teto">Teto de preco</label>
      <input id="teto" name="teto" inputmode="numeric" value="${d.teto ? esc(String(d.teto)) : ""}"
        placeholder="4000">
      <div class="dica">Opcional. Avisamos assim que ficar abaixo disso.</div></div>
  </div>
  <div class="campo"><label for="periodicidade">Quero receber o relatorio</label>
    <select id="periodicidade" name="periodicidade">
      <option value="diario"${sel(d.periodicidade, "diario")}>todo dia</option>
      <option value="semanal"${sel(d.periodicidade || "semanal", "semanal")}>toda semana</option>
      <option value="quinzenal"${sel(d.periodicidade, "quinzenal")}>a cada 15 dias</option>
      <option value="mensal"${sel(d.periodicidade, "mensal")}>uma vez por mes</option>
    </select>
    <div class="dica">Se o preco despencar, avisamos na hora, sem esperar o relatorio.</div></div>`;
}

function paginaInicial(erros = [], d = {}) {
  return pagina(
    "Radar de Passagens",
    `<h1>Monitore o preco da sua passagem</h1>
     <p class="sub">Cadastre a rota uma vez. Consultamos o preco varias vezes por dia
     e mandamos um relatorio no seu e-mail. Se cair de verdade, avisamos na hora.</p>
     ${erros.length ? `<div class="erro">${erros.map(esc).join("<br>")}</div>` : ""}
     <form method="post" action="/assinar">
       <h2>A viagem</h2>
       ${campoRota(d)}
       <h2>Convite</h2>
       <div class="campo"><label for="convite">Codigo de convite</label>
         <input id="convite" name="convite" required placeholder="informe o codigo que voce recebeu">
         <div class="dica">O cadastro e restrito a quem recebeu o codigo.</div></div>
       <button type="submit">Comecar a monitorar</button>
     </form>
     <p style="margin-top:26px"><a href="/painel">Ja tenho cadastro, quero meus links</a></p>`
  );
}

function detalheVoo(v) {
  if (!v) return "";
  const partes = [];
  if (v.partida && v.chegada) {
    partes.push(`${esc(v.partida)} ate ${esc(v.chegada)}${v.chega_outro_dia ? " do dia seguinte" : ""}`);
  }
  if (v.duracao_min) {
    const h = Math.floor(v.duracao_min / 60), m = v.duracao_min % 60;
    partes.push(h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`);
  }
  partes.push(v.paradas ? `${v.paradas} parada${v.paradas > 1 ? "s" : ""}` : "direto");
  if (v.cia) partes.push(esc(v.cia));
  return partes.join(" · ");
}

function botoesSite(a) {
  const { principal, secundario } = linksCompra(a, a.ultimo_voo || { link: a.ultimo_link, cia: a.ultima_cia });
  if (!principal) return "";
  return `<p style="margin:16px 0 0"><a href="${esc(principal.url)}" style="display:inline-block;
    background:var(--acento);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;
    font-weight:600;font-size:14px">${esc(principal.rotulo)}</a></p>
    ${secundario ? `<p style="margin:10px 0 0"><a href="${esc(secundario.url)}"
      style="font-size:13px">${esc(secundario.rotulo)}</a></p>` : ""}`;
}

/** Historico das ultimas leituras. Pequeno de proposito: o destaque
 *  continua sendo o preco atual, isto e so contexto. */
function graficoHistorico(leituras = []) {
  if (!leituras || leituras.length < 2) return "";
  const precos = leituras.map((l) => l.preco);
  const min = Math.min(...precos), max = Math.max(...precos);
  const faixa = max - min || 1;
  const barras = leituras
    .map((l) => {
      const alt = 14 + Math.round(((l.preco - min) / faixa) * 40);
      const ehMin = l.preco === min;
      return `<div title="${esc(dataBR(l.coletado_em))} ${esc(String(l.coletado_em).slice(11, 16))} · ${brl(l.preco)}"
        style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px">
        <div style="width:100%;max-width:24px;height:${alt}px;border-radius:3px;
          background:${ehMin ? "var(--ok)" : "var(--borda)"}"></div>
        <div style="font-size:10px;color:var(--suave);white-space:nowrap">
          ${esc(String(l.coletado_em).slice(11, 16))}</div></div>`;
    })
    .join("");
  return `<div class="cartao" style="margin-top:12px">
    <div class="meta" style="text-transform:uppercase;letter-spacing:.07em;font-size:11px;
      font-weight:600;margin-bottom:12px">Ultimas verificacoes</div>
    <div style="display:flex;align-items:flex-end;gap:5px;height:74px">${barras}</div>
    <div class="meta" style="margin-top:10px;font-size:12px">
      menor ${brl(min)} · maior ${brl(max)}</div></div>`;
}

function paginaAssinatura(a, url, novo = false, salvo = false) {
  const p = PERIODICIDADES[a.periodicidade] || PERIODICIDADES.semanal;
  const aviso = novo
    ? `<div class="cartao" style="border-color:var(--ok);margin-bottom:24px">
         <strong>Monitoramento ativo.</strong>
         <div class="meta" style="margin-top:6px">Enviamos este link para ${esc(a.email)}.
         Guarde o codigo abaixo, e por ele que voce volta aqui.</div>
         <p style="margin:14px 0 0"><span class="codigo">${esc(a.id)}</span></p>
       </div>`
    : salvo
    ? `<div class="cartao" style="border-color:var(--ok);margin-bottom:24px"><strong>Alteracoes salvas.</strong></div>`
    : "";

  return pagina(
    "Sua assinatura",
    `${aviso}
     <h1>${esc(a.origem)} para ${esc(a.destino)}</h1>
     <p class="sub">${dataBR(a.ida)}${a.volta ? " a " + dataBR(a.volta) : ""} ·
     relatorio ${esc(p.texto)} · ${a.ativa ? "ativa" : "pausada"}</p>

     ${a.ultimo_preco != null ? `
     <div class="cartao" style="margin-top:24px">
       <div class="meta">melhor preco na ultima leitura</div>
       <div class="preco">${brl(a.ultimo_preco)}</div>
       <div class="meta">${a.volta ? "total ida e volta" : "somente ida"}, 1 adulto${
         a.ultimo_voo?.coletado_em
           ? ` · verificado em ${dataBR(a.ultimo_voo.coletado_em)} as ${String(a.ultimo_voo.coletado_em).slice(11, 16)}`
           : ""}</div>
       <div class="meta" style="margin-top:6px">${detalheVoo(a.ultimo_voo)}</div>
       <div class="meta" style="margin-top:6px">menor preco ja visto: ${brl(a.minimo)}
       · ${a.amostras} leitura(s)</div>
       ${botoesSite(a)}
       ${a.volta && String(a.ultima_cia || "").toLowerCase().includes("latam") ? `
       <div class="meta" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--borda)">
         No site da LATAM o valor aparece <strong>por trecho</strong>. O total de ida e volta
         e aproximadamente o dobro do que aparece na primeira tela.</div>` : ""}
     </div>
     ${graficoHistorico(a.leituras)}` : `
     <div class="cartao" style="margin-top:24px"><div class="meta">
       Ainda sem leitura. A primeira coleta acontece nos proximos minutos.</div></div>`}

     <form method="post" action="/a/${esc(a.id)}">
       <h2>Editar</h2>
       ${campoRota(a, false)}
       <div class="campo"><label for="ativa">Situacao</label>
         <select id="ativa" name="ativa">
           <option value="1"${a.ativa ? " selected" : ""}>monitorando</option>
           <option value="0"${!a.ativa ? " selected" : ""}>pausada, nao receber nada</option>
         </select></div>
       <button type="submit" name="acao" value="salvar">Salvar alteracoes</button>
       <button type="submit" name="acao" value="cancelar" class="secundario"
         onclick="return confirm('Cancelar esta assinatura e apagar o historico? Nao da para desfazer.')">
         Cancelar assinatura e apagar meus dados</button>
     </form>`
  );
}

/** Ultimas leituras, uma por coleta (a mais barata daquele instante). */
async function ultimasLeituras(env, id, limite = 10) {
  const { results } = await env.DB.prepare(
    `SELECT coletado_em, MIN(preco) AS preco FROM observacoes
     WHERE assinatura_id = ? GROUP BY coletado_em
     ORDER BY coletado_em DESC LIMIT ?`
  ).bind(id, limite).all();
  return (results || []).reverse();  // do mais antigo para o mais novo
}

// ------------------------------------------------------------- rastreamento
//
// Limites que valem saber antes de confiar no numero de aberturas:
// o Gmail serve as imagens por um proxy proprio e as busca sozinho, o que
// infla a contagem; e quem bloqueia imagens nunca aparece, o que reduz.
// Clique e o sinal confiavel: so acontece se alguem clicou de verdade.

const GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

// Destinos permitidos no redirecionamento. Sem esta lista a rota /c/ viraria
// um redirecionador aberto, util para phishing em cima do nosso dominio.
const DESTINOS_OK = [
  "www.google.com", "google.com",
  "www.latamairlines.com", "latamairlines.com",
  "www.voeazul.com.br", "voeazul.com.br",
  "www.voegol.com.br", "b2c.voegol.com.br",
];

async function registrarEnvio(env, { assinaturaId, email, tipo, assunto }) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  await env.DB.prepare(
    `INSERT INTO envios (id,assinatura_id,email,tipo,assunto,enviado_em)
     VALUES (?,?,?,?,?,?)`
  ).bind(id, assinaturaId || null, email, tipo, assunto || null, agoraISO()).run();
  return id;
}

function ferramentasRastreio(origem, envioId) {
  return {
    pixel: `${origem}/px/${envioId}.gif`,
    rastrear: (url) => `${origem}/c/${envioId}?u=${encodeURIComponent(url)}`,
  };
}

async function pixel(env, id) {
  await env.DB.prepare(
    `UPDATE envios SET aberturas = aberturas + 1,
     aberto_em = COALESCE(aberto_em, ?) WHERE id = ?`
  ).bind(agoraISO(), id).run();
  return new Response(GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

async function clique(env, id, destino) {
  let alvo;
  try {
    alvo = new URL(destino);
  } catch {
    return respostaHTML(paginaMensagem("Link invalido", "Nao conseguimos abrir esse endereco."), 400);
  }
  if (alvo.protocol !== "https:" || !DESTINOS_OK.includes(alvo.hostname)) {
    return respostaHTML(paginaMensagem("Link nao permitido",
      "Este endereco nao faz parte dos destinos do Radar de Passagens."), 400);
  }
  await env.DB.prepare(
    `UPDATE envios SET cliques = cliques + 1,
     clicado_em = COALESCE(clicado_em, ?) WHERE id = ?`
  ).bind(agoraISO(), id).run();
  return Response.redirect(alvo.href, 302);
}

// -------------------------------------------------------------- desativar
//
// Um clique, sem exigir o codigo. Quem recebeu o e-mail e dono do endereco,
// e obrigar a achar o codigo para parar de receber e o tipo de atrito que faz
// a pessoa marcar como spam em vez de cancelar.

function paginaDesativar(a) {
  return pagina(
    "Parar de receber",
    `<h1>Parar de receber estes e-mails?</h1>
     <p class="sub">${esc(a.origem)} para ${esc(a.destino)},
     ${dataBR(a.ida)}${a.volta ? " a " + dataBR(a.volta) : ""}</p>
     <form method="post" action="/desativar/${esc(a.id)}">
       <button type="submit" name="acao" value="pausar">Pausar o monitoramento</button>
       <div class="dica" style="margin-top:8px">A rota continua salva. Voce pode religar
       quando quiser pelo link de edicao.</div>
       <button type="submit" name="acao" value="apagar" class="secundario"
         onclick="return confirm('Apagar a rota e todo o historico? Nao da para desfazer.')">
         Apagar a rota e meus dados</button>
     </form>
     <p style="margin-top:26px"><a href="/a/${esc(a.id)}">Voltar sem alterar</a></p>`
  );
}

async function desativar(req, env, id) {
  const a = await env.DB.prepare("SELECT * FROM assinaturas WHERE id = ?").bind(id).first();
  if (!a) return respostaHTML(paginaMensagem("Assinatura nao encontrada",
    "Talvez ela ja tenha sido cancelada."), 404);

  if (req.method === "GET") return respostaHTML(paginaDesativar(a));

  const acao = (await req.formData()).get("acao");
  if (acao === "apagar") {
    await env.DB.prepare("DELETE FROM observacoes WHERE assinatura_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM assinaturas WHERE id = ?").bind(id).run();
    return respostaHTML(paginaMensagem("Pronto, tudo apagado",
      "Removemos a rota e o historico dela. Voce nao recebera mais e-mails."));
  }
  await env.DB.prepare("UPDATE assinaturas SET ativa = 0 WHERE id = ?").bind(id).run();
  return respostaHTML(paginaMensagem(
    "Monitoramento pausado",
    "Voce nao recebe mais e-mails desta rota. Ela continua salva se quiser religar.",
    `<p style="margin-top:20px"><a href="/a/${esc(id)}">Abrir a rota</a></p>`
  ));
}

// ------------------------------------------------------------------- painel
//
// Substitui login e senha. Quem controla a caixa de e-mail recebe os proprios
// links, que e exatamente o que uma senha tentaria provar, sem guardar senha.

function paginaPainel(mensagem = "", erro = "") {
  return pagina(
    "Minhas rotas",
    `<h1>Ver minhas rotas</h1>
     <p class="sub">Nao usamos senha. Informe o e-mail do cadastro e enviamos
     os links de todas as suas rotas.</p>
     ${erro ? `<div class="erro" style="margin-top:20px">${esc(erro)}</div>` : ""}
     ${mensagem ? `<div class="cartao" style="border-color:var(--ok);margin-top:20px">
       ${esc(mensagem)}</div>` : ""}
     <form method="post" action="/painel">
       <div class="campo" style="margin-top:22px"><label for="email">Seu e-mail</label>
         <input id="email" name="email" type="email" required placeholder="voce@exemplo.com"></div>
       <button type="submit">Receber meus links</button>
     </form>
     <p style="margin-top:26px"><a href="/">Cadastrar uma rota nova</a></p>`
  );
}

async function enviarPainel(req, env, url) {
  const fd = await req.formData();
  const email = String(fd.get("email") || "").trim().toLowerCase();
  if (!RE_EMAIL.test(email)) return respostaHTML(paginaPainel("", "E-mail invalido."), 400);

  const { results } = await env.DB.prepare(
    "SELECT * FROM assinaturas WHERE email = ? ORDER BY ida"
  ).bind(email).all();

  // Resposta identica com ou sem cadastro: senao a pagina vira um verificador
  // de quais e-mails estao na base.
  const confirmacao = "Se este e-mail tiver rotas cadastradas, a lista chega em instantes.";
  if (!results?.length) return respostaHTML(paginaPainel(confirmacao));

  const assinaturas = [];
  for (const a of results) {
    const ult = await env.DB.prepare(
      `SELECT preco FROM observacoes WHERE assinatura_id = ?
       ORDER BY coletado_em DESC, preco ASC LIMIT 1`
    ).bind(a.id).first();
    assinaturas.push({ ...a, ativa: !!a.ativa, ultimo_preco: ult?.preco ?? null });
  }

  try {
    await enviarEmail(env, {
      para: email,
      assunto: `Suas rotas no Radar de Passagens (${assinaturas.length})`,
      html: montarPainel({
        email, assinaturas, origem: url.origin,
        ...ferramentasRastreio(url.origin, await registrarEnvio(env, {
          email, tipo: "painel", assunto: "Suas rotas",
        })),
      }),
    });
  } catch (e) {
    console.log("falha ao enviar painel:", e.message);
  }
  return respostaHTML(paginaPainel(confirmacao));
}

// -------------------------------------------------------------- handlers web

async function criarAssinatura(req, env, url) {
  const fd = await req.formData();
  const d = lerFormulario(fd);

  if (String(fd.get("convite") || "").trim() !== (env.CODIGO_CONVITE || "")) {
    return respostaHTML(paginaInicial(["Codigo de convite invalido."], d), 403);
  }
  const erros = validar(d);
  if (erros.length) return respostaHTML(paginaInicial(erros, d), 400);

  const jaTem = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM assinaturas WHERE email = ? AND ativa = 1"
  ).bind(d.email).first();
  if ((jaTem?.n ?? 0) >= 10) {
    return respostaHTML(
      paginaInicial(["Limite de 10 rotas ativas por e-mail atingido."], d), 429
    );
  }

  const id = gerarCodigo();
  await env.DB.prepare(
    `INSERT INTO assinaturas
     (id,email,origem,destino,ida,volta,flex_dias,teto,periodicidade,ativa,criada_em)
     VALUES (?,?,?,?,?,?,?,?,?,1,?)`
  ).bind(id, d.email, d.origem, d.destino, d.ida, d.volta, d.flex_dias, d.teto,
         d.periodicidade, agoraISO()).run();

  const urlAssinatura = `${url.origin}/a/${id}`;
  try {
    await enviarEmail(env, {
      para: d.email,
      assunto: `Monitorando ${d.origem} para ${d.destino}`,
      html: montarBoasVindas({
        ...ferramentasRastreio(url.origin, await registrarEnvio(env, {
          assinaturaId: id, email: d.email, tipo: "boas-vindas",
          assunto: `Monitorando ${d.origem} para ${d.destino}`,
        })),
        assinatura: { ...d, id },
        urlAssinatura,
        urlPainel: `${url.origin}/painel`,
        periodicidadeTexto: PERIODICIDADES[d.periodicidade].texto,
      }),
    });
  } catch (e) {
    // O cadastro nao pode se perder porque o e-mail falhou: a pagina seguinte
    // mostra o codigo na tela, entao a pessoa nao fica sem acesso.
    console.log("falha ao enviar boas-vindas:", e.message);
  }
  return Response.redirect(`${urlAssinatura}?novo=1`, 303);
}

async function carregarAssinatura(env, id) {
  const a = await env.DB.prepare("SELECT * FROM assinaturas WHERE id = ?").bind(id).first();
  if (!a) return null;
  const ult = await env.DB.prepare(
    `SELECT preco, cia, link, partida, chegada, duracao_min, chega_outro_dia, coletado_em
     FROM observacoes WHERE assinatura_id = ?
     ORDER BY coletado_em DESC, preco ASC LIMIT 1`
  ).bind(id).first();
  const agg = await env.DB.prepare(
    "SELECT MIN(preco) AS minimo, COUNT(*) AS n FROM observacoes WHERE assinatura_id = ?"
  ).bind(id).first();
  return {
    ...a,
    ativa: !!a.ativa,
    ultimo_preco: ult?.preco ?? null,
    ultima_cia: ult?.cia ?? null,
    ultimo_link: ult?.link ?? null,
    ultimo_voo: ult || null,
    minimo: agg?.minimo ?? null,
    amostras: agg?.n ?? 0,
    leituras: await ultimasLeituras(env, id),
  };
}

async function atualizarAssinatura(req, env, id) {
  const atual = await carregarAssinatura(env, id);
  if (!atual) return respostaHTML(paginaMensagem("Assinatura nao encontrada",
    "Confira o link. Se voce cancelou, os dados foram apagados."), 404);

  const fd = await req.formData();
  if (fd.get("acao") === "cancelar") {
    await env.DB.prepare("DELETE FROM observacoes WHERE assinatura_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM assinaturas WHERE id = ?").bind(id).run();
    return respostaHTML(paginaMensagem(
      "Assinatura cancelada",
      "Removemos a rota e todo o historico dela. Voce nao recebera mais e-mails."
    ));
  }

  const d = { ...lerFormulario(fd), email: atual.email };
  const erros = validar(d);
  if (erros.length) return respostaHTML(paginaInicial(erros, d), 400);

  const ativa = fd.get("ativa") === "1" ? 1 : 0;
  await env.DB.prepare(
    `UPDATE assinaturas SET origem=?,destino=?,ida=?,volta=?,flex_dias=?,teto=?,
     periodicidade=?,ativa=? WHERE id=?`
  ).bind(d.origem, d.destino, d.ida, d.volta, d.flex_dias, d.teto,
         d.periodicidade, ativa, id).run();

  return respostaHTML(paginaAssinatura(await carregarAssinatura(env, id), "", false, true));
}

// ------------------------------------------------------------- api do coletor

const autorizado = (req, env) =>
  env.RADAR_API_KEY && req.headers.get("x-radar-key") === env.RADAR_API_KEY;

async function listarRotas(env) {
  const { results } = await env.DB.prepare(
    `SELECT id,origem,destino,ida,volta,flex_dias,teto FROM assinaturas
     WHERE ativa = 1 AND ida >= date('now') ORDER BY ida`
  ).all();
  return json({ rotas: results || [] });
}

async function receberObservacoes(req, env) {
  const corpo = await req.json();
  const obs = Array.isArray(corpo?.observacoes) ? corpo.observacoes : [];
  if (!obs.length) return json({ gravadas: 0 });
  if (obs.length > 500) return json({ erro: "lote grande demais" }, 413);

  const stmt = env.DB.prepare(
    `INSERT INTO observacoes
     (assinatura_id,preco,moeda,cia,paradas,ida,volta,link,
      partida,chegada,duracao_min,chega_outro_dia,fonte,coletado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  // Estado ANTES de gravar: e com ele que se sabe se o preco caiu.
  const alvos = [...new Set(obs.map((o) => o.assinatura_id))];
  const antes = new Map();
  for (const id of alvos) {
    const prev = await env.DB.prepare(
      `SELECT MIN(preco) AS ultimo FROM observacoes WHERE assinatura_id = ?
       AND coletado_em = (SELECT MAX(coletado_em) FROM observacoes WHERE assinatura_id = ?)`
    ).bind(id, id).first();
    const hist = await env.DB.prepare(
      "SELECT MIN(preco) AS minimo FROM observacoes WHERE assinatura_id = ?"
    ).bind(id).first();
    antes.set(id, { ultimo: prev?.ultimo ?? null, minimo: hist?.minimo ?? null });
  }

  await env.DB.batch(
    obs.map((o) => stmt.bind(
      o.assinatura_id, o.preco, o.moeda || "BRL", o.cia || null, o.paradas ?? null,
      o.ida || null, o.volta || null, o.link || null,
      o.partida || null, o.chegada || null, o.duracao_min ?? null,
      o.chega_outro_dia ? 1 : 0, o.fonte || "google",
      o.coletado_em || agoraISO()
    ))
  );

  const url = new URL(req.url);
  const alertas = await avaliarAlertas(env, obs, antes, url.origin);
  return json({ gravadas: obs.length, alertas });
}

const QUEDA_BRUSCA_PCT = 15;
const COOLDOWN_HORAS = 6;
const REALERTA_PCT = 5;

/** Alerta imediato do assinante. Mesma logica dos gatilhos do coletor,
 *  aplicada aqui porque e aqui que o preco novo encontra o historico. */
async function avaliarAlertas(env, obs, antes, origem) {
  let enviados = 0;

  for (const id of new Set(obs.map((o) => o.assinatura_id))) {
    const novas = obs.filter((o) => o.assinatura_id === id);
    const melhor = novas.reduce((a, b) => (b.preco < a.preco ? b : a));
    const { ultimo, minimo } = antes.get(id) || {};

    const motivos = [];
    if (ultimo && ultimo > 0) {
      const pct = ((ultimo - melhor.preco) / ultimo) * 100;
      if (pct >= QUEDA_BRUSCA_PCT) motivos.push(`queda de ${pct.toFixed(0)}% desde a ultima leitura`);
    }
    if (minimo != null && melhor.preco < minimo) motivos.push("menor preco ja visto nesta rota");

    const a = await env.DB.prepare("SELECT * FROM assinaturas WHERE id = ? AND ativa = 1")
      .bind(id).first();
    if (!a) continue;
    if (a.teto && melhor.preco <= a.teto) motivos.push(`abaixo do seu teto de ${brl(a.teto)}`);
    if (!motivos.length) continue;

    // anti-ruido: sem isso o assinante recebe dezenas de e-mails e marca como spam
    if (a.ultimo_alerta) {
      const dentro = Date.now() - new Date(a.ultimo_alerta).getTime() < COOLDOWN_HORAS * 3600 * 1000;
      const caiuMais = melhor.preco <= (a.ultimo_alerta_preco || Infinity) * (1 - REALERTA_PCT / 100);
      if (dentro && !caiuMais) continue;
    }

    try {
      const assunto = assuntoAlerta(a, melhor, ultimo);
      const envioId = await registrarEnvio(env, {
        assinaturaId: a.id, email: a.email, tipo: "alerta", assunto,
      });
      await enviarEmail(env, {
        para: a.email,
        assunto,
        html: montarAlerta({
          ...ferramentasRastreio(origem, envioId),
          assinatura: a, atual: melhor, anterior: ultimo, motivos,
          // as outras opcoes da mesma coleta viram a base da comparacao
          // "este tem escala e leva o dobro do tempo do direto"
          avisos: montarAvisos(melhor, novas),
          leituras: await ultimasLeituras(env, a.id),
          urlAssinatura: `${origem}/a/${a.id}`,
          urlPainel: `${origem}/painel`,
          urlDesativar: `${origem}/desativar/${a.id}`,
        }),
      });
      await env.DB.prepare(
        "UPDATE assinaturas SET ultimo_alerta = ?, ultimo_alerta_preco = ? WHERE id = ?"
      ).bind(agoraISO(), melhor.preco, id).run();
      enviados++;
    } catch (e) {
      console.log(`falha no alerta de ${id}:`, e.message);
    }
  }
  return enviados;
}

// ------------------------------------------------------------ cron: relatorio

async function enviarRelatorios(env, origem) {
  const { results: assinaturas } = await env.DB.prepare(
    "SELECT * FROM assinaturas WHERE ativa = 1 ORDER BY ultimo_relatorio IS NOT NULL, ultimo_relatorio LIMIT 40"
  ).all();

  let enviados = 0;
  for (const a of assinaturas || []) {
    const periodo = PERIODICIDADES[a.periodicidade] || PERIODICIDADES.semanal;
    const desde = a.ultimo_relatorio ? new Date(a.ultimo_relatorio) : null;
    if (desde && Date.now() - desde.getTime() < periodo.horas * 3600 * 1000) continue;

    const corte = (desde || new Date(a.criada_em)).toISOString();
    const atual = await env.DB.prepare(
      `SELECT preco,cia,paradas,link,partida,chegada,duracao_min,chega_outro_dia,coletado_em
       FROM observacoes WHERE assinatura_id = ?
       ORDER BY coletado_em DESC, preco ASC LIMIT 1`
    ).bind(a.id).first();
    // demais opcoes da mesma leitura, para comparar escala contra direto
    const { results: irmas } = atual
      ? await env.DB.prepare(
          `SELECT preco,paradas,duracao_min FROM observacoes WHERE assinatura_id = ?
           AND coletado_em = (SELECT MAX(coletado_em) FROM observacoes WHERE assinatura_id = ?)`
        ).bind(a.id, a.id).all()
      : { results: [] };
    const resumo = await env.DB.prepare(
      `SELECT MIN(preco) AS minimo, COUNT(*) AS n FROM observacoes
       WHERE assinatura_id = ? AND coletado_em >= ?`
    ).bind(a.id, corte).first();
    const antes = desde
      ? await env.DB.prepare(
          `SELECT MIN(preco) AS preco FROM observacoes
           WHERE assinatura_id = ? AND coletado_em <= ?`
        ).bind(a.id, corte).first()
      : null;

    try {
      const assunto = assuntoRelatorio(a, atual, antes?.preco ?? null);
      const envioId = await registrarEnvio(env, {
        assinaturaId: a.id, email: a.email, tipo: "relatorio", assunto,
      });
      await enviarEmail(env, {
        para: a.email,
        assunto,
        html: montarRelatorio({
          ...ferramentasRastreio(origem, envioId),
          assinatura: a,
          atual,
          minimo: resumo?.minimo ?? null,
          anterior: antes?.preco ?? null,
          amostras: resumo?.n ?? 0,
          avisos: montarAvisos(atual, irmas || []),
          leituras: await ultimasLeituras(env, a.id),
          urlAssinatura: `${origem}/a/${a.id}`,
          urlPainel: `${origem}/painel`,
          urlDesativar: `${origem}/desativar/${a.id}`,
        }),
      });
      await env.DB.prepare("UPDATE assinaturas SET ultimo_relatorio = ? WHERE id = ?")
        .bind(agoraISO(), a.id).run();
      enviados++;
    } catch (e) {
      console.log(`falha no relatorio de ${a.id}:`, e.message);
    }
  }
  return enviados;
}

// ----------------------------------------------------------------- roteamento

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const rota = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (req.method === "GET" && rota === "/") return respostaHTML(paginaInicial());
      if (req.method === "POST" && rota === "/assinar") return criarAssinatura(req, env, url);
      if (rota === "/painel") {
        return req.method === "POST"
          ? enviarPainel(req, env, url)
          : respostaHTML(paginaPainel());
      }

      const d = rota.match(/^\/desativar\/([A-Z0-9-]{6,12})$/i);
      if (d) return desativar(req, env, d[1].toUpperCase());

      const m = rota.match(/^\/a\/([A-Z0-9-]{6,12})$/i);
      if (m) {
        const id = m[1].toUpperCase();
        if (req.method === "POST") return atualizarAssinatura(req, env, id);
        const a = await carregarAssinatura(env, id);
        if (!a) return respostaHTML(paginaMensagem("Assinatura nao encontrada",
          "Confira o link. Se voce cancelou, os dados foram apagados."), 404);
        return respostaHTML(paginaAssinatura(a, url.href, url.searchParams.has("novo")));
      }

      const px = rota.match(/^\/px\/([a-z0-9]{10,32})\.gif$/i);
      if (px) return pixel(env, px[1]);

      const cl = rota.match(/^\/c\/([a-z0-9]{10,32})$/i);
      if (cl) return clique(env, cl[1], url.searchParams.get("u") || "");

      if (rota === "/admin") {
        if (req.method === "POST") {
          const senha = String((await req.formData()).get("senha") || "");
          return entrarAdmin(senha, env, url.protocol === "https:");
        }
        return ehAdmin(req, env) ? respostaHTML(await painelAdmin(env, url)) : telaLogin();
      }
      if (rota === "/admin/sair" && req.method === "POST") return sairAdmin();

      if (rota.startsWith("/api/")) {
        if (!autorizado(req, env)) return json({ erro: "nao autorizado" }, 401);
        if (req.method === "GET" && rota === "/api/rotas") return listarRotas(env);
        if (req.method === "POST" && rota === "/api/observacoes") return receberObservacoes(req, env);
        if (req.method === "POST" && rota === "/api/relatorios") {
          return json({ enviados: await enviarRelatorios(env, url.origin) });
        }
      }

      return respostaHTML(paginaMensagem("Pagina nao encontrada",
        "O endereco nao existe.", '<p><a href="/">Voltar ao inicio</a></p>'), 404);
    } catch (e) {
      console.log("erro:", e.stack || e.message);
      return respostaHTML(paginaMensagem("Algo deu errado",
        "Tente de novo em instantes."), 500);
    }
  },

  async scheduled(evento, env, ctx) {
    const origem = env.SITE_URL || "https://radar-passagens.workers.dev";
    ctx.waitUntil(enviarRelatorios(env, origem));
  },
};
