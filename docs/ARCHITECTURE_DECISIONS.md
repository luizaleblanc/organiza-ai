# Decisões de Arquitetura

Este documento reúne as principais decisões técnicas do projeto Organiza IA e o raciocínio por trás delas.

---

## Por que KOF em vez de React/Next.js?

O frontend e o BFF são escritos em KOF, uma linguagem compilada para a JVM ([KofLang/Kof4j](https://github.com/KofLang/Kof4j)), em vez de React/Next.js. A escolha unifica toda a stack -- frontend, BFF e backend -- em torno da JVM, eliminando a necessidade de um runtime Node.js separado, com seu próprio gerenciador de pacotes, bundler e superfície de dependências. Isso reduz a complexidade operacional do projeto e mantém um único ecossistema de build e deploy.

## Por que monólito modular?

O time é composto por 2-3 desenvolvedores. Nesse tamanho de equipe, o custo operacional de uma arquitetura de microsserviços -- orquestração, observabilidade distribuída, versionamento de contratos entre serviços -- supera largamente o benefício de escalabilidade independente. Um monólito modular, com módulos bem delimitados (auth, user, transaction, budget, coach, notification, bankreader), entrega a maior parte dos benefícios de organização sem a sobrecarga de infraestrutura distribuída.

## Por que Spring AI com tool calling?

O coach de IA usa tool calling em vez de gerar respostas apenas a partir do prompt. Isso permite que o modelo consulte dados reais do usuário -- transações, envelopes, pulso diário -- antes de responder, em vez de inferir ou "chutar" números. O resultado é reduzir alucinação: a IA fala sobre o que existe no banco, não sobre o que parece plausível.

## Por que 6 modelos de orçamento?

O modelo 50/30/20 pressupõe renda fixa, previsível e suficiente para cobrir necessidades básicas com folga -- realidade que não corresponde à maioria dos brasileiros, que lidam com renda variável, informalidade ou orçamento apertado. Por isso o backend oferece 6 modelos de orçamento adaptativos, selecionados automaticamente no onboarding com base em renda, tipo de renda e situação de dívida do usuário.

## Por que persistir chat?

O histórico de conversas com o coach é salvo no banco de dados em vez de viver apenas na sessão. Isso garante continuidade: o coach lembra do contexto entre sessões, em vez de tratar cada conversa como uma interação isolada e sem memória do que já foi discutido com o usuário.

## Sobre alucinação de LLMs com KOF

KOF é uma linguagem nova e pouco representada nos dados de treinamento das LLMs, o que faz com que elas frequentemente "inventem" sintaxe que não existe. A pasta `training/` do repositório oficial ([KofLang/Kof4j](https://github.com/KofLang/Kof4j)) é a fonte de verdade sobre a linguagem -- em caso de conflito entre o que uma IA "sabe" e o que está documentado ali, o training/ vence. Todo código KOF gerado por IA deve ser compilado com `kof run` antes de ser considerado concluído ou commitado.
