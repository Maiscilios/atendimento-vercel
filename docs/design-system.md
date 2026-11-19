# Identidade visual MAIS CÍLIOS

A paleta está centralizada no bloco `@theme` de `frontend/src/index.css`, usando o Tailwind CSS v4. As fontes Cormorant Garamond e Plus Jakarta Sans foram preservadas.

| Token | Cor | Uso |
| --- | --- | --- |
| `brand` | `#C084C6` | Ícones decorativos, detalhes de cards e bordas de seleção |
| `brand-strong` | `#78367E` | Ações principais, títulos e valores importantes |
| `brand-hover` | `#5E2965` | Hover das ações principais |
| `brand-soft` | `#F7EDF8` | Destaques suaves e ações secundárias |
| `brand-selected` | `#EEDCF0` | Opções e abas selecionadas |
| `background` | `#FCF8FD` | Fundo das páginas |
| `surface` | `#FFFFFF` | Cards, cabeçalhos, campos e modais |
| `border` | `#E8D6EB` | Bordas e divisórias |
| `text-primary` | `#322337` | Texto principal |
| `text-secondary` | `#6E5972` | Descrições e legendas |
| `placeholder` | `#7C6580` | Placeholders |

Use as classes de tokens, como `bg-background`, `text-text-secondary` e `border-brand`, em vez de novos valores HEX nos componentes.

Os estilos reutilizáveis ficam no mesmo CSS, em `@layer components`:

- `btn-primary`, `btn-secondary` e `btn-ghost` padronizam ações e hover.
- `btn-danger` e `btn-danger-solid` identificam ações destrutivas; `btn-success` e `btn-success-soft` identificam confirmações e ações de WhatsApp.
- `field-control` define fundo, borda, texto, placeholder, foco, campos inválidos e campos desabilitados. As dimensões continuam definidas em cada componente.
- `choice-selected` e `choice-idle` padronizam seleções; `tab-active` e `tab-idle` padronizam abas.
- `metric-card-featured`, `metric-card-accent` e `metric-value` estabelecem a hierarquia dos indicadores.
- `shadow-card` e `shadow-dialog` mantêm sombras discretas. `chart-grid` fornece as linhas auxiliares dos gráficos.

Sucesso usa `success`/`success-soft` (`#166534`/`#F0FDF4`), erro usa `error`/`error-soft` (`#9F1239`/`#FFF1F2`) e alerta usa `warning`/`warning-soft` (`#92400E`/`#FFFBEB`). Esses estados não devem ser convertidos em lilás.

`brand` tem contraste aproximado de 2,85:1 sobre branco: reserve-o para detalhes decorativos e bordas, evitando textos pequenos ou botões com texto branco. `brand-strong` sobre branco tem contraste aproximado de 7,99:1. O foco por teclado combina um contorno escuro visível com um halo lilás. Campos recebem texto de 16 px; grupos de filtros devem caber em telas de 320 px, com quebra de linha quando necessário.

O componente `ProductionChart` mantém produção em `brand-strong`, comissão em `brand`, seleção em `brand-selected`, grade em `border` e legendas em `text-secondary`. A série clara recebe contorno escuro. Seus cálculos e callbacks permanecem os mesmos; ele não está montado nos painéis atuais.
