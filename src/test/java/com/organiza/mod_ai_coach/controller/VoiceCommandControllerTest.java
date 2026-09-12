package com.organiza.mod_ai_coach.controller;

import com.organiza.mod_ai_coach.repository.ChatMessageEntityRepository;
import com.organiza.mod_ai_coach.service.KakeiboReflectionService;
import com.organiza.shared.security.CurrentUserService;
import com.organiza.shared.service.TierEnforcementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiAudioSpeechModel;
import org.springframework.ai.openai.OpenAiAudioTranscriptionModel;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class VoiceCommandControllerTest {

    @Mock
    private ChatMessageEntityRepository chatMessageRepository;

    @Mock
    private CurrentUserService currentUserService;

    @Mock
    private TierEnforcementService tierEnforcementService;

    @Mock
    private KakeiboReflectionService kakeiboReflectionService;

    @Mock
    private OpenAiAudioTranscriptionModel transcriptionModel;

    @Mock
    private OpenAiAudioSpeechModel speechModel;

    @Test
    void shouldAddKakeiboReflectionPromptWhenUserNeedsWeeklyReflection() throws Exception {
        ChatClient.Builder chatClientBuilder = org.mockito.Mockito.mock(ChatClient.Builder.class);
        ChatClient chatClient = org.mockito.Mockito.mock(ChatClient.class);

        when(chatClientBuilder.defaultSystem(anyString())).thenReturn(chatClientBuilder);
        when(chatClientBuilder.defaultToolNames(org.mockito.ArgumentMatchers.any(String[].class))).thenReturn(chatClientBuilder);
        when(chatClientBuilder.build()).thenReturn(chatClient);
        when(kakeiboReflectionService.shouldAskForReflection("u-1", LocalDate.now())).thenReturn(true);

        VoiceCommandController controller = new VoiceCommandController(
                new ByteArrayResource("system prompt".getBytes()),
                chatClientBuilder,
                transcriptionModel,
                speechModel,
                chatMessageRepository,
                currentUserService,
                tierEnforcementService,
                kakeiboReflectionService
        );

        Method method = VoiceCommandController.class.getDeclaredMethod("buildPromptForCurrentInteraction", String.class, String.class);
        method.setAccessible(true);

        String prompt = (String) method.invoke(controller, "u-1", "quero falar sobre gastos");

        assertTrue(prompt.contains("ATENÇÃO"));
        assertTrue(prompt.contains("Kakeibo"));
        assertTrue(prompt.contains("reflexivas"));
    }

    @Test
    void shouldStopPromptingAfterUserHasAnsweredThisWeeksReflection() throws Exception {
        ChatClient.Builder chatClientBuilder = org.mockito.Mockito.mock(ChatClient.Builder.class);
        ChatClient chatClient = org.mockito.Mockito.mock(ChatClient.class);

        when(chatClientBuilder.defaultSystem(anyString())).thenReturn(chatClientBuilder);
        when(chatClientBuilder.defaultToolNames(org.mockito.ArgumentMatchers.any(String[].class))).thenReturn(chatClientBuilder);
        when(chatClientBuilder.build()).thenReturn(chatClient);

        when(kakeiboReflectionService.shouldAskForReflection("u-1", LocalDate.now())).thenReturn(true, false);
        when(kakeiboReflectionService.recordReflection(eq("u-1"), anyList(), org.mockito.ArgumentMatchers.any(LocalDate.class)))
                .thenReturn(null);

        VoiceCommandController controller = new VoiceCommandController(
                new ByteArrayResource("system prompt".getBytes()),
                chatClientBuilder,
                transcriptionModel,
                speechModel,
                chatMessageRepository,
                currentUserService,
                tierEnforcementService,
                kakeiboReflectionService
        );

        Method method = VoiceCommandController.class.getDeclaredMethod("buildPromptForCurrentInteraction", String.class, String.class);
        method.setAccessible(true);

        String firstPrompt = (String) method.invoke(controller, "u-1", "quero falar sobre gastos");
        assertTrue(firstPrompt.contains("ATENÇÃO"));

        kakeiboReflectionService.recordReflection("u-1", List.of("gastos essenciais", "cultura", "gasto extra", "ajuste"), LocalDate.now());

        String secondPrompt = (String) method.invoke(controller, "u-1", "quero falar sobre gastos");
        assertFalse(secondPrompt.contains("ATENÇÃO"));
    }
}
