// Camada visual. HTML e CSS ficam aqui para o index.js tratar so de rotas e dados.

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

export const brl = (v) =>
  v == null ? "-" : "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export const dataBR = (iso) => {
  if (!iso) return "-";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return d && m ? `${d}/${m}/${a}` : iso;
};

const CSS = `
:root{
  --bg:#ffffff; --superficie:#f7f8fa; --borda:#e3e6ea; --texto:#16191d;
  --suave:#606a75; --acento:#1f6feb; --ok:#127a4b; --ok-bg:#e7f5ee; --alerta:#9a3412;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0f1115; --superficie:#161a20; --borda:#262c35; --texto:#e8eaed;
         --suave:#98a2ae; --acento:#5b9bff; --ok:#4ade80; --ok-bg:#123024; --alerta:#fca5a5; }
}
:root[data-theme=dark]{
  --bg:#0f1115; --superficie:#161a20; --borda:#262c35; --texto:#e8eaed;
  --suave:#98a2ae; --acento:#5b9bff; --ok:#4ade80; --ok-bg:#123024; --alerta:#fca5a5;
}
:root[data-theme=light]{
  --bg:#ffffff; --superficie:#f7f8fa; --borda:#e3e6ea; --texto:#16191d;
  --suave:#606a75; --acento:#1f6feb; --ok:#127a4b; --ok-bg:#e7f5ee; --alerta:#9a3412;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--texto);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:640px;margin:0 auto;padding:48px 20px 72px}
header{margin-bottom:36px}
.marca{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.01em}
.marca svg{width:22px;height:22px;color:var(--acento)}
h1{font-size:26px;line-height:1.25;letter-spacing:-.02em;margin:22px 0 8px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.07em;color:var(--suave);
   font-weight:600;margin:34px 0 14px}
p.sub{color:var(--suave);margin:0}
form{margin-top:8px}
.linha{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:520px){.linha{grid-template-columns:1fr}}
.campo{margin-bottom:16px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.dica{font-size:12px;color:var(--suave);margin-top:5px;font-weight:400}
input,select{width:100%;padding:10px 12px;border:1px solid var(--borda);border-radius:8px;
  background:var(--bg);color:var(--texto);font-size:15px;font-family:inherit}
input:focus,select:focus{outline:2px solid var(--acento);outline-offset:-1px;border-color:transparent}
button{width:100%;padding:12px 16px;border:0;border-radius:8px;background:var(--acento);
  color:#fff;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:8px}
button:hover{filter:brightness(1.08)}
button.secundario{background:transparent;color:var(--alerta);border:1px solid var(--borda);margin-top:10px}
.cartao{background:var(--superficie);border:1px solid var(--borda);border-radius:10px;padding:18px 20px}
.cartao+.cartao{margin-top:12px}
.preco{font-size:30px;font-weight:680;letter-spacing:-.02em;margin:2px 0}
.queda{display:inline-block;font-size:13px;font-weight:600;color:var(--ok);
  background:var(--ok-bg);padding:2px 8px;border-radius:20px}
.meta{font-size:13px;color:var(--suave)}
.codigo{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:19px;
  letter-spacing:.06em;background:var(--superficie);border:1px solid var(--borda);
  border-radius:8px;padding:11px 14px;display:inline-block;word-break:break-all}
a{color:var(--acento)}
.rodape{margin-top:44px;padding-top:20px;border-top:1px solid var(--borda);
  font-size:13px;color:var(--suave)}
.erro{background:#fee;border:1px solid #f5b5b5;color:#8a1c1c;padding:11px 14px;
  border-radius:8px;font-size:14px;margin-bottom:20px}
@media (prefers-color-scheme:dark){.erro{background:#2a1416;border-color:#5c2626;color:#fca5a5}}
`;

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8l3.5 4-2.3 2.3-2-.4a.5.5 0 0 0-.5.8L5 16l1.3 2a.5.5 0 0 0 .8-.5l-.4-2 2.3-2.3 4 3.5a.5.5 0 0 0 .8-.5Z"/></svg>`;

export function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><style>${CSS}</style></head>
<body><div class="wrap">
<header><div class="marca">${LOGO}<span>Radar de Passagens</span></div></header>
${corpo}
<div class="rodape">Monitoramos o preco da sua rota varias vezes por dia e avisamos quando cai.</div>
</div></body></html>`;
}

export const respostaHTML = (html, status = 200) =>
  new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export function paginaMensagem(titulo, texto, extra = "") {
  return pagina(titulo, `<h1>${esc(titulo)}</h1><p class="sub">${esc(texto)}</p>${extra}`);
}
