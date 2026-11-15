# Inventário Arquitetural: Importação de Faturas e Roteamento de Intenções 100% em KOF (GATE 0)

> Documento gerado conforme a especificação **"Guia de implementação: leitura de faturas orientada à intenção — Especificação operacional anti-alucinação | PDF, PNG, JPEG e DOCX | Versão 1.0 · 15/11/2026"**.

---

## 1. Visão Geral da Arquitetura (KofLith)

O **Organiza AI** é construído como um monólito modular **KofLith** em **KofLang `0.6.6`** (definido em `KOF_VERSION`):
- **Backend JVM:** Arquivos `.kf` em `backend/` compilados juntos no pacote padrão para `build/organiza.jar` via `kof build backend --target jvm`, com interoperabilidade direta com a JDK 25 (`java.util.*`, `java.security.*`, `java.util.zip.*`, `javax.imageio.*`, `java.nio.*`).
- **Frontend Web:** Arquivos `.kf` em `frontend/` compilados para ES Modules (`build/web/Default.mjs`) via `kof build frontend --target js`, acoplados à ponte de voz e anexos `frontend/assets/voice_bridge.js`.
- **Persistência:** `kof.orm` em `backend/store.kf` com H2 em arquivo no ambiente local/dev (`jdbc:h2:file:./data/organiza;WRITE_DELAY=0`) e MySQL/MariaDB com TLS (`sslMode=trust` + `ANSI_QUOTES`) em produção. Valores monetários são armazenados estritamente em **centavos inteiros (`Long`)**.

---

## 2. Mapa de Componentes Reais do Repositório

| Camada | Arquivo / Diretório | Responsabilidade Atual | Evidência / Observações |
| :--- | :--- | :--- | :--- |
| **Versão da Linguagem** | `KOF_VERSION` | Fixa o compilador/runtime em `kof-0.6.6`. | Binário local em `build/kof-0.6.6-windows-x86_64/bin/kof.bat`. |
| **HTTP Server & Rotas** | `backend/main.kf` | Inicializa `kof.web`, aplica middleware JWT global em `/api/*`, gerencia `openDb()`, `ensureDb()` e expõe endpoints REST. | Rotas de documentos/faturas/intenções/chat ficam em `app.post("/api/...")` / `app.get("/api/...")`. |
| **Autenticação & Segurança** | `backend/auth.kf` | Validação JWT HMAC-SHA256 (`jwt.verify`), rate limiting e extração segura de `currentUserId()` sempre a partir do claim `sub` do token. | Qualquer rota `/api/*` fora de `publicApiPaths()` exige token válido (401 sem token). |
| **Pipeline de Faturas & Intenções** | `backend/invoice.kf` | **(Alvo principal dos Gates 1, 2 e 3)** Validação binária (magic bytes), SHA-256, extratores 100% KOF (PDF `/FlateDecode` + `/ToUnicode` CMap, DOCX XML ZIP, PNG/JPEG `ImageIO` + OCR nativo Windows), modelo canônico em centavos, reconciliação, registro por `documentId`, máquina de estados e despachante de intenções (`IntentRequest` -> `IntentResult`). | Substitui integralmente o antigo helper Python `scripts/parse_pdf.py` (`parsePdfViaAgent` removido). |
| **Coach Determinístico & Voz** | `backend/coach.kf` | Regras financeiras determinísticas (pulso diário, saldo de buckets, Kakeibo, fluxo em 3 passos com tom de voz da marca e resolvedor de perguntas em linguagem natural sobre gastos). | Opera com **zero tokens de LLM**. |
| **Coach LLM (Opcional)** | `backend/coach_llm.kf` | Integração opcional com OpenAI (`OPENAI_API_KEY`) com 8 tools e memória das últimas 20 mensagens. Quando desligada, usa 100% `coachReplyOffline`. | Nunca recebe documento bruto; apenas consultas/ações explícitas. |
| **Modelos e DTOs** | `backend/models.kf` | Enums (`Category`, `Bucket`, `Source`, `BudgetModelType`, `ChatRole`, etc.), entidades de domínio e conversão segura reais <-> centavos (`toCents`, `centsToReais`). | DTOs de saída serializam enums como `String` (por conta do comportamento de `json.encode` em enums do Kof 0.6.6). |
| **Serviços & Transações** | `backend/services.kf` | Persistência atômica de transações e débito de caixinhas (`persistTransactionAmount`, `confirmInvoiceItems`), limites por plano (`TierEnforcementService`) e validação de lote de fatura. | Blocos `transaction {}` isolados em funções próprias sem `try` externo (contorno conhecido do `COMP002` no Kof 0.6.6). |
| **Persistência ORM** | `backend/store.kf` | Entidades `UserRow`, `TransactionRow`, `EnvelopeRow`, `ChatMessageRow`, `VariableIncomeRow`, `KakeiboReflectionRow`, `NotificationRow`, `PasswordResetRow`, `EmailLogRow`, `PreferenceRow`. | Controle de concorrência com canal `DbConn.lock` e valores em `amountCents: Long`. |
| **Visão Geral & Formatação** | `backend/overview.kf` | `formatBrl(Long cents)`, dashboard agregado por período, overview de caixinhas (`EM_DIA`/`ALERTA`/`ESTOURADA`), chips e notificações diárias. | Base para o cálculo de métricas sem alucinação numérica. |
| **Interface Web KOF** | `frontend/screens/chat_screen.kf` | Tela do chat Organiza AI, histórico paginado, composer com botão de anexo (`#chat-attach`), microfone (`#chat-mic`), envio (`#chat-send`) e bolha `... pensando`. | Compilado para `build/web/Default.mjs`. |
| **Ponte Web Speech & Upload** | `frontend/assets/voice_bridge.js` | Captura Web Speech (`pt-BR`), leitura em base64 do anexo, travas contra upload duplicado, bolha `#chat-ocr-thinking`, chamada ao backend para extração e envio de confirmação apenas após o "Sim" do usuário. | Não envia conteúdo bruto de documento para nenhum LLM; aciona apenas rotas `/api/*` autenticadas. |
| **Testes Automatizados** | `tests/parity_test.kf`, `scripts/test_e2e_flow.ps1`, `scripts/test_gate5_finance_import.ps1` | Suíte de paridade unitária em KOF (`kof test`) e testes E2E HTTP/OCR/Segurança contra o servidor ativo. | Valida regressão funcional, segurança anti-IDOR, idempotência e aderência anti-alucinação. |

