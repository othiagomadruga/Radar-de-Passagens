-- Banco do Radar de Passagens (Cloudflare D1).
-- Aplicar com:  npx wrangler d1 execute radar --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS assinaturas (
  id                TEXT PRIMARY KEY,       -- codigo publico, vira a URL de edicao
  email             TEXT NOT NULL,
  origem            TEXT NOT NULL,
  destino           TEXT NOT NULL,
  ida               TEXT NOT NULL,
  volta             TEXT,
  flex_dias         INTEGER NOT NULL DEFAULT 0,
  teto              REAL,
  periodicidade     TEXT NOT NULL DEFAULT 'semanal',  -- diario|semanal|quinzenal|mensal
  ativa             INTEGER NOT NULL DEFAULT 1,
  criada_em         TEXT NOT NULL,
  ultimo_relatorio  TEXT,
  ultimo_alerta     TEXT,                   -- cooldown do alerta imediato
  ultimo_alerta_preco REAL
);

CREATE TABLE IF NOT EXISTS observacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assinatura_id TEXT NOT NULL,
  preco         REAL NOT NULL,
  moeda         TEXT NOT NULL DEFAULT 'BRL',
  cia           TEXT,
  paradas       INTEGER,
  ida           TEXT,
  volta         TEXT,
  link          TEXT,
  -- horario e duracao real: sem eles o preco sozinho engana, porque um voo
  -- com escala de 4h parece igual a um direto de 1h40
  partida         TEXT,
  chegada         TEXT,
  duracao_min     INTEGER,
  chega_outro_dia INTEGER NOT NULL DEFAULT 0,
  fonte         TEXT NOT NULL,
  coletado_em   TEXT NOT NULL,
  FOREIGN KEY (assinatura_id) REFERENCES assinaturas(id) ON DELETE CASCADE
);

-- consulta quente: melhor preco de uma assinatura num periodo
CREATE INDEX IF NOT EXISTS idx_obs_assinatura ON observacoes (assinatura_id, coletado_em);

-- o cron varre por periodicidade e ultimo envio
CREATE INDEX IF NOT EXISTS idx_assin_ativas ON assinaturas (ativa, ultimo_relatorio);
