# Educação Financeira no Organiza IA -- Visão e Backlog

> Documento de sugestão (produto + técnico), não uma fase aprovada. Objetivo:
> propor como transformar a lógica de negócio que **já existe** no app (modelos
> adaptativos, pulso diário, buckets, renda variável, Kakeibo) na própria
> ferramenta de educação financeira -- em vez de construir uma trilha de
> cursos separada. Serve de insumo para `docs/ISSUES_GUIDE.md` quando os itens
> abaixo forem aprovados e virarem issues.

## Tese central

O Organiza já é, estruturalmente, uma ferramenta de educação financeira --
só que a parte "educação" está implícita na lógica de negócio, não explícita
para o usuário. Todo cálculo que o backend já faz é uma oportunidade de
ensinar um conceito, no momento exato em que ele é relevante para a vida da
pessoa (aprendizado situado, não uma aula descontextualizada).

O erro mais fácil de cometer aqui é tratar "educação" como uma feature nova
e paralela (uma aba "Aprenda", uma trilha de vídeos, um quiz). Isso:
1. Contradiz a Regra Inviolável 10 do `CLAUDE.md` -- o dashboard é a
   interface principal, o app não deve virar uma plataforma de conteúdo.
2. Duplica lógica que já existe (ex.: reimplementar em texto estático o que
   `CategoryBucketMapper`/`BudgetModelSuggestionService`/
   `SuggestModelChangeFunction` já calculam de verdade).
3. Não se sustenta no modelo de negócio atual (freemium simples, ver ADR-004
   em `DECISIONS.md`) -- conteúdo educacional "à parte" tem custo de produção
   contínuo que este projeto, no estágio atual, não tem capacidade de manter.

