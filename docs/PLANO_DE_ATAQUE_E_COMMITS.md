# Plano de Ataque para Amanhã e Blocos de Commits Atômicos

Este documento consolida a mensagem oficial de análise financeira no tom de voz do Organiza AI, o plano de ataque técnico para a execução de amanhã (OCR com suporte a PNG, subagentes mini/nano de leitura assertiva, confirmação obrigatória do usuário, indicador `... pensando` e correção de duplicidade) e os 8 blocos de commits atômicos do estado atual do repositório.

---

## 1. Mensagem Adaptada ao Tom de Voz da Marca (Caso Extrato Neon 1 a 14/11)

Diretrizes aplicadas: **sucinta, acolhedora, zero emojis, zero jargões técnicos e confirmação explícita da usuária antes de salvar categorias ou distribuir na regra 70/20/10.**

### Estado de processamento (enquanto a análise ocorre)
> `... pensando`

### Passo 1 — Confirmação inicial dos totais lidos no extrato (1 a 14 de novembro)
> Oi, Luiza! Já li o seu extrato da Neon de 1 a 14 de novembro e tirei as movimentações internas do Viracrédito para nada ficar contado duas vezes.
>
> Encontrei **R\$ 2.740,00** de renda profissional e **R\$ 2.579,10** em saídas e compras no cartão:
> - **R\$ 1.527,80** em Pix enviados pela conta
> - **R\$ 209,60** em compras e Pix no cartão
> - **R\$ 841,70** em pagamentos de faturas
>
> Esse total de **R\$ 2.579,10** confere com o que você esperava para o período?

### Passo 2 — Análise assertiva (substituindo a resposta antiga que classificava R\$ 841,70 como moradia)
> Conferi cada valor do seu extrato de 1 a 14 de novembro. O total de **R\$ 2.579,10** fecha certinho, mas prefiro não adivinhar algumas categorias sem confirmar com você antes.
>
> Veja o que está confirmado e o que precisa do seu olhar:
> - **Compras e Pix confirmados em estabelecimentos:** **R\$ 10,92** com Uber e **R\$ 55,00** na G4 Bebidas (o restante das compras no cartão soma até **R\$ 209,60** no total).
> - **Pagamentos de faturas:** **R\$ 841,70** (não dá para colocar como moradia ou contas fixas sem olhar os itens dessas faturas, porque podem ser compras de meses anteriores).
> - **Pix para pessoas físicas:** **R\$ 1.214,16** dentro dos **R\$ 1.527,80** enviados por Pix (não sabemos se foram gastos do mês, divisão de contas, empréstimos ou movimentações pessoais).
>
> **Sobre a regra 70/20/10:** com a sua renda profissional de **R\$ 2.740,00**, a divisão ficaria assim:
> - **70% para necessidades e despesas:** **R\$ 1.918,00**
> - **20% para poupança ou dívidas:** **R\$ 548,00**
> - **10% para lazer e desejos:** **R\$ 274,00**
>
> Embora **R\$ 2.579,10** represente **94,1%** da renda de **R\$ 2.740,00**, isso não quer dizer que você gastou quase todo o salário de novembro, já que parte envolve faturas antigas e transferências pessoais.
>
> Antes de eu salvar tudo nas suas caixinhas e organizar no 70/20/10, você pode me confirmar o que foram esses **R\$ 1.214,16** em Pix para pessoas físicas e o que tinha nos **R\$ 841,70** das faturas?

---

## 2. Plano de Ataque para Amanhã (5 Frentes Técnicas)

### Frente 1 — Correção da Duplicidade no Upload e Fim do Auto-Save Precoce
- **Arquivos:** `frontend/assets/voice_bridge.js`, `frontend/screens/chat_screen.kf`
- **Problema atual:** Ao anexar `novembro.pdf`, a mensagem `"Fatura novembro.pdf processada: 23 lançamentos identificados!"` é enviada em duplicidade no chat e `uploadInvoice` chama `POST /api/invoices/confirm` automaticamente antes da usuária confirmar os valores.
- **Ações:**
  1. Adicionar trava `isUploading` em `voice_bridge.js` para bloquear disparos repetidos do seletor de arquivos e do envio do formulário.
  2. Remover a chamada automática a `POST /api/invoices/confirm` dentro de `uploadInvoice(file)`. Os lançamentos extraídos ficam em estado pendente (`draft` / rascunho de conferência) até a usuária responder confirmando.
  3. Unificar o disparo do formulário em `voice_bridge.js` para não disparar `requestSubmit()` e `submit` duplicados com o handler de `chat_screen.kf`, garantindo uma única bolha de envio `"Fatura novembro.pdf processada..."`.

