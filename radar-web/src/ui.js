// Camada visual. HTML e CSS ficam aqui para o index.js tratar so de rotas e dados.
//
// A paleta e a mesma dos e-mails, azul sobre branco, para o site e a mensagem
// que chega na caixa de entrada parecerem o mesmo produto.

import { AEROPORTOS_JSON } from "./aeroportos.js";

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

const CLARO = `
  --bg:#ffffff; --superficie:#f4f6f8; --borda:#e3e6ea; --texto:#16191d;
  --suave:#606a75; --acento:#1f6feb; --acento-escuro:#12459b; --acento-fraco:#eaf1ff;
  --ok:#127a4b; --ok-bg:#e7f5ee; --alerta:#8a5a00; --alerta-bg:#fdf6e3;
  --erro:#8a1c1c; --erro-bg:#fdecec; --erro-borda:#f5b5b5; --sombra:0 1px 2px rgba(16,25,45,.06);`;

const ESCURO = `
  --bg:#0e1116; --superficie:#161b22; --borda:#252c36; --texto:#e8eaed;
  --suave:#97a2af; --acento:#5b9bff; --acento-escuro:#1f4e9c; --acento-fraco:#16233a;
  --ok:#4ade80; --ok-bg:#12301f; --alerta:#e3b341; --alerta-bg:#2a2213;
  --erro:#fca5a5; --erro-bg:#2a1416; --erro-borda:#5c2626; --sombra:none;`;

const CSS = `
:root{${CLARO}}
@media (prefers-color-scheme:dark){:root{${ESCURO}}}
:root[data-theme=dark]{${ESCURO}}
:root[data-theme=light]{${CLARO}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--texto);
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}

.faixa{background:var(--acento);
  background-image:linear-gradient(135deg,var(--acento) 0%,var(--acento-escuro) 100%)}
.faixa-int{max-width:640px;margin:0 auto;padding:20px;display:flex;align-items:center;
  justify-content:space-between;gap:12px}
.marca{display:flex;align-items:center;gap:9px;color:#fff;font-weight:650;
  letter-spacing:-.01em;text-decoration:none}
.marca svg{width:21px;height:21px}
.tema{background:rgba(255,255,255,.16);border:0;border-radius:8px;color:#fff;cursor:pointer;
  width:34px;height:34px;display:flex;align-items:center;justify-content:center;padding:0}
.tema:hover{background:rgba(255,255,255,.26)}
.tema svg{width:17px;height:17px}

.wrap{max-width:640px;margin:0 auto;padding:36px 20px 72px}
h1{font-size:26px;line-height:1.25;letter-spacing:-.02em;margin:0 0 8px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--suave);
   font-weight:600;margin:34px 0 14px}
p.sub{color:var(--suave);margin:0}
.linha{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:520px){.linha{grid-template-columns:1fr}}
.campo{margin-bottom:16px;position:relative}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
.dica{font-size:12px;color:var(--suave);margin-top:5px;font-weight:400}
input,select{width:100%;padding:11px 12px;border:1px solid var(--borda);border-radius:9px;
  background:var(--bg);color:var(--texto);font-size:15px;font-family:inherit;
  box-shadow:var(--sombra);appearance:none}
select{background-image:linear-gradient(45deg,transparent 50%,var(--suave) 50%),
  linear-gradient(135deg,var(--suave) 50%,transparent 50%);
  background-position:calc(100% - 17px) 52%,calc(100% - 12px) 52%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:34px}
input:focus,select:focus{outline:2px solid var(--acento);outline-offset:-1px;border-color:transparent}
button{width:100%;padding:13px 16px;border:0;border-radius:9px;background:var(--acento);
  color:#fff;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:8px}
button:hover{filter:brightness(1.08)}
button.secundario{background:transparent;color:var(--suave);border:1px solid var(--borda);margin-top:10px}
button.secundario:hover{color:var(--erro);border-color:var(--erro-borda);filter:none}
.cartao{background:var(--superficie);border:1px solid var(--borda);border-radius:11px;padding:18px 20px}
.preco{font-size:31px;font-weight:680;letter-spacing:-.02em;margin:2px 0}
.meta{font-size:13px;color:var(--suave)}
.codigo{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:19px;
  letter-spacing:.06em;background:var(--bg);border:1px solid var(--borda);
  border-radius:8px;padding:11px 14px;display:inline-block;word-break:break-all}
a{color:var(--acento)}
.rodape{margin-top:44px;padding-top:20px;border-top:1px solid var(--borda);
  font-size:13px;color:var(--suave)}
.erro{background:var(--erro-bg);border:1px solid var(--erro-borda);color:var(--erro);
  padding:11px 14px;border-radius:9px;font-size:14px;margin-bottom:20px}

/* autocomplete de aeroporto */
.sugestoes{position:absolute;z-index:30;left:0;right:0;top:100%;margin-top:4px;
  background:var(--bg);border:1px solid var(--borda);border-radius:10px;
  box-shadow:0 8px 24px rgba(16,25,45,.14);max-height:264px;overflow-y:auto;display:none}
:root[data-theme=dark] .sugestoes,
@media (prefers-color-scheme:dark){.sugestoes{box-shadow:0 8px 24px rgba(0,0,0,.5)}}
.sugestoes.aberto{display:block}
.sug{padding:10px 13px;cursor:pointer;display:flex;align-items:center;gap:10px;
  border-bottom:1px solid var(--borda)}
.sug:last-child{border-bottom:0}
.sug:hover,.sug.ativo{background:var(--acento-fraco)}
.sug b{font-weight:600;font-size:14px}
.sug .cid{flex:1;min-width:0}
.sug .aer{font-size:12px;color:var(--suave);display:block;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.sug .iata{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;
  background:var(--superficie);border:1px solid var(--borda);border-radius:5px;
  padding:2px 6px;color:var(--suave);flex-shrink:0}
.vazio{padding:12px 13px;font-size:13px;color:var(--suave)}
`;

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8l3.5 4-2.3 2.3-2-.4a.5.5 0 0 0-.5.8L5 16l1.3 2a.5.5 0 0 0 .8-.5l-.4-2 2.3-2.3 4 3.5a.5.5 0 0 0 .8-.5Z"/></svg>`;

