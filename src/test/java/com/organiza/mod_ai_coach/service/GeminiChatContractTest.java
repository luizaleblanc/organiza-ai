package com.organiza.mod_ai_coach.service;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GeminiChatContractTest {
    static class BalanceTool {
        int calls;
        @Tool(description = "Consulta o saldo de exemplo")
        public String balance() { calls++; return "20 reais"; }
    }

    @Test
    void sendsToolsToGoogleAndReturnsToolResultToTheModel() throws Exception {
        var properties = PropertiesLoaderUtils.loadProperties(new ClassPathResource("application.properties"));
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var api = OpenAiApi.builder().baseUrl(properties.getProperty("spring.ai.openai.base-url"))
                .completionsPath(properties.getProperty("spring.ai.openai.chat.completions-path"))
                .apiKey("test-key").restClientBuilder(builder).build();
        var model = OpenAiChatModel.builder().openAiApi(api).defaultOptions(OpenAiChatOptions.builder()
                .model(properties.getProperty("spring.ai.openai.chat.options.model")).build()).build();
        String url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        server.expect(requestTo(url)).andExpect(header("Authorization", "Bearer test-key"))
                .andExpect(jsonPath("$.model").value("gemini-2.5-flash-lite"))
                .andExpect(jsonPath("$.tools[0].function.name").value("balance"))
                .andRespond(withSuccess("""
                    {"id":"one","object":"chat.completion","created":1,"model":"gemini-2.5-flash-lite",
                    "choices":[{"index":0,"finish_reason":"tool_calls","message":{"role":"assistant","content":null,
                    "tool_calls":[{"id":"call_1","type":"function","function":{"name":"balance","arguments":"{}"}}]}}]}
                    """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(url)).andExpect(jsonPath("$.messages[2].role").value("tool"))
                .andExpect(jsonPath("$.messages[2].tool_call_id").value("call_1"))
                .andRespond(withSuccess("""
                    {"id":"two","object":"chat.completion","created":2,"model":"gemini-2.5-flash-lite",
                    "choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"Seu saldo é 20 reais."}}]}
                    """, MediaType.APPLICATION_JSON));
        var tool = new BalanceTool();
        assertThat(ChatClient.create(model).prompt().user("Qual meu saldo?").tools(tool).call().content())
                .isEqualTo("Seu saldo é 20 reais.");
        assertThat(tool.calls).isEqualTo(1);
        server.verify();
    }
}
