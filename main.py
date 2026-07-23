# -*- coding: utf-8 -*-
"""Radar de Passagens: um ciclo de monitoramento.

O mesmo script roda no GitHub Actions e no PC (Tarefa Agendada), sem mudar
uma linha. Isso e proposital: se o IP do runner for bloqueado pela fonte,
voce troca de ambiente em minutos, sem reescrever nada.

Uso:
    python main.py            # ciclo normal
    python main.py --dry      # coleta e mostra, nao envia nada no Telegram
    python main.py --rota ID  # so uma rota
"""

from __future__ import annotations

import argparse
import io
import sys

# console do Windows e cp1252: sem isso, acento quebra a execucao
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from radar import notificar, remoto  # noqa: E402
from radar.coletores import google  # noqa: E402
from radar.config import CICLOS_SEM_DADO_ALERTA, carregar_ambiente, carregar_rotas  # noqa: E402
from radar.deteccao import avaliar  # noqa: E402
from radar.storage import agora, carregar_estado, gravar_observacoes, salvar_estado  # noqa: E402

COLETORES = [google]


def coletar_assinantes() -> None:
    """Rotas cadastradas no site. Historico e alerta ficam no Worker, nao aqui:
    o repositorio guarda so as rotas pessoais do rotas.yaml."""
    try:
        rotas = remoto.buscar_rotas()
    except Exception as exc:  # noqa: BLE001
        print(f"[site] nao foi possivel buscar as rotas: {exc}")
        return

    if not rotas:
        print("[site] nenhuma assinatura ativa")
        return

    print(f"\n### assinaturas do site: {len(rotas)} rota(s) ###")
    for rota in rotas:
        if rota.expirada:
            continue
        print(f"\n=== {rota.id} · {rota.trecho} · {rota.ida} -> {rota.volta or 'so ida'} ===")
        obs, erro = google.coletar(rota)
        if not obs:
            print(f"  [saude] google: sem dados {erro or ''}")
            continue
        melhor = min(obs, key=lambda o: o.preco)
        print(f"  {len(obs)} resultados · mais barato R$ {melhor.preco:,.0f} ({melhor.cia})")
        try:
            gravadas = remoto.enviar_observacoes(obs)
            print(f"  {gravadas} observacao(oes) enviada(s) ao site")
        except Exception as exc:  # noqa: BLE001
            print(f"  [site] falha ao enviar observacoes: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Radar de Passagens")
    ap.add_argument("--dry", action="store_true", help="nao envia nada no Telegram")
    ap.add_argument("--rota", help="executa somente a rota com este id")
    args = ap.parse_args()

    amb = carregar_ambiente()
    if args.dry:
        amb.somente_teste = True

    rotas = carregar_rotas()
    if args.rota:
        rotas = [r for r in rotas if r.id == args.rota]
        if not rotas:
            print(f"rota '{args.rota}' nao encontrada em rotas.yaml")
            return 1

    estado = carregar_estado()
    estado.setdefault("alertas", {})
    estado.setdefault("saude", {})

    problemas_saude: list[str] = []
    ativas = 0

    for rota in rotas:
        if not rota.ativa:
            continue
        if rota.expirada:
            print(f"[{rota.id}] data de ida ja passou, pulando (marque ativa: false)")
            continue
        ativas += 1
        print(f"\n=== {rota.id} · {rota.trecho} · {rota.ida} -> {rota.volta or 'so ida'} ===")

        for coletor in COLETORES:
            fonte = coletor.FONTE
            chave = f"{rota.id}:{fonte}"
            obs, erro = coletor.coletar(rota)

            # --- monitor de saude: fonte muda por N ciclos = coletor provavelmente morto ---
            if obs:
                estado["saude"][chave] = {"falhas": 0, "ultimo_ok": agora().isoformat(timespec="seconds")}
            else:
                falhas = int((estado["saude"].get(chave) or {}).get("falhas", 0)) + 1
                estado["saude"][chave] = {
                    "falhas": falhas,
                    "ultimo_ok": (estado["saude"].get(chave) or {}).get("ultimo_ok"),
                    "ultimo_erro": erro,
                }
                if falhas == CICLOS_SEM_DADO_ALERTA:
                    problemas_saude.append(
                        f"{fonte} sem retornar dados ha {falhas} ciclos na rota {rota.id}"
                        + (f" ({erro})" if erro else "")
                    )
                print(f"  [saude] {fonte}: sem dados ({falhas}x) {erro or ''}")
                continue

            gravar_observacoes(obs)
            melhor = min(obs, key=lambda o: o.preco)
            print(f"  {len(obs)} resultados · mais barato R$ {melhor.preco:,.0f} ({melhor.cia})")

            veredito = avaliar(rota, obs, estado)
            if veredito.alertar:
                texto = notificar.montar_alerta(rota, veredito)
                if notificar.enviar(amb, texto):
                    estado["alertas"][rota.id] = {
                        "em": agora().isoformat(timespec="seconds"),
                        "preco": veredito.melhor.preco,
                    }
                    print(f"  >>> ALERTA enviado: {'; '.join(veredito.motivos)}")
            elif veredito.silenciado_por:
                print(f"  (sem alerta: {veredito.silenciado_por})")
            else:
                print("  (preco dentro do normal)")

    if problemas_saude:
        notificar.enviar(amb, notificar.montar_saude(problemas_saude))

    salvar_estado(estado)

    # rotas dos assinantes do site, se o Worker estiver configurado
    if not args.rota and remoto.configurado():
        coletar_assinantes()
    elif not args.rota:
        print("\n[site] RADAR_API_URL/RADAR_API_KEY ausentes, assinaturas ignoradas")
    print(f"\nCiclo concluido. {ativas} rota(s) ativa(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
