# Organiza IA

**O único app de finanças que conversa com você, entende seu salário e te diz o que fazer hoje.**

Organiza IA é um organizador de gastos inteligente projetado para separar as finanças de uma pessoa com base no salário que ela ganha -- fixo ou variável. Ao contrário de agregadores passivos de mercado, ele atua como um coach financeiro proativo.

---

## Diferenciais

**Abordagem Híbrida** -- combina a simplicidade da regra 50/30/20 com a personalização do método de Envelopes. O sistema sugere a divisão inicial, mas permite que o usuário crie tetos de gastos personalizados dentro de cada bucket.

**Coach Financeiro com IA** -- a IA classifica os gastos automaticamente nos buckets corretos, alerta sobre a proximidade dos limites e gera insights acionáveis para orientar o futuro financeiro do usuário. Não mostra só o que você gastou; diz o que fazer com o dinheiro que você tem hoje.

**Zero Barreira de Entrada** -- não exige conexão bancária (Open Finance), eliminando o atrito e o receio de compartilhamento de dados. A entrada é ativa e simplificada, podendo ser feita de forma manual ou por comandos de voz.

**Renda Fixa + Variável** -- diferente de concorrentes que só orçam sobre o fixo, o Organiza separa automaticamente renda variável (freela, shows, mentorias) e direciona 100% para reserva de emergência até atingir a meta. Depois disso, aplica 50/30/20 normalmente. Uma aba própria de renda variável permite ao usuário acompanhar cada entrada extra e o progresso da reserva de emergência.

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | KOF (kof.ui) -- linguagem compilada para JVM, renderiza via KofJS em webview |
| Back-end (BFF) | KOF (kof.web) -- servidor HTTP desacoplado, servindo dados estruturados para o front-end |
| Back-end (API) | Java 17, Spring Boot 3.3.x, Spring AI (GPT-4o-mini via tool calling) |
| Banco de Dados | MySQL no Render (modelo relacional) com cronjob de ping para estabilidade contínua |
| Build | Gradle (backend), kof-cli (frontend/BFF) |

## Arquitetura

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│  KOF Frontend (kof.ui)  │     │  KOF BFF (kof.web)      │     │  Spring Boot (Backend)  │
│                         │     │                         │     │                         │
│  Telas e componentes    │────>│  Proxy autenticado      │────>│  Lógica de negócio      │
│  compilados para JVM    │ JWT │  Rotas desacopladas     │ HTTP│  Spring AI (coach IA)   │
│  Renderiza via webview  │     │  Servidor HTTP na JVM   │     │  MySQL (Render)         │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

## Modelo de Negócio

| Tier | Preço | Inclui |
|---|---|---|
| Free | R$0 | Chat com IA (30 msgs/mês), pulso diário, 3 envelopes |
| Premium | R$9,90/mês | Chat ilimitado, voz, insights semanais, simulador, envelopes ilimitados |

## Modelagem de Dados

O modelo relacional completo está disponível em: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)

Resumo das entidades principais: **User** (dados do usuário, salário mensal, indicador de renda variável e meta de reserva de emergência), **Envelope** (tetos de gastos por categoria, com limite fixo ou por média móvel), **Transaction** (movimentações financeiras associadas a um envelope e a um usuário) e **VariableIncome** (entradas extras -- freela, show, mentoria -- direcionadas automaticamente para reserva de emergência ou para o orçamento 50/30/20).

## Roadmap

| Fase | Foco | Entregável |
|---|---|---|
| **1 -- Design** | Modelagem visual (Mermaid.js), aprovação de fluxo | Diagramas ER e de fluxo validados |
| **2 -- Desenvolvimento** | Implementação full-stack (KOF + Spring Boot) | MVP funcional: chat + pulso diário + envelopes |
| **3 -- Code Review** | PRs rigorosos para a comunidade open source | Produto estável com contribuições externas |

## Como Contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para o guia completo de setup, padrões de código e fluxo de PR. Todo participante deve seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

## Tecnologia

O Organiza IA usa a linguagem **KOF** -- uma linguagem de programação geral, fortemente tipada e compilada para JVM (https://github.com/KofLang/Kof4j). Usamos KOF tanto no front-end (kof.ui) quanto no BFF (kof.web), eliminando Node.js e Flutter do stack e unificando tudo na JVM.

## Licença

MIT License. Veja [LICENSE](LICENSE).
