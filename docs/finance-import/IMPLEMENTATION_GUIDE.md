# Guia de implementação: leitura de faturas orientada à intenção

> Especificação operacional anti-alucinação | PDF, PNG, JPEG e DOCX | Versão 1.0 · 15/11/2026
>
> **Regra do projeto:** todo agente (Claude Code, Antigravity, subagentes) trabalha na importação de faturas e no coach **somente** por este guia. Ver `CLAUDE.md`, seção "Regras de Sessao", item 14.
>
> **Estado do GATE 0 no Organiza AI:** feito em [`architecture-inventory.md`](architecture-inventory.md). Nele, KOF está confirmado como KofLang (`KOF_VERSION`, `backend/*.kf`, `kof build`), então a premissa da seção 0 ("não presumir KofLang") já foi verificada no repositório. O pipeline real fica em `backend/invoice.kf` (100% KOF); `scripts/parse_pdf.py` não faz parte do fluxo (o gate5 confere isso).

Objetivo: integrar extração e interpretação auditável de faturas a uma plataforma financeira com arquitetura denominada KOF, sem presumir que KOF seja uma linguagem ou framework específico.

## 0. Premissas e bloqueios de segurança

- KOF é tratado neste guia como nome da arquitetura orientada à intenção. A sintaxe, runtime, linguagem e convenções reais NÃO foram confirmados. Não gerar código .kf nem presumir KofLang antes de inspecionar o repositório.
- O fluxo deve funcionar sem LLM para extração, normalização, cálculos e reconciliação. IA generativa, se usada, apenas explica dados verificados.
- Bibliotecas open source não cobram por documento, mas infraestrutura, armazenamento, suporte e manutenção podem gerar custos. Conferir versões e licenças antes da adoção.
- Nunca assumir que texto extraído corresponde a transações corretas; todo dado deve preservar evidência e estado de validação.

## 1. Inventário obrigatório do projeto (GATE 0)

- Inspecionar package.json, pom.xml, build.gradle, requirements.txt, estrutura de pastas e arquivos de configuração existentes.
- Localizar implementação real do roteador de intenções, handlers, contratos, persistência, autenticação e upload.
- Identificar stack efetiva, padrões de erro, filas, testes e storage. Não criar uma segunda arquitetura paralela.
- Registrar em `docs/finance-import/architecture-inventory.md`: arquivos encontrados, evidências, lacunas e decisões.
- Se KOF não estiver documentado, pedir a definição e exemplos reais de duas intenções antes de escrever integração.

**Critério de saída:** existe um mapa rastreável de pontos de integração, com caminhos reais do repositório. Sem isso, parar antes de gerar código de integração.

## 2. Contrato de intenções (GATE 1)

- Definir intenções sem acoplá-las ao tipo de entrada: `IMPORTAR_DOCUMENTO_FINANCEIRO`, `CONFIRMAR_IMPORTACAO`, `CONSULTAR_GASTOS`, `ANALISAR_FATURA`, `SIMULAR_ECONOMIA`. O nome final deve seguir convenções já existentes.
- `IntentRequest { intent, userId, correlationId, parameters, attachmentIds? }`
- `IntentResult { status, data?, errors?, requiresConfirmation?, correlationId }`
- `IMPORTAR_DOCUMENTO_FINANCEIRO` recebe um identificador seguro de arquivo previamente carregado, não o conteúdo em texto dentro do prompt. O handler inicia extração, parsing e validação, devolvendo prévia com pendências.

**Critério de saída:** contratos tipados, validação de parâmetros, autorização por usuário e testes unitários de despacho.

## 3. Pipeline de importação (GATE 2)

1. Receber upload autenticado com limites configuráveis de tamanho, páginas e tempo; validar extensão E assinatura/MIME real; bloquear formatos inesperados.
2. Gerar identificador opaco, hash SHA-256, metadados mínimos e armazenamento temporário privado; proteger contra path traversal, zip bombs e arquivos maliciosos.
3. Detectar PDF com camada textual, PDF digitalizado, imagem ou DOCX. Não escolher OCR apenas pela extensão.
4. Extrair texto e estrutura de tabelas; para PDF sem texto útil, renderizar páginas e aplicar OCR; guardar referência à página/linha e bounding box quando disponível.
5. Normalizar números brasileiros, datas, sinais, parcelas e moeda. Preservar sempre valor original e texto bruto.
6. Classificar registros como transação, totalizador, saldo, pagamento, estorno, tarifa, juros ou informação não transacional.
7. Executar reconciliação e regras de confiança; mostrar prévia e solicitar correção humana para casos incertos.
8. Confirmar importação de forma idempotente; registrar trilha de auditoria e excluir temporários conforme política de retenção.

**Adaptadores sugeridos, sujeitos à stack confirmada:** Python: PyMuPDF/pdfplumber, python-docx, Tesseract via pytesseract. JVM: Apache PDFBox, Apache POI, Tess4J/Tesseract. Escolher uma trilha conforme o projeto existente. Para PDF digitalizado, OCR exige dependências de sistema e configuração de idioma português.

## 4. Modelo canônico de dados (GATE 3)

```
Document { id, userId, sha256, sourceType, statementPeriod?, currency, status }
Transaction { id, documentId, date?, descriptionRaw, descriptionNormalized?,
  amountMinor?, currency, direction?, kind, installment?, category?,
  confidence, evidence: { page?, row?, snippet?, box? }, reviewStatus }
ImportReview { documentId, extractedCount, warnings[], totals[],
  reconciled: boolean, confirmedByUser: boolean }
```

Usar inteiro de centavos ou decimal exato, nunca float binário para dinheiro. Campos desconhecidos devem permanecer null, não ser preenchidos por inferência. Cada transação precisa de evidência rastreável no documento.

