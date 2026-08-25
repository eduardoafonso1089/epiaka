# Reinstalação local do Poligome no Windows

Este guia descreve como recriar o ambiente local e iniciar a aplicação no
Windows. Execute os comandos no PowerShell ou Prompt de Comando.

## Requisitos

- Git
- Node.js 22.13 ou superior
- npm

Confirme as versões:

```powershell
git --version
node --version
npm.cmd --version
```

## Instalação normal

```powershell
cd C:\Users\Administrador\Documents\personal
git clone https://github.com/eduardoafonso1089/poligome.git
cd poligome
npm.cmd ci
```

`npm ci` instala exatamente as versões registradas no `package-lock.json`.
O diretório `node_modules` não faz parte do Git e precisa ser recriado depois
de um clone novo.

## Alternativa para erro de certificado ou HTTP 403

Nesta rede, o registro oficial do npm pode retornar
`UNABLE_TO_VERIFY_LEAF_SIGNATURE` ou bloquear um tarball com HTTP 403. Use o
espelho somente para essa execução:

```powershell
npm.cmd ci --registry=https://registry.npmmirror.com --strict-ssl=false
```

Essa opção não altera permanentemente a configuração do npm. Embora a
validação TLS fique desativada durante o download, o npm ainda confere os
hashes de integridade registrados no `package-lock.json`. Prefira `npm.cmd ci`
sem essas opções quando o certificado da rede estiver corretamente instalado.

## Iniciar a aplicação

O script `npm run dev` do repositório usa sintaxe de variável de ambiente para
Linux. No Windows, execute o Vite diretamente:

```powershell
.\node_modules\.bin\vite.cmd --host 127.0.0.1
```

Abra:

```text
http://127.0.0.1:5173/
```

Para encerrar, pressione `Ctrl+C` no terminal em que o Vite está rodando.

## Reinstalação das dependências sem clonar novamente

Dentro da pasta do projeto:

```powershell
npm.cmd ci
```

Se a rede voltar a bloquear o registro oficial, use novamente o comando com
`--registry` e `--strict-ssl=false` mostrado acima.
