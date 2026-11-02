# Issues de Arquitetura e Integração (Auditoria KOF + Spring Boot)

## 1. Documentação de API KOF Faltante (Causa Raiz de CI Crash)
**Severidade:** Crítica
**Descrição:** O uso das APIs de Router e Component está espalhado por todo o frontend, mas estas APIs não estão documentadas no CLAUDE.md nem no KOF_REFERENCE.md. Essa discrepância de uso/documentação causou erros sintáticos (ou construtos inválidos) que levam o compilador JVM do Kof (ASM) a sofrer o "frame crash" (ArrayIndexOutOfBoundsException).
**Solução:** 
- Adicionar documentação oficial do pacote de rotas e componentes de UI ao KOF_REFERENCE.md.
- Garantir que a versão do kof-runtime utilizada possui suporte para estes recursos de roteamento se não existiam nativamente.

## 2. Vazamento de Domínio no Backend (VoiceCommandController)
**Severidade:** Média
**Descrição:** O controlador VoiceCommandController pertence ao módulo mod_ai_coach (Inteligência Artificial), mas está mapeado com @RequestMapping("/transactions"), invadindo o espaço de rotas do módulo de transações (mod_transaction).
**Solução:**
- Mover a rota de processamento de voz para /api/coach/voice ou /api/ai/transactions para refletir o domínio da IA, ou encapsular esse serviço dentro do mod_transaction se for considerado uma fachada de entrada.

## 3. Sobrecarga de Rotas de Usuário
**Severidade:** Baixa/Média
**Descrição:** Os controladores TierStatusController, SalaryController e OnboardingController estão todos no módulo mod_user mapeando a mesma rota base @RequestMapping("/api/users"). Isso sobrecarrega um mesmo caminho REST e pode gerar conflitos de endpoints se houver ambiguidade.
**Solução:**
- Centralizar essas rotas ou deixá-las explícitas de forma restful (ex: /api/users/me/salary, /api/users/me/tier).

## 4. Documentação Conflitante no Projeto (Status e Specs)
**Severidade:** Resolvida
**Descrição:** 
- O PROJECT_STATUS.md afirma que o "frontend KOF não está iniciado", mas logo abaixo lista 11 telas como concluídas.
- A especificação base specs/PHASE_0_FOUNDATION.md ainda cita Flutter/Next.js, ignorando o Handoff para KOF.
**Solução:**
- Atualizar a fundação no PHASE_0_FOUNDATION.md para refletir a adoção do KOF.
- Corrigir a seção de status do frontend no PROJECT_STATUS.md.

## 5. Limpeza de Arquivos de Integração Contínua
**Severidade:** Resolvida
**Descrição:** O arquivo .github/workflows/kof-check.yml tentava rodar o KOF em ambiente remoto sem suporte. O erro já foi mitigado e o arquivo excluído e ignorado localmente.
## 20. Refatorar Optionals no Backend (Substituir .get() por .orElseThrow())
**Severidade:** Resolvida
**Descricao:** Havia warnings de Null type safety no VS Code devido ao uso inseguro de Optional.get().
**Solucao:** Substituidos por .orElseThrow() e .orElseGet() nos respectivos arquivos.

## 28. Extrator Estatistico de AST e LOC para validar LLM-friendliness
**Severidade:** Resolvida
**Descricao:** Necessidade de comprovar empiricamente a melhoria de DX do KOF frente ao Java.
**Solucao:** Criado script scripts/AstStats.java que consome o parser/lexer do Kof4j, realiza parsing nativo de .kf e extrai contagem exata de tokens, linhas de codigo e nos estruturais AST via Reflection.

## Pendente: anexo e voz (bloqueado upstream)
**Severidade:** Bloqueada (upstream Kof4j)
**Descricao:** A usuária aprovou o anexo de PDF (decisão 5) e a voz (decisão 6) na Tela 10. O probe no Edge headless, em 0.6.6 e 0.6.7, mostrou o seguinte:
- `Input.setType("file")` renderiza o input, mas `Input.text()` só retorna `C:akepathatura.pdf`.
- O bundle js não tem `FileReader`, `Blob`, `getUserMedia`, `MediaRecorder` nem `SpeechRecognition`.
- O `kof.http` envia só String, e multipart está `PLANNED`.
- Não há contorno, porque HTML/JS embutido em .kf é proibido.

**Escopo quando destravar:** só PDF via `POST /api/invoices/parse {fileBase64}` (já existe), depois `POST /api/invoices/confirm`. DOCX e imagens ficam fora. A voz vai virar `POST /api/chat/voice` (transcrição OpenAI via backend/outbound.kf, 503 sem chave, freemium do coach). O áudio vai como base64 em JSON, que já funciona com o `kof.http` atual.
**Acao:** abrir upstream as issues de file input no kof.ui, microfone no alvo js e http com bytes/multipart.
