# MAIS CÍLIOS — Vercel + Neon PostgreSQL

O sistema tem frontend React/Vite e backend Express, publicados no **mesmo projeto da Vercel**. O banco é **PostgreSQL no Neon**, criado e conectado pela integração nativa da Vercel. Atendimentos, senhas, sessões e comissões ficam no PostgreSQL.

A aplicação usa `pg` com um pool de conexões e o gerenciamento de conexões de `@vercel/functions`, recomendado para Vercel Fluid compute. O banco é acessado exclusivamente pelo backend. A autenticação continua sendo a do aplicativo: contas `lais` e `duda`, senhas individuais e sessões no banco.

A aba **Minha agenda** permite consultar o calendário por dia, semana ou mês, criar horários manualmente e confirmar solicitações de retorno com data e horário definidos. É possível editar, remarcar, cancelar e excluir agendamentos. Duda acessa sua própria agenda; Laís pode gerenciar as duas profissionais. O banco impede horários confirmados duplicados para a mesma profissional.

A atualização cria a tabela `agenda_appointments` e seus índices automaticamente na inicialização, preservando os registros existentes. Não exige novas variáveis de ambiente; basta publicar esta versão. Cancelamentos e exclusões liberam o horário e devolvem a solicitação de retorno à situação de espera quando ela não tem outro agendamento confirmado.

## Criar e conectar o Neon pela Vercel