### Frente 2 — Estado de Processamento Natural (`... pensando`)
- **Arquivos:** `frontend/screens/chat_screen.kf`, `frontend/assets/voice_bridge.js`
- **Objetivo:** Tornar o tempo de leitura de extratos, imagens e análise de gastos mais natural e humano.
- **Ações:**
  1. Alterar a bolha temporária em `chatBubblesNewestFirst()` (`frontend/screens/chat_screen.kf`) de `"Organiza AI está digitando…"` para `"... pensando"`.
  2. Exibir `"... pensando"` imediatamente no início do upload em `voice_bridge.js` enquanto o OCR processa o arquivo e os subagentes analisam os lançamentos, removendo a bolha assim que a resposta definitiva chegar (ou restaurando o rascunho em caso de erro 402/503).

### Frente 3 — Pipeline OCR com Suporte Completo a PNG
- **Arquivos:** `scripts/parse_pdf.py`, `backend/invoice.kf`, `frontend/assets/voice_bridge.js`
- **Objetivo:** Tratar arquivos `.png` (prints de extratos bancários, telas de app e comprovantes Pix) como fonte de dados de primeira classe ao lado de `.pdf`, `.jpeg` e `.docx`.
- **Ações:**
  1. Atualizar a mensagem de validação em `frontend/assets/voice_bridge.js` (linha 188) para mencionar explicitamente PNG (`"Envie uma fatura ou extrato em PDF, PNG, JPEG ou DOCX."`).
  2. Evoluir `scripts/parse_pdf.py` para detectar assinatura por *magic bytes* (`%PDF-`, `\x89PNG`, `\xff\xd8\xff` JPEG, `PK` DOCX), aplicando pipeline OCR específico para imagens `.png` / `.jpeg` (pré-processamento de contraste/escala + OCR com layout preservado) e extração nativa/OCR para PDFs e DOCX.
  3. Garantir que o extrator nunca invente categorias quando o estabelecimento não estiver claro no texto lido pelo OCR.

### Frente 4 — Subagentes Mini/Nano de Código para Leitura Assertiva e Confirmação Obrigatória
- **Arquivos:** `backend/coach.kf`, `backend/invoice.kf`, `scripts/parse_pdf.py`
- **Objetivo:** Substituir heurísticas soltas por uma cadeia enxuta de subagentes especializados com verificação matemática e confirmação explícita do usuário em todas as etapas críticas.
- **Arquitetura:**
  1. **Subagente Nano 1 — Extrator OCR e Filtro de Movimentações Internas:**
     - Lê linhas brutas (data, descrição, contraparte e valor) vindas do OCR (PNG/PDF/JPEG/DOCX).
     - Identifica e exclui movimentações circulares/internas (ex.: garantia e resgate de Viracrédito) para evitar contagem dupla.
     - Entrega os totais de entradas (ex.: `R\$ 2.740,00` renda profissional) e saídas reais (`R\$ 2.579,10`) pedindo a **primeira confirmação de valor** ao usuário.
  2. **Subagente Mini 2 — Triagem por Comprovação Contábil:**
     - Separa as saídas validadas em três grupos claros sem forçar categorias sem prova:
       - *Gastos comprovados em estabelecimentos:* ex. `R\$ 55,00` G4 Bebidas, `R\$ 10,92` Uber e compras de cartão até `R\$ 209,60`;
       - *Pagamentos de fatura:* ex. `R\$ 841,70` (mantidos como pagamento de fatura a detalhar, jamais rotulados como Moradia ou Contas Fixas sem a lista de compras da fatura);
       - *Pix para pessoas físicas:* ex. `R\$ 1.214,16` dos `R\$ 1.527,80` de Pix da conta (retidos como "a confirmar" até o usuário dizer se foram gasto, divisão de conta ou transferência pessoal).
  3. **Subagente Mini 3 — Consultor de Confirmação e Regra 70/20/10:**
     - Calcula a referência da regra 70/20/10 sobre a renda identificada (`R\$ 2.740,00` → `R\$ 1.918,00` / `R\$ 548,00` / `R\$ 274,00`).
     - Explica com linguagem simples e sem jargões que o percentual aparente (`94,1%`) não significa consumo integral do salário no mês quando há faturas anteriores e Pix pessoais em aberto.
     - Só persiste transações (`POST /api/invoices/confirm`) e distribui nas caixinhas após confirmação explícita da usuária sobre os valores e os lançamentos em dúvida.

### Frente 5 — Atualização de `backend/coach.kf` e Homologação Ponta a Ponta
- **Arquivos:** `backend/coach.kf`, `backend/qa.kf`
- **Ações:**
  1. Substituir os textos de resposta das linhas 274–340 em `backend/coach.kf` pelo fluxo enxuto e sem jargões definido na Seção 1.
  2. Garantir coerência com a diretriz `docs/AI_FINANCIAL_COACH_GUIDELINE.md` (zero emojis, tom acolhedor e direto, confirmação antes de categorizar).
  3. Validar os cenários E2E: upload único sem duplicidade (`.pdf` e `.png`), exibição de `... pensando`, confirmação de totais, esclarecimento de Pix PF/faturas e persistência final somente após confirmação.

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
