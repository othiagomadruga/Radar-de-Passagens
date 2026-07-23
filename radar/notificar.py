# -*- coding: utf-8 -*-
"""Telegram. A mensagem precisa ser acionavel em 10 segundos: promocao dura pouco."""

from __future__ import annotations

from datetime import datetime

import requests

from .config import Ambiente, Rota
from .deteccao import Veredito

API = "https://api.telegram.org/bot{token}/sendMessage"
TIMEOUT = 20


def _br(valor: float) -> str:
    return f"{valor:,.0f}".replace(",", ".")


def _data_br(iso: str | None) -> str:
    if not iso:
        return "-"
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m")
    except ValueError:
        return iso


def enviar(amb: Ambiente, texto: str) -> bool:
    if amb.somente_teste:
        print("[dry-run] mensagem nao enviada:\n" + texto)
        return True
    if not amb.telegram_ok:
        print("[aviso] TELEGRAM_TOKEN/TELEGRAM_CHAT_ID ausentes, alerta nao enviado")
        return False
    resp = requests.post(
        API.format(token=amb.telegram_token),
        data={
            "chat_id": amb.telegram_chat_id,
            "text": texto,
            "parse_mode": "HTML",
            "disable_web_page_preview": "true",
        },
        timeout=TIMEOUT,
    )
    if not resp.ok:
        print(f"[erro] telegram {resp.status_code}: {resp.text[:200]}")
    return resp.ok


def montar_alerta(rota: Rota, v: Veredito) -> str:
    o = v.melhor
    assert o is not None
    linhas = [
        f"✈️ <b>{rota.origem} → {rota.destino}</b>  ·  {_data_br(o.ida)} - {_data_br(o.volta)}",
        f"<b>R$ {_br(o.preco)}</b>",
    ]
    if v.anterior and v.queda_pct and v.queda_pct > 0:
        linhas.append(f"antes R$ {_br(v.anterior)} · <b>-{v.queda_pct:.0f}%</b>")
    linhas.append("")
    linhas.append("\n".join(f"• {m}" for m in v.motivos))
    linhas.append("")
    linhas.append(f"{o.cia} · {o.paradas} parada(s) · fonte: {o.fonte}")
    if rota.dias_ate_embarque <= 21:
        linhas.append(f"⏳ faltam {rota.dias_ate_embarque} dias para o embarque")
    linhas.append(f'\n<a href="{o.link}">Ver e comprar</a>')
    return "\n".join(linhas)


def montar_saude(problemas: list[str]) -> str:
    corpo = "\n".join(f"• {p}" for p in problemas)
    return (
        "⚠️ <b>Radar de Passagens: fonte com problema</b>\n\n"
        f"{corpo}\n\n"
        "Enquanto isso o monitoramento dessa fonte esta cego. "
        "Sem este aviso voce ficaria achando que simplesmente nao houve promocao."
    )
