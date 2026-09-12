# Guia para Elaboração de Artigos Científicos — Organiza.aí

Este documento orienta a produção de dois artefatos de pesquisa relacionados ao domínio do
Organiza.aí (aplicativos de organização/produtividade): (1) um **Mapeamento Sistemático da
Literatura (MSL)** para identificar o estado da arte, lacunas (gaps) e oportunidades de
melhoria; e (2) um **artigo de pesquisa quantitativa** que usa mineração de reviews negativos
da Play Store para embasar melhorias no produto, complementado por grupo focal.

Os dois artigos são sequenciais: o MSL (Artigo 1) fundamenta teoricamente os gaps que o
Artigo 2 vai investigar empiricamente e, futuramente, endereçar no roadmap do app.

---

## Artigo 1 — Mapeamento Sistemático da Literatura (MSL)

### 1. Objetivo

Identificar, classificar e sintetizar estudos sobre [tema — ex.: "aplicativos móveis de
organização pessoal/produtividade", "gestão de tarefas assistida por IA", "adoção e
abandono (churn) de apps de produtividade"], levantando:

- Abordagens, técnicas e arquiteturas usadas.
- Métricas de avaliação de usabilidade/eficácia.
- Lacunas (gaps) de pesquisa e de mercado.
- Oportunidades de melhoria aplicáveis ao produto.

### 2. Definição do escopo com PICOC

O PICOC estrutura a pergunta de pesquisa e orienta a construção da string de busca.

| Elemento | Definição | Exemplo aplicado ao domínio |
|---|---|---|
| **P — Population** | Quem/o quê é estudado | Usuários de aplicativos móveis de organização/produtividade pessoal |
| **I — Intervention** | Tecnologia, método ou abordagem investigada | Funcionalidades de organização de tarefas, IA, notificações, gamificação |
| **C — Comparison** | Alternativa de comparação (pode ser N/A em MSL exploratório) | Abordagens tradicionais (papel, planilhas) vs. apps; ou apps entre si |
| **O — Outcomes** | Resultados de interesse | Retenção, satisfação, produtividade percebida, taxa de abandono, usabilidade |
| **C — Context** | Contexto de aplicação | Uso pessoal/individual, mobile-first, mercado consumidor (não corporativo) |

**Questões de pesquisa (RQs) — modelo a adaptar:**

- **RQ1:** Quais abordagens/técnicas são utilizadas em apps de organização pessoal para
  aumentar engajamento e retenção?
- **RQ2:** Quais métricas são usadas para avaliar a eficácia desses aplicativos?
- **RQ3:** Quais são as principais lacunas (gaps) reportadas na literatura sobre usabilidade
  e abandono desses apps?
- **RQ4:** Quais melhorias/recomendações de design ou funcionalidade são sugeridas pelos
  estudos analisados?

> Ajuste as RQs ao recorte real do Organiza.aí antes de iniciar a busca (ex.: foco em
> estudantes, finanças pessoais, hábitos, etc.).

### 3. Protocolo de Revisão (baseado em Kitchenham & Charters, 2007)

Siga as fases do protocolo Kitchenham, documentando cada decisão para permitir replicação:

1. **Necessidade da revisão** — justificar por que o MSL é necessário (não há síntese
   recente sobre o tema aplicado a apps de organização pessoal).
2. **Questões de pesquisa** — RQs definidas acima (seção 2).
3. **Estratégia de busca** — bases, strings, período, idiomas (seção 4).
4. **Critérios de seleção** — inclusão/exclusão (seção 5).
5. **Avaliação de qualidade** — checklist de qualidade dos estudos (seção 6).
6. **Extração de dados** — formulário padronizado (seção 7).
7. **Síntese dos dados** — qualitativa (temática) e, se aplicável, quantitativa (contagem de
   frequência de abordagens/técnicas).
8. **Ameaças à validade** — vieses de seleção, cobertura das bases, subjetividade na
   triagem (mitigada por dupla checagem/kappa de Cohen quando houver mais de um revisor).

### 4. Estratégia e strings de busca

**Bases de dados obrigatórias:**

- **IEEE Xplore**
- **ScienceDirect**
- **+1 base relevante adicional** — sugestões (escolher conforme foco):
  - **ACM Digital Library** (forte em IHC/usabilidade de software)
  - **Scopus** (boa cobertura multidisciplinar, útil para snowballing)
  - **Google Scholar** (apenas como complemento/controle de qualidade, não como base primária)

**Construção da string genérica (padrão PICOC):**

```
(("mobile application" OR "mobile app" OR "smartphone app")
 AND ("personal organization" OR "task management" OR "productivity app" OR "to-do app")
 AND ("user retention" OR "user engagement" OR "usability" OR "user experience" OR "churn" OR "abandonment"))
```

**Adaptações por base (sintaxe varia):**

| Base | Campo de busca | Observação |
|---|---|---|
| IEEE Xplore | `("Full Text & Metadata")` | Usar operadores booleanos e aspas; atenção ao limite de termos combinados |
| ScienceDirect | Título, resumo, palavras-chave | Suporta menos operadores complexos; pode exigir divisão da string em buscas menores |
| ACM DL / Scopus | Full-text ou Title-Abs-Key | Scopus permite `TITLE-ABS-KEY(...)`, mais flexível |

**Filtros:**

- Período: últimos 10 anos (ajustar conforme maturidade do tema), com opção de estender se
  o retorno for baixo.
- Idioma: inglês e português.
- Tipo de documento: artigos de periódico, conferência e revisões (excluir livros, patentes).

### 5. Critérios de inclusão e exclusão

**Inclusão (todos devem ser atendidos):**

- IC1: Aborda diretamente aplicativos móveis de organização pessoal/produtividade.
- IC2: Apresenta dados empíricos (quantitativos, qualitativos ou mistos) ou revisão
  sistemática/mapeamento correlato.
- IC3: Publicado no período definido, disponível em texto completo.

**Exclusão (qualquer um desqualifica):**

- EC1: Foco exclusivo em produtividade corporativa/enterprise (fora do escopo B2C).
- EC2: Estudos sem avaliação de usuário final (ex.: apenas arquitetura técnica sem validação).
- EC3: Duplicatas, resumos estendidos sem conteúdo completo, workshops sem revisão por pares.
- EC4: Não responde a nenhuma das RQs.

### 6. Avaliação de qualidade (exemplo de checklist)

Pontuar cada estudo incluído de 0 a 1 (ou 0/0.5/1) por critério, somando um score final usado
para ponderar a síntese:

1. Os objetivos da pesquisa estão claramente definidos?
2. O método (amostra, coleta, análise) está descrito de forma reprodutível?
3. Os resultados são sustentados pelos dados apresentados?
4. Limitações do estudo são discutidas?
5. O estudo é relevante para pelo menos uma RQ?

### 7. Formulário de extração de dados

Para cada estudo incluído, registrar em planilha (ex.: Google Sheets/Excel):

| Campo | Descrição |
|---|---|
| ID | Identificador único |
| Título, autores, ano, veículo | Metadados bibliográficos |
| Base de origem | IEEE / ScienceDirect / outra |
| RQ(s) respondida(s) | Mapeamento direto |
| Abordagem/técnica | Ex.: gamificação, IA, notificações push |
| Métrica de avaliação | Ex.: retenção, NPS, SUS score |
| Principais achados | Resumo objetivo |
| Gap identificado | Lacuna explícita ou inferida |
| Score de qualidade | Da seção 6 |

### 8. Síntese e saída esperada do Artigo 1

- **Tabela de frequência** de abordagens/técnicas por número de estudos.
- **Mapa de gaps** (bubble/heat map) cruzando tema x tipo de lacuna.
- **Seção de discussão** respondendo cada RQ.
- **Seção "Trabalhos futuros / oportunidades"** — insumo direto para o Artigo 2: lista
  objetiva de gaps que serão testados empiricamente via reviews e grupo focal.

### 9. Estrutura sugerida do manuscrito (Artigo 1)

1. Introdução (motivação, contribuição)
2. Fundamentação teórica (breve)
3. Metodologia (PICOC, protocolo Kitchenham, strings, critérios)
4. Condução da busca (PRISMA-like flow diagram: identificados → triados → elegíveis → incluídos)
5. Resultados (síntese por RQ)
6. Discussão (gaps consolidados)
7. Ameaças à validade
8. Conclusão e trabalhos futuros

---

## Artigo 2 — Pesquisa Quantitativa: Mineração de Reviews + Grupo Focal

### 1. Objetivo

Validar empiricamente, com dados reais de usuários, os gaps levantados no Artigo 1,
priorizando problemas relatados em reviews negativos de aplicativos concorrentes na Play
Store e aprofundando a interpretação via grupo focal (ou outra técnica qualitativa
complementar).

### 2. Etapa 1 — Coleta de dados (scraping)

**Escopo de coleta:**

- Selecionar de 5 a 10 aplicativos concorrentes/similares na categoria de organização
  pessoal/produtividade (definir lista com critérios objetivos: nº de downloads, nota média,
  relevância de mercado).
- Coletar reviews com **nota ≤ 3 estrelas** (negativos/neutros-negativos), pois concentram
  relatos de dor/fricção mais úteis para identificar melhorias.
- Aplicar filtro por relevância/data (ex.: reviews dos últimos 12–24 meses, ordenados por
  "mais relevantes" quando a fonte permitir).

**Ferramentas sugeridas:**

- Biblioteca `google-play-scraper` (Node.js/Python) para extração estruturada
  (app_id, score, texto, data, thumbsUp).
- Respeitar os Termos de Serviço do Google Play e da fonte de dados; documentar a
  metodologia de coleta (data, filtros, quantidade) para reprodutibilidade.
- Anonimizar identificadores de usuário (username) antes de qualquer publicação —
  tratar como dado sensível mesmo que público, por ética em pesquisa.

**Exemplo conceitual de parâmetros de busca/filtro:**

```
app_ids: [<lista de package names>]
lang: 'pt' (e 'en' se necessário)
score_filter: [1, 2, 3]
sort: MOST_RELEVANT
date_range: últimos 24 meses
```

### 3. Etapa 2 — Pré-processamento e análise

1. **Limpeza:** remoção de duplicatas, spam, reviews sem texto útil (< N caracteres).
2. **Categorização temática:** codificação aberta (open coding) ou uso de técnicas de NLP
   (ex.: LDA para tópicos, ou classificação manual com dupla codificação + teste de
   confiabilidade — Kappa de Cohen).
3. **Mapeamento com os gaps do Artigo 1:** verificar quais gaps teóricos aparecem
   confirmados empiricamente nos reviews (ex.: "notificações excessivas",
   "sincronização falha", "falta de personalização", "curva de aprendizado alta").
4. **Análise quantitativa:** frequência de menções por categoria, distribuição por
   app/concorrente, evolução temporal (se dados permitirem).

### 4. Etapa 3 — Grupo focal (ou metodologia complementar)

Usar os achados da mineração de reviews como **roteiro semiestruturado** do grupo focal,
aprofundando o "porquê" por trás das queixas quantitativas.

**Desenho sugerido:**

- 6 a 10 participantes por sessão, perfil de usuários reais/potenciais de apps de
  organização pessoal (recrutamento por conveniência ou amostragem intencional).
- Roteiro construído a partir das top-N categorias de queixa identificadas na Etapa 2.
- Gravação, transcrição e análise temática (Braun & Clarke) triangulando com os dados
  quantitativos dos reviews.
- Alternativas/complementos possíveis, caso o grupo focal seja inviável ou queira
  triangulação adicional: entrevistas semiestruturadas individuais, survey (questionário
  fechado com escala Likert) para validar quantitativamente as categorias emergentes,
  ou teste de usabilidade moderado com protótipo.

### 5. Estrutura sugerida do manuscrito (Artigo 2)

1. Introdução (conexão explícita com os gaps do Artigo 1)
2. Metodologia mista:
   - 2.1 Mineração de reviews (fonte, apps, filtros, volume de dados, ferramenta)
   - 2.2 Análise de conteúdo/categorização
   - 2.3 Grupo focal (protocolo, perfil de participantes, ética/consentimento)
3. Resultados quantitativos (frequência de categorias, gráficos)
4. Resultados qualitativos (temas do grupo focal, citações ilustrativas)
5. Triangulação (cruzamento review x grupo focal x literatura do Artigo 1)
6. Discussão — recomendações de melhoria priorizadas
7. Limitações e considerações éticas (dados públicos, anonimização, consentimento do
   grupo focal via TCLE)
8. Conclusão e aplicação prática — como os achados alimentam o backlog/roadmap do
   Organiza.aí

### 6. Do artigo à aplicação prática

Após a publicação/consolidação do Artigo 2, os achados priorizados devem ser convertidos em
itens de backlog rastreáveis (ver `ISSUES_GUIDE.md` e `ISSUES_BACKLOG_2026-09-08.md` neste
repositório), com cada melhoria referenciando o gap de origem (Artigo 1) e a evidência
empírica correspondente (categoria de review / achado do grupo focal), fechando o ciclo
pesquisa → produto.

---

## Checklist rápido de reprodutibilidade

- [ ] RQs e PICOC documentados antes da busca
- [ ] Strings de busca versionadas por base (IEEE, ScienceDirect, base extra)
- [ ] Critérios de inclusão/exclusão aplicados por ≥1 revisor, com log de decisões
- [ ] Planilha de extração de dados preenchida e auditável
- [ ] Script/parâmetros de scraping documentados (apps, filtros, datas, volume)
- [ ] Dados de reviews anonimizados antes de qualquer publicação
- [ ] Protocolo de grupo focal com TCLE e aprovação ética (se exigido pela instituição)
- [ ] Rastreabilidade gap (Artigo 1) → achado empírico (Artigo 2) → item de backlog
