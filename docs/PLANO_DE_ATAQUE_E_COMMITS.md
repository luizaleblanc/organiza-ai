# Plano de Ação para o Chat e Blocos de Commits Atômicos

Este documento detalha o plano de refinamento da inteligência de interpretação financeira do chat e organiza as alterações realizadas em blocos de commits atômicos para versionamento limpo.

---

## 1. Diagnóstico da Análise de Extrato (Caso Neon)

A avaliação da usuária demonstrou uma distinção crucial entre **consistência aritmética** e **precisão semântica**:

1. **Aritmética consolidada:** O total de saídas líquidas de R\$ 2.579,10 está correto, pois desconsiderou com sucesso as movimentações circulares de garantia do Viracrédito.
2. **Fragilidades identificadas na categorização bruta:**
   - **Pagamentos de Fatura (R\$ 841,70):** Foram rotulados como custos fixos/moradia. Na prática, pagamentos de fatura cobrem compras realizadas em períodos anteriores com composição desconhecida.
   - **Pix para Pessoas Físicas (R\$ 1.214,16 dos R\$ 1.527,80 de Pix):** Transferências para terceiros (ex.: Anderson Barbosa, Alan Vitor) não devem ser automaticamente convertidas em despesas de consumo sem confirmação se constituem repasses, divisão de contas ou empréstimos.
   - **Aplicação Precipitada da Regra 70/20/10:** Comparar R\$ 2.579,10 diretamente com a renda profissional de R\$ 2.740,00 (94,1% de consumo aparente) gera diagnóstico distorcido se parte desse volume for quitação de passivo passado e não consumo corrente de novembro.

---

## 2. Plano de Ataque para o Chat (Próxima Iteração)

### Etapa 1: Camada de Triagem e Tipologia Contábil
- **Separação em 3 Pilares no Backend:**
  1. *Despesas de Consumo Comprovadas:* Pagamentos para pessoas jurídicas identificadas (alimentação, transporte, mercado, serviços).
  2. *Pagamento de Faturas Anteriores:* Quitação de crédito consolidado (tratado como passivo/compromisso, não como gasto discricionário do mês).
  3. *Transferências para Pessoas Físicas (Pix PF):* Classificadas preliminarmente como *Lançamentos a Esclarecer*.

### Etapa 2: Diálogo de Desambiguação Ativa no Chat
- Em vez de atribuir categorias genéricas como *Moradia* ou *Outros*, o chat deve adotar uma abordagem interrogativa empática:
  > *"Identifiquei R\$ 1.214,16 em transferências para pessoas físicas (como Anderson Barbosa). Esses valores foram despesas do mês, divisão de contas ou transferências pessoais?"*
- O chat oferece respostas rápidas para o usuário categorizar sem atrito.

### Etapa 3: Diagnóstico Consciente da Regra 70/20/10
- Antes de emitir o veredito orçamentário:
  - Isolar a liquidação de faturas passadas para não penalizar a folga do mês corrente.
  - Explicar ao usuário que o consumo do mês pode estar dentro da margem caso o grosso das faturas seja referente a outubro.
  - Recomendar a regra 70/20/10 somente após o esclarecimento dos repasses maiores.

### Etapa 4: Indicador de Processamento Natural (`... pensando`)
- Para tornar a experiência conversacional mais natural no envio de mensagens e no upload/interpretação de extratos e faturas:
  - Exibir na interface do chat (`frontend/screens/chat_screen.kf` e `frontend/assets/voice_bridge.js`) uma bolha temporária da IA com o texto `... pensando` enquanto o backend analisa os lançamentos e calcula os totais antes de renderizar a resposta definitiva.
  - Substituir a bolha `... pensando` imediatamente quando o resultado retornar (ou restaurar o rascunho em caso de erro 402/503).

---

## 3. Blocos de Commits Atômicos

Abaixo estão os blocos organizados no padrão Conventional Commits cobrindo todos os arquivos modificados/novos/removidos sem sobreposição para aplicação direta no repositório.

### Bloco 1: Identidade Visual e Remoção de Elementos Depreciados
```powershell
git add frontend/assets/brand/kof-voice.png frontend/assets/brand/organiza-simbolo.svg frontend/components/brand_mark.kf
git commit -m "fix(brand): remover mascote legado e reforcar simbolo oficial do design system"
```
- **Arquivos:**
  - `frontend/assets/brand/kof-voice.png` (removido)
  - `frontend/assets/brand/organiza-simbolo.svg` (gradiente e espessura oficiais)
  - `frontend/components/brand_mark.kf` (ajuste de proporções do símbolo de envio)

