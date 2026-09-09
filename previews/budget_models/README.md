# Prévia da tela de modelos de orçamento — issue #11

Tela em `kof.ui`, sem integração, autenticação ou persistência. As descrições
locais são conteúdo demonstrativo baseado no README e em `docs/DATA_MODEL.md`.
O selo **Ativo · exemplo** não representa um usuário real. Recarregar a página
restaura o exemplo inicial. Nenhum modelo é sugerido automaticamente.

Inclui seis modelos, seleção sem troca automática, confirmação e cancelamento,
aviso de conclusão dispensável e alternância entre temas claro e escuro.
O aviso explicita que a alteração não foi salva.

## Abrir

Requer Kof 0.3.2-beta (versão validada nesta entrega):

```powershell
kof version
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_budget_models_preview.ps1
python -m http.server 8765 --bind 127.0.0.1 --directory build/budget-models-preview
```

Abra `http://localhost:8765`. Encerre o servidor com Ctrl+C.

O script monta uma unidade de compilação isolada em `build/`, com o entrypoint
da prévia e a tela original. Não altera a inicialização do aplicativo nem os
arquivos JavaScript gerados. Acrescenta ao HTML gerado apenas idioma, viewport,
título e a folha de estilos da tela. Todos os widgets e eventos ficam em Kof.

## Referência visual e limites

- Paleta escura, fonte Manrope, botões de 48px e raio de 12px seguem `DESIGN_SYSTEM.md`.
- Tema claro e escolhas contornadas usam como referência os prints do artifact
  atualizado indicado no README. As cores claras são aproximações: os prints
  reduzidos não permitem recuperar os tokens exatos.
- A lista usa uma coluna no celular e duas em telas maiores.
- Manrope é carregada do Google Fonts; sem rede, usa a fonte de sistema.
- A confirmação é um painel na página. O aviso segue a superfície escura das
  notificações nos dois temas e permanece até ser fechado.
- Ainda falta comparação visual em navegador: nenhum estava disponível na sessão.

## Validação

Compilação KofJS e teste de interação sobre o módulo realmente gerado:

```powershell
npm install --prefix build/budget-models-test --no-package-lock --no-audit --no-fund jsdom@30.0.1
node scripts/test_budget_models_preview.mjs
```

Node/jsdom são usados somente para este teste de DOM; não são dependências do
frontend. O teste verifica seis modelos, seleção, cancelamento, confirmação,
aviso, temas e ausência de requisições e gravações em Web Storage. Não mede layout.

Na futura integração, substituir o conteúdo demonstrativo pelos dados da API,
carregar o modelo ativo autenticado e persistir apenas após confirmação.
