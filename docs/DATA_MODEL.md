# Modelagem de Dados -- Organiza IA

## Decisoes de simplificacao

O modelo foi desenhado para facilitar a adocao pelo KOF e permitir que qualquer contribuidor entenda visualmente como os dados se relacionam no banco hospedado no Render.

Tres entidades cobrem todo o dominio:

- **USER** e o centro. Tem salario mensal, que e a base de calculo para tudo.
- **ENVELOPE** pertence ao User e representa um teto de gastos por categoria (ex: "Moradia -- 50%"). O campo `current_spent` e desnormalizado propositalmente para consulta rapida sem precisar agregar transacoes a cada request.
- **TRANSACTION** pertence ao User e opcionalmente a um Envelope. E o registro de cada gasto ou receita.

A simplicidade e intencional: um dev que olha o diagrama entende o sistema inteiro em 30 segundos.

---

## ER Diagram

```mermaid
erDiagram
    USER ||--o{ ENVELOPE : gerencia
    USER ||--o{ TRANSACTION : realiza
    ENVELOPE ||--o{ TRANSACTION : contem

    USER {
        string id PK
        string name
        float monthly_salary
        datetime created_at
    }

    ENVELOPE {
        string id PK
        string user_id FK
        string category_name "Ex: Moradia (50%)"
        float limit_amount
        float current_spent
    }

    TRANSACTION {
        string id PK
        string envelope_id FK
        string user_id FK
        float amount
        string description
        datetime date
    }
```

---

## Fluxo principal: registro de gasto via chat

```mermaid
flowchart TD
    A[Usuario digita: gastei 50 no uber] --> B[KOF BFF]
    B --> C[Spring Boot - ChatController]
    C --> D[Spring AI - Tool Calling]
    D --> E[registerExpense]
    E --> F[Classifica: Transporte - Envelope adequado]
    F --> G[Salva Transaction no MySQL]
    G --> H[Atualiza current_spent do Envelope]
    H --> I[Calcula Pulso Diario]
    I --> J[Retorna: Registrei R$50 em Transporte. Pulso: R$92/dia]
```

## Fluxo: calculo do pulso diario

```mermaid
flowchart LR
    A[monthly_salary] --> B[Soma de todas as Transactions do mes]
    B --> C["pulso = (salary - total_spent) / dias_restantes"]
    C --> D["R$ 92,00 por dia"]
```

## Fluxo: criacao automatica de envelopes

```mermaid
flowchart TD
    A[Usuario informa salario: R$ 4.000] --> B[Sistema cria Budget 50/30/20]
    B --> C["Necessidades: R$ 2.000 (50%)"]
    B --> D["Desejos: R$ 1.200 (30%)"]
    B --> E["Poupanca: R$ 800 (20%)"]
    C --> F[Usuario personaliza envelopes dentro de cada bucket]
    F --> G["Moradia: R$ 1.200"]
    F --> H["Mercado: R$ 500"]
    F --> I["Transporte: R$ 300"]
```
