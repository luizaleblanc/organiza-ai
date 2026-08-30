package com.organiza.shared.config;

import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.boot.web.client.RestClientCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

@Configuration
public class RestClientConfig {

    @Bean
    public RestClientCustomizer restClientCustomizer() {
        return builder -> builder.requestFactory(new HttpComponentsClientHttpRequestFactory(HttpClients.createDefault()));
    }
}
