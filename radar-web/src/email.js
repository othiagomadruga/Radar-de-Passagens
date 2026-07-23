// Envio de e-mail pelo Brevo e montagem do relatorio periodico.

import { brl, dataBR, esc } from "./ui.js";

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

const ESTILO_EMAIL = `
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#16191d;line-height:1.55;max-width:560px;margin:0 auto;padding:8px`;

function moldura(conteudo, urlAssinatura) {
  return `<div style="${ESTILO_EMAIL}">
${conteudo}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e3e6ea;font-size:13px;color:#606a75">
  <a href="${urlAssinatura}" style="color:#1f6feb">Editar, pausar ou cancelar esta assinatura</a><br>
  Voce recebe este e-mail porque cadastrou esta rota no Radar de Passagens.
</div></div>`;
}

/** Relatorio periodico: panorama do periodo, tenha caido ou nao. */
export function montarRelatorio({ assinatura, atual, minimo, anterior, amostras, urlAssinatura }) {
  const trecho = `${esc(assinatura.origem)} para ${esc(assinatura.destino)}`;
  const datas = `${dataBR(assinatura.ida)}${assinatura.volta ? " a " + dataBR(assinatura.volta) : ""}`;

  if (!atual) {
    return moldura(
      `<h2 style="font-size:19px;margin:0 0 6px">${trecho}</h2>
       <p style="color:#606a75;margin:0 0 18px">${datas}</p>
       <p>Ainda nao temos preco coletado para esta rota neste periodo.
       Se isso se repetir no proximo relatorio, provavelmente a rota nao tem voos
       disponiveis para as datas escolhidas.</p>`,
      urlAssinatura
    );
  }

  let variacao = "";
  if (anterior && anterior > 0) {
    const pct = ((anterior - atual.preco) / anterior) * 100;
    if (Math.abs(pct) >= 1) {
      const caiu = pct > 0;
      variacao = `<p style="margin:0 0 4px">
        <span style="display:inline-block;font-size:13px;font-weight:600;padding:3px 9px;border-radius:20px;
        background:${caiu ? "#e7f5ee" : "#fdf0e8"};color:${caiu ? "#127a4b" : "#9a3412"}">
        ${caiu ? "caiu" : "subiu"} ${Math.abs(pct).toFixed(0)}% desde o ultimo relatorio</span></p>`;
    }
  }

  const abaixoDoTeto =
    assinatura.teto && atual.preco <= assinatura.teto
      ? `<p style="margin:14px 0 0;padding:11px 14px;background:#e7f5ee;border-radius:8px;color:#127a4b;font-weight:600">
         Esta abaixo do seu teto de ${brl(assinatura.teto)}.</p>`
      : "";

  return moldura(
    `<h2 style="font-size:19px;margin:0 0 6px">${trecho}</h2>
     <p style="color:#606a75;margin:0 0 20px">${datas}</p>
     <div style="background:#f7f8fa;border:1px solid #e3e6ea;border-radius:10px;padding:18px 20px">
       <div style="font-size:13px;color:#606a75">melhor preco agora</div>
       <div style="font-size:30px;font-weight:680;margin:2px 0 8px">${brl(atual.preco)}</div>
       ${variacao}
       <div style="font-size:13px;color:#606a75;margin-top:8px">
         ${esc(atual.cia || "")} · ${atual.paradas ?? 0} parada(s)<br>
         menor preco do periodo: ${brl(minimo)} · ${amostras} leitura(s)
       </div>
       ${atual.link ? `<p style="margin:16px 0 0"><a href="${esc(atual.link)}"
         style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:8px;font-weight:600">Ver e comprar</a></p>` : ""}
     </div>
     ${abaixoDoTeto}`,
    urlAssinatura
  );
}

/** Alerta imediato: o preco caiu agora, nao espera o relatorio. */
export function montarAlerta({ assinatura, atual, anterior, motivos, urlAssinatura }) {
  const trecho = `${esc(assinatura.origem)} para ${esc(assinatura.destino)}`;
  const pct = anterior && anterior > 0 ? ((anterior - atual.preco) / anterior) * 100 : null;
  return moldura(
    `<h2 style="font-size:19px;margin:0 0 6px">O preco caiu</h2>
     <p style="margin:0 0 20px;color:#606a75">${trecho}, ${dataBR(assinatura.ida)}${
      assinatura.volta ? " a " + dataBR(assinatura.volta) : ""
    }</p>
     <div style="background:#f7f8fa;border:1px solid #e3e6ea;border-radius:10px;padding:18px 20px">
       <div style="font-size:30px;font-weight:680;margin:0 0 6px">${brl(atual.preco)}</div>
       ${anterior ? `<div style="font-size:14px;color:#606a75;margin-bottom:10px">
         antes ${brl(anterior)}${pct && pct > 0 ? `, queda de ${pct.toFixed(0)}%` : ""}</div>` : ""}
       <ul style="margin:12px 0 0;padding-left:18px;font-size:14px;color:#16191d">
         ${motivos.map((m) => `<li>${esc(m)}</li>`).join("")}
       </ul>
       <div style="font-size:13px;color:#606a75;margin-top:12px">
         ${esc(atual.cia || "")} · ${atual.paradas ?? 0} parada(s)</div>
       ${atual.link ? `<p style="margin:16px 0 0"><a href="${esc(atual.link)}"
         style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;
         padding:10px 18px;border-radius:8px;font-weight:600">Ver e comprar</a></p>` : ""}
     </div>
     <p style="font-size:13px;color:#606a75;margin-top:16px">
       Promocao de passagem costuma durar pouco. Se fizer sentido, vale conferir agora.</p>`,
    urlAssinatura
  );
}

/** E-mail de boas-vindas: o unico lugar onde o codigo de edicao e entregue. */
export function montarBoasVindas({ assinatura, urlAssinatura, periodicidadeTexto }) {
  const trecho = `${esc(assinatura.origem)} para ${esc(assinatura.destino)}`;
  return moldura(
    `<h2 style="font-size:19px;margin:0 0 6px">Monitoramento ativo</h2>
     <p style="margin:0 0 18px;color:#606a75">${trecho}, ${dataBR(assinatura.ida)}${
      assinatura.volta ? " a " + dataBR(assinatura.volta) : ""
    }</p>
     <p>A partir de agora acompanhamos o preco desta rota varias vezes por dia.
     Voce recebe um relatorio <strong>${esc(periodicidadeTexto)}</strong>.</p>
     <p style="margin-top:18px">Guarde este link. E por ele que voce edita as datas,
     muda a frequencia, pausa ou cancela:</p>
     <p><a href="${urlAssinatura}" style="color:#1f6feb;word-break:break-all">${urlAssinatura}</a></p>
     <p style="font-size:13px;color:#606a75">Quem tiver este link consegue alterar a assinatura,
     entao evite compartilha-lo.</p>`,
    urlAssinatura
  );
}
