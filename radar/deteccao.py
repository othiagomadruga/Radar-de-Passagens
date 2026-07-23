# -*- coding: utf-8 -*-
"""Os quatro gatilhos, o baseline e o anti-ruido.

Rodam em paralelo: qualquer um disparando gera alerta. Um teto fixo em reais
sozinho e ruim (ou nunca dispara, ou dispara sempre), por isso o gatilho
principal e relativo ao comportamento normal da propria rota.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from .config import (
    COOLDOWN_HORAS,
    JANELA_BASELINE_DIAS,
    MIN_AMOSTRAS_BASELINE,
    PERCENTIL_BASELINE,
    QUEDA_BRUSCA_PCT,
    REALERTA_PCT,
    Rota,
)
from .storage import Observacao, agora, ler_observacoes


@dataclass
class Veredito:
    alertar: bool
    motivos: list[str]
    melhor: Observacao | None
    baseline: float | None
    anterior: float | None
    queda_pct: float | None
    silenciado_por: str | None = None


def percentil(valores: list[float], p: float) -> float | None:
    """Percentil por interpolacao linear. Sem numpy: o runner instala menos coisa."""
    if not valores:
        return None
    ordenado = sorted(valores)
    if len(ordenado) == 1:
        return ordenado[0]
    pos = (len(ordenado) - 1) * (p / 100.0)
    baixo = int(pos)
    alto = min(baixo + 1, len(ordenado) - 1)
    fracao = pos - baixo
    return ordenado[baixo] + (ordenado[alto] - ordenado[baixo]) * fracao


def _minimo_por_ciclo(historico: list[Observacao]) -> list[float]:
    """Um preco por coleta: o mais barato daquele instante.

    Sem isso o baseline ficaria enviesado, porque cada execucao grava varios
    voos e os caros pesariam tanto quanto o mais barato.
    """
    por_instante: dict[str, float] = {}
    for o in historico:
        atual = por_instante.get(o.coletado_em)
        if atual is None or o.preco < atual:
            por_instante[o.coletado_em] = o.preco
    return list(por_instante.values())


def avaliar(rota: Rota, novas: list[Observacao], estado: dict) -> Veredito:
    if not novas:
        return Veredito(False, [], None, None, None, None, silenciado_por="sem dados nesta coleta")

    melhor = min(novas, key=lambda o: o.preco)
    motivos: list[str] = []

    historico = ler_observacoes(rota.id, desde_dias=JANELA_BASELINE_DIAS)
    anteriores = [o for o in historico if o.coletado_em != melhor.coletado_em]

    # --- gatilho 1: abaixo do percentil 20 dos ultimos 30 dias ---
    amostras = _minimo_por_ciclo(anteriores)
    baseline = None
    if len(amostras) >= MIN_AMOSTRAS_BASELINE:
        baseline = percentil(amostras, PERCENTIL_BASELINE)
        if baseline and melhor.preco < baseline:
            motivos.append(f"abaixo do p{PERCENTIL_BASELINE} de {JANELA_BASELINE_DIAS}d (R$ {baseline:,.0f})")

    # --- gatilho 2: queda brusca desde a ultima leitura ---
    anterior = None
    queda_pct = None
    if anteriores:
        ultimo_instante = max(o.coletado_em for o in anteriores)
        anterior = min(o.preco for o in anteriores if o.coletado_em == ultimo_instante)
        if anterior > 0:
            queda_pct = (anterior - melhor.preco) / anterior * 100
            if queda_pct >= QUEDA_BRUSCA_PCT:
                motivos.append(f"queda de {queda_pct:.0f}% desde a ultima leitura")

    # --- gatilho 3: minimo historico ---
    todos = _minimo_por_ciclo(ler_observacoes(rota.id))
    passados = [p for p in todos if p != melhor.preco] or []
    if anteriores and passados and melhor.preco < min(passados):
        motivos.append("menor preco ja visto nesta rota")

    # --- gatilho 4: teto absoluto definido por voce ---
    if rota.teto and melhor.preco <= rota.teto:
        motivos.append(f"abaixo do seu teto de R$ {rota.teto:,.0f}")

    if not motivos:
        return Veredito(False, [], melhor, baseline, anterior, queda_pct)

    # --- anti-ruido: cooldown e re-alerta so se cair mais ---
    ultimo = (estado.get("alertas") or {}).get(rota.id)
    if ultimo:
        quando = ultimo.get("em")
        preco_alertado = float(ultimo.get("preco", 0) or 0)
        from datetime import datetime

        try:
            dentro_cooldown = datetime.fromisoformat(quando) > agora() - timedelta(hours=COOLDOWN_HORAS)
        except (TypeError, ValueError):
            dentro_cooldown = False
        if dentro_cooldown:
            limite = preco_alertado * (1 - REALERTA_PCT / 100)
            if melhor.preco > limite:
                return Veredito(
                    False, motivos, melhor, baseline, anterior, queda_pct,
                    silenciado_por=f"cooldown de {COOLDOWN_HORAS}h (ultimo alerta R$ {preco_alertado:,.0f})",
                )

    return Veredito(True, motivos, melhor, baseline, anterior, queda_pct)
