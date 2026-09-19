# PHASE 1 -- Core MVP: Monólito KofLith (Auth + Onboarding + Envelopes + Transações + Pulso Diário + Coach)

## Contexto e Arquitetura Atual
O Organiza IA opera sob a arquitetura **KofLith (Monólito Modular JVM em KOF)**.
Toda a lógica de gateway HTTP, modelos de domínio, cálculo financeiro com precisão de 64 bits (`Double`), regras cognitivas anti-alucinação e persistência foi unificada nos pacotes `backend/*.kf`, operando de forma autônoma na porta 3000 sem proxies ou dependência de microsserviços.

---

## Escopo Consolidado do MVP

### 1. Autenticação & Segurança (`backend/auth.kf` + `backend/main.kf`)
- `POST /api/auth/register`: Registro com validação de formato e emissão de Bearer Token JWT nativo.
- `POST /api/auth/login`: Autenticação e emissão de JWT.
- Middleware JWT nativo KofWeb intercepta rotas privadas e valida o segredo `KOF_AUTH_SECRET`.

### 2. Usuário & Onboarding Adaptativo (`backend/services.kf` + `backend/coach.kf`)
- `POST /api/users/onboarding`: Processamento de renda mensal, tipo de renda (`FIXED` ou `VARIABLE`), presença e valor de dívidas (`debtAmount`).
- Seleção e sugestão automática de 6 modelos de orçamento adaptativos (50/30/20, 60/20/20, 70/20/10, etc.).
- Geração automática dos buckets de orçamento e direcionamento de renda variável para reserva de emergência.

### 3. Sistema de Envelopes (`backend/models.kf` + `backend/services.kf`)
- `GET /api/envelopes`: Listagem dos envelopes orçamentários por categoria do usuário autenticado.
- `POST /api/envelopes`: Criação de envelopes com nome, categoria e limite mensal planejado (`allocatedLimit`).
- Saldo atual e gastos acumulados (`currentSpent`) rastreados com precisão aritmética.

### 4. Transações com Vínculo e Dedução Automática (`backend/services.kf` + `backend/main.kf`)
- `POST /api/transactions`: Registro de transações com `envelopeId` opcional. Se nulo, localiza automaticamente o envelope da categoria do usuário, associa a transação e debita/acumula o valor gasto no envelope.
- `GET /api/transactions`: Histórico filtrado de transações do usuário.

### 5. Motor de Pulso Diário (`backend/coach.kf` + `backend/services.kf`)
- `GET /api/budgets/daily-pulse`:
  - Cálculo: `(salário - total_gastos_mês) / dias_restantes_no_mês`.
  - Arredondamento financeiro com 2 casas decimais (`roundTo(valor, 2)`).
  - Status dos buckets com percentual e limite comprometido.

### 6. IA Coach Financeiro com Grounding (`backend/coach.kf` + `backend/main.kf`)
- `POST /api/chat/message`: Processamento cognitivo de despesas e orientações via Coach Financeiro com grounding temporal.
- Integração de tools cognitivas: `getDailyPulse`, `getBalance`, `suggestModelChange`.

---

## Contratos de API (Resumo)

### POST /api/transactions
```json
// Request
{
  "amount": 45.50,
  "category": "FOOD",
  "description": "Almoço executivo",
  "envelopeId": "env_1"
}

// Response (TransactionOutput)
{
  "id": "tx_1",
  "userId": "user_1",
  "envelopeId": "env_1",
  "amount": 45.50,
  "category": "FOOD",
  "description": "Almoço executivo",
  "createdAt": "2026-09-18T12:00:00Z"
}
```

### GET /api/budgets/daily-pulse
```json
// Response
{
  "dailyLimit": 133.33,
  "daysRemaining": 30,
  "availableToday": 133.33,
  "spentToday": 45.50,
  "message": "Você tem R$ 133,33 disponíveis por dia neste mês."
}
```

---

## Critérios de Homologação E2E (100% GREEN)
Conforme homologado na suíte `scripts/test_e2e_flow.ps1` e na suíte de paridade diferencial `tests/parity_test.kf`:
1. Health check respondendo 200 OK na porta 3000.
2. Fluxo de ponta a ponta sem qualquer proxy intermediário.
3. Paridade de centavos e regras de negócio com o ground truth Java legado.
