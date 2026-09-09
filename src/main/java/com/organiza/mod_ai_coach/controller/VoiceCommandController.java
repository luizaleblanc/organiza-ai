package com.organiza.mod_ai_coach.controller;

import com.organiza.mod_ai_coach.model.ChatMessageEntity;
import com.organiza.mod_ai_coach.model.ChatRole;
import com.organiza.mod_ai_coach.repository.ChatMessageEntityRepository;
import com.organiza.shared.exception.TierLimitExceededException;
import com.organiza.shared.security.CurrentUserService;
import com.organiza.shared.service.TierEnforcementService;
import com.organiza.mod_ai_coach.service.GeminiAudioService;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.InMemoryChatMemoryRepository;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/coach")
@SuppressWarnings("null")
public class VoiceCommandController {

    private static final int HISTORY_LIMIT = 20;

    private final ChatClient chatClient;
    private final GeminiAudioService audioService;
    private final ChatMemory chatMemory;
    private final ChatMessageEntityRepository chatMessageRepository;
    private final CurrentUserService currentUserService;
    private final TierEnforcementService tierEnforcementService;

    public VoiceCommandController(@Value("classpath:prompts/system-message.st") Resource systemPrompt,
                                   ChatClient.Builder chatClientBuilder,
                                   GeminiAudioService audioService,
                                   ChatMessageEntityRepository chatMessageRepository,
                                   CurrentUserService currentUserService,
                                   TierEnforcementService tierEnforcementService) throws IOException {
        this.audioService = audioService;
        this.chatMessageRepository = chatMessageRepository;
        this.currentUserService = currentUserService;
        this.tierEnforcementService = tierEnforcementService;
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

    @PostMapping(value = "/ai", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = "audio/wav")
    public ResponseEntity<byte[]> processAudioCommand(
            @RequestParam("file") MultipartFile file) throws IOException {

        byte[] responseAudio = processVoiceCommand(file.getBytes(),
                file.getContentType() == null ? "audio/webm" : file.getContentType());
        return ResponseEntity.ok(responseAudio);
    }

    @PostMapping(value = "/ai-base64", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> processAiTransactionBase64(@RequestBody Map<String, String> payload) {
        try {
            String base64Audio = payload.get("audioBase64");
            if (base64Audio == null || base64Audio.length() > 14_000_000) {
                throw new IllegalArgumentException("Áudio base64 ausente ou muito grande.");
            }

            byte[] audioBytes = Base64.getDecoder().decode(base64Audio);
            byte[] responseAudio = processVoiceCommand(audioBytes, payload.getOrDefault("mimeType", "audio/webm"));
            String responseBase64 = Base64.getEncoder().encodeToString(responseAudio);

            return ResponseEntity.ok(Map.of("audioBase64", responseBase64, "mimeType", "audio/wav"));
        } catch (TierLimitExceededException e) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", e.getMessage()));
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).body(Map.of("error", e.getReason()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Áudio ou base64 inválido."));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body("Erro ao processar áudio. Tente novamente mais tarde.");
        }
    }

    private byte[] processVoiceCommand(byte[] audio, String mimeType) {
        tierEnforcementService.enforceVoiceAllowed();
        tierEnforcementService.enforceCanSendMessage();

        String userId = currentUserService.getCurrentUserId();

        String userText = audioService.transcribe(audio, mimeType);

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

        return audioService.speak(aiTextResponse);
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