---

### Bloco 2: Dashboard - Gráfico de Barras e Remoção de Dados Mockados
```powershell
git add frontend/screens/dashboard_screen.kf
git commit -m "feat(dashboard): converter grafico em barras centralizadas e remover opcao ano e simulacoes"
```
- **Arquivos:**
  - `frontend/screens/dashboard_screen.kf`
- **Alterações:**
  - Remoção do contêiner escuro acima das barras (`background: transparent`).
  - Posicionamento dos valores planejados abaixo das colunas com nome e porcentagem.
  - Centralização simétrica das colunas no cartão.
  - Remoção da aba "Ano" do cabeçalho, mantendo apenas "Semana" e "Mês".
  - Eliminação de valores estáticos simulados.

---

### Bloco 3: Gestão de Caixinhas - Edição Livre de Nomes
```powershell
git add backend/services.kf frontend/screens/envelopes_screen.kf
git commit -m "feat(envelopes): desbloquear edicao e renomeacao de todas as caixinhas"
```
- **Arquivos:**
  - `backend/services.kf` (remoção da trava para renomeação e ajuste de sugestão de modelo)
  - `frontend/screens/envelopes_screen.kf` (campo de nome habilitado no modal)

---

### Bloco 4: Chat e Navegação - Saudação Fixa, Placeholder e Ícones
```powershell
git add frontend/screens/chat_screen.kf frontend/core/theme.kf frontend/components/nav_bar.kf
git commit -m "fix(chat): fixar saudacao permanente, atualizar placeholder e ajustar sidebar"
```
- **Arquivos:**
  - `frontend/screens/chat_screen.kf`
  - `frontend/core/theme.kf`
  - `frontend/components/nav_bar.kf`
- **Alterações:**
  - Fixação permanente do greeting inicial no topo do histórico.
  - Atualização do placeholder para *"Fale com o Organiza e ele te explicará seus gastos..."*.
  - Ajuste da sidebar e remoção do item de notificações do menu lateral no escopo do MVP 1.
  - Vínculo do ícone oficial de microfone do Design System.

---

### Bloco 5: Configurações - Centralização da Tela
```powershell
git add frontend/screens/settings_screen.kf
git commit -m "style(settings): centralizar tela de configuracoes e remover etiqueta em breve"
```
- **Arquivos:**
  - `frontend/screens/settings_screen.kf`

---

### Bloco 6: Extratos e Faturas - Parser Determinístico e Agente OCR
```powershell
git add scripts/parse_pdf.py backend/invoice.kf frontend/assets/voice_bridge.js
git commit -m "feat(invoice): implementar agente ocr e parser deterministico de extratos"
```
- **Arquivos:**
  - `scripts/parse_pdf.py` (leitura de PDFs com codificação Adobe UCS / CID)
  - `backend/invoice.kf` (integração via ponte de processo com isolamento de I/O e parsing dinâmico)
  - `frontend/assets/voice_bridge.js` (suporte a PDF, DOCX, JPEG, PNG e TXT com cálculo dinâmico de totais)

---

### Bloco 7: Backend - Fluxo Conversacional, Rotas Diretas e QA Local
```powershell
git add backend/coach.kf backend/store.kf backend/qa.kf backend/main.kf
git commit -m "feat(backend): fluxo conversacional offline, rotas dinamicas de qa e limpeza de historico"
```
- **Arquivos:**
  - `backend/coach.kf` (progressão em 3 etapas baseada no último estado da IA, sem emojis)
  - `backend/store.kf` (método `deleteChatMessagesByUserId`)
  - `backend/qa.kf` (semeadura dos modelos de notificação e ajustes de QA)
  - `backend/main.kf` (endpoints `/api/qa/clear-chat`, `/api/qa/clear-transactions`, `/qa/reset-all`, `/api/qa/notifications/simulate` e rotas diretas `/organizaai`, `/dashboard`, `/caixinhas`, `/notificacoes`, `/configuracoes` e variantes mobile)

---

### Bloco 8: Documentação e Diretrizes de Engenharia
```powershell
git add docs/AI_FINANCIAL_COACH_GUIDELINE.md docs/PLANO_DE_ATAQUE_E_COMMITS.md README.md
git commit -m "docs: atualizar readme, diretriz do coach financeiro e plano de ataque do chat"
```
- **Arquivos:**
  - `docs/AI_FINANCIAL_COACH_GUIDELINE.md`
  - `docs/PLANO_DE_ATAQUE_E_COMMITS.md`
  - `README.md`
