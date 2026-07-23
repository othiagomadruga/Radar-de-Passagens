// Envio pelo Brevo e montagem dos e-mails.
//
// HTML de e-mail nao e HTML de site: Outlook e Gmail ignoram flex, grid e
// boa parte do CSS moderno. Por isso tudo aqui e tabela com estilo inline.

import { linksCompra } from "./links.js";
import { brl, dataBR, esc } from "./ui.js";

const AZUL = "#1f6feb";
const AZUL_ESCURO = "#12459b";
const TINTA = "#16191d";
const SUAVE = "#606a75";
const BORDA = "#e3e6ea";
const FUNDO = "#f4f6f8";
const VERDE = "#127a4b";
const VERDE_FUNDO = "#e7f5ee";
const AMBAR = "#8a5a00";
const AMBAR_FUNDO = "#fdf6e3";

export async function enviarEmail(env, { para, assunto, html }) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: env.REMETENTE_NOME || "Radar de Passagens", email: env.REMETENTE_EMAIL },
      to: [{ email: para }],
      subject: assunto,
      htmlContent: html,
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${corpo.slice(0, 300)}`);
  }
  return true;
}

// ------------------------------------------------------------------- pecas

/** Faixa superior com a marca. O avião é texto, não imagem: imagem em e-mail
 *  costuma vir bloqueada por padrão e a arte apareceria quebrada. */
function cabecalho(titulo, subtitulo) {
  return `
<tr><td style="background-color:${AZUL};background-image:linear-gradient(135deg,${AZUL} 0%,${AZUL_ESCURO} 100%);padding:26px 28px">
  <div style="font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:#bcd4ff;letter-spacing:.14em;text-transform:uppercase">Radar de Passagens</div>
  <div style="font:700 23px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:#ffffff;margin-top:10px">${titulo}</div>
  ${subtitulo ? `<div style="font:400 15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:#d6e4ff;margin-top:5px">${subtitulo}</div>` : ""}
</td></tr>`;
}

function moldura(conteudo, urlAssinatura, urlPainel, urlDesativar) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${FUNDO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO};padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;
    border:1px solid ${BORDA};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    ${conteudo}
    <tr><td style="padding:20px 28px 26px;border-top:1px solid ${BORDA}">
      <div style="font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
        <a href="${urlAssinatura}" style="color:${AZUL};text-decoration:none">Editar rota</a>
        ${urlPainel ? ` &nbsp;·&nbsp; <a href="${urlPainel}" style="color:${AZUL};text-decoration:none">Minhas rotas</a>` : ""}
        <br>Voce recebe este e-mail porque cadastrou esta rota no Radar de Passagens.
      </div>
      ${urlDesativar ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid ${BORDA};text-align:center">
        <a href="${urlDesativar}" style="display:inline-block;border:1px solid ${BORDA};
          border-radius:7px;padding:9px 18px;color:${SUAVE};text-decoration:none;
          font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
          Parar de receber estes e-mails</a>
        <div style="font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
          color:${SUAVE};margin-top:8px">Um clique, sem precisar do codigo.</div>
      </div>` : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Historico compacto das ultimas leituras. Fica pequeno de proposito: o
 *  destaque continua sendo o preco atual, isto aqui e so contexto. */
function historico(leituras = []) {
  if (!leituras || leituras.length < 2) return "";
  const precos = leituras.map((l) => l.preco);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const faixa = max - min || 1;

  const linhas = leituras
    .map((l) => {
      const larg = 12 + Math.round(((l.preco - min) / faixa) * 88);
      const ehMin = l.preco === min;
      const hora = String(l.coletado_em || "").slice(11, 16);
      const dia = dataBR(l.coletado_em).slice(0, 5);
      return `<tr>
        <td style="padding:3px 8px 3px 0;font:400 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
          color:${SUAVE};white-space:nowrap;width:74px">${dia} ${hora}</td>
        <td style="padding:3px 8px 3px 0;width:100%">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:${larg}%">
            <tr><td style="height:7px;background:${ehMin ? VERDE : "#c7d3e0"};border-radius:4px"></td></tr>
          </table>
        </td>
        <td style="padding:3px 0;font:${ehMin ? 600 : 400} 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
          color:${ehMin ? VERDE : SUAVE};white-space:nowrap;text-align:right">${brl(l.preco)}</td>
      </tr>`;
    })
    .join("");

  return `
<tr><td style="padding:6px 28px 0">
  <div style="font:600 11px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:${SUAVE};letter-spacing:.09em;text-transform:uppercase;margin-bottom:9px">
    Ultimas verificacoes</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
</td></tr>`;
}

