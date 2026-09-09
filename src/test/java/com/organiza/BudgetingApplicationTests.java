package com.organiza;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class BudgetingApplicationTests {
    @Autowired ApplicationContext context;
    @Autowired Environment environment;

    @Test
    void contextLoads() {
        assertThat(environment.getProperty("spring.ai.openai.base-url"))
                .isEqualTo("https://generativelanguage.googleapis.com");
        assertThat(environment.getProperty("spring.ai.openai.chat.completions-path"))
                .isEqualTo("/v1beta/openai/chat/completions");
        assertThat(context.containsBean("openAiAudioSpeechModel")).isFalse();
        assertThat(context.containsBean("openAiAudioTranscriptionModel")).isFalse();
    }

}
