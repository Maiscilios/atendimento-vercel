# Identidade visual MAIS CÍLIOS

A paleta está centralizada no bloco `@theme` de `frontend/src/index.css`, usando o Tailwind CSS v4. As fontes Cormorant Garamond e Plus Jakarta Sans foram preservadas.

| Token | Cor | Uso |
| --- | --- | --- |
| `brand` | `#ff1d8d` | Cor primária: ações principais, ícones, detalhes de cards e bordas de seleção |
| `brand-strong` | `#B80B61` | Títulos, valores importantes e indicadores de seleção |
| `brand-hover` | `#FF4DA6` | Hover das ações principais |
| `on-brand` | `#33071F` | Texto e ícones sobre a cor primária |
| `brand-soft` | `#FFF0F7` | Destaques suaves e ações secundárias |
| `brand-selected` | `#FFE0EF` | Opções e abas selecionadas |
| `background` | `#FFF7FB` | Fundo das páginas |
| `surface` | `#FFFFFF` | Cards, cabeçalhos, campos e modais |
| `border` | `#F2CDDD` | Bordas e divisórias |
| `text-primary` | `#35212C` | Texto principal |
| `text-secondary` | `#765366` | Descrições e legendas |
| `placeholder` | `#806270` | Placeholders |

Use as classes de tokens, como `bg-background`, `text-text-secondary` e `border-brand`, em vez de novos valores HEX nos componentes.

Os estilos reutilizáveis ficam no mesmo CSS, em `@layer components`:

- `btn-primary`, `btn-secondary` e `btn-ghost` padronizam ações e hover.
- `btn-danger` e `btn-danger-solid` identificam ações destrutivas; `btn-success` e `btn-success-soft` identificam confirmações e ações de WhatsApp.
- `field-control` define fundo, borda, texto, placeholder, foco, campos inválidos e campos desabilitados. As dimensões continuam definidas em cada componente.
- `choice-selected` e `choice-idle` padronizam seleções; `tab-active` e `tab-idle` padronizam abas.
- `metric-card-featured`, `metric-card-accent` e `metric-value` estabelecem a hierarquia dos indicadores.
- `shadow-card` e `shadow-dialog` mantêm sombras discretas. `chart-grid` fornece as linhas auxiliares dos gráficos.

Sucesso usa `success`/`success-soft` (`#166534`/`#F0FDF4`), erro usa `error`/`error-soft` (`#9F1239`/`#FFF1F2`) e alerta usa `warning`/`warning-soft` (`#92400E`/`#FFFBEB`). Esses estados mantêm suas cores semânticas para serem distinguíveis da marca.

`brand` tem contraste aproximado de 3,61:1 sobre branco: use `brand-strong` para textos pequenos em superfícies claras e `on-brand` para textos nos botões primários. `brand-strong` sobre branco tem contraste aproximado de 6,44:1. O foco por teclado combina um contorno escuro visível com um halo rosa. Campos recebem texto de 16 px; grupos de filtros devem caber em telas de 320 px, com quebra de linha quando necessário.

O componente `ProductionChart` mantém produção em `brand-strong`, comissão em `brand`, seleção em `brand-selected`, grade em `border` e legendas em `text-secondary`. A série clara recebe contorno escuro. Seus cálculos e callbacks permanecem os mesmos; ele não está montado nos painéis atuais.
