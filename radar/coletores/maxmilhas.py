# -*- coding: utf-8 -*-
"""Coletor da MaxMilhas: passagens emitidas com milhas de terceiros.

POR QUE ESTE COLETOR EXISTE
O Google mostra a tarifa da companhia (GOL R$ 1.556 no GRU-GYN de 02/12) e
esconde, do acesso automatizado, as ofertas de revendedores de milhas. A
MaxMilhas vende a mesma poltrona por R$ 658 porque emite com milhas de outra
pessoa. Esse e o preco que interessa monitorar, e ele so aparece aqui.

POR QUE curl_cffi E NAO requests
O `requests` comum tem fingerprint de TLS que sites com protecao reconhecem
como robo. O curl_cffi imita o aperto de mao do Chrome. Sem isso, varios
endpoints devolvem bloqueio no lugar do JSON.

FLUXO (descoberto por captura de rede, ver HAR de 23/07/2026)
  1. GET  /busca-passagens-aereas/RT/{orig}/{dest}/{ida}/{volta}/1/0/0/EC
     A pagina e gerada no servidor e ja embute o UUID da busca no HTML.
  2. GET  bff-mall/search/air-offer/offers/{uuid}/{cia}
     Devolve as ofertas. O preco por passageiro fica em `paxTotalAmount`.
     A resposta e montada progressivamente, entao vale repetir se vier vazia.

RISCO CONHECIDO
E API interna, sem contrato publico. Pode mudar sem aviso. O monitor de saude
do main.py cobre isso: se parar de retornar dados por N ciclos, voce e avisado.
"""

from __future__ import annotations

import random
import re
import time
import uuid
from datetime import datetime

from ..config import Rota
from ..storage import Observacao, agora

FONTE = "maxmilhas"

SITE = "https://www.maxmilhas.com.br"
BFF = "https://bff-mall.maxmilhas.com.br"
# "mix" combina companhias diferentes na ida e na volta, e costuma ter o menor preco
COMPANHIAS = ("mix", "gol", "latam", "azul")
RE_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TENTATIVAS = 3
TIMEOUT = 45


def _sessao():
    """Importa aqui dentro para o coletor do Google seguir funcionando
    mesmo que o curl_cffi nao esteja instalado no ambiente."""
    from curl_cffi import requests

    return requests.Session(
        impersonate="chrome124",
        headers={
            "origin": SITE,
            "referer": SITE + "/",
            "accept": "application/json, text/plain, */*",
            "accept-language": "pt-BR,pt;q=0.9",
            "x-correlation-id": str(uuid.uuid4()),
        },
    )


def _url_busca(rota: Rota, ida: str, volta: str | None) -> str:
    tipo = "RT" if volta else "OW"
    trecho = f"{rota.origem}/{rota.destino}/{ida}"
    if volta:
        trecho += f"/{volta}"
    return f"{SITE}/busca-passagens-aereas/{tipo}/{trecho}/{rota.adultos}/0/0/EC"


def _uuid_da_busca(sessao, url: str) -> str | None:
    resp = sessao.get(url, timeout=TIMEOUT)
    if resp.status_code != 200:
        return None
    achados = RE_UUID.findall(resp.text)
    return achados[0] if achados else None


def _hora(iso: str | None) -> str | None:
    if not iso or len(iso) < 16:
        return None
    return iso[11:16]


