# Modelagem de Dados -- Organiza IA

## Decisões de simplificação

O modelo foi desenhado para facilitar a adoção pelo KOF e permitir que qualquer contribuidor entenda visualmente como os dados se relacionam no banco hospedado no Render.

Três entidades cobrem todo o domínio:

- **USER** é o centro. Tem salário mensal, que é a base de cálculo para tudo.
- **ENVELOPE** pertence ao User e representa um teto de gastos por categoria (ex: "Moradia -- 50%"). O campo `current_spent` é desnormalizado propositadamente para consulta rápida sem precisar agregar transações a cada request.
- **TRANSACTION** pertence ao User e opcionalmente a um Envelope. É o registro de cada gasto ou receita.

A simplicidade é intencional: um dev que olha o diagrama entende o sistema inteiro em 30 segundos.

---

## ER Diagram

```mermaid
erDiagram
    USER ||--o{ ENVELOPE : gerencia
    USER ||--o{ TRANSACTION : realiza
    USER ||--o{ VARIABLE_INCOME : recebe
    ENVELOPE ||--o{ TRANSACTION : contem

    USER {
        string id PK
        string name
        float monthly_salary
        boolean has_variable_income
        float emergency_fund_goal
        string budget_model "Um dos 5 modelos oficiais"
        string income_type "FIXED ou VARIABLE"
        boolean has_debt
        float debt_amount
        boolean saves_monthly
        datetime created_at
    }

    ENVELOPE {
        string id PK
        string user_id FK
        string category_name "Ex: Moradia (50%)"
        float limit_amount
        float current_spent
        string limit_type "FIXED ou MOVING_AVERAGE"
        int moving_average_months
    }

    TRANSACTION {
        string id PK
        string envelope_id FK
        string user_id FK
        float amount
        string description
        datetime date
    }

    VARIABLE_INCOME {
        string id PK
        string user_id FK
        float amount
        string source "Ex: freela, show, mentoria"
        string destination "EMERGENCY_FUND ou BUDGET_5030020"
        datetime date
    }
```

---

## Fluxo principal: registro de gasto via chat

```mermaid
flowchart TD
    A["Usuário digita: 'gastei 50 no Uber'"] --> B[KOF BFF]
    B --> C[Spring Boot - ChatController]
    C --> D[Spring AI - Tool Calling]
    D --> E[registerExpense]
    E --> F[Classifica: Transporte - Envelope adequado]
    F --> G[Salva Transaction no MySQL]
    G --> H[Atualiza current_spent do Envelope]
    H --> I[Calcula Pulso Diário]
    I --> J["Retorna: 'Registrei R$50 em Transporte. Pulso: R$92/dia'"]
```

## Fluxo: cálculo do pulso diário

```mermaid
flowchart LR
    A[monthly_salary] --> B[Soma de todas as Transactions do mês]
    B --> C["pulso = (salary - total_spent) / dias_restantes"]
    C --> D["R$ 92,00 por dia"]
```

## Fluxo: criação automática de envelopes

```mermaid
flowchart TD
    A[Usuário informa salário: R$ 4.000] --> B[Sistema cria Budget 50/30/20]
    B --> C["Necessidades: R$ 2.000 (50%)"]
    B --> D["Desejos: R$ 1.200 (30%)"]
    B --> E["Poupança: R$ 800 (20%)"]
    C --> F[Usuário personaliza envelopes dentro de cada bucket]
    F --> G["Moradia: R$ 1.200"]
    F --> H["Mercado: R$ 500"]
    F --> I["Transporte: R$ 300"]
```

## Fluxo: renda variável

```mermaid
flowchart TD
    A[Usuário registra renda extra] --> B{Meta de reserva atingida?}
    B -->|Não| C[100% para reserva de emergência]
    B -->|Sim| D[Aplica 50/30/20 na renda extra]
    C --> E[Atualiza progresso da reserva]
    D --> F[Distribui nos envelopes]
```

## Fluxo: onboarding com sugestão de modelo

```mermaid
flowchart TD
    A["Quanto você ganha por mês?"] --> D[Motor de sugestão]
    B["Sua renda é fixa ou variável?"] --> D
    C["Você tem dívidas em atraso?"] --> C2["Qual o valor da sua dívida? (se sim)"]
    S["Você já guarda dinheiro todo mês?"] --> D
    C2 --> D
    C -->|Não| D
    D -->|1. Dívida e renda >= 1 SM| F[Anti-Dívida 70/10/20]
    D -->|2. Renda < 2 SM ou dívida com renda < 1 SM| G[Sobrevivência 70/20/10]
    D -->|3. Sem dívida, guarda todo mês e renda >= 5 SM| P[80/20]
    D -->|4. Sem dívida, renda >= 3 SM, escolha do usuário| K[Kakeibo]
    D -->|5. Sem dívida e renda >= 2 SM| H[50/30/20]
```

## Modelos de orçamento adaptativos

SM = salário mínimo (R$ 1.621,00). A coluna `budget_model` só aceita estes 5 valores; valores fora desses 5 são convertidos ao carregar (`userFromRow` em `backend/store.kf`).

| Ordem | Modelo | Renda mínima | Condição | Por quê |
|---|---|---|---|---|
| 1 | **Anti-Dívida 70/10/20 (ANTI_DEBT_701020)** | 1 SM (R$ 1.621) | Tem dívida | Abaixo disso, 20% para quitação não cobre nem a parcela mínima. Quem tem dívida e ganha menos de 1 SM fica no Sobrevivência, e o coach orienta a renegociar. |
| 2 | **Sobrevivência 70/20/10 (SURVIVAL_702010)** | Nenhuma | Renda abaixo de 2 SM (R$ 3.242) | É o modelo de entrada. |
| 3 | **80/20 (SIMPLE_8020)** | 5 SM (R$ 8.105) | Sem dívida e já guarda todo mês | Com 80% livre e sem divisão interna, precisa de folga para não estourar o essencial. |
| 4 | **Kakeibo (KAKEIBO)** | 3 SM (R$ 4.863) | Sem dívida, escolhido pelo usuário | Ele não tem bucket de poupança, então exige margem. |
| 5 | **50/30/20 (STANDARD_503020)** | 2 SM (R$ 3.242) | Sem dívida | |
