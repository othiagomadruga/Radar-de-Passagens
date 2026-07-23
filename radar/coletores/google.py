# -*- coding: utf-8 -*-
"""Sensor primario: Google Flights via fast-flights.

Backend puro. Monta a query em Protobuf base64 (parametro tfs) e faz HTTP
direto, sem navegador. E a fonte gratuita que roda em toda execucao.
"""

from __future__ import annotations

import random
import time
from datetime import datetime

from fast_flights import FlightQuery, Passengers, create_query, get_flights

from ..config import Rota
from ..storage import Observacao, agora

FONTE = "google"
TENTATIVAS = 3


def _consultar(rota: Rota, ida: str, volta: str | None):
    trechos = [FlightQuery(date=ida, from_airport=rota.origem, to_airport=rota.destino)]
    if volta:
        trechos.append(FlightQuery(date=volta, from_airport=rota.destino, to_airport=rota.origem))
    query = create_query(
        flights=trechos,
        trip="round-trip" if volta else "one-way",
        seat=rota.classe,
        passengers=Passengers(adults=rota.adultos),
        language="pt-BR",
        currency="BRL",
    )
    return query, get_flights(query)


def _hora(momento) -> str | None:
    """SimpleDatetime traz time como lista, e meia-noite vem com a hora nula."""
    try:
        t = momento.time
    except AttributeError:
        return None
    if not t:
        return None
    h = t[0] if t[0] is not None else 0
    m = t[1] if len(t) > 1 and t[1] is not None else 0
    return f"{h:02d}:{m:02d}"


def _instante(momento) -> datetime | None:
    try:
        a, m, d = momento.date
        t = momento.time or []
        return datetime(a, m, d, t[0] if t and t[0] is not None else 0,
                        t[1] if len(t) > 1 and t[1] is not None else 0)
    except (AttributeError, TypeError, ValueError):
        return None


def _detalhes(voo) -> dict:
    """Horarios, duracao porta a porta e se pousa no dia seguinte."""
    pernas = getattr(voo, "flights", None) or []
    if not pernas:
        return {}
    primeira, ultima = pernas[0], pernas[-1]

    # Somar a duracao das pernas ignora a conexao: um voo com escala de 3h
    # apareceria tao curto quanto o direto. Medimos da decolagem ao pouso.
    saida, chegada = _instante(primeira.departure), _instante(ultima.arrival)
    if saida and chegada and chegada > saida:
        duracao = int((chegada - saida).total_seconds() // 60)
    else:
        duracao = sum(int(getattr(p, "duration", 0) or 0) for p in pernas)

    try:
        chega_outro_dia = list(ultima.arrival.date) != list(primeira.departure.date)
    except (AttributeError, TypeError):
        chega_outro_dia = False
    return {
        "partida": _hora(primeira.departure),
        "chegada": _hora(ultima.arrival),
        "duracao_min": duracao or None,
        "chega_outro_dia": chega_outro_dia,
    }


def _link(query) -> str:
    """query.url e metodo nesta versao da lib, mas ja foi atributo em outras."""
    alvo = getattr(query, "url", "")
    return alvo() if callable(alvo) else str(alvo)


def coletar(rota: Rota) -> tuple[list[Observacao], str | None]:
    """Retorna (observacoes, erro). Erro nao-nulo alimenta o monitor de saude."""
    observacoes: list[Observacao] = []
    ultimo_erro: str | None = None

    for ida, volta in rota.combinacoes_datas():
        for tentativa in range(1, TENTATIVAS + 1):
            try:
                query, resultado = _consultar(rota, ida, volta)
                for voo in resultado:
                    if not voo.price:
                        continue
                    observacoes.append(
                        Observacao(
                            rota_id=rota.id,
                            fonte=FONTE,
                            preco=float(voo.price),
                            moeda="BRL",
                            cia=", ".join(voo.airlines) if voo.airlines else "?",
                            paradas=max(len(voo.flights) - 1, 0),
                            ida=ida,
                            volta=volta,
                            link=_link(query),
                            coletado_em=agora().isoformat(timespec="seconds"),
                            **_detalhes(voo),
                        )
                    )
                ultimo_erro = None
                break
            except Exception as exc:  # noqa: BLE001 - qualquer falha vira sinal de saude
                ultimo_erro = f"{type(exc).__name__}: {exc}"
                if tentativa < TENTATIVAS:
                    # backoff exponencial com jitter, nunca paralelizar
                    time.sleep((2 ** tentativa) + random.uniform(0, 1.5))
        # respiro entre combinacoes de datas para nao parecer rajada
        time.sleep(random.uniform(1.5, 3.5))

    return observacoes, ultimo_erro
