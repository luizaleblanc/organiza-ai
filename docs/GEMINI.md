# Gemini Developer API

O coach usa exclusivamente o Google Gemini. Crie uma chave no
[Google AI Studio](https://aistudio.google.com/apikey) e configure `GEMINI_API_KEY`
no `.env` local ou nas variáveis do deploy. Não coloque a chave no frontend.
`OPENAI_API_KEY` não é mais utilizada.

Os padrões são `gemini-2.5-flash-lite` para conversa/transcrição e
`gemini-2.5-flash-preview-tts` com voz `Kore` para síntese. Podem ser alterados
pelas variáveis `GEMINI_CHAT_MODEL`, `GEMINI_AUDIO_MODEL`, `GEMINI_SPEECH_MODEL`
e `GEMINI_SPEECH_VOICE` do `.env.example`.

Esses modelos têm cota gratuita na tabela do Google consultada em 09/09/2026.
Use um projeto no Free Tier, sem ativar faturamento para este experimento.
Gratuidade da API não depende de assinatura estudantil do aplicativo Gemini e
não significa uso ilimitado. Cotas variam por projeto/modelo; não existe fallback
para OpenAI ou para modelos pagos. No tier gratuito, os dados podem ser usados
pelo Google para melhorar produtos: use dados fictícios nos estudos.
Confira [preços](https://ai.google.dev/gemini-api/docs/pricing) e limites no AI Studio.

## Implementação

O starter `spring-ai-starter-model-openai` permanece como adaptador de protocolo
compatível, mantendo Spring AI 1.0.8, histórico e tool calling existentes.
O host é `generativelanguage.googleapis.com`, e o caminho do chat é
`/v1beta/openai/chat/completions`. O nome `spring.ai.openai` nas propriedades
descreve o adaptador, não o fornecedor nem a chave. Os modelos automáticos de
áudio, imagem, embedding e moderação desse starter estão desativados.
Ver [compatibilidade oficial](https://ai.google.dev/gemini-api/docs/openai).

`GeminiAudioService` usa `generateContent` para transcrição e síntese, com timeout
de conexão de 10s e leitura de 90s. Não repete automaticamente as chamadas de
áudio. Cota excedida retorna HTTP 429; falhas do fornecedor não expõem seu corpo
de resposta. O chat mantém as políticas de retry existentes do Spring AI.

## Contrato de voz

- `POST /api/coach/ai`: multipart `file`; saída agora é **audio/wav**, não MP3.
- `POST /api/coach/ai-base64`: recebe `audioBase64` e `mimeType` opcional
  (padrão `audio/webm`, preservando as gravações anteriores).
- Resposta JSON: `audioBase64` e `mimeType: "audio/wav"`. Clientes devem usar
  esse MIME ao montar o áudio, sem fixar `audio/mpeg`.
- Entrada aceita WAV, MP3/MPEG, AIFF, AAC, OGG, FLAC, M4A e WebM. O serviço
  limita a entrada a 10 MB; limites multipart do servidor também se aplicam.
- A saída PCM mono de 24 kHz / 16 bits do Gemini é encapsulada em WAV usando
  Java Sound, sem serviço pago de conversão.

Referências: [transcrição](https://ai.google.dev/gemini-api/docs/generate-content/audio)
e [síntese](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

## Validar

`./gradlew test` executa testes sem chave real e sem chamadas ao Google.
Para um teste real, configure a chave, inicie o backend e use as rotas de voz
com usuário autenticado e plano que permita voz. As regras de plano do Organiza
IA permanecem iguais; elas são independentes do Free Tier do fornecedor.