1. Crie/importe o projeto na Vercel, usando a raiz onde estão `package.json` e `vercel.json`. Se a primeira publicação ainda não tiver banco, o build pode concluir; a API só funcionará após conectar o Neon e republicar.
2. No painel do projeto, abra **Storage → Create Database** e selecione **Neon**. Também é possível começar pelo [Neon no Marketplace da Vercel](https://vercel.com/marketplace/neon).
3. Se você não tem conta Neon, escolha **Create New Neon Account**. A integração cria a conta/recurso para você e centraliza a administração e a cobrança pela Vercel.
4. Escolha o plano **Free**, a região próxima à aplicação e um nome para o banco. Confira os limites e o plano na tela de confirmação.
5. O sistema já tem login próprio. Os serviços opcionais **Neon Auth** e **Realtime** não são utilizados pelo código; você pode deixá-los desativados na criação.
6. Em **Connect to Project**, conecte o banco a este projeto e selecione os ambientes desejados, incluindo **Production**. Use os nomes padrão das variáveis, sem **Custom Prefix**.
7. A integração adiciona automaticamente `DATABASE_URL`, a conexão com pooling. O código também aceita `POSTGRES_URL` como alternativa para integrações antigas; `DATABASE_URL` tem prioridade. Nenhum token de API do Neon é necessário para a aplicação.
8. Em **Settings → Environment Variables**, adicione `SETUP_KEY`: um código secreto aleatório com pelo menos 32 caracteres, usado no cadastro inicial das senhas da equipe.
9. Faça um **Redeploy**. As novas variáveis só entram nas publicações criadas depois da conexão com o banco.
10. Abra `https://seu-projeto.vercel.app/api/health`. A resposta esperada é `{"ok":true}`; a rota inicializa as tabelas e verifica a conexão com PostgreSQL.
11. Abra o site, entre em **Acesso da Equipe** e cadastre as senhas de Laís e Duda usando o código de `SETUP_KEY`. Depois do cadastro, basta a senha individual para entrar.

Para gerar `SETUP_KEY` no seu computador:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Variáveis de ambiente

| Variável | Origem e uso |
| --- | --- |
| `DATABASE_URL` | Criada pela integração Neon; conexão PostgreSQL usada pela API |
| `POSTGRES_URL` | Alternativa opcional quando a integração disponibiliza apenas esse nome |
| `SETUP_KEY` | Configurada por você; protege o cadastro/redefinição da primeira senha |
| `PORT` | Opcional, somente para executar o servidor local; padrão `3000` |

Guarde as conexões e o código de configuração em segredo. Essas variáveis não devem começar com `VITE_` nem entrar no Git. `DATABASE_URL_UNPOOLED` pode ser fornecida pela integração para ferramentas que precisam de conexão direta, mas não é exigida pela aplicação. As antigas `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` podem ser removidas da Vercel: o código não as utiliza.

A integração cria uma conta Neon vinculada à Vercel, sem exigir cadastro manual separado. O armazenamento é operado pelo Neon; ele não passa a ser um banco executado dentro das funções da Vercel. Documentação: [integração gerenciada pela Vercel](https://neon.com/docs/guides/vercel-managed-integration).

## Planos gratuitos

O [Neon no Marketplace](https://vercel.com/marketplace/neon) oferece plano a partir de US$ 0, com limites de armazenamento, processamento e transferência. Confira os limites vigentes na contratação e em Storage → Usage; não considere o banco ilimitado. [Planos Neon](https://neon.com/pricing).

A hospedagem do aplicativo tem seu próprio plano. O Hobby gratuito da Vercel é destinado a uso pessoal e não comercial; para a operação do salão, considere um plano compatível, como Pro. [Preços Vercel](https://vercel.com/pricing), [termos da Vercel](https://vercel.com/legal/terms).

## Publicação e estrutura

```text
frontend/           Interface React, estilos, imagens e index.html
backend/            API Express, autenticação e consultas PostgreSQL
shared/             Tipos e catálogo usados por frontend e backend
api/index.ts        Entrada da API nas funções da Vercel
api/tsconfig.json   Configuração TypeScript da função
scripts/setup-db.ts  Inicialização manual opcional do banco
tests/              Testes de integração com PostgreSQL
vercel.json         Build e encaminhamento das rotas
package-lock.json   Versões usadas na instalação com npm ci
```

| Configuração na Vercel | Valor |
| --- | --- |
| Root Directory | Raiz do projeto (`.`), onde está `vercel.json` |
| Framework Preset | Vite |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

As dependências são instaladas na raiz. Se o projeto estiver em uma subpasta do repositório, selecione essa subpasta como Root Directory. O frontend usa `/api/...` no mesmo endereço; não precisa de URL de backend ou CORS separado.

No seu repositório existente, aplique esta versão, faça commit e push. Preserve a pasta `.git` do clone. Depois de conectar o repositório à Vercel, novos pushes na branch de produção publicam as mudanças automaticamente.

Também é possível publicar diretamente desta pasta, sem Git:

```bash
npm ci
npx vercel login
npx vercel link
```

Conecte o Neon ao projeto e configure `SETUP_KEY` no painel. Em seguida:

```bash
npx vercel --prod
```

Para Preview, ative **Create database branch for deployment → Preview** na conexão do Neon, ou use um banco de testes separado. Sem essa opção, ambientes podem compartilhar o mesmo banco. Configure `SETUP_KEY` nos ambientes em que a aplicação será executada e mantenha **Fluid compute** habilitado.

## Inicialização das tabelas e dados antigos

As tabelas e as duas contas são criadas automaticamente no primeiro acesso ao banco. A inicialização usa uma transação com bloqueio para evitar conflitos entre funções que iniciem simultaneamente. Reexecutar a inicialização preserva registros, senhas e sessões existentes.

Se quiser preparar o banco manualmente, configure `DATABASE_URL` no `.env` e execute:

```bash
npm run db:setup
```

Esta troca de código **não transfere dados de SQLite/Turso para PostgreSQL**. Esta pasta não contém banco local nem credenciais do ambiente anterior. Se você já tem dados em outro ambiente, exporte e converta os registros antes de mudar o endereço em uso. A aplicação não lê mais SQLite ou Turso e não cria um banco temporário quando falta configuração.

## Desenvolvimento local

Requer Node.js 22, npm e uma conexão PostgreSQL. Você pode usar uma branch Neon de desenvolvimento criada pela integração, ou um servidor PostgreSQL local.

```bash
npm ci
cp .env.example .env
```

Preencha `DATABASE_URL` no `.env` com a conexão do banco de desenvolvimento. Você pode obter a conexão no console Neon acessível por **Storage → seu banco → Open in Neon**. Para variáveis de Development que permitem leitura pela CLI, também pode usar `npx vercel env pull .env`; variáveis marcadas como Sensitive podem não ser retornadas por esse comando.

Opcionalmente, para criar um PostgreSQL local com Docker:

```bash
docker run --name maiscilios-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=maiscilios -p 127.0.0.1:5432:5432 -d postgres:18
```

Nesse caso, a conexão local é `postgresql://postgres:postgres@127.0.0.1:5432/maiscilios`. Use essas credenciais de exemplo apenas no ambiente local.

```bash
npm run dev
```

Abra `http://localhost:3000`. `SETUP_KEY` pode ficar vazio apenas em desenvolvimento. Em produção, a aplicação exige conexão PostgreSQL e um código de configuração válido. As conexões ao Neon usam TLS com verificação do certificado.

## Verificação

```bash
npm run typecheck
npm run build
```

Os testes de integração precisam de um PostgreSQL disponível, com conexão **direta**, permissão para criar schemas e `TEST_DATABASE_URL` configurada. Pode ser o servidor local acima ou uma branch exclusiva para testes no Neon; para Neon, use a conexão sem `-pooler` no hostname. Não é necessário instalar o Neon para testar SQL localmente.

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/maiscilios npm test
```

A suíte cria um schema com nome aleatório, usa esse schema nas conexões de teste e o remove ao terminar. Não modifica as tabelas do schema `public`. Ela verifica login, permissões, persistência entre processos, criação concorrente das tabelas, valores monetários com centavos, retornos, comissões e configuração de produção. Sem `TEST_DATABASE_URL`, a suíte informa a configuração necessária em vez de executar contra seu banco de produção.

`npm run preview` mostra somente o frontend compilado. Use `npm run dev` ou `npm start` para iniciar também a API.

## Diagnóstico

- **API responde 500:** confira se a integração conectou o banco ao ambiente correto e faça Redeploy. Os logs da função indicam falhas de conexão ou de inicialização.
- **DATABASE_URL ausente:** conecte o recurso Neon ao projeto sem Custom Prefix. Uma variável como `MYDB_DATABASE_URL` precisa ser disponibilizada com o nome padrão `DATABASE_URL` para este código.
- **Primeiro cadastro responde 403:** informe o código definido em `SETUP_KEY`, diferente da senha individual.
- **Dados antigos não aparecem:** PostgreSQL é outro banco; publicar o código não importa dados de SQLite/Turso.
- **API retorna HTML/404:** publique a raiz inteira, incluindo `api/`, `backend/`, `shared/` e `vercel.json`.

Referências técnicas: [Postgres na Vercel](https://vercel.com/docs/postgres), [conexões Neon na Vercel](https://neon.com/docs/guides/vercel-connection-methods), [pool de conexões nas funções](https://vercel.com/kb/guide/connection-pooling-with-functions), [node-postgres](https://node-postgres.com/).
