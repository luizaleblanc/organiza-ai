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
  let authorization = "";

  // A ponte carrega antes do modulo KOF e observa somente o cabecalho usado
  // nas chamadas same-origin. O token fica em memoria e nunca e persistido.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const options = init || {};
    const source = options.headers || (input instanceof Request ? input.headers : undefined);
    if (source) {
      const header = new Headers(source).get("Authorization");
      if (header) authorization = header;
    }
    return nativeFetch(input, init);
  };

  function mic() {
    return document.getElementById("chat-mic");
  }

  function setMicState(state) {
    const control = mic();
    if (!control) return;
    control.dataset.voiceState = state;
    control.setAttribute("aria-label", state === "listening" ? "Parar gravação de voz" : "Falar com Organiza AI");
    control.style.boxShadow = state === "listening" ? "0 0 0 4px rgba(0, 212, 255, .18)" : "none";
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

  function setAttachmentStatus(message, kind) {
    const form = document.getElementById("chat-form");
    if (!form || !form.parentElement) return;
    let status = document.getElementById("chat-attachment-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "chat-attachment-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      status.style.fontSize = ".8125rem";
      status.style.padding = "0 8px";
      status.style.alignSelf = "flex-start";
      form.parentElement.appendChild(status);
    }
    status.style.color = kind === "error" ? "#FF4A6E" : kind === "success" ? "#00E5A0" : "#7B8EAD";
    status.textContent = message;
  }

  function fileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read"));
      reader.onload = () => {
        const encoded = String(reader.result || "");
        const comma = encoded.indexOf(",");
        resolve(comma >= 0 ? encoded.substring(comma + 1) : encoded);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadInvoice(file) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setAttachmentStatus("Envie uma fatura em PDF.", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAttachmentStatus("O PDF deve ter no maximo 2 MB.", "error");
      return;
    }
    if (!authorization) {
      setAttachmentStatus("A sessao ainda esta carregando. Tente novamente em instantes.", "error");
      return;
    }
    setAttachmentStatus(`Analisando ${file.name}...`, "loading");
    try {
      const fileBase64 = await fileAsBase64(file);
      const response = await nativeFetch("/api/invoices/parse", {
        method: "POST",
        headers: { "Authorization": authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || "Nao foi possivel analisar a fatura.");
      }
      const count = Array.isArray(payload.transactions) ? payload.transactions.length : 0;
      const suffix = count === 1 ? "lancamento identificado" : "lancamentos identificados";
      setAttachmentStatus(`${file.name}: ${count} ${suffix}.`, "success");
    } catch (error) {
      setAttachmentStatus(error.message || "Nao foi possivel analisar a fatura.", "error");
    }
  }

  function chooseInvoice() {
    const control = document.getElementById("chat-attach");
    if (!control || control.disabled || control.getAttribute("disabled") !== null) return;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "application/pdf,.pdf";
    picker.hidden = true;
    picker.addEventListener("change", async () => {
      await uploadInvoice(picker.files && picker.files[0]);
      picker.remove();
    });
    document.body.appendChild(picker);
    picker.click();
  }

  document.addEventListener("click", (event) => {
    const voiceTarget = event.target.closest ? event.target.closest("#chat-mic") : null;
    if (voiceTarget) {
      event.preventDefault();
      startRecognition();
      return;
    }
    const attachTarget = event.target.closest ? event.target.closest("#chat-attach") : null;
    if (attachTarget) {
      event.preventDefault();
      chooseInvoice();
    }
  }, true);

  new MutationObserver(readNewAssistantReplies).observe(document.documentElement, { childList: true, subtree: true });
})();
