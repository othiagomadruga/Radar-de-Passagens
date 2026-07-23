// Link de compra: leva a pessoa o mais perto possivel do botao de comprar.
//
// Nao existe URL que caia direto no checkout: a tarifa e revalidada por sessao
// no momento em que a pessoa chega. O melhor possivel e cair na lista de voos
// da propria companhia com origem, destino, datas e passageiros preenchidos.
//
// Padroes conferidos abrindo cada URL no navegador:
//   LATAM  abre "Selecao de voos" com a busca ja disparada   -> preenche
//   Azul   abre "Selecao de Voo" com a busca ja disparada     -> preenche
//   GOL    abre a pagina de compra, mas ignora os parametros  -> nao preenche
//
// Para quem nao preenche, o Google Flights e melhor destino: ele mostra a
// tarifa exata que disparou o alerta. Melhor um resultado certo do que uma
// busca em branco no site da companhia.

const iso = (d) => String(d).slice(0, 10);

function latam({ origem, destino, ida, volta, adultos = 1 }) {
  const p = new URLSearchParams({
    origin: origem,
    destination: destino,
    outbound: `${iso(ida)}T12:00:00.000Z`,
    adt: String(adultos),
    chd: "0",
    inf: "0",
    trip: volta ? "RT" : "OW",
    cabin: "Economy",
    redemption: "false",
    sort: "RECOMMENDED",
  });
  if (volta) p.set("inbound", `${iso(volta)}T12:00:00.000Z`);
  return `https://www.latamairlines.com/br/pt/oferta-voos?${p}`;
}

function azul({ origem, destino, ida, volta, adultos = 1 }) {
  const p = new URLSearchParams();
  p.set("c[0].ds", origem);
  p.set("c[0].as", destino);
  p.set("c[0].std", iso(ida));
  if (volta) {
    p.set("c[1].ds", destino);
    p.set("c[1].as", origem);
    p.set("c[1].std", iso(volta));
  }
  p.set("ADT", String(adultos));
  p.set("CHD", "0");
  p.set("INF", "0");
  p.set("f", volta ? "RT" : "OW");
  p.set("cc", "BRL");
  return `https://www.voeazul.com.br/br/pt/home/selecao-voo?${p}`;
}

const COMPANHIAS = [
  { chave: "latam", nome: "LATAM", montar: latam },
  { chave: "azul", nome: "Azul", montar: azul },
];

/**
 * Decide para onde o botao principal aponta.
 * Devolve { principal:{url,rotulo}, secundario:{url,rotulo}|null }.
 */
export function linksCompra(assinatura, voo) {
  const google = voo?.link || null;
  const cia = String(voo?.cia || "").toLowerCase();

  // Voo com escala pode ter duas companhias; so vale o atalho quando uma
  // unica companhia opera o trecho, senao o site dela nao vende o itinerario.
  const varias = cia.includes(",");
  const alvo = varias ? null : COMPANHIAS.find((c) => cia.includes(c.chave));

  if (alvo) {
    return {
      principal: { url: alvo.montar(assinatura), rotulo: `Comprar na ${alvo.nome}` },
      secundario: google ? { url: google, rotulo: "Comparar no Google Flights" } : null,
    };
  }
  if (google) {
    return {
      principal: { url: google, rotulo: "Ver e comprar" },
      secundario: null,
    };
  }
  return { principal: null, secundario: null };
}