def _minutos(saida: str | None, chegada: str | None) -> int | None:
    """Duracao porta a porta. Mesma regra do coletor do Google: medir da
    decolagem ao pouso, porque somar as pernas ignora a conexao."""
    if not saida or not chegada:
        return None
    try:
        a = datetime.fromisoformat(saida.replace("Z", "+00:00"))
        b = datetime.fromisoformat(chegada.replace("Z", "+00:00"))
        m = int((b - a).total_seconds() // 60)
        return m if m > 0 else None
    except ValueError:
        return None


# Codigos IATA das companhias que aparecem no campo `carrier`.
CIAS = {"G3": "Gol", "LA": "LATAM", "AD": "Azul", "JJ": "LATAM", "O6": "Avianca"}

RE_DURACAO = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?")


def _duracao_iso(texto: str | None) -> int | None:
    """Converte a duracao no formato ISO 8601 (PT1H40M) para minutos."""
    if not texto:
        return None
    m = RE_DURACAO.fullmatch(str(texto))
    if not m:
        return None
    horas, minutos = m.group(1), m.group(2)
    return (int(horas or 0) * 60) + int(minutos or 0) or None


def _preco_total(oferta: dict) -> float | None:
    """Preco por passageiro, ja com taxas.

    A MaxMilhas devolve o total dentro de priceDetails.unitPrices; os campos
    de nome mais obvio (paxTotalAmount na raiz) vem nulos.
    """
    det = oferta.get("priceDetails") or {}
    for unidade in det.get("unitPrices") or []:
        for chave in ("paxTotalAmount", "total", "totalAmount"):
            valor = unidade.get(chave)
            if valor:
                return float(valor)
    for chave in ("paxTotalAmount", "total"):
        if oferta.get(chave):
            return float(oferta[chave])
    return None


def _ler_ofertas(dados: dict) -> list[dict]:
    """Extrai (preco, cia, paradas, horarios) de cada oferta.

    `bounds` e uma lista de trechos: indice 0 e a ida. E dela que saem horario
    e paradas, porque e o que a pessoa olha primeiro no alerta.
    """
    saida = []
    for oferta in dados.get("offers") or []:
        preco = _preco_total(oferta)
        if not preco:
            continue
        trechos = oferta.get("bounds") or []
        if not trechos:
            continue
        ida = trechos[0]
        partida = (ida.get("departure") or {}).get("dateTime")
        chegada = (ida.get("arrival") or {}).get("dateTime")
        codigo = ida.get("carrier") or ida.get("validatedBy")
        saida.append(
            {
                "preco": preco,
                "cia": CIAS.get(codigo, codigo or "milhas"),
                "paradas": int(ida.get("totalStops") or 0),
                "partida": _hora(partida),
                "chegada": _hora(chegada),
                "duracao_min": _duracao_iso(ida.get("duration")) or _minutos(partida, chegada),
                "chega_outro_dia": bool(ida.get("daysDifference")),
            }
        )
    return saida


def coletar(rota: Rota) -> tuple[list[Observacao], str | None]:
    """Retorna (observacoes, erro). Mesma assinatura do coletor do Google."""
    try:
        sessao = _sessao()
    except ImportError:
        return [], "curl_cffi nao instalado"

    observacoes: list[Observacao] = []
    ultimo_erro: str | None = None

    for ida, volta in rota.combinacoes_datas():
        url = _url_busca(rota, ida, volta)
        try:
            identificador = _uuid_da_busca(sessao, url)
        except Exception as exc:  # noqa: BLE001
            ultimo_erro = f"busca: {type(exc).__name__}: {exc}"
            continue
        if not identificador:
            ultimo_erro = "UUID da busca nao encontrado na pagina"
            continue

        melhores: dict[float, dict] = {}
        for cia in COMPANHIAS:
            for tentativa in range(1, TENTATIVAS + 1):
                try:
                    resp = sessao.get(
                        f"{BFF}/search/air-offer/offers/{identificador}/{cia}", timeout=TIMEOUT
                    )
                    if resp.status_code == 404:
                        break  # essa companhia nao opera a rota
                    resp.raise_for_status()
                    ofertas = _ler_ofertas(resp.json())
                    if ofertas:
                        for o in ofertas:
                            melhores.setdefault(o["preco"], o)
                        break
                    # resposta montada aos poucos: espera e tenta de novo
                    if tentativa < TENTATIVAS:
                        time.sleep(2 + tentativa)
                except Exception as exc:  # noqa: BLE001
                    ultimo_erro = f"{cia}: {type(exc).__name__}: {exc}"
                    if tentativa < TENTATIVAS:
                        time.sleep((2 ** tentativa) + random.uniform(0, 1.5))
            time.sleep(random.uniform(0.8, 1.8))

        quando = agora().isoformat(timespec="seconds")
        for o in sorted(melhores.values(), key=lambda x: x["preco"])[:10]:
            observacoes.append(
                Observacao(
                    rota_id=rota.id,
                    fonte=FONTE,
                    preco=o["preco"],
                    moeda="BRL",
                    cia=o["cia"],
                    paradas=o["paradas"],
                    ida=ida,
                    volta=volta,
                    link=url,
                    coletado_em=quando,
                    partida=o["partida"],
                    chegada=o["chegada"],
                    duracao_min=o["duracao_min"],
                    chega_outro_dia=o["chega_outro_dia"],
                )
            )
        if observacoes:
            ultimo_erro = None
        time.sleep(random.uniform(1.5, 3.0))

    return observacoes, ultimo_erro
