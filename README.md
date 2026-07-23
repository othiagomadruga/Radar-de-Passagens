# Radar de Passagens

Monitor de preço de passagens aéreas que roda sozinho no GitHub Actions e avisa no
Telegram quando o preço cai. Backend puro: nenhum navegador, nenhum servidor, custo zero.

## Como funciona

A cada 15 minutos o GitHub executa um ciclo:

1. Lê as rotas de [`rotas.yaml`](rotas.yaml)
2. Consulta o Google Flights via `fast-flights` (Protobuf + HTTP direto, sem navegador)
3. Grava cada leitura em `dados/observacoes.jsonl`, commitado no próprio repositório
4. Avalia quatro gatilhos em paralelo e, se algum disparar, manda alerta no Telegram

### Os quatro gatilhos

| # | Gatilho | Quando dispara |
|---|---------|----------------|
| 1 | Baseline | preço abaixo do percentil 20 dos últimos 30 dias da rota |
| 2 | Queda brusca | caiu 15% ou mais desde a leitura anterior |
| 3 | Mínimo histórico | menor preço já visto naquela rota |
| 4 | Teto | abaixo do valor que você definiu em `rotas.yaml` |

Os gatilhos 1 e 2 precisam de histórico. Na primeira semana só 3 e 4 funcionam,
e é normal: o baseline exige no mínimo 20 amostras.

### Anti-ruído

Sem isso o sistema vira spam e você silencia o bot na primeira semana:

- **Cooldown de 6 h** por rota
- Só **re-alerta** se o preço cair mais 5% abaixo do último alerta

### Monitor de saúde

Se uma fonte parar de retornar dados por 4 ciclos seguidos, você recebe um aviso.
Isso não é opcional: sem ele, um coletor quebrado se parece exatamente com
"não houve promoção", e você ficaria meses no escuro.

## Configuração

### 1. Secrets do repositório

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`:

| Secret | Valor |
|--------|-------|
| `TELEGRAM_TOKEN` | token do bot, obtido no [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | seu id, obtido no [@userinfobot](https://t.me/userinfobot) |

Secrets **não** são expostos, mesmo em repositório público.

### 2. Cadastrar rotas

Edite `rotas.yaml` — dá para fazer direto pelo site do GitHub, inclusive no celular.
O commit já vale para o ciclo seguinte.

```yaml
rotas:
  - id: gru-lis-out26
    origem: GRU
    destino: LIS
    ida: 2026-10-12
    volta: 2026-10-26
    flex_dias: 2      # testa também -2..+2 dias, multiplica a chance de achar promoção
    teto: 4000
    ativa: true
```

## Rodar localmente

```bash
pip install -r requirements.txt
python main.py --dry              # coleta e mostra, não envia nada
python main.py --rota gru-lis-out26
```

Com as variáveis `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` no ambiente, `python main.py`
funciona igual ao que roda na nuvem.

## Se o GitHub for bloqueado pela fonte

O risco real deste projeto é o IP do runner do GitHub ser barrado pelo Google Flights.
Por isso o script é agnóstico de ambiente: o **mesmo** `main.py` roda no PC via Tarefa
Agendada, sem alterar uma linha. Se o monitor de saúde acusar bloqueio, é só trocar
onde ele executa.

## Calibragem

Os parâmetros de detecção ficam todos no topo de [`radar/config.py`](radar/config.py):
janela do baseline, percentil, queda mínima, cooldown e limiar de re-alerta.

## Estrutura

```
main.py                      um ciclo de monitoramento
rotas.yaml                   suas rotas (a "interface" do projeto)
radar/config.py              parâmetros e carregamento das rotas
radar/coletores/google.py    sensor primário (Google Flights)
radar/deteccao.py            baseline, gatilhos e anti-ruído
radar/notificar.py           mensagem do Telegram
radar/storage.py             histórico em JSONL
dados/                       histórico e estado, commitados pelo workflow
```

Histórico em JSONL e não SQLite de propósito: o workflow commita o arquivo a cada
ciclo, e o git faz delta de texto muito melhor do que de binário. Um `.db` seria
regravado inteiro a cada commit e incharia o repositório em poucos dias.