**A proposta é o oposto: cada resposta que o coach já dá vira também uma
resposta que explica o "porquê".** Isso é consistente com o tom de voz já
definido no `CLAUDE.md` ("amigo que entende de dinheiro, não gerente de
banco") -- o mesmo lugar onde já mora a lógica de negócio.

---

## Onde a lógica de negócio já é (quase) educação

Tabela de mapeamento -- o que o código já faz hoje vs. a oportunidade de
ensino que está sendo desperdiçada por só entregar o número, sem o
"porquê":

| Mecânica existente | Onde está no código | O que ela já decide | O que falta para virar educação |
|---|---|---|---|
| Pulso diário zerado | `GetDailyPulseFunction` | Detecta que o salário do mês já foi comprometido | Só diz "você já comprometeu tudo" -- não explica *por que* isso aconteceu (ritmo de gasto vs. dias restantes) nem o que fazer diferente no próximo ciclo |
| Roteamento de renda variável | `RegisterIncomeFunction` + `VariableIncomeService.decideDestination` | Decide automaticamente entre reserva de emergência e orçamento 50/30/20 | Na primeira vez que isso acontece com um usuário, é o momento perfeito para explicar o *porquê* de uma reserva vir antes de qualquer outro destino -- hoje só confirma a ação |
| Detecção de divergência de modelo | `SuggestModelChangeFunction` | Já compara, mês a mês, o % gasto em necessidades vs. o que o modelo previa, e sugere um modelo diferente após 2 de 3 meses divergentes | Sugere o nome do novo modelo, mas não ensina a *diferença filosófica* entre os modelos -- perde a chance de ensinar por que "70/20/10" existe separado de "50/30/20" |
| Sugestão de modelo no onboarding | `BudgetModelSuggestionService` | Decide o modelo com base em renda, tipo de renda e dívida (com limiares concretos: até R$3.242 -> Sobrevivência, dívida -> Anti-Dívida, renda variável -> Base Zero) | O critério nunca é mostrado ao usuário -- ele recebe o resultado, não o raciocínio. Transparência aqui = literacia + confiança |
| Buckets do modelo (`GetBalanceFunction`) | `BudgetModelPlanService` + `CategoryBucketMapper` | Já sabe exatamente por que "Streaming" é WANTS e "Aluguel" é NEEDS | Essa classificação nunca é explicada ao usuário -- ele só vê o resultado agregado |
| Kakeibo | `system-message.st`, regra 12 | O prompt já *manda* a IA fazer as 4 perguntas reflexivas no fim de semana | Não há nenhum gatilho real (agendamento, persistência) -- depende inteiramente de o modelo lembrar sozinho, sem grounding de tempo confiável |
| Modelo Anti-Dívida | `BudgetModelType.ANTI_DEBT_701020` | Já prioriza um bucket de "Quitação de Dívida" | Não ensina nada sobre estratégia de quitação (o app corretamente evita recomendar investimentos específicos, mas quitação de dívida não é investimento -- dá para orientar sobre isso sem violar a regra 3 do `system-message.st`) |

O padrão em toda a tabela é o mesmo: **o backend já sabe o "porquê" -- ele só
não conta pro usuário.** Isso é uma mudança de baixo risco técnico (a lógica
já existe e já foi validada) com alto potencial de diferenciação de produto.

---

## Backlog proposto

Organizado como épicos, no mesmo formato de `docs/ISSUES_GUIDE.md` (para
poder virar issues diretamente quando aprovado). Números de issue não são
reservados -- são só uma sugestão de sequência.

### Épico A -- Momentos de ensino contextual (maior prioridade)

**O que é:** anexar uma explicação curta e opcional ao lado das respostas
que o coach já dá, nos 3 pontos de maior densidade de decisão automática:
pulso zerado, primeira renda variável roteada, sugestão de troca de modelo.

**Por que primeiro:** usa 100% de lógica que já existe (`GetDailyPulseFunction`,
`RegisterIncomeFunction`, `SuggestModelChangeFunction`) -- não cria nenhum
dado novo, só enriquece o que essas funções já retornam.

**Decisão arquitetural em aberto:** onde a explicação deve morar?
- Opção 1 (recomendada): campo novo `explanation`/`porque` nos records de
  saída dessas tools (`GetDailyPulseOutput`, `RegisterIncomeOutput`,
  `SuggestModelChangeOutput`), preenchido por lógica Java determinística
  (não pelo LLM) -- mesmo padrão de confiabilidade que a regra "NUNCA
  invente valores" do `system-message.st` já exige para números. Reduz
  risco de alucinação: a explicação é um texto fixo por cenário, não gerado
  livremente pelo modelo.
- Opção 2: regra nova no `system-message.st` pedindo pro LLM "sempre
  explicar o porquê" -- mais simples de escrever, mas reintroduz o risco de
  inconsistência que as regras anti-alucinação do prompt já tentam evitar
  em outras áreas.

**Critérios de aceite:**
- `GetDailyPulseOutput` com pulso <= 0 inclui uma explicação de por que
  chegou a zero (ritmo de gasto vs. dias do mês), não só o fato.
- Primeira vez que `RegisterIncomeFunction` roteia uma renda variável para
  reserva de emergência (por usuário), a resposta inclui uma explicação
  de por que isso acontece antes de qualquer outro destino.
- Quando `SuggestModelChangeFunction` sugere troca, a resposta explica a
  diferença filosófica entre o modelo atual e o sugerido (não só o nome).

---

### Épico B -- Transparência do onboarding

**O que é:** expor o critério por trás da sugestão de modelo no onboarding,
hoje escondido em `BudgetModelSuggestionService` (limiares de renda,
tipo de renda, dívida).

**Passo a passo sugerido:**
1. `BudgetModelSuggestionService.suggestModel` passa a retornar um objeto
   (`SuggestedModel(BudgetModelType model, String reason)`) em vez de só o
   enum -- a razão já existe implicitamente em cada `if`/`return` do método,
   só precisa virar texto.
2. Expor essa razão no endpoint de onboarding (`OnboardingResponse`, já
   referenciado em `bff/models.kf`, tem `modelDescription` -- aproveitar
   esse campo em vez de criar um novo).
3. Tela de onboarding (frontend KOF, quando existir) mostra a razão junto
   com o modelo sugerido, antes do usuário confirmar.

**Critérios de aceite:**
- Usuário vê por que aquele modelo específico foi sugerido antes de aceitar.
- Trocar de modelo manualmente depois continua possível (não é um limite,
  é uma explicação).

---

### Épico C -- Kakeibo de verdade (transformar a regra 12 do prompt em feature real)

**O que é:** o `system-message.st` já *promete* as 4 perguntas reflexivas
semanais do Kakeibo, mas isso hoje depende inteiramente do LLM lembrar
sozinho, sem nenhum agendamento ou persistência dedicada -- na prática, não
funciona de forma confiável.

**Por que isso é especificamente "educação":** Kakeibo é, por definição, um
método de reflexão sobre hábitos de consumo -- é o único dos 6 modelos que
já é, no espírito, um exercício de literacia financeira, não só uma regra
de alocação. Vale tratá-lo como o carro-chefe da iniciativa de educação, não
como só mais um modelo de orçamento.

**Passo a passo sugerido:**
1. Nova entidade `KakeiboReflectionEntity` (`id`, `userId`, `weekStart`,
   `answers` -- as 4 respostas, `createdAt`) em `mod_ai_coach` ou um novo
   `mod_kakeibo` -- decisão de escopo (perguntar ao maintainer antes,
   seguindo o padrão já usado na issue #6 do `docs/ISSUES_GUIDE.md` para
   sobreposição conceitual).
2. Gatilho real: Spring Scheduler (`@Scheduled`, semanal) que verifica
   usuários com `budgetModel = KAKEIBO` sem reflexão na semana corrente, e
   marca uma notificação/flag pendente -- não depender do LLM "adivinhar"
   que é fim de semana.
3. Tool nova (`answerKakeiboReflection`) para o LLM registrar as respostas
   quando o usuário responder no chat.
4. Regra 12 do `system-message.st` passa a referenciar essa tool em vez de
   confiar só em instrução de texto.

**Critérios de aceite:**
- Reflexão semanal do Kakeibo é de fato perguntada uma vez por semana para
  usuários nesse modelo, independente de o LLM "lembrar" sozinho.
- Respostas ficam persistidas e consultáveis (histórico de reflexão --
  insumo natural para o Épico E, "evolução").

---

### Épico D -- Glossário embutido (just-in-time, não enciclopédia)

**O que é:** na primeira vez que um termo técnico aparece na conversa de um
usuário (ex.: "reserva de emergência", "bucket", o nome de um modelo), a
resposta inclui uma definição de uma linha. Da segunda vez em diante, não
repete -- teachable moment, não repetição cansativa (evita contradizer o
tom "amigo", não "professor").

**Decisão técnica:** rastrear "termos já explicados por usuário" -- tabela
simples (`userId`, `termo`, `explicadoEm`) ou reaproveitar
`chat_messages` já existente (buscar se o termo já apareceu numa resposta
anterior do assistant para aquele usuário, sem tabela nova). Preferir a
segunda opção primeiro (menos schema novo) e só migrar para tabela dedicada
se a busca em `chat_messages` se mostrar cara.

**Critérios de aceite:**
- Termo é explicado uma vez por usuário, não repetido em toda conversa.
- Lista de termos é curada manualmente (não um dicionário genérico) --
  reaproveitar exatamente os termos que já aparecem nas regras do
  `system-message.st` e nos modelos de orçamento.

---

### Épico E -- "Evolução", não "nota" (produto + métrica)

**O que é:** superfície visual/textual de como o comportamento financeiro do
usuário está mudando ao longo do tempo -- sem virar um score ou julgamento
(viola a Regra Inviolável do `CLAUDE.md`: "nunca julgue o usuário").

**Fonte de dados:** já existe -- é o mesmo cálculo de divergência que
`SuggestModelChangeFunction` já faz mês a mês. Reaproveitar, não duplicar.

**Enquadramento de produto sugerido:** "seu perfil está cada vez mais
alinhado ao modelo X" (positivo, orientador) em vez de "você gastou 20% a
mais que o ideal" (julgamento). Mesma régua de tom do resto do app.

**Onde encaixa no roadmap já existente:** o README já lista "insights
semanais" como item do tier **Premium** (Fase 4 do roadmap,
`PROJECT_STATUS.md`). Este épico é literalmente o conteúdo desse item já
planejado -- não é uma feature nova a vender, é a implementação do que já
está no modelo de negócio.