const cartaoPreco = (dentro) => `
<tr><td style="padding:26px 28px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background:${FUNDO};border:1px solid ${BORDA};border-radius:11px">
    <tr><td style="padding:20px 22px">${dentro}</td></tr>
  </table>
</td></tr>`;

const botao = (url, texto) => `
<div style="margin-top:18px"><a href="${esc(url)}"
  style="display:inline-block;background:${AZUL};color:#ffffff;text-decoration:none;
  padding:12px 26px;border-radius:8px;font-weight:600;font-size:15px">${esc(texto)}</a></div>`;

/** Botao principal na companhia (quando o site dela aceita busca preenchida)
 *  e o Google Flights como comparacao. */
function botoesCompra(assinatura, voo) {
  const { principal, secundario } = linksCompra(assinatura, voo);
  if (!principal) return "";
  return botao(principal.url, principal.rotulo) + (secundario
    ? `<div style="margin-top:11px"><a href="${esc(secundario.url)}"
        style="color:${AZUL};text-decoration:none;font:400 13px/1
        -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">${esc(secundario.rotulo)}</a></div>`
    : "");
}

const aviso = (texto) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="background:${AMBAR_FUNDO};border-left:3px solid ${AMBAR};border-radius:6px;margin-top:12px">
  <tr><td style="padding:11px 14px;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${AMBAR}">
    ${texto}</td></tr></table>`;

const duracaoTexto = (min) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};

/** Linha do voo: horario, duracao, paradas. Sem isso o preco sozinho engana. */
function linhaVoo(v) {
  if (!v) return "";
  const partes = [];
  if (v.partida && v.chegada) {
    partes.push(`<strong style="color:${TINTA}">${esc(v.partida)}</strong> ate
      <strong style="color:${TINTA}">${esc(v.chegada)}</strong>${v.chega_outro_dia ? " do dia seguinte" : ""}`);
  }
  const dur = duracaoTexto(v.duracao_min);
  if (dur) partes.push(dur);
  partes.push(v.paradas ? `${v.paradas} parada${v.paradas > 1 ? "s" : ""}` : "direto");
  if (v.cia) partes.push(esc(v.cia));
  return `<div style="font:400 14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
    color:${SUAVE};margin-top:10px">${partes.join(" &nbsp;·&nbsp; ")}</div>`;
}

/** As armadilhas que o preco esconde. Regras vindas de casos reais:
 *  escala que dobra o tempo de viagem, e pouso no dia seguinte. */
export function montarAvisos(escolhido, alternativas = []) {
  const avisos = [];
  if (!escolhido) return avisos;

  if (escolhido.chega_outro_dia) {
    avisos.push("Atencao: este voo pousa no dia seguinte ao da partida.");
  }

  const diretos = alternativas.filter((a) => !a.paradas && a.duracao_min);
  const melhorDireto = diretos.length
    ? diretos.reduce((a, b) => (b.duracao_min < a.duracao_min ? b : a))
    : null;

  if (escolhido.paradas && escolhido.duracao_min && melhorDireto) {
    const extra = escolhido.duracao_min - melhorDireto.duracao_min;
    if (extra >= 90) {
      const dif = melhorDireto.preco - escolhido.preco;
      avisos.push(
        `Este voo tem escala e leva ${duracaoTexto(escolhido.duracao_min)}, ` +
        `contra ${duracaoTexto(melhorDireto.duracao_min)} do direto. ` +
        (dif > 0
          ? `O direto sai por ${brl(melhorDireto.preco)}, ${brl(dif)} a mais.`
          : `O direto custa o mesmo ou menos, entao vale conferir.`)
      );
    }
  }
  return avisos;
}

