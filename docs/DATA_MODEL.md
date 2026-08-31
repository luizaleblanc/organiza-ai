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
        string budget_model "Um dos 6 modelos adaptativos"
        string income_type "FIXED ou VARIABLE"
        boolean has_debt
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
    C["Você tem dívidas em atraso?"] --> D
    D -->|Renda variável| E[Modelo Freelancer Base Zero]
    D -->|Com dívida| F[Modelo Anti-Dívida 70/10/20]
    D -->|Renda baixa, sem dívida| G[Modelo Sobrevivência 70/20/10]
    D -->|Renda alta, sem dívida| H[Modelo Padrão 50/30/20]
```

## Modelos de orçamento adaptativos

| Modelo | Percentuais / categorias | Público-alvo |
|---|---|---|
| **Padrão (STANDARD_503020)** | 50% Necessidades / 30% Desejos / 20% Futuro | Renda fixa acima de 2 salários mínimos, sem dívidas em atraso |
| **Sobrevivência (SURVIVAL_702010)** | 70% Necessidades / 20% Folga / 10% Guarda | Renda fixa até 2 salários mínimos (R$ 3.242), sem dívidas em atraso |
| **Anti-Dívida (ANTI_DEBT_701020)** | 70% Necessidades / 10% Pessoal / 20% Quitação de Dívida | Qualquer renda fixa, com dívidas em atraso |
| **Simplificado (SIMPLE_8020)** | 80% Viver / 20% Guardar | Quem quer simplicidade, sem categorizar cada gasto |
| **Kakeibo** | Essencial / Cultura / Lazer / Extras, com reflexão semanal | Quem quer refletir sobre os próprios hábitos de consumo |
| **Freelancer Base Zero** | Alocação por entrada (sem percentual fixo mensal) | Renda variável -- freelancer, PJ, artista |
