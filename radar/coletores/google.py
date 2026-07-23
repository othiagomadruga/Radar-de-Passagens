# -*- coding: utf-8 -*-
"""Sensor primario: Google Flights via fast-flights.

Backend puro. Monta a query em Protobuf base64 (parametro tfs) e faz HTTP
direto, sem navegador. E a fonte gratuita que roda em toda execucao.
"""

from __future__ import annotations

import random
import time

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
