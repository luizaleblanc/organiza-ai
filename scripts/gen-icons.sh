#!/usr/bin/env sh
# Gera os ícones do design system (artefato JVjueTmHeJsnHLsow3LDVb, objeto I)
# como arquivos .svg estáticos em frontend/assets/icons/<nome>-<tom>.svg.
# Paths, viewBox 0 0 24 24, stroke-width e linecap/linejoin copiados do artefato.
# "pulse" usa o path do ícone zap ("Seu pulso de hoje" no artefato Desktop).
# Uso: sh scripts/gen-icons.sh   (idempotente; rode após mudar paleta ou ícones)
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/frontend/assets/icons"
mkdir -p "$out"

tone_hex() {
  case "$1" in
    accent) echo "#00D4FF" ;; secondary) echo "#7B8EAD" ;; muted) echo "#4A5578" ;;
    primary) echo "#F0F0F0" ;; onaccent) echo "#06121C" ;; danger) echo "#FF4A6E" ;;
    warning) echo "#FFB800" ;; success) echo "#00E5A0" ;;
  esac
}

# nome|stroke-width|atributos extras do <svg>|corpo
icons='dash|2||<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/>
chat|2||<path d="M4 5h16v11H9l-5 4V5z" stroke-linejoin="round"/>
box|2||<path d="M3 8l9-5 9 5-9 5-9-5z" stroke-linejoin="round"/><path d="M3 8v8l9 5 9-5V8" stroke-linejoin="round"/>
bell|2||<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
gear|2||<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
warn|2| stroke-linecap="round"|<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
check|2.5| stroke-linecap="round"|<path d="M20 6 9 17l-5-5"/>
mic|2| stroke-linecap="round"|<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v3"/>
send|2.5||<path d="M5 12h14M13 6l6 6-6 6"/>
plus|2.2| stroke-linecap="round"|<path d="M12 5v14M5 12h14"/>
pulse|2.2| stroke-linecap="round" stroke-linejoin="round"|<path d="M13 2 3 14h8L9 22l12-12h-8L13 2z"/>'

n=0
for tone in accent secondary muted primary onaccent danger warning success; do
  hex="$(tone_hex "$tone")"
  printf '%s\n' "$icons" | while IFS='|' read -r name sw extra body; do
    printf '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="%s"%s>%s</svg>\n' \
      "$hex" "$sw" "$extra" "$body" > "$out/$name-$tone.svg"
  done
done
echo "ícones gerados em $out: $(ls "$out" | wc -l | tr -d ' ')"