// ------------------------------------------------------------------ e-mails

/** Alerta imediato: o preco caiu agora, nao espera o relatorio. */
export function montarAlerta({ assinatura, atual, anterior, motivos, avisos = [],
                               leituras = [], urlAssinatura, urlPainel, urlDesativar }) {
  const pct = anterior && anterior > 0 ? ((anterior - atual.preco) / anterior) * 100 : null;
  const datas = `${dataBR(assinatura.ida)}${assinatura.volta ? " a " + dataBR(assinatura.volta) : ""}`;

  return moldura(
    `${cabecalho("O preco caiu", `${esc(assinatura.origem)} para ${esc(assinatura.destino)} · ${datas}`)}
     ${cartaoPreco(`
       <div style="font:700 34px/1.1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA}">
         ${brl(atual.preco)}</div>
       ${anterior ? `<div style="margin-top:9px">
         <span style="display:inline-block;background:${VERDE_FUNDO};color:${VERDE};font:600 13px/1
         -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:6px 11px;border-radius:20px">
         ${pct && pct > 0 ? `queda de ${pct.toFixed(0)}%` : "novo preco"} · antes ${brl(anterior)}</span></div>` : ""}
       ${linhaVoo(atual)}
       ${botoesCompra(assinatura, atual)}
     `)}
     ${historico(leituras)}
     <tr><td style="padding:18px 28px 0">
       <div style="font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
         color:${SUAVE};letter-spacing:.09em;text-transform:uppercase">Por que voce esta recebendo</div>
       <ul style="margin:10px 0 0;padding-left:19px;font:400 14px/1.65
         -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA}">
         ${motivos.map((m) => `<li>${esc(m)}</li>`).join("")}
       </ul>
       ${avisos.map(aviso).join("")}
       <div style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
         color:${SUAVE};margin:16px 0 22px">Promocao de passagem costuma durar pouco.
         Se fizer sentido, vale conferir agora.</div>
     </td></tr>`,
    urlAssinatura, urlPainel, urlDesativar
  );
}

/** Relatorio periodico: o panorama, tenha caido ou nao. */
export function montarRelatorio({ assinatura, atual, minimo, anterior, amostras, avisos = [],
                                  leituras = [], urlAssinatura, urlPainel, urlDesativar }) {
  const datas = `${dataBR(assinatura.ida)}${assinatura.volta ? " a " + dataBR(assinatura.volta) : ""}`;
  const titulo = `${esc(assinatura.origem)} para ${esc(assinatura.destino)}`;

  if (!atual) {
    return moldura(
      `${cabecalho(titulo, datas)}
       <tr><td style="padding:26px 28px 30px;font:400 15px/1.6
         -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA}">
         Ainda nao temos preco coletado para esta rota neste periodo. Se isso se repetir no
         proximo relatorio, provavelmente nao ha voos disponiveis para as datas escolhidas.
       </td></tr>`,
      urlAssinatura, urlPainel, urlDesativar
    );
  }

  let variacao = "";
  if (anterior && anterior > 0) {
    const pct = ((anterior - atual.preco) / anterior) * 100;
    if (Math.abs(pct) >= 1) {
      const caiu = pct > 0;
      variacao = `<div style="margin-top:9px">
        <span style="display:inline-block;background:${caiu ? VERDE_FUNDO : AMBAR_FUNDO};
        color:${caiu ? VERDE : AMBAR};font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
        padding:6px 11px;border-radius:20px">${caiu ? "caiu" : "subiu"} ${Math.abs(pct).toFixed(0)}%
        desde o ultimo relatorio</span></div>`;
    }
  }

  const teto =
    assinatura.teto && atual.preco <= assinatura.teto
      ? `<div style="margin-top:14px;padding:12px 15px;background:${VERDE_FUNDO};border-radius:8px;
         font:600 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${VERDE}">
         Esta abaixo do seu teto de ${brl(assinatura.teto)}.</div>`
      : "";

  return moldura(
    `${cabecalho(titulo, datas)}
     ${cartaoPreco(`
       <div style="font:400 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
         melhor preco agora</div>
       <div style="font:700 34px/1.1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
         color:${TINTA};margin-top:4px">${brl(atual.preco)}</div>
       ${variacao}
       ${linhaVoo(atual)}
       ${botoesCompra(assinatura, atual)}
     `)}
     ${historico(leituras)}
     <tr><td style="padding:16px 28px 26px">
       <div style="font:400 13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
         menor preco do periodo: <strong style="color:${TINTA}">${brl(minimo)}</strong>
         &nbsp;·&nbsp; ${amostras} leitura${amostras === 1 ? "" : "s"}</div>
       ${avisos.map(aviso).join("")}
       ${teto}
     </td></tr>`,
    urlAssinatura, urlPainel, urlDesativar
  );
}

