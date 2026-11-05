# Spec Delta

## Purpose

Define como o app é gerado e executado no nosso servidor como um processo Node, configurado só por variáveis de ambiente e sem dependência da hospedagem do Lovable.

## ADDED Requirements

### Requirement: Build e execução como servidor Node
O projeto SHALL gerar, com `npm run build`, um servidor Node que roda com `npm start` e escuta na porta definida por `PORT`, padrão 3000.

#### Scenario: Build e start
- **WHEN** se roda `npm run build` e depois `npm start` com as variáveis obrigatórias definidas
- **THEN** o app responde em `http://<servidor>:<PORT>/login`

### Requirement: Configuração por variáveis de ambiente
O servidor SHALL ler a configuração de variáveis de ambiente: `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_DIR`, `PUBLIC_ORIGIN` e `SMTP_*`. O projeto SHALL ter um `.env.example` com cada variável explicada e sem valores secretos.

#### Scenario: Variável obrigatória ausente
- **WHEN** o servidor inicia sem `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_DIR` ou `PUBLIC_ORIGIN`
- **THEN** o servidor não sobe e informa qual variável falta

#### Scenario: SMTP não configurado
- **WHEN** o servidor roda sem as variáveis `SMTP_*`
- **THEN** o app funciona, mas o pedido de reset de senha avisa que o envio de e-mail não está configurado e o servidor registra isso no log

#### Scenario: Segredos fora do git
- **WHEN** se olha o `.gitignore` do projeto
- **THEN** `.env` e a pasta `database/`, que guarda os backups, estão ignorados

### Requirement: QR codes usam a origem pública configurada
Os QR codes de auditoria e de manutenção SHALL codificar endereços montados com `PUBLIC_ORIGIN`, nunca com um domínio fixo do Lovable nem com o endereço da aba atual.

#### Scenario: Geração de QR
- **WHEN** um admin gera os QR codes dos setores com `PUBLIC_ORIGIN=https://5s.exemplo.com.br`
- **THEN** cada QR aponta para `https://5s.exemplo.com.br/auditoria/q/<token>` ou `https://5s.exemplo.com.br/manutencao/q/<token>`

### Requirement: Sem dependência do Lovable em produção
O app em produção SHALL funcionar sem acessar nenhum domínio do Lovable ou do Supabase.

#### Scenario: Rede sem acesso ao Lovable
- **WHEN** o servidor e os navegadores não conseguem acessar `*.lovable.app`, `*.lovable.dev` nem `*.supabase.co`
- **THEN** todas as telas e fluxos funcionam