**Critérios de aceite:**
- Usuário Premium recebe, semanalmente, um resumo de evolução (não nota)
  baseado em dados reais já calculados pelo backend.
- Nenhuma linguagem de julgamento ("você gastou demais") -- seguir os
  exemplos do `CLAUDE.md`, seção "Tom de voz".

---

### Épico F -- Transparência de categoria/bucket

**O que é:** endpoint leve (`GET /api/categories`) que expõe a mesma
classificação que `CategoryBucketMapper` já faz em código, para o frontend
mostrar "por que essa categoria conta como Necessidade" sem duplicar a
lógica em texto estático em nenhum lugar.

**Risco técnico a evitar:** escrever essa explicação como texto solto em
outro lugar do código (frontend ou uma nova tabela) cria uma segunda fonte
de verdade que pode divergir de `CategoryBucketMapper` quando ele mudar.
O endpoint deve *ler* do mapper existente, nunca duplicar suas regras.

**Critérios de aceite:**
- Endpoint retorna, para cada uma das 12 categorias, o bucket padrão e o
  bucket Kakeibo correspondente, direto de `CategoryBucketMapper` (sem
  reimplementar a lógica).

---

## Sugestão de priorização

| Ordem | Épico | Por quê nessa posição |
|---|---|---|
| 1 | A -- Momentos de ensino contextual | Zero dado novo, reaproveita 3 tools que já existem e já são as mais usadas (pulso, renda, sugestão de modelo) |
| 2 | C -- Kakeibo de verdade | Fecha uma lacuna que já existe hoje (regra 12 do prompt promete algo que não é confiável) e cria o "produto educacional" mais forte do app |
| 3 | B -- Transparência do onboarding | Baixo esforço (a razão já existe implicitamente no código), alto impacto em confiança logo na primeira experiência |
| 4 | F -- Transparência de categoria/bucket | Baixo esforço, mas depende de ter frontend pronto pra exibir (hoje `frontend/` ainda não existe -- ver `PROJECT_STATUS.md`) |
| 5 | D -- Glossário embutido | Precisa de mais decisão de design (curadoria de termos) antes de virar issue |
| 6 | E -- Evolução (Premium) | Depende do Épico C (mais dado histórico) e do roadmap de Fase 4 já planejado -- não é bloqueante, mas também não é o primeiro passo |

