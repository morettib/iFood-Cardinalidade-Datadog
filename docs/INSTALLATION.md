# Instalação e desenvolvimento

## Instalar no Cribl

Baixe `releases/ifood-kubernetes-pov-0.3.1.tgz` e importe o pacote pela área de Apps da sua organização Cribl. Revise as permissões declaradas em `config/policies.yml` antes de compartilhar o app.

SHA-256 do pacote publicado:

```text
a254127059d1f3592aaf0b98291c3a29ce1cab60bb26f41d7688bb5b676491dc
```

Consulte o README para datasets, saved search, permissões Datadog e referências aos secrets resolvidos no Stream. O repositório não fornece as credenciais nem provisiona automaticamente esses recursos.

## Desenvolvimento

Use Node.js compatível com os requisitos de Vite e TypeScript registrados no lockfile.

```sh
npm ci
npm test
npm run build
npm run dev
```

O preview local depende da integração com a plataforma Cribl para APIs e autenticação. Consulte `AGENTS.md` para os contratos da plataforma.

## Empacotamento

Para reproduzir a versão atual sem incrementar o número:

```sh
npm run package -- --version 0.3.1
node scripts/verify-package.mjs
```

`npm run package` sem argumentos incrementa a versão patch. Os pacotes gerados ficam em `build/`, ignorado pelo Git; o pacote desta publicação está em `releases/`.

## Testes

```sh
npm test
npm run test:ui
```

Os testes de navegador usam a configuração em `tests/browser.config.ts` e precisam do navegador previsto nela. O catálogo de cenários está em `tests/test-catalog.yaml`. Na publicação 0.3.1, os 73 testes Vitest passaram e o pacote passou nas verificações de metadados, permissões, documentação e padrões de credenciais.
