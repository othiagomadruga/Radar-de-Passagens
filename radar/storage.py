# -*- coding: utf-8 -*-
"""Persistencia em arquivo texto, versionada pelo proprio git.

Historico em JSONL (append-only) em vez de SQLite de proposito: o workflow
commita o arquivo a cada execucao, e o git faz delta de texto muito melhor
do que de binario. Um .db seria regravado inteiro a cada commit e incharia
o repositorio em poucos dias.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import ARQ_ESTADO, ARQ_OBS, DIR_DADOS

FUSO = timezone(timedelta(hours=-3))  # horario de Brasilia


def agora() -> datetime:
    return datetime.now(FUSO)


@dataclass
class Observacao:
    rota_id: str
    fonte: str
    preco: float
    moeda: str
    cia: str
    paradas: int
    ida: str
    volta: str | None
    link: str
    coletado_em: str
    # Campos abaixo sao o que separa um alerta util de um alerta que engana:
    # sem eles, um voo de 4h15 com escala parece igual a um direto de 1h45.
    partida: str | None = None        # HH:MM da decolagem
    chegada: str | None = None        # HH:MM do pouso
    duracao_min: int | None = None    # porta a porta, em minutos
    chega_outro_dia: bool = False     # pousa no dia seguinte

    @property
    def momento(self) -> datetime:
        return datetime.fromisoformat(self.coletado_em)

    @property
    def duracao_texto(self) -> str:
        if not self.duracao_min:
            return "-"
        h, m = divmod(int(self.duracao_min), 60)
        return f"{h}h{m:02d}" if h else f"{m}min"


def _garantir_dirs() -> None:
    DIR_DADOS.mkdir(parents=True, exist_ok=True)


def gravar_observacoes(obs: list[Observacao]) -> None:
    if not obs:
        return
    _garantir_dirs()
    with ARQ_OBS.open("a", encoding="utf-8") as fh:
        for o in obs:
            fh.write(json.dumps(asdict(o), ensure_ascii=False) + "\n")


def ler_observacoes(rota_id: str | None = None, desde_dias: int | None = None) -> list[Observacao]:
    if not ARQ_OBS.exists():
        return []
    corte = agora() - timedelta(days=desde_dias) if desde_dias else None
    fora: list[Observacao] = []
    with ARQ_OBS.open("r", encoding="utf-8") as fh:
        for linha in fh:
            linha = linha.strip()
            if not linha:
                continue
            try:
                o = Observacao(**json.loads(linha))
            except (json.JSONDecodeError, TypeError):
                continue  # linha corrompida nao derruba a execucao
            if rota_id and o.rota_id != rota_id:
                continue
            if corte and o.momento < corte:
                continue
            fora.append(o)
    return fora


def carregar_estado() -> dict:
    if not ARQ_ESTADO.exists():
        return {}
    try:
        return json.loads(ARQ_ESTADO.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def salvar_estado(estado: dict) -> None:
    _garantir_dirs()
    ARQ_ESTADO.write_text(
        json.dumps(estado, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
