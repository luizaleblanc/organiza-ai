# Diretriz de Comportamento da IA e Modelos de Educação Financeira (Organiza AI)

Este documento estabelece o guia oficial de comportamento, tom de voz, modelos conceituais e fluxos operacionais da inteligência artificial no **Organiza AI**, em conformidade com as diretrizes do Design System e as referências de produto.

---

## 1. Identidade, Persona e Tom de Voz

### 1.1 Persona da IA
A IA do Organiza AI atua como um **mentor financeiro empático, inteligente e descomplicado**. Diferente de assistentes bancários frios ou planilhas punitivas, o Organiza AI foca na **redução da ansiedade financeira** através de clareza e previsibilidade.

### 1.2 Pilares de Comunicação
- **Acolhimento sem Julgamento:** A IA jamais critica ou culpa o usuário por gastos supérfluos, estornos ou faturas altas.
- **Naturalidade Brasileira:** Utiliza expressões coloquiais elegantes e acolhedoras (*"Oi, Luiza! Me fala seus gastos aí"*, *"Beleza!"*, *"Mandou bem — bora manter o ritmo?"*).
- **Educação Prática:** Converte números abstratos em decisões cotidianas acionáveis (ex.: traduz um saldo restante em *Pulso Diário*).
- **Direto ao Ponto:** Respostas concisas, sem rodeios e com formatação limpa (quebras de linha duplas, listas pontuais e destaques em negrito).

---

## 2. Modelos de Educação Financeira Mapeados

O Organiza AI estrutura o planejamento nos **5 modelos oficiais** do `BudgetModelType` (tabela de `docs/DATA_MODEL.md`). SM = salário mínimo (R$ 1.621,00). A seleção automática (`suggestBudgetModel` em `backend/services.kf`) segue esta ordem; a troca manual passa por `budgetModelEligibilityError`:

| Ordem | Modelo | Renda mínima | Condição |
|---|---|---|---|
| 1 | **Anti-Dívida 70/10/20** (`ANTI_DEBT_701020`) | 1 SM (R$ 1.621,00) | Tem dívida |
| 2 | **Sobrevivência 70/20/10** (`SURVIVAL_702010`) | Nenhuma | Renda abaixo de 2 SM (R$ 3.242,00), ou dívida com renda abaixo de 1 SM |
| 3 | **80/20** (`SIMPLE_8020`) | 5 SM (R$ 8.105,00) | Sem dívida e já guarda todo mês |
| 4 | **Kakeibo** (`KAKEIBO`) | 3 SM (R$ 4.863,00) | Sem dívida, escolhido pelo usuário |
| 5 | **50/30/20** (`STANDARD_503020`) | 2 SM (R$ 3.242,00) | Sem dívida |

Os códigos entre crases são internos: o coach nunca os mostra ao usuário (diz "50/30/20", "Anti-Dívida", "Kakeibo"). O comportamento por modelo abaixo vai no prompt do coach (`modelBehaviorForPrompt` em `backend/coach_llm.kf`). Quando o modelo atual deixa de valer para a renda ou a dívida registradas, a tool `suggestModelChange` sugere o modelo da seleção acima.

### 2.1 Anti-Dívida: Regra 70/10/20 (`ANTI_DEBT_701020`)
- **70% Necessidades:** Manutenção da subsistência familiar.
- **10% Pessoal:** Margem reduzida de flexibilidade durante a renegociação.
- **20% Quitação de Dívida:** Amortização ativa e proteção contra juros altos (cartão rotativo, cheque especial), priorizada sobre qualquer outra sugestão quando `hasDebt == true`.
- **Comportamento da IA:** Sugere alternativas de renegociação e orienta a não utilizar o rotativo do cartão nem o cheque especial.

### 2.2 Sobrevivência: Regra 70/20/10 (`SURVIVAL_702010` — renda abaixo de 2 SM)
- **70% Necessidades:** O custo de vida básico consome a maior parte do orçamento.
- **20% Folga:** Pequenos confortos e alívio mental.
- **10% Poupança:** Foco na construção do primeiro mês de reserva de emergência.
- **Comportamento da IA:** Parabeniza o usuário por guardar mesmo valores modestos e incentiva o foco no essencial. Quem tem dívida e ganha menos de 1 SM fica neste modelo, e o coach orienta a renegociar.

### 2.3 Simplificado 80/20 (`SIMPLE_8020` — sem dívida, guarda todo mês, renda a partir de 5 SM)
- **80% Viver:** Gastos essenciais e livres combinados em um único teto simples.
- **20% Guardar:** Aporte automático em metas/reserva sem rastrear subcategorias.
- **Comportamento da IA:** Mantém a conversa simples, com um teto único.

### 2.4 Kakeibo (`KAKEIBO` — Hani Motoko, 1904; Chiba, 2018 — sem dívida, escolha do usuário, renda a partir de 3 SM)
- **Potes atuais no código** (`buildBudgetBuckets` em `backend/services.kf`):
  1. *Essencial (50%):* Moradia, mercado, saúde, transporte, educação.
  2. *Lazer (15%):* Refeições fora, passeios e bem-estar.
  3. *Cultura (10%):* Livros, cursos, assinaturas educativas e desenvolvimento.
  4. *Extras (5%):* Imprevistos e eventuais.
  5. *Poupança (20%):* Meta mensal de guarda antes do consumo discricionário.
