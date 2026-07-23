# -*- coding: utf-8 -*-
"""Ciclo do coletor de milhas (MaxMilhas).

Roda separado do main.py e em cadencia propria (30 min em vez de 15), porque
oferta de milhas nao e a prioridade: e oportunidade, nao vigilancia. Tambem
consulta SO as rotas de quem marcou "ofertas em milhas" no cadastro.

Uso:
    python milhas.py          # ciclo normal
    python milhas.py --dry    # coleta e mostra, nao envia ao site
"""

from __future__ import annotations

import argparse
import io
import sys

# console do Windows e cp1252: sem isso, acento quebra a execucao
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from radar import remoto  # noqa: E402
from radar.coletores import maxmilhas  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Radar de Passagens: coletor de milhas")
    ap.add_argument("--dry", action="store_true", help="nao envia as observacoes ao site")
    args = ap.parse_args()

    if not remoto.configurado():
        print("[site] RADAR_API_URL/RADAR_API_KEY ausentes, nada a fazer")
        return 0

    try:
        rotas = remoto.buscar_rotas(somente_milhas=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[site] nao foi possivel buscar as rotas: {exc}")
        return 1

    if not rotas:
        print("[milhas] nenhuma assinatura pediu ofertas em milhas")
        return 0

    print(f"### milhas: {len(rotas)} rota(s) com opt-in ###")
    problemas: list[str] = []

    for rota in rotas:
        if rota.expirada:
            continue
        print(f"\n=== {rota.id} · {rota.trecho} · {rota.ida} -> {rota.volta or 'so ida'} ===")
        obs, erro = maxmilhas.coletar(rota)
        if not obs:
            print(f"  [saude] maxmilhas: sem ofertas {erro or ''}")
            problemas.append(f"{rota.id}: {erro or 'sem ofertas'}")
            continue

        melhor = min(obs, key=lambda o: o.preco)
        marca = "" if melhor.paradas else " direto"
        print(f"  {len(obs)} oferta(s) · menor R$ {melhor.preco:,.2f} "
              f"({melhor.cia}{marca}, sai {melhor.partida})")

        if args.dry:
            continue
        try:
            gravadas = remoto.enviar_observacoes(obs)
            print(f"  {gravadas} observacao(oes) enviada(s) ao site")
        except Exception as exc:  # noqa: BLE001
            print(f"  [site] falha ao enviar: {exc}")

    print(f"\nCiclo de milhas concluido. {len(problemas)} rota(s) sem oferta.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
