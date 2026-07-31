# Guia de Compilação do APK Android (TWA) com Bubblewrap

Este guia orienta como transformar a aplicação Web hospedada no GitHub Pages em um APK Android nativo por meio da tecnologia **TWA (Trusted Web Activity)**, garantindo que o app rode em tela cheia, sem barra de endereços do navegador e de forma 100% integrada.

---

## Passo 1: Pré-requisitos
Certifique-se de ter instalado em sua máquina:
1. **Node.js** (v16 ou superior)
2. **Java Development Kit (JDK)** v11 ou v17 (necessário para compilação do Android)
3. **Android Command Line Tools** ou Android Studio

Instale a ferramenta oficial do Google para TWA globalmente:
```bash
npm install -g @bubblewrap/cli
```

---

## Passo 2: Gerar a Chave de Assinatura (Keystore) do Android
Caso ainda não possua uma chave de assinatura, gere uma usando o utilitário `keytool` (incluído no JDK):

```bash
keytool -genkey -v -keystore android.keystore -alias pau_brasil_alias -keyalg RSA -keysize 2048 -validity 10000
```
- Ele solicitará uma senha (guarde bem esta senha!).
- Responder às perguntas sobre seu nome, empresa, etc.
- Isso gerará um arquivo chamado `android.keystore` no diretório atual.

---

## Passo 3: Inicializar o Projeto com Bubblewrap
Crie uma pasta vazia e inicialize o projeto apontando para a sua URL pública do GitHub Pages:

```bash
mkdir pau-brasil-apk
cd pau-brasil-apk

bubblewrap init --manifest=https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/manifest.json
```
*(Substitua pela URL real onde seu PWA está publicado no GitHub Pages).*

### Perguntas do Wizard do Bubblewrap:
1. **Domain & Start Path**: Confirme seu domínio do GitHub Pages e caminho de início (`/NOME-DO-REPOSITORIO/`).
2. **Application ID**: Insira `com.paubrasil.guarabira.retorno`.
3. **Display mode**: Escolha `standalone` ou `fullscreen`.
4. **Keystore Location**: Indique o caminho do arquivo `android.keystore` gerado no Passo 2.
5. **Key Alias**: `pau_brasil_alias`.

---

## Passo 4: Compilar o APK
Após a inicialização, execute o comando de compilação:

```bash
bubblewrap build
```
- A ferramenta solicitará a senha do Keystore que você definiu.
- Ela baixará as ferramentas do Android SDK caso necessário e compilará o APK assinado.
- Dois arquivos serão gerados: `app-release-signed.apk` (o APK instalável) e `assetlinks.json`.

---

## Passo 5: Obter o SHA256 da Chave e Atualizar o `assetlinks.json`
Para remover a barra de navegador do APK, o Google exige que a assinatura do APK corresponda ao arquivo hospedado em seu site.

### Como extrair o SHA-256 do seu Keystore:
Execute o seguinte comando:
```bash
keytool -list -v -keystore android.keystore -alias pau_brasil_alias
```
Procure pela linha que inicia com **SHA256**:
Exemplo: `SHA256: AA:BB:CC:DD:EE:FF:00:11...`

### Atualizar o arquivo no projeto:
Abra o arquivo `/public/.well-known/assetlinks.json` e substitua o valor em `sha256_cert_fingerprints` pela impressão digital copiada, mantendo as letras em maiúsculo separadas por dois pontos.

Exemplo final em `/public/.well-known/assetlinks.json`:
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.paubrasil.guarabira.retorno",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99"
      ]
    }
  }
]
```

Publique a alteração no GitHub. Assim que o GitHub Pages atualizar e seu APK for instalado, ele detectará o link de associação digital e rodará de forma nativa e limpa em tela cheia!
