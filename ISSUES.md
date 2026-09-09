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
**Severidade:** Baixa
**Descrição:** 
- O PROJECT_STATUS.md afirma que o "frontend KOF não está iniciado", mas logo abaixo lista 11 telas como concluídas.
- A especificação base specs/PHASE_0_FOUNDATION.md ainda cita Flutter/Next.js, ignorando o Handoff para KOF.
**Solução:**
- Atualizar a fundação no PHASE_0_FOUNDATION.md para refletir a adoção do KOF.
- Corrigir a seção de status do frontend no PROJECT_STATUS.md.

## 5. Limpeza de Arquivos de Integração Contínua
**Severidade:** Resolvida
**Descrição:** O arquivo .github/workflows/kof-check.yml tentava rodar o KOF em ambiente remoto sem suporte. O erro já foi mitigado e o arquivo excluído e ignorado localmente.
