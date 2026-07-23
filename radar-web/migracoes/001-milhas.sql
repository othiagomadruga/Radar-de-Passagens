-- Adiciona o opt-in de ofertas em milhas e o cooldown proprio desse alerta.
--
-- Necessario porque o schema.sql usa CREATE TABLE IF NOT EXISTS: em um banco
-- que ja existe, ele nao acrescenta colunas novas. Rodar uma vez:
--
--   npx wrangler d1 execute radar --remote --file=migracoes/001-milhas.sql

ALTER TABLE assinaturas ADD COLUMN quer_milhas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assinaturas ADD COLUMN ultimo_alerta_milhas TEXT;
ALTER TABLE assinaturas ADD COLUMN ultimo_alerta_milhas_preco REAL;