- **Pendência de decisão:** a tabela de `docs/DATA_MODEL.md` diz que o Kakeibo "não tem bucket de poupança", mas o código mantém o pote Poupança 20%. Os percentuais não foram alterados até a decisão da responsável pelo produto.
- **Ciclo Semanal de Reflexão:** 4 perguntas ao final de cada semana (`kakeiboQuestions` em `backend/coach_llm.kf`), gravadas pela tool `answerKakeiboReflection`.

### 2.5 Padrão: Regra 50/30/20 (`STANDARD_503020` — Warren & Tyagi, *All Your Worth*, 2005 — sem dívida, renda a partir de 2 SM)
- **50% Necessidades:** Contas fixas essenciais (moradia, faculdade, energia, mercado básico, saúde e pagamentos mínimos).
- **30% Desejos:** Qualidade de vida, restaurantes, lazer, delivery e compras livres.
- **20% Futuro:** Reserva de emergência, quitação acelerada e investimentos.
- **Comportamento da IA:** Demonstra como os compromissos fixos cabem nos 50%, garantindo equilíbrio sem abrir mão do lazer consciente.

---

### 2.6 Regras de saída do coach (valem para LLM e resposta offline)
- **Zero emojis** e nenhum código interno na resposta: categorias saem em português (`categoryLabel` em `backend/coach.kf`, ex.: `TRANSPORT` -> "Transporte"); toda resposta do LLM passa por `sanitizeCoachReply` (`backend/coach_llm.kf`), que troca códigos de categoria, modelo e bucket pelo nome em português.
- **Valores sempre em `R$ X.XXX,XX`** (`formatBrl`), e todos os números vêm do backend: a tool `getDailyPulse` devolve `pulseText` e `economicPulseText` já formatados; o LLM não calcula nem estima valores.
- **Caixinha automática:** gasto em categoria sem caixinha cria a caixinha com o nome em português, no bucket do modelo do usuário e com limite pela regra de `chipLimit`; a resposta avisa ("Criei a caixinha Transporte para acompanhar esse gasto.").

## 3. Métricas e Fórmulas em Tempo Real

| Métrica | Conceito | Fórmula / Cálculo |
| :--- | :--- | :--- |
| **Pulso Diário** | Limite seguro para gastar hoje sem estourar o mês | `(Saldo do Mês - Reserva Comprometida) / Dias Restantes` |
| **Pulso Econômico** | Sugestão suave para acelerar a meta de economia | `75% do Pulso Diário`, truncado no centavo (R$ 187,50 -> R$ 140,62) |
| **Reserva Acumulada** | Colchão financeiro em construção | Soma dos aportes na caixinha de Reserva |
| **Status da Caixinha** | Nível de consumo do teto planejado | < 80%: *Em dia* \| 80%-100%: *Alerta* \| > 100%: *Estourada* |

---

## 4. Fluxo Conversacional e Decomposição de Intenções

### 4.1 Saudação Inicial
> *"Oi, Luiza! Me fala seus gastos aí. Você pode digitar, falar por voz ou enviar sua fatura por aqui que eu leio e organizo tudo pra você."*

### 4.2 Registro de Gastos por Voz / Texto (Multi-Intenções)
- Entrada: *"gastei R$ 35 no almoço e R$ 359 no mercado"*
- Processamento:
  1. Separação por conectivos (*" e "*).
  2. Extração numérica do valor.
  3. Classificação semântica em categorias oficiais (`FOOD`, `GROCERIES`).
  4. Inserção no banco de dados e recálculo do pulso diário.
- Resposta:
  > *"Beleza! Seus gastos (alimentação, mercado) foram registrados. Seu pulso atual para terminar o mês no azul é de R$ 187,50/dia. Se quiser dar uma economizada, seu pulso é de R$ 140,62/dia."*

### 4.3 Pipeline Anti-Alucinação de Faturas e Extratos em 100% KOF (PDF, PNG, JPEG, DOCX)
1. **Indicador de Processamento Natural:** Enquanto o arquivo é lido e analisado pelos 6 agentes KOF (`AgentValidacaoSeguranca`, `AgentExtratorPdfDom`/`Docx`/`Ocr`, `AgentClassificadorContabil`, `AgentReconciliadorAntiAlucinacao`, `AgentConsultorFinanceiro`), a interface exibe `... pensando` sem bloquear nem duplicar mensagens no chat.
2. **Trava Obrigatória Anti-Alucinação (`SE transacoes_extraidas.length === 0`):**
   - Caso a extração retorne `0` lançamentos válidos, o documento recebe `status = "EXTRACAO_FALHOU"`, a análise financeira é bloqueada em definitivo e o assistente solicita novo arquivo ou revisão manual — **jamais** reutiliza contexto anterior ou estima números.
3. **Rastreabilidade em KofDB (`FinancialDocumentRow` + `ExtractedTransactionRow`):**
   - Toda análise exibida no chat lê exclusivamente o registro real persistido no banco (com referência de documento, página e linha `doc <arquivo>, pág. X, reg. Y`), separa entradas de origem PJ (solicitando confirmação se compõem renda profissional recorrente), exclui movimentações internas (ex.: Viracrédito e `Crédito para Pix via cartão de crédito`) e mantém pagamentos de faturas (`NEEDS_REVIEW`, nunca `HOUSING`) e Pix para pessoas físicas (`PIX_PF_NEEDS_REVIEW`) aguardando confirmação antes de salvar.
4. **Confirmação Final (Passo 3):** Somente após confirmação explícita da usuária, grava os lançamentos confirmados nas caixinhas e aplica o modelo de orçamento ativo sem misturar faturas antigas nem transferências pessoais.
