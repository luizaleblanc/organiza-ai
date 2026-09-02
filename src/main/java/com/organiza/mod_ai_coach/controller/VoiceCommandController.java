package com.organiza.mod_ai_coach.controller;

import com.organiza.mod_ai_coach.model.ChatMessageEntity;
import com.organiza.mod_ai_coach.model.ChatRole;
import com.organiza.mod_ai_coach.repository.ChatMessageEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.ai.audio.transcription.AudioTranscriptionPrompt;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.InMemoryChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.openai.OpenAiAudioSpeechModel;
import org.springframework.ai.openai.OpenAiAudioSpeechOptions;
import org.springframework.ai.openai.OpenAiAudioTranscriptionModel;
import org.springframework.ai.openai.OpenAiAudioTranscriptionOptions;
import org.springframework.ai.openai.api.OpenAiAudioApi;
import org.springframework.ai.openai.audio.speech.SpeechPrompt;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.Charset;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/transactions")
public class VoiceCommandController {

    private static final int HISTORY_LIMIT = 20;

    private final ChatClient chatClient;
    private final OpenAiAudioTranscriptionModel transcriptionModel;
    private final OpenAiAudioSpeechModel speechModel;
    private final ChatMemory chatMemory;
    private final ChatMessageEntityRepository chatMessageRepository;
    private final CurrentUserService currentUserService;

    public VoiceCommandController(@Value("classpath:prompts/system-message.st") Resource systemPrompt,
                                   ChatClient.Builder chatClientBuilder,
                                   OpenAiAudioTranscriptionModel transcriptionModel,
                                   OpenAiAudioSpeechModel speechModel,
                                   ChatMessageEntityRepository chatMessageRepository,
                                   CurrentUserService currentUserService) throws IOException {
        this.transcriptionModel = transcriptionModel;
        this.speechModel = speechModel;
        this.chatMessageRepository = chatMessageRepository;
        this.currentUserService = currentUserService;
        // Cache em memória exigido pelo MessageChatMemoryAdvisor do Spring AI;
        // é ressincronizado com o banco a cada interação em syncChatMemoryFromDatabase.
        this.chatMemory = MessageWindowChatMemory.builder()
                .chatMemoryRepository(new InMemoryChatMemoryRepository())
                .maxMessages(HISTORY_LIMIT)
                .build();
        this.chatClient = chatClientBuilder
                .defaultSystem(systemPrompt.getContentAsString(Charset.defaultCharset()))
                .defaultToolNames("persistTransactionUseCase", "listTransactionsByCategoryUseCase", "getTotalByCategoryUseCase",
                        "registerIncomeFunction", "suggestModelChangeFunction", "getDailyPulseFunction", "getBalanceFunction")
                .build();
    }

    @PostMapping(value = "/ai", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = "audio/mpeg")
    public ResponseEntity<byte[]> processAudioCommand(
            @RequestParam("file") MultipartFile file) throws IOException {

        byte[] responseAudio = processVoiceCommand(file.getResource());
        return ResponseEntity.ok(responseAudio);
    }

    @PostMapping(value = "/ai-base64", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> processAiTransactionBase64(@RequestBody Map<String, String> payload) {
        try {
            String base64Audio = payload.get("audioBase64");

            byte[] audioBytes = Base64.getDecoder().decode(base64Audio);
            Resource audioResource = new ByteArrayResource(audioBytes) {
                @Override
                public String getFilename() {
                    return "voice-command.webm";
                }
            };

            byte[] responseAudio = processVoiceCommand(audioResource);
            String responseBase64 = Base64.getEncoder().encodeToString(responseAudio);

            return ResponseEntity.ok(Map.of("audioBase64", responseBase64));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Erro ao processar áudio: " + e.getMessage());
        }
    }

    private byte[] processVoiceCommand(Resource audioResource) {
        String userId = currentUserService.getCurrentUserId();

        var transcriptionOptions = OpenAiAudioTranscriptionOptions.builder()
                .language("pt")
                .build();
        var transcriptionPrompt = new AudioTranscriptionPrompt(audioResource, transcriptionOptions);
        String userText = transcriptionModel.call(transcriptionPrompt).getResult().getOutput();

        syncChatMemoryFromDatabase(userId);

        String promptPersonalizado = userText + " (Obrigatório: Responda em português do Brasil de forma amigável e natural informando o resultado da operação).";

        LocalDate hoje = LocalDate.now();
        String currentDate = hoje.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        String currentDayOfWeek = hoje.getDayOfWeek().getDisplayName(TextStyle.FULL, new Locale("pt", "BR"));

        String aiTextResponse = chatClient.prompt()
                .system(s -> s.param("currentDate", currentDate).param("currentDayOfWeek", currentDayOfWeek))
                .user(promptPersonalizado)
                .advisors(MessageChatMemoryAdvisor.builder(this.chatMemory).build())
                .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, userId))
                .call()
                .content();

        chatMessageRepository.save(new ChatMessageEntity(userId, ChatRole.USER, userText));
        chatMessageRepository.save(new ChatMessageEntity(userId, ChatRole.ASSISTANT, aiTextResponse));

        var speechOptions = OpenAiAudioSpeechOptions.builder()
                .model("tts-1")
                .voice(OpenAiAudioApi.SpeechRequest.Voice.NOVA)
                .responseFormat(OpenAiAudioApi.SpeechRequest.AudioResponseFormat.MP3)
                .speed(1.0f)
                .build();
        var speechPrompt = new SpeechPrompt(aiTextResponse, speechOptions);

        return speechModel.call(speechPrompt).getResult().getOutput();
    }

    /**
     * Recarrega o cache em memória do Spring AI a partir do banco antes de cada
     * interação, para que o histórico sobreviva a restarts do servidor.
     */
    private void syncChatMemoryFromDatabase(String userId) {
        List<ChatMessageEntity> recentMessagesDesc = chatMessageRepository.findTop20ByUserIdOrderByCreatedAtDesc(userId);

        List<Message> history = recentMessagesDesc.stream()
                .sorted((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()))
                .<Message>map(entity -> entity.getRole() == ChatRole.USER
                        ? new UserMessage(entity.getContent())
                        : new AssistantMessage(entity.getContent()))
                .toList();

        chatMemory.clear(userId);
        if (!history.isEmpty()) {
            chatMemory.add(userId, Collections.unmodifiableList(history));
        }
    }
}
