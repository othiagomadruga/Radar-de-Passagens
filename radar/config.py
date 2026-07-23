# -*- coding: utf-8 -*-
"""Carrega rotas.yaml e as variaveis de ambiente. Nenhum segredo mora no codigo."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
ARQ_ROTAS = RAIZ / "rotas.yaml"
DIR_DADOS = RAIZ / "dados"
ARQ_OBS = DIR_DADOS / "observacoes.jsonl"
ARQ_ESTADO = DIR_DADOS / "estado.json"

# --- parametros de deteccao (mexa aqui para calibrar) ---
JANELA_BASELINE_DIAS = 30   # quantos dias entram no calculo do preco "normal"
PERCENTIL_BASELINE = 20     # abaixo do p20 dos ultimos 30d = promocao
MIN_AMOSTRAS_BASELINE = 20  # antes disso nao ha historico suficiente, gatilho fica mudo
QUEDA_BRUSCA_PCT = 15.0     # caiu >=15% desde a ultima leitura = promo relampago
COOLDOWN_HORAS = 6          # nao repete alerta da mesma rota nesse intervalo
REALERTA_PCT = 5.0          # ... a menos que caia mais 5% abaixo do ultimo alerta
CICLOS_SEM_DADO_ALERTA = 4  # fonte muda por 4 ciclos seguidos = coletor provavelmente morto


@dataclass
class Rota:
    id: str
    origem: str
    destino: str
    ida: str
    volta: str | None = None
    flex_dias: int = 0
    teto: float | None = None
    adultos: int = 1
    classe: str = "economy"
    ativa: bool = True

    def __post_init__(self) -> None:
        # o YAML converte 2026-10-12 sem aspas num objeto date; normaliza para str
        if isinstance(self.ida, date):
            self.ida = self.ida.isoformat()
        if isinstance(self.volta, date):
            self.volta = self.volta.isoformat()
        self.origem = str(self.origem).strip().upper()
        self.destino = str(self.destino).strip().upper()

    @property
    def trecho(self) -> str:
        return f"{self.origem} - {self.destino}"

    @property
    def dias_ate_embarque(self) -> int:
        try:
            saida = datetime.strptime(self.ida, "%Y-%m-%d").date()
        except ValueError:
            return 999
        return (saida - date.today()).days

    @property
    def expirada(self) -> bool:
        """Data de ida ja passou: para de gastar chamada com ela."""
        return self.dias_ate_embarque < 0

    def combinacoes_datas(self) -> list[tuple[str, str | None]]:
        """Expande flex_dias em pares (ida, volta), preservando a duracao da viagem."""
        if self.flex_dias <= 0:
            return [(self.ida, self.volta)]
        base_ida = datetime.strptime(self.ida, "%Y-%m-%d").date()
        base_volta = datetime.strptime(self.volta, "%Y-%m-%d").date() if self.volta else None
        pares: list[tuple[str, str | None]] = []
        for delta in range(-self.flex_dias, self.flex_dias + 1):
            nova_ida = base_ida + timedelta(days=delta)
            if nova_ida < date.today():
                continue
            nova_volta = (base_volta + timedelta(days=delta)).isoformat() if base_volta else None
            pares.append((nova_ida.isoformat(), nova_volta))
        return pares


@dataclass
class Ambiente:
    telegram_token: str = ""
    telegram_chat_id: str = ""
    somente_teste: bool = False
    erros: list[str] = field(default_factory=list)

    @property
    def telegram_ok(self) -> bool:
        return bool(self.telegram_token and self.telegram_chat_id)


def carregar_ambiente() -> Ambiente:
    return Ambiente(
        telegram_token=os.environ.get("TELEGRAM_TOKEN", "").strip(),
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID", "").strip(),
        somente_teste=os.environ.get("RADAR_DRY_RUN", "").strip().lower() in ("1", "true", "sim"),
    )


def carregar_rotas(caminho: Path | None = None) -> list[Rota]:
    caminho = caminho or ARQ_ROTAS
    if not caminho.exists():
        raise FileNotFoundError(f"rotas.yaml nao encontrado em {caminho}")
    with caminho.open("r", encoding="utf-8") as fh:
        bruto = yaml.safe_load(fh) or {}
    rotas: list[Rota] = []
    vistos: set[str] = set()
    for item in bruto.get("rotas") or []:
        rota = Rota(**item)
        if rota.id in vistos:
            raise ValueError(f"id de rota duplicado em rotas.yaml: {rota.id}")
        vistos.add(rota.id)
        rotas.append(rota)
    return rotas