---

## 3. Gaps Identificados no Estado Anterior e Decisões Aplicadas

| Gap Encontrado Antes da Implementação | Decisão Arquitetural Adotada (Gates 1 a 5) |
| :--- | :--- |
| **Dependência de Python em tempo de execução:** `backend/invoice.kf` chamava `python scripts/parse_pdf.py` via `parsePdfViaAgent`. | **100% KOF:** Removido `parsePdfViaAgent` de `backend/invoice.kf`. Toda a descompressão PDF `/FlateDecode`, decodificação `/ToUnicode` CMap (`beginbfchar`/`beginbfrange`), leitura de DOCX (`ZipInputStream` em `word/document.xml`), validação de imagens (`ImageIO.read`), leitura de chunks PNG e acionamento direto com timeout do OCR nativo Windows (`OcrEngine`) rodam diretamente em KOF na JVM. |
| **Ausência de validação binária rigorosa (Magic Bytes vs Extensão):** `parseInvoicePdf` fazia fallback para `pdf.split("\n")` mesmo quando um arquivo falso era renomeado para `.pdf` ou `.png`. | Validação estrita de extensão + assinatura binária (`%PDF-`, `\x89PNG\r\n\x1a\n`, `\xFF\xD8\xFF`, `PK\x03\x04` com `word/document.xml`). Discrepância ou arquivo corrompido gera erro tipado `INVALID_FILE` ou `UNSUPPORTED_FORMAT` (HTTP 400). |
| **Ausência de `documentId` opaco, hash `sha256` e máquina de estados:** Upload retornava apenas `streams`, `text`, `transactions`. | Introduzidos `CanonicalDocument`, `CanonicalTransaction`, `CanonicalEvidence(page, row, snippet, box)`, `CanonicalTotal`, `ImportReview` e `InvoiceRegistry` com hash SHA-256, detecção de duplicidade (`DUPLICATE_DOCUMENT`), isolamento por `userId` (anti-IDOR -> HTTP 403 `UNAUTHORIZED`) e estados `RECEBIDO -> EM_PROCESSAMENTO -> EXTRAIDO -> EM_REVISAO -> CONFIRMADO -> IMPORTADO`. |
| **Falta de idempotência na confirmação em lote:** Reenviar `POST /api/invoices/confirm` com os mesmos itens podia gravar transações duplicadas. | Controle idempotente por `(userId, documentId)` e por `(userId, batchSha256)` garantindo que confirmações repetidas devolvam exatamente os registros já persistidos sem duplicar linhas nem saldos nas caixinhas. |
| **Ausência de roteador tipado de intenções financeiras (`Gate 1`):** As ações estavam acopladas a texto livre no chat. | Criados `IntentRequest`, `IntentResult`, `dispatchFinanceIntent` e a rota autenticada `POST /api/intents/dispatch` suportando `IMPORTAR_DOCUMENTO_FINANCEIRO`, `CONFIRMAR_IMPORTACAO`, `CONSULTAR_GASTOS`, `ANALISAR_FATURA` e `SIMULAR_ECONOMIA` com consumo zero de tokens de LLM. |
| **Risco de classificação sem comprovação ou soma dupla:** Itens como pagamento de fatura (`PAYMENT`), transferências internas (`INTERNAL_TRANSFER`) e Pix para pessoa física (`PIX_PF`) podiam ser tratados como moradia ou compras comuns. | Classificação explícita por `kind` (`TRANSACTION`, `TOTAL`, `BALANCE`, `PAYMENT`, `REFUND`, `FEE`, `INTEREST`, `INTERNAL_TRANSFER`), reconciliação em centavos (`Long`) e marcação obrigatória `NEEDS_REVIEW` para `PAYMENT` e `PIX_PF`. |