## 5. Regras financeiras que não podem ser ignoradas

- Não somar automaticamente pagamento da fatura, compras, créditos e estornos como se fossem a mesma natureza de fluxo.
- Não confundir total da fatura com soma de todas as linhas extraídas: saldos anteriores, juros, parcelas e ajustes podem alterar a reconciliação.
- Distinguir data da compra, data do lançamento e vencimento; não inventar a data quando faltar.
- Tratar vírgula decimal, separador de milhar, valores negativos e moeda explicitamente.
- Detectar duplicatas por documento/hash e assinatura de transação, sem excluir automaticamente compras legítimas idênticas.
- Categoria inferida deve indicar origem da regra e permitir correção; estabelecimento não determina categoria com certeza absoluta.

## 6. Estados e tratamento de erros

```
RECEBIDO -> EM_PROCESSAMENTO -> EXTRAIDO -> EM_REVISAO
                             -> FALHA_EXTRACAO
EM_REVISAO -> CONFIRMADO -> IMPORTADO
EM_REVISAO -> CANCELADO
```

Erros tipados: `UNSUPPORTED_FORMAT`, `INVALID_FILE`, `OCR_UNAVAILABLE`, `EXTRACTION_TIMEOUT`, `PARSE_AMBIGUOUS`, `RECONCILIATION_FAILED`, `UNAUTHORIZED`, `DUPLICATE_DOCUMENT`. Falhas devem ser observáveis, sem expor dados bancários em logs.

## 7. Integração com voz e linguagem natural (GATE 4)

STT produz texto; resolvedor de intenção extrai operação e parâmetros; handler consulta apenas transações confirmadas. Se a pergunta depender de documento ausente, solicitar upload. A resposta educativa deve usar resultados numéricos calculados pelo backend e indicar período, filtros e limites dos dados.

```
Voz: "Quanto gastei em delivery em novembro?"
-> CONSULTAR_GASTOS {period: "2026-11", category: "delivery"}
-> consulta autorizada -> agregação exata -> explicação ao usuário
```

## 8. Testes obrigatórios e critérios de aceitação (GATE 5)

- Fixtures sintéticas, sem dados reais: PDF textual, PDF escaneado, JPEG, PNG e DOCX com tabelas.
- Casos difíceis: OCR parcial, imagem rotacionada, múltiplas páginas, valores negativos, parcelas, estorno, pagamentos, saldo anterior e fatura com divergência.
- Teste de segurança: arquivo renomeado com extensão falsa, arquivo corrompido, upload excessivo, acesso a documento de outro usuário, repetição do mesmo upload.
- Teste de idempotência: confirmar duas vezes não duplica transações.
- Teste de auditoria: cada valor importado tem trecho/página de origem.
- Teste de reconciliação: diferença fora da tolerância configurada impede confirmação automática.
- Teste anti-alucinação: campos não encontrados permanecem ausentes; o sistema não inventa receitas, gastos ou categorias.

**Critério de conclusão do MVP:** formatos suportados passam nas fixtures; cálculos são exatos; divergências são apresentadas; importações são autorizadas e idempotentes; nenhuma transação incerta é confirmada silenciosamente.

## 9. Plano incremental de entregas

1. PR 1: inventário de arquitetura e contratos de intenção, sem alterar produção.
2. PR 2: upload seguro e persistência temporária com testes.
3. PR 3: extração de PDF textual e DOCX com fixtures.
4. PR 4: OCR de PNG/JPEG e PDF escaneado, com timeouts.
5. PR 5: parser financeiro, evidências e normalização monetária.
6. PR 6: reconciliação, revisão humana e importação idempotente.
7. PR 7: consultas financeiras e conexão com STT/intenções.
8. PR 8: observabilidade, privacidade, testes E2E e rollout gradual.

## 10. Prompt operacional anti-alucinação para agente de programação

Você implementará a próxima etapa do importador financeiro.

1. Inspecione o repositório antes de propor alterações.
2. Não presuma que KOF é KofLang; descubra sua definição no projeto.
3. Cite caminhos reais e trechos de código existentes para justificar a integração.
4. Não invente APIs, pacotes, versões, endpoints ou resultados de testes.
5. Se uma dependência/sintaxe não puder ser verificada, marque NÃO VERIFICADO e pare.
6. Faça a menor mudança funcional possível, com testes automatizados.
7. Nunca use LLM para fabricar transações ou valores ausentes.
8. Mostre diff, comandos executados, resultados observados e limitações.
9. Não afirme "funciona" sem executar os testes relevantes.
10. Solicite aprovação antes de migrations destrutivas ou mudanças em produção.

## 11. Checklist de revisão de cada PR

- [ ] Mudança baseada em arquivos reais do repositório
- [ ] Dependências e licenças verificadas
- [ ] Dados financeiros com decimal exato e evidência
- [ ] Erros e limites de recursos tratados
- [ ] Testes executados e saída registrada
- [ ] Privacidade e autorização por usuário verificadas
- [ ] Nenhuma afirmação de sucesso sem prova
- [ ] Rollback ou plano de reversão documentado

## 12. Referências técnicas a verificar na implementação

Documentação oficial: pymupdf.readthedocs.io; pdfplumber (GitHub/jsvine/pdfplumber); python-docx.readthedocs.io; tesseract-ocr.github.io; pdfbox.apache.org; poi.apache.org; github.com/nguyenq/tess4j. Consultar documentação da versão instalada, não copiar assinaturas de memória.

> **Nota de escopo:** este guia é independente da linguagem e não contém código KOF executável, pois o significado e o runtime de KOF ainda não foram confirmados. Isso é uma proteção intencional contra geração de código fictício.
