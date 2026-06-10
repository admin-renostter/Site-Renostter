# Google Apps Script: resumo interno de agendamentos

Este fluxo e uma alternativa gratuita para enviar um e-mail interno mais bonito quando surgirem novos agendamentos no calendario conectado ao Cal.com.

## O que ele faz

- Le o Google Calendar usado pelo Cal.com.
- Procura eventos futuros ainda nao notificados.
- Envia um e-mail HTML para o Gmail/RH com resumo do agendamento.
- Guarda os IDs dos eventos ja enviados para evitar duplicidade.
- Roda automaticamente por gatilho de tempo, por exemplo a cada 15 minutos.

## Arquivo criado

Use este arquivo como fonte do Google Apps Script:

```text
scripts/google-apps-script/renostter-agendamento-resumo.gs
```

## Passo a passo

1. Acesse [script.google.com](https://script.google.com).
2. Clique em `Novo projeto`.
3. Apague o conteudo padrao do arquivo `Code.gs`.
4. Cole o conteudo de:

```text
scripts/google-apps-script/renostter-agendamento-resumo.gs
```

5. Ajuste o bloco `CONFIG`:

```js
const CONFIG = {
  CALENDAR_ID: 'comercial.renostter@gmail.com',
  TO_EMAIL: 'comercial.renostter@gmail.com',
  CC_EMAIL: '',
  COMPANY_NAME: 'Renostter',
  LOOKAHEAD_DAYS: 45,
  MAX_EVENTS_PER_EMAIL: 12,
  TRIGGER_MINUTES: 15,
  WHATSAPP_NUMBER: '5511952730593',
  SITE_URL: 'https://renostter.com',
};
```

6. Clique em `Salvar`.
7. No seletor de funcoes, escolha `testRenostterBookingDigestEmail`.
8. Clique em `Executar`.
9. Autorize o acesso ao Gmail e Calendar da conta.
10. Verifique se chegou um e-mail de teste na caixa configurada em `TO_EMAIL`.
11. Depois escolha a funcao `setupRenostterBookingDigestTrigger`.
12. Clique em `Executar` uma vez.

Pronto: o Apps Script passara a verificar o calendario automaticamente.

## Como testar com evento real

1. Abra a pagina de agendamento do Cal.com.
2. Crie um agendamento teste.
3. Confirme se o evento apareceu no Google Calendar conectado ao Cal.com.
4. Aguarde ate 15 minutos ou execute manualmente a funcao:

```js
sendRenostterBookingDigest
```

5. Confirme se o Gmail recebeu um e-mail com:

- titulo do evento;
- data e hora;
- local;
- convidados;
- detalhes do evento;
- botao para WhatsApp;
- botao para o site.

## Replicar dados no WhatsApp

O e-mail interno tambem inclui um botao por agendamento:

```text
Enviar este agendamento no WhatsApp
```

Ao clicar, o WhatsApp abre com uma mensagem pronta contendo:

- titulo do agendamento;
- data e hora;
- horario de termino;
- local;
- convidados;
- detalhes do evento;
- origem do agendamento.

Essa e a melhor opcao gratuita porque o WhatsApp exige confirmacao humana para enviar mensagens pelo link `wa.me`.

Envio 100% automatico para WhatsApp so deve ser feito com WhatsApp Business Cloud API ou provedor autorizado. Nesse caso, sera necessario configurar token, numero aprovado, template de mensagem e webhook/backend seguro.

## Pontos de atencao

- O script nao fica no site publico, entao nao expoe chaves nem dados sensiveis.
- O Gmail pode impor limites diarios de envio. Para uso interno normal, tende a ser suficiente.
- Se o Cal.com mudar o titulo dos eventos, ajuste a funcao `shouldNotifyEvent_`.
- Se quiser receber em outro e-mail, altere `TO_EMAIL`.
- Se quiser copiar outra pessoa, preencha `CC_EMAIL`.

## Quando usar Pipedream em vez deste script

Use Pipedream quando quiser notificacao instantanea por webhook do Cal.com.

Use Google Apps Script quando quiser:

- custo zero;
- menos dependencia de ferramenta externa;
- e-mail interno bonito;
- uma rotina simples, controlada pela conta Google.