/** Boas-vindas: unico lugar onde o codigo de edicao e entregue. */
export function montarBoasVindas({ assinatura, urlAssinatura, urlPainel, periodicidadeTexto }) {
  const datas = `${dataBR(assinatura.ida)}${assinatura.volta ? " a " + dataBR(assinatura.volta) : ""}`;
  return moldura(
    `${cabecalho("Monitoramento ativo",
       `${esc(assinatura.origem)} para ${esc(assinatura.destino)} · ${datas}`)}
     <tr><td style="padding:26px 28px 8px;font:400 15px/1.65
       -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA}">
       A partir de agora acompanhamos o preco desta rota varias vezes por dia.
       Voce recebe um relatorio <strong>${esc(periodicidadeTexto)}</strong>, e se o preco
       despencar avisamos na hora, sem esperar.
     </td></tr>
     ${cartaoPreco(`
       <div style="font:400 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
         seu codigo de acesso</div>
       <div style="font:700 24px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
         color:${TINTA};letter-spacing:.07em;margin-top:6px">${esc(assinatura.id)}</div>
       <div style="font:400 13px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
         color:${SUAVE};margin-top:10px">Guarde este e-mail. E por ele que voce edita as datas,
         muda a frequencia, pausa ou cancela.</div>
       ${botao(urlAssinatura, "Abrir minha assinatura")}
     `)}
     <tr><td style="padding:14px 28px 26px;font:400 13px/1.55
       -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
       Quem tiver este link consegue alterar a assinatura, entao evite compartilha-lo.
     </td></tr>`,
    urlAssinatura, urlPainel
  );
}

/** Painel: todas as rotas daquele e-mail. Substitui login e senha. */
export function montarPainel({ email, assinaturas, origem }) {
  const itens = assinaturas
    .map((a) => {
      const datas = `${dataBR(a.ida)}${a.volta ? " a " + dataBR(a.volta) : ""}`;
      const preco = a.ultimo_preco != null ? brl(a.ultimo_preco) : "sem leitura ainda";
      return `<tr><td style="padding:14px 0;border-bottom:1px solid ${BORDA}">
        <div style="font:600 16px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA}">
          ${esc(a.origem)} para ${esc(a.destino)}</div>
        <div style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
          color:${SUAVE};margin-top:3px">${datas} · ${a.ativa ? "monitorando" : "pausada"} · ${preco}</div>
        <div style="margin-top:7px"><a href="${origem}/a/${esc(a.id)}"
          style="color:${AZUL};text-decoration:none;font:600 14px/1
          -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">Abrir e editar</a></div>
      </td></tr>`;
    })
    .join("");

  return moldura(
    `${cabecalho("Suas rotas", email)}
     <tr><td style="padding:20px 28px 8px">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itens}</table>
     </td></tr>
     <tr><td style="padding:14px 28px 26px;font:400 13px/1.55
       -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${SUAVE}">
       Nao usamos senha. Sempre que precisar dos seus links, peca este e-mail de novo no site.
     </td></tr>`,
    `${origem}/`, null
  );
}
