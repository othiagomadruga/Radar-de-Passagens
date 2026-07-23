# -*- coding: utf-8 -*-
"""Ponte entre o coletor (GitHub Actions) e o site (Cloudflare Worker).

O coletor busca as rotas cadastradas no site, coleta os precos e devolve as
observacoes. Quem decide se manda e-mail e o Worker, porque e la que fica o
historico dos assinantes e o cadastro de contato.
"""

from __future__ import annotations

import os
from dataclasses import asdict

import requests

from .config import Rota
from .storage import Observacao

TIMEOUT = 30


def configurado() -> bool:
    return bool(os.environ.get("RADAR_API_URL") and os.environ.get("RADAR_API_KEY"))


def _base() -> tuple[str, dict]:
    url = os.environ["RADAR_API_URL"].rstrip("/")
    return url, {"x-radar-key": os.environ["RADAR_API_KEY"]}


def buscar_rotas() -> list[Rota]:
    """Rotas dos assinantes do site. Falha aqui nao derruba as rotas locais."""
    url, headers = _base()
    resp = requests.get(f"{url}/api/rotas", headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    rotas = []
    for item in resp.json().get("rotas", []):
        rotas.append(
            Rota(
                id=item["id"],
                origem=item["origem"],
                destino=item["destino"],
                ida=item["ida"],
                volta=item.get("volta"),
                flex_dias=int(item.get("flex_dias") or 0),
                teto=item.get("teto"),
            )
        )
    return rotas


def enviar_observacoes(obs: list[Observacao]) -> int:
    if not obs:
        return 0
    url, headers = _base()
    carga = []
    for o in obs:
        d = asdict(o)
        d["assinatura_id"] = d.pop("rota_id")
        carga.append(d)
    resp = requests.post(
        f"{url}/api/observacoes", headers=headers, json={"observacoes": carga}, timeout=TIMEOUT
    )
    resp.raise_for_status()
    dados = resp.json()
    if dados.get("alertas"):
        print(f"  >>> {dados['alertas']} alerta(s) de e-mail disparado(s) pelo site")
    return dados.get("gravadas", 0)