---

## Riscos e diretrizes (para quem for implementar)

1. **Não vire professor.** Toda explicação nova deve caber no tom já
   definido no `CLAUDE.md` -- curta, sem jargão, sem julgamento. Se uma
   explicação precisar de mais de 2-3 frases, ela é grande demais para uma
   resposta de chat.
2. **Opt-in, não obrigatório.** Explicações são um adicional à resposta
   normal, nunca um bloqueio -- o usuário que só quer registrar o gasto e
   seguir em frente não pode ser forçado a ler uma aula.
3. **Fonte única de verdade.** Nenhuma explicação nova deve duplicar lógica
   que já existe em código (`CategoryBucketMapper`,
   `BudgetModelSuggestionService`, `BudgetModelPlanService`). Ler dessas
   classes, nunca reescrever o critério em texto solto em outro lugar --
   senão a explicação diverge da regra real na primeira mudança de código.
4. **Sem investimento específico.** As explicações sobre Anti-Dívida/reserva
   de emergência devem continuar respeitando a regra 3 do
   `system-message.st` (nunca sugerir ações, fundos, criptomoedas) --
   educação sobre *conceitos* (quitação de dívida, reserva, buckets), nunca
   sobre produtos financeiros específicos.
5. **Não crie um CMS.** Dado o estágio do projeto (freemium simples, time
   pequeno), comece com templates de texto em código (mesmo padrão de
   `BudgetModelPlanService`), não um sistema de conteúdo editável -- só
   considere uma tabela/admin de conteúdo se o volume de texto justificar,
   não antecipadamente.

---

## Métricas sugeridas (para validar se está funcionando)

Nenhuma dessas existe hoje -- ficam como sugestão de instrumentação futura,
não como requisito deste documento:

- Taxa de aceitação de troca de modelo sugerida por `SuggestModelChangeFunction`
  antes vs. depois de explicar o "porquê" (Épico A) -- proxy direto de
  confiança/entendimento.
- % de usuários no modelo Kakeibo que respondem a reflexão semanal
  (Épico C) -- proxy de engajamento com o único modelo explicitamente
  reflexivo.
- Retenção D30 comparando usuários que receberam >=1 explicação contextual
  (Épico A) vs. os que não receberam.
