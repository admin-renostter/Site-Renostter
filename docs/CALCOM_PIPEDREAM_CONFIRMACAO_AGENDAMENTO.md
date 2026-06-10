# Cal.com + Pipedream + Gmail: confirmacao de agendamento

Este fluxo mantém o site Renostter leve e seguro:

- O cliente agenda pelo Cal.com.
- O Cal.com redireciona para `https://renostter.com/confirmacao-agendamento.html`.
- A pagina mostra uma confirmacao visual com os dados recebidos na URL.
- O Cal.com dispara um webhook para o Pipedream.
- O Pipedream envia um e-mail para `comercial.renostter@gmail.com`.

## 1. Redirect URL no Cal.com

No tipo de evento do Cal.com, abra:

`Event Type > Advanced > Redirect URL`

Use a URL abaixo como base:

```text
https://renostter.com/confirmacao-agendamento.html?nome={name}&email={email}&telefone={phone}&data={date}&servico={eventType}
```

Dependendo da versao do Cal.com, alguns placeholders podem mudar. A pagina foi preparada para aceitar estes aliases:

- Nome: `nome`, `name`, `guest.name`, `attendee.name`, `customerName`, `firstName`
- E-mail: `email`, `guest.email`, `attendee.email`, `customerEmail`
- Telefone: `telefone`, `phone`, `guest.phone`, `attendee.phone`
- Data/hora: `data`, `date`, `time`, `startTime`, `start`, `start_time`, `booking.startTime`
- Servico: `servico`, `service`, `event`, `eventType`, `eventType.title`, `eventTitle`, `title`

Se o Cal.com mostrar uma lista de variaveis disponiveis no painel, use as variaveis nativas dele e mantenha os nomes dos parametros do lado esquerdo:

```text
https://renostter.com/confirmacao-agendamento.html?nome=VARIAVEL_DO_CAL&email=VARIAVEL_DO_CAL&telefone=VARIAVEL_DO_CAL&data=VARIAVEL_DO_CAL&servico=VARIAVEL_DO_CAL
```

## 2. Webhook do Cal.com para Pipedream

No Pipedream:

1. Crie um workflow.
2. Escolha o trigger `HTTP / Webhook`.
3. Copie a URL gerada.

No Cal.com:

1. Acesse `Settings > Developer > Webhooks`.
2. Crie um novo webhook.
3. Em `Subscriber URL`, cole a URL do Pipedream.
4. Em eventos, selecione `BOOKING_CREATED`.
5. Salve.

## 3. E-mail pelo Gmail no Pipedream

No workflow do Pipedream, adicione uma etapa Gmail:

- App: `Gmail`
- Action: `Send Email`
- Conta: `comercial.renostter@gmail.com`
- To: `comercial.renostter@gmail.com`
- Subject:

```text
Novo agendamento Renostter - {{steps.trigger.event.body.title || steps.trigger.event.body.eventType?.title || "Cal.com"}}
```

Corpo sugerido:

```html
<h2>Novo agendamento Renostter</h2>
<p><strong>Cliente:</strong> {{steps.trigger.event.body.attendees?.[0]?.name || steps.trigger.event.body.name}}</p>
<p><strong>E-mail:</strong> {{steps.trigger.event.body.attendees?.[0]?.email || steps.trigger.event.body.email}}</p>
<p><strong>Telefone:</strong> {{steps.trigger.event.body.responses?.phone || steps.trigger.event.body.phone}}</p>
<p><strong>Servico:</strong> {{steps.trigger.event.body.eventType?.title || steps.trigger.event.body.title}}</p>
<p><strong>Inicio:</strong> {{steps.trigger.event.body.startTime}}</p>
<p><strong>Fim:</strong> {{steps.trigger.event.body.endTime}}</p>
<p><strong>Timezone:</strong> {{steps.trigger.event.body.timeZone}}</p>
<hr>
<p>Origem: Cal.com via renostter.com</p>
```

Como o payload pode variar, confirme os campos reais em um teste do Pipedream e ajuste os nomes conforme o log do evento.

## 4. QA antes de publicar

Teste local da pagina de confirmacao:

```text
http://127.0.0.1:4173/confirmacao-agendamento.html?nome=Joao%20Teste&email=joao@email.com&telefone=11999999999&data=2026-06-10T09:00:00-03:00&servico=Visita%20Tecnica
```

Checklist:

- A pagina mostra nome, e-mail, telefone, data e servico.
- O botao de WhatsApp abre a conversa com os dados preenchidos.
- O GTM dispara o evento `renostter_booking_confirmation_view`.
- O Cal.com redireciona para a pagina apos um agendamento real.
- O Pipedream recebe `BOOKING_CREATED`.
- O Gmail recebe o e-mail.

## 5. Observacao de seguranca

Nao coloque chave de Gmail, token do Pipedream ou segredo do Cal.com no `index.html`, `calendar.js` ou qualquer arquivo publico do site. O envio de e-mail deve ficar no Pipedream ou em backend seguro.
