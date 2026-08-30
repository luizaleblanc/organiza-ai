# PHASE 1 -- Core MVP: Chat + Registro + Pulso Diario

## Contexto
Fase 0 concluida: backend modular, Flutter scaffold, schema atualizado.
Esta fase entrega o fluxo principal: usuario informa salario, registra gastos via chat, ve o pulso diario.

## Escopo EXATO desta fase

### Backend (mod-ai-coach)
- [ ] Endpoint `POST /api/chat/message` -- recebe texto, processa via Spring AI, retorna resposta
- [ ] System prompt: coach financeiro em pt-BR, usa tool calling para registrar gastos
- [ ] Tools: `registerExpense`, `registerIncome`, `getBalance`, `getDailyPulse`
- [ ] Persistencia de historico de chat (tabela `chat_messages`, ultimas 20 msgs como contexto)

### Backend (mod-transaction)
- [ ] `POST /api/transactions` -- criar transacao
- [ ] `GET /api/transactions?month=2026-09` -- listar por mes
- [ ] Categorizacao automatica pela IA ao registrar via chat
- [ ] Classificacao em bucket (NEEDS/WANTS/SAVINGS) pela IA

### Backend (mod-budget)
- [ ] `POST /api/budgets` -- criar budget mensal (triggered no onboarding ao informar salario)
- [ ] `GET /api/budgets/current` -- retorna budget do mes corrente
- [ ] `GET /api/budgets/daily-pulse` -- calculo: (salario - gastos_mes) / dias_restantes
- [ ] Auto-criacao: ao cadastrar salario, gera budget com 50/30/20

### Backend (mod-user)
- [ ] `PATCH /api/users/salary` -- atualizar salario
- [ ] Endpoint retorna user com salario

### Flutter (4 telas)
- [ ] **Onboarding**: input de salario + nome. Chama `PATCH /users/salary` + `POST /budgets`
- [ ] **Chat**: lista de mensagens (USER/ASSISTANT). Input de texto. Scroll automatico. Card de pulso diario fixo no topo
- [ ] **Pulso Diario (widget)**: consome `GET /budgets/daily-pulse`. Mostra "Voce pode gastar R$XX hoje"
- [ ] **Historico**: lista de transacoes do mes. Consome `GET /transactions?month=`

## Contratos de API

### POST /api/chat/message
```json
// Request
{ "message": "gastei 35 reais no almoco" }

// Response
{
  "reply": "Registrei R$35,00 em Alimentacao (Necessidades). Seu pulso diario agora e R$92,00.",
  "transaction": {
    "id": 42,
    "amount": 35.00,
    "category": "ALIMENTACAO",
    "bucket": "NEEDS",
    "description": "almoco",
    "source": "MANUAL"
  },
  "dailyPulse": 92.00
}
```

### GET /api/budgets/daily-pulse
```json
// Response
{
  "dailyPulse": 92.00,
  "daysRemaining": 12,
  "totalSpent": 2896.00,
  "totalBudget": 4000.00,
  "bucketsUsage": {
    "NEEDS": { "limit": 2000.00, "spent": 1650.00, "percentage": 82.5 },
    "WANTS": { "limit": 1200.00, "spent": 980.00, "percentage": 81.6 },
    "SAVINGS": { "limit": 800.00, "spent": 266.00, "percentage": 33.2 }
  }
}
```

## Regras de Negocio
1. Pulso diario = (salario - total_gastos_mes) / dias_restantes_no_mes
2. Se pulso <= 0, a IA deve orientar: "Voce ja comprometeu todo o salario. Vamos revisar seus gastos?"
3. Classificacao de bucket pela IA: Moradia, Saude, Mercado, Transporte = NEEDS. Delivery, Lazer, Streaming, Roupas = WANTS. Poupanca, Investimento = SAVINGS
4. Historico de chat limitado a 20 mensagens como contexto para a IA (gerenciar tokens)
5. Budget e criado automaticamente no primeiro dia de cada mes (Spring Scheduler) OU no onboarding

## Criterios de Aceite
1. Usuario abre o app pela primeira vez -> onboarding pede salario -> budget 50/30/20 criado
2. Usuario digita "gastei 50 no uber" no chat -> IA registra transacao em Transporte/NEEDS -> pulso atualiza
3. Usuario digita "quanto posso gastar hoje?" -> IA responde com pulso diario calculado
4. Historico mostra transacoes do mes com categoria e bucket
5. Pulso diario no topo do chat atualiza apos cada gasto registrado

## Fora de Escopo
- Envelopes (Fase 2)
- Dashboard visual com graficos (Fase 2)
- Entrada por voz (Fase 3)
- Leitura de notificacoes bancarias (Fase 3)
- Insights semanais (Fase 4)
- Paywall (Fase 5)
