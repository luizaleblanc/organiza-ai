# PHASE 2 -- Dashboard + Envelopes

## Contexto
Fase 1 concluida: chat funcional, registro de gastos via IA, pulso diario.
Esta fase adiciona o dashboard visual e o sistema de envelopes personalizaveis.

## Escopo EXATO desta fase

### Backend (mod-budget)
- [ ] CRUD de envelopes: `POST/GET/PUT/DELETE /api/envelopes`
- [ ] `GET /api/budget/summary` -- dados agregados para dashboard
- [ ] `GET /api/envelopes/{id}/transactions` -- transacoes do envelope
- [ ] Vincular transacoes a envelopes (IA sugere, usuario confirma)
- [ ] Adicionar tool no Spring AI: `suggestReallocation` -- sugere mover dinheiro entre envelopes

### Flutter (3 telas)
- [ ] **Dashboard**: 3 barras de progresso (buckets). Cards de resumo. Total gasto vs salario
- [ ] **Envelopes**: lista agrupada por bucket. Barra de progresso individual. FAB para criar novo
- [ ] **Detalhe do Envelope**: transacoes filtradas. Mini grafico de evolucao semanal

## Contratos de API

### GET /api/budget/summary
```json
{
  "monthYear": "2026-09",
  "salary": 4000.00,
  "totalSpent": 2896.00,
  "dailyPulse": 92.00,
  "daysRemaining": 12,
  "buckets": [
    {
      "type": "NEEDS",
      "label": "Necessidades",
      "limit": 2000.00,
      "spent": 1650.00,
      "percentage": 82.5,
      "envelopes": [
        { "id": 1, "name": "Moradia", "limit": 1200.00, "spent": 1200.00 },
        { "id": 2, "name": "Mercado", "limit": 500.00, "spent": 320.00 },
        { "id": 3, "name": "Transporte", "limit": 300.00, "spent": 130.00 }
      ]
    },
    {
      "type": "WANTS",
      "label": "Desejos",
      "limit": 1200.00,
      "spent": 980.00,
      "percentage": 81.6,
      "envelopes": []
    },
    {
      "type": "SAVINGS",
      "label": "Poupanca",
      "limit": 800.00,
      "spent": 266.00,
      "percentage": 33.2,
      "envelopes": []
    }
  ]
}
```

### POST /api/envelopes
```json
// Request
{
  "name": "Mercado",
  "bucket": "NEEDS",
  "amountLimit": 500.00
}

// Response
{
  "id": 2,
  "name": "Mercado",
  "bucket": "NEEDS",
  "amountLimit": 500.00,
  "spent": 0.00
}
```

## Regras de Negocio
1. Soma dos limites dos envelopes de um bucket NAO pode exceder o limite do bucket
2. Envelopes sao opcionais -- usuario pode usar so os 3 buckets sem criar envelopes
3. Ao criar envelope, recalcular espaco livre no bucket
4. Ao deletar envelope, transacoes perdem FK mas mantem o bucket
5. IA no chat pode sugerir: "Seu envelope de Delivery esta em 90%. Quer mover R$50 de Transporte?"
6. Free: maximo 3 envelopes. Premium: ilimitado (enforcement na Fase 5, preparar flag aqui)

## Criterios de Aceite
1. Dashboard mostra 3 buckets com barras de progresso proporcionais ao salario
2. Usuario cria envelope "Mercado" em Necessidades com limite R$500
3. Transacao registrada via chat aparece dentro do envelope correto
4. Barra de progresso do envelope atualiza ao registrar gasto
5. Endpoint summary retorna dados completos para montar o dashboard

## Fora de Escopo
- Voz (Fase 3)
- Leitura de notificacoes (Fase 3)
- Insights semanais (Fase 4)
- Simulador (Fase 4)
- Paywall e enforcement de limites (Fase 5)
