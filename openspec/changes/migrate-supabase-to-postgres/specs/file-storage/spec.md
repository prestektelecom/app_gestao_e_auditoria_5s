# Spec Delta

## Purpose

Guarda as fotos de evidência das auditorias e das notas de manutenção no próprio servidor, entregando-as só a quem pode vê-las, por links com validade.

## ADDED Requirements

### Requirement: Fotos guardadas no servidor
O sistema SHALL guardar as fotos em uma pasta persistente do servidor, informada por `STORAGE_DIR`, separadas por bucket (`audit-evidences` e `maintenance-images`), mantendo os mesmos caminhos (`storage_path`) já gravados no banco.

#### Scenario: Pasta ausente
- **WHEN** o servidor inicia sem `STORAGE_DIR` ou com uma pasta sem permissão de escrita
- **THEN** o servidor falha na inicialização com uma mensagem clara

### Requirement: Envio de foto autorizado
O sistema SHALL aceitar o envio de uma foto só por uma autorização de envio emitida pelo servidor para um caminho específico, de uso único e com validade de no máximo 2 horas.

#### Scenario: Foto pelo QR de auditoria
- **WHEN** um auditor, com sessão de auditoria válida e a auditoria em andamento, envia uma foto de uma resposta
- **THEN** a foto é gravada no caminho `<auditoria>/<resposta>/<id>.jpg` e aparece na resposta

#### Scenario: Auditoria finalizada
- **WHEN** alguém pede autorização de envio para uma auditoria que não está em andamento
- **THEN** o servidor recusa com "Auditoria já finalizada."

#### Scenario: Foto de nota de manutenção
- **WHEN** uma nota de manutenção é criada e recebe a autorização de envio de uso único
- **THEN** as fotos da nota são gravadas no bucket `maintenance-images`

#### Scenario: Autorização reaproveitada ou adulterada
- **WHEN** um envio usa uma autorização já usada, vencida ou com o caminho alterado
- **THEN** o envio é recusado e nada é gravado

#### Scenario: Arquivo que não é imagem ou grande demais
- **WHEN** o arquivo enviado não é uma imagem JPEG, PNG ou WebP, ou passa de 10 MB
- **THEN** o envio é recusado

### Requirement: Leitura de foto por link assinado
O sistema SHALL entregar fotos só por links assinados pelo servidor, válidos por 1 hora. Os links SHALL ser emitidos apenas para usuários ativos ou para a sessão de QR da própria auditoria.

#### Scenario: Usuário ativo vê evidências
- **WHEN** um usuário ativo abre uma auditoria, um plano de ação ou a impressão de uma auditoria
- **THEN** as fotos aparecem por links que funcionam por 1 hora

#### Scenario: Link vencido ou alterado
- **WHEN** alguém abre um link de foto com mais de 1 hora ou com a assinatura ou o caminho alterados
- **THEN** o servidor responde 403 e não entrega o arquivo

#### Scenario: Sessão de QR pede foto de outra auditoria
- **WHEN** a sessão de QR de uma auditoria pede links de caminhos de outra auditoria
- **THEN** esses caminhos são ignorados

#### Scenario: Tentativa de sair da pasta
- **WHEN** um caminho de foto contém `..`, barra inicial ou caracteres de controle
- **THEN** o pedido é recusado

### Requirement: Remoção de foto
O sistema SHALL apagar o arquivo da pasta quando a foto for removida, seguindo as mesmas permissões de hoje: a sessão de QR remove evidências da própria auditoria em andamento, e quem gerencia manutenção remove fotos de notas.

#### Scenario: Remover evidência no QR
- **WHEN** o auditor remove uma foto durante a auditoria
- **THEN** o registro e o arquivo são apagados

#### Scenario: Sem permissão para remover foto de manutenção
- **WHEN** um usuário que não pode gerenciar manutenção tenta remover uma foto de nota
- **THEN** a remoção é recusada e o arquivo continua existindo

### Requirement: Importação das fotos existentes
O sistema SHALL ter um procedimento que copia para `STORAGE_DIR` as fotos dos buckets `audit-evidences` e `maintenance-images` do Supabase atual, nos mesmos caminhos, e informa quais não puderam ser copiadas.

#### Scenario: Cópia completa
- **WHEN** a importação roda com acesso aos buckets de origem
- **THEN** cada `storage_path` de `audit_evidences` e `maintenance_note_images` tem um arquivo correspondente na pasta

#### Scenario: Foto não encontrada
- **WHEN** uma foto não existe na origem ou falha ao baixar
- **THEN** o procedimento lista o caminho no relatório final e continua com as demais
