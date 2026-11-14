/*
 * Ponte Web Speech para a interface KOF.
 *
 * Fluxo: SpeechRecognition (pt-BR) -> evento input do KOF ->
 * ChatMessageRequest -> ChatReplyResponse -> SpeechSynthesis.
 * O token e a chamada HTTP continuam exclusivamente no cliente KOF; este
 * arquivo não lê nem armazena credenciais nem faz upload de áudio; o
 * reconhecimento segue a política e o mecanismo de fala do navegador.
 */
(() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const spokenReplies = new Set();
  let recognition = null;
  let listening = false;
  let speakNextReply = false;

  function mic() {
    return document.getElementById("chat-mic");
  }

  function setMicState(state) {
    const control = mic();
    if (!control) return;
    control.dataset.voiceState = state;
    control.setAttribute("aria-label", state === "listening" ? "Parar gravação de voz" : "Falar com Organiza AI");
    control.style.background = state === "listening" ? "rgba(0, 212, 255, .16)" : "transparent";
  }

  function unavailable(message) {
    const input = document.getElementById("chat-input");
    if (input) input.placeholder = message;
    setMicState("idle");
  }

  function sendTranscript(text) {
    const input = document.getElementById("chat-input");
    const form = document.getElementById("chat-form");
    if (!input || !form || !text) return;
    speakNextReply = true;
    input.value = text.trim();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  function stopRecognition() {
    if (recognition && listening) recognition.stop();
  }

  function startRecognition() {
    const control = mic();
    if (!control || control.disabled || control.getAttribute("disabled") !== null) return;
    if (!Recognition) {
      unavailable("Seu navegador não oferece reconhecimento de voz.");
      return;
    }
    if (listening) {
      stopRecognition();
      return;
    }
    recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => {
      listening = true;
      setMicState("listening");
    };
    recognition.onresult = (event) => {
      const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
      sendTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        unavailable("Permita o microfone para falar com o Organiza AI.");
      } else if (event.error !== "aborted") {
        unavailable("Não consegui entender. Tente falar novamente.");
      }
    };
    recognition.onend = () => {
      listening = false;
      setMicState("idle");
    };
    recognition.start();
  }

  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function readNewAssistantReplies() {
    const replies = document.querySelectorAll('[id^="chat-assistant-msg-"]');
    replies.forEach((reply) => {
      const text = reply.textContent.trim();
      if (text && !spokenReplies.has(text)) {
        spokenReplies.add(text);
        if (speakNextReply) {
          speakNextReply = false;
          speak(text);
        }
      }
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest ? event.target.closest("#chat-mic") : null;
    if (!target) return;
    event.preventDefault();
    startRecognition();
  }, true);

  new MutationObserver(readNewAssistantReplies).observe(document.documentElement, { childList: true, subtree: true });
})();