const ICONE_TEMA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4
  M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

// O tema roda antes da pintura para nao piscar branco em quem usa modo escuro.
const JS_TEMA = `
(function(){
  var s = localStorage.getItem('radar-tema');
  if (s) document.documentElement.setAttribute('data-theme', s);
  window.alternarTema = function(){
    var atual = document.documentElement.getAttribute('data-theme');
    if (!atual) atual = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    var novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', novo);
    localStorage.setItem('radar-tema', novo);
  };
})();`;

/** Autocomplete de aeroporto. Busca por cidade, nome e codigo, sem acento,
 *  para quem nao sabe que Guarulhos e GRU conseguir digitar "sao paulo". */
export const JS_AEROPORTOS = `
(function(){
  var LISTA = ${AEROPORTOS_JSON};
  var limpa = function(t){
    return (t||'').toString().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();
  };
  var INDICE = LISTA.map(function(a){
    return { cod:a[0], cid:a[1], aer:a[2], reg:a[3],
             bCid:limpa(a[1]), bAer:limpa(a[2]), bReg:limpa(a[3]) };
  });

  // Cidade pesa mais que nome do aeroporto, senao "rio" traz Aracatuba
  // (aeroporto "Dario Guarita") na frente do Rio de Janeiro.
  function pontos(it, t){
    if (it.cod.toLowerCase() === t) return 0;
    if (it.bCid === t) return 1;
    if (it.bCid.indexOf(t) === 0) return 2;
    if (it.bCid.indexOf(' ' + t) > 0) return 3;   // segunda palavra da cidade
    if (it.bAer.indexOf(t) === 0) return 4;
    if (it.bCid.indexOf(t) > 0) return 5;
    if (it.bAer.indexOf(t) > 0) return 6;
    if (it.bReg.indexOf(t) === 0) return 7;
    return 99;
  }

  function procurar(termo){
    var t = limpa(termo);
    if (!t) return [];
    var achados = [];
    for (var i=0;i<INDICE.length;i++){
      var p = pontos(INDICE[i], t);
      if (p < 99) achados.push({ it:INDICE[i], p:p, i:i });
    }
    achados.sort(function(a,b){ return a.p - b.p || a.i - b.i; });
    return achados.slice(0, 8).map(function(x){ return x.it; });
  }

  function ligar(campo){
    var visivel = document.getElementById(campo + '_busca');
    var oculto  = document.getElementById(campo);
    if (!visivel || !oculto) return;
    var caixa = document.createElement('div');
    caixa.className = 'sugestoes';
    visivel.parentNode.appendChild(caixa);
    var itens = [], ativo = -1;

    function fechar(){ caixa.classList.remove('aberto'); ativo = -1; }

    function escolher(it){
      oculto.value = it.cod;
      visivel.value = it.cid + ' · ' + it.aer + ' (' + it.cod + ')';
      fechar();
    }

    function desenhar(){
      if (!itens.length){
        caixa.innerHTML = '<div class="vazio">Nenhum aeroporto encontrado. ' +
          'Tente o nome da cidade.</div>';
        caixa.classList.add('aberto');
        return;
      }
      caixa.innerHTML = itens.map(function(it, i){
        return '<div class="sug' + (i===ativo?' ativo':'') + '" data-i="' + i + '">' +
          '<span class="cid"><b>' + it.cid + '</b>' +
          '<span class="aer">' + it.aer + ' · ' + it.reg + '</span></span>' +
          '<span class="iata">' + it.cod + '</span></div>';
      }).join('');
      caixa.classList.add('aberto');
    }

    visivel.addEventListener('input', function(){
      oculto.value = '';                       // digitou de novo: escolha anterior nao vale
      var t = visivel.value.trim();
      // quem ja sabe o codigo digita GRU e segue a vida
      if (/^[A-Za-z]{3}$/.test(t)){
        var exato = INDICE.filter(function(x){ return x.cod === t.toUpperCase(); })[0];
        if (exato) oculto.value = exato.cod;
      }
      itens = procurar(t); ativo = -1;
      if (t) desenhar(); else fechar();
    });

    visivel.addEventListener('keydown', function(e){
      if (!caixa.classList.contains('aberto')) return;
      if (e.key === 'ArrowDown'){ e.preventDefault(); ativo = Math.min(ativo+1, itens.length-1); desenhar(); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); ativo = Math.max(ativo-1, 0); desenhar(); }
      else if (e.key === 'Enter' && ativo >= 0){ e.preventDefault(); escolher(itens[ativo]); }
      else if (e.key === 'Escape'){ fechar(); }
    });

    caixa.addEventListener('mousedown', function(e){
      var alvo = e.target.closest('.sug');
      if (alvo) { e.preventDefault(); escolher(itens[+alvo.dataset.i]); }
    });

    visivel.addEventListener('blur', function(){
      setTimeout(function(){
        fechar();
        // sem codigo escolhido, assume a primeira sugestao para nao barrar quem
        // digitou "sao paulo" e clicou direto em enviar
        if (!oculto.value){
          var r = procurar(visivel.value);
          if (r.length) escolher(r[0]); else visivel.value = '';
        }
      }, 140);
    });

    // valor ja preenchido (pagina de edicao)
    if (oculto.value){
      var atual = INDICE.filter(function(x){ return x.cod === oculto.value; })[0];
      if (atual) visivel.value = atual.cid + ' · ' + atual.aer + ' (' + atual.cod + ')';
    }
  }

  ligar('origem'); ligar('destino');
})();`;

export function pagina(titulo, corpo, scripts = "") {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1f6feb">
<title>${esc(titulo)}</title><style>${CSS}</style><script>${JS_TEMA}</script></head>
<body>
<div class="faixa"><div class="faixa-int">
  <a class="marca" href="/">${LOGO}<span>Radar de Passagens</span></a>
  <button class="tema" type="button" onclick="alternarTema()" aria-label="Alternar tema claro e escuro"
    title="Alternar tema claro e escuro">${ICONE_TEMA}</button>
</div></div>
<div class="wrap">
${corpo}
<div class="rodape">Monitoramos o preco da sua rota varias vezes por dia e avisamos quando cai.</div>
</div>
${scripts ? `<script>${scripts}</script>` : ""}
</body></html>`;
}

export const respostaHTML = (html, status = 200) =>
  new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });

export function paginaMensagem(titulo, texto, extra = "") {
  return pagina(titulo, `<h1>${esc(titulo)}</h1><p class="sub">${esc(texto)}</p>${extra}`);
}
