# SAM local — instalação e uso

O Poligome roda os modelos Segment Anything no computador do usuário. Imagens e
prompts nunca saem da máquina: o editor fala com um conector FastAPI em
`127.0.0.1`, e é ele quem carrega o modelo.

Este documento cobre os modelos oficiais. Para rodar um modelo seu num contêiner,
veja [byom.md](byom.md).

---

## Os modelos

| Modelo | ID | Checkpoint | Acesso |
| --- | --- | --- | --- |
| SAM 2.1 Hiera Tiny | `sam2.1-hiera-tiny` | 156 MB | público |
| SAM 2.1 Hiera Small | `sam2.1-hiera-small` | 184 MB | público |
| SAM 2.1 Hiera Base+ | `sam2.1-hiera-base-plus` | 324 MB | público |
| SAM 2.1 Hiera Large | `sam2.1-hiera-large` | 898 MB | público |
| MedSAM2 (imagem médica) | `medsam2-latest` | 156 MB | público |
| MedSAM2 · lesão em TC | `medsam2-ct-lesion` | 156 MB | público |
| MedSAM2 · lesão hepática em RM | `medsam2-mri-liver-lesion` | 156 MB | público |
| MedSAM2 · ecocardiograma | `medsam2-us-heart` | 156 MB | público |
| MedSAM2 2411 (versão anterior) | `medsam2-2411` | 156 MB | público |
| SAM 3 Concepts | `sam3-concepts` | 3,45 GB | **aprovação manual da Meta** |

Aliases aceitos: `medsam2`, `medsam2-ct`, `medsam2-mri`, `medsam2-us` e `sam3`.

Os quatro MedSAM2 são ajustes finos do SAM 2.1 Hiera Tiny e reaproveitam o mesmo
runtime: instalá-los custa apenas o download do checkpoint, sem ambiente novo.

---

## Instalação

### Linux e macOS

```bash
bash poligome-sam-macos-linux.sh sam2.1-hiera-small
```

Sem argumento, o instalador abre um menu. Ele cria um ambiente Python isolado por
família em `~/.poligome-sam/venvs`, baixa só o checkpoint escolhido para
`~/.poligome-sam/models/<id>` e inicia o conector.

No macOS, o SAM 2.1 exige Apple Silicon: o PyTorch 2.5.1+ não publica mais wheels
para Intel. O SAM 3 não é oferecido no macOS.

### Windows

```
poligome-sam-windows.bat sam2.1-hiera-small
```

O `.bat` não instala nada no Windows nativo: ele delega ao WSL2, preservando o
mesmo menu e os mesmos IDs.

### Já instalado

Os iniciadores `poligome-sam-start-macos-linux.sh` e
`poligome-sam-start-windows.bat` sobem o modelo salvo em
`~/.poligome-sam/selected-model.txt` e retomam automaticamente uma instalação
interrompida.

No Linux, `poligome-sam-service-linux.sh install` registra o conector como
serviço de usuário do systemd, para ele subir no login sem terminal aberto.

---

## SAM 3: a aprovação da Meta

O SAM 3 é o único modelo do catálogo com checkpoint **gated**. Sem aprovação, o
download responde `HTTP 401` e a instalação para. Não há caminho alternativo: a
Meta não publica o arquivo em outro lugar.

### Passo a passo

1. **Conta no Hugging Face** — https://huggingface.co/join
2. Logado, abrir https://huggingface.co/facebook/sam3. O formulário pede:
   - nome e sobrenome;
   - data de nascimento;
   - país (a localização por IP também é registrada);
   - afiliação;
   - cargo, numa lista fixa: *Student, Research Graduate, AI researcher,
     AI developer/engineer, Reporter, Other*;
   - caixa aceitando a licença e a Política de Privacidade da Meta.
3. **Enviar e esperar.** O repositório está marcado como `gated: manual`, ou
   seja, alguém revisa — não é liberação automática. O status aparece em
   https://huggingface.co/settings/gated-repos
4. **Autenticar na máquina.** Aprovado, rode o instalador: ele chama o
   `hf auth login` oficial, que guarda o token sozinho. O Poligome não lê nem
   armazena o seu token.

O formulário é vinculado à sua conta e pede dados pessoais seus, então ninguém
pode solicitar por você.

### Requisitos próprios

O SAM 3 não compartilha ambiente com o SAM 2.1:

| | SAM 2.1 e MedSAM2 | SAM 3 |
| --- | --- | --- |
| Python | 3.10+ | 3.12+ |
| PyTorch | 2.5.1+ | 2.10 com CUDA 12.8 |
| GPU | recomendada | **obrigatória**, CUDA 12.6+ |
| Sistema | Linux, macOS (Apple Silicon), WSL2 | Linux ou WSL2 |
| Licença | Apache 2.0 · MedSAM2 restrito a pesquisa | SAM License, própria da Meta |

A instalação do SAM 3 fixa `setuptools<81` enquanto a revisão oficial ainda
depender de `pkg_resources`, e instala explicitamente as dependências que o
import principal usa mas o `pyproject` não declara.

### Verificado nesta implementação

Com uma conta aprovada, o fluxo foi exercitado assim:

| Etapa | Como foi conferida |
| --- | --- |
| formulário e aprovação | campos lidos da API do Hugging Face; repositório confirmado como `gated: manual` |
| autenticação | `hf auth whoami` respondendo com a conta aprovada |
| download | `hf download facebook/sam3 sam3.pt`, 3.450.062.241 bytes, batendo com o tamanho que o instalador exige |
| instalação | `bash poligome-sam-macos-linux.sh sam3-concepts` do começo ao fim, com a seleção salva em `selected-model.txt` |
| inferência | ponto 0,980 · caixa 0,984 · texto devolvendo três instâncias para "red circle" e duas para "blue square" |
| troca de modelo | entra e sai do SAM 3 sem perder SAM 2.1 nem MedSAM2 |

Uma ressalva honesta: na execução do instalador o checkpoint já estava em disco,
então o ramo de download não foi reexecutado por ele — esse trecho foi conferido
à parte, com o mesmo comando que o instalador usa.

Isso revelou dois defeitos que o gate escondia, ambos corrigidos:

- **dtype.** O SAM 3 gera ativações em bfloat16 sem declarar autocast próprio, e
  o conector carrega o modelo numa thread e atende requisições em outra. Toda
  inferência morria com `mat1 and mat2 must have the same dtype`. O adaptador
  passou a declarar autocast bfloat16 explicitamente.
- **CLI do Hugging Face.** O console script `hf` grava o caminho do interpretador
  no shebang, então quebra se a pasta do app for renomeada. O instalador confere
  o shebang sem executar o script e, se o interpretador sumiu, resolve o entry
  point pelo próprio pacote.

---

## Prompts por modelo

| Prompt | SAM 2.1 | MedSAM2 | SAM 3 |
| --- | --- | --- | --- |
| ponto positivo e negativo | sim | sim | sim |
| caixa | sim | sim | sim |
| texto (conceito) | não | não | **sim** |
| caixa como exemplar | não | não | sim |
| múltiplas instâncias de um conceito | não | não | sim |

O prompt de texto funciona melhor como frase nominal curta — `carro vermelho`.
Descrições relacionais longas exigem outro tipo de modelo.

O MedSAM2 aceita os mesmos prompts do SAM 2.1, mas foi treinado em TC, RM e
ultrassom: em fotografia comum o resultado é pior que o do SAM 2.1 padrão, e a
caixa funciona melhor que o ponto.

---

## Trocar de modelo

A troca acontece pela própria interface. `GET /models` lista o que está
instalado em `~/.poligome-sam` e `POST /load {"model_id"}` recarrega o conector
no ambiente da família pedida.

Como cada família tem runtime próprio, a troca usa `execv` para substituir o
processo preservando PID, terminal e processo pai — assim os instaladores que
aguardam o conector continuam válidos. A porta fica indisponível por instantes e
o modal acompanha o `/health` até o `ready`. Modelos não instalados são recusados
com HTTP 409 explicando o que falta.

Medido nesta máquina: trocar entre variantes do SAM 2.1 e MedSAM2 leva cerca de
três segundos; entrar ou sair do SAM 3, cerca de nove.

---

## Limites desta versão

- **Só imagem.** SAM 2.1 e SAM 3 fazem vídeo no upstream, mas o editor integra
  apenas imagens. O SAM 3.1, com Object Multiplex para vídeo, não está integrado.
- **Sem máscara anterior como prompt**, sem geração automática de máscaras e sem
  exemplares combinados com texto.
- **MedSAM2 não cobre odontologia.** Radiografia odontológica não faz parte do
  treino publicado; usar o ajuste fino de TC em CBCT dental é extrapolação.
