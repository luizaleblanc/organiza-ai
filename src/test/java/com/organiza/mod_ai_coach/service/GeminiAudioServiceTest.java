package com.organiza.mod_ai_coach.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import javax.sound.sampled.AudioSystem;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GeminiAudioServiceTest {
    private MockRestServiceServer server;
    private GeminiAudioService service;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        service = new GeminiAudioService(builder.baseUrl("https://generativelanguage.googleapis.com")
                .defaultHeader("x-goog-api-key", "test-key").build(), "gemini-2.5-flash-lite",
                "gemini-2.5-flash-preview-tts", "Kore");
    }

    @Test
    void transcribesWebmWithoutExecutingAudioInstructions() {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"))
                .andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", "test-key"))
                .andExpect(jsonPath("$.contents[0].parts[1].inlineData.mimeType").value("audio/webm"))
                .andExpect(jsonPath("$.contents[0].parts[1].inlineData.data").value("AQI="))
                .andExpect(jsonPath("$.generationConfig.temperature").value(0))
                .andRespond(withSuccess("""
                    {"candidates":[{"content":{"parts":[{"text":"hidden","thought":true},{"text":"Gastei dez reais."}]}}]}
                    """, MediaType.APPLICATION_JSON));
        assertThat(service.transcribe(new byte[]{1, 2}, "audio/webm;codecs=opus")).isEqualTo("Gastei dez reais.");
        server.verify();
    }

    @Test
    void returnsPlayableWavWithOriginalPcm() throws Exception {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"))
                .andExpect(jsonPath("$.generationConfig.responseModalities[0]").value("AUDIO"))
                .andExpect(jsonPath("$.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName").value("Kore"))
                .andRespond(withSuccess("""
                    {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16;rate=24000;codec=pcm","data":"AQIDBA=="}}]}}]}
                    """, MediaType.APPLICATION_JSON));
        try (var audio = AudioSystem.getAudioInputStream(new ByteArrayInputStream(service.speak("Registrado.")))) {
            assertThat(audio.getFormat().getSampleRate()).isEqualTo(24000);
            assertThat(audio.getFormat().getSampleSizeInBits()).isEqualTo(16);
            assertThat(audio.getFormat().getChannels()).isEqualTo(1);
            assertThat(audio.readAllBytes()).containsExactly(1, 2, 3, 4);
        }
        server.verify();
    }

    @Test
    void quotaIsReportedWithoutRetryingOrExposingProviderBody() {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("private-provider-details"));
        assertThatThrownBy(() -> service.transcribe(new byte[]{1}, "audio/wav"))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS))
                .hasMessageNotContaining("private-provider-details");
        server.verify();
    }

    @Test
    void rejectsUnsupportedAndEmptyInputBeforeCallingGemini() {
        assertThatThrownBy(() -> service.transcribe(new byte[]{1}, "text/plain")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.transcribe(new byte[0], "audio/wav")).isInstanceOf(IllegalArgumentException.class);
        server.verify();
    }

    @Test
    void blockedResponseDoesNotBecomeAnEmptyRecording() {
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"))
                .andRespond(withSuccess("{\"promptFeedback\":{\"blockReason\":\"SAFETY\"}}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> service.speak("Texto")).isInstanceOf(ResponseStatusException.class);
        server.verify();
    }
}
