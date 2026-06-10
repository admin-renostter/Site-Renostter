/**
 * Renostter - resumo interno de agendamentos Cal.com / Google Calendar.
 *
 * Como usar:
 * 1. Crie um projeto em https://script.google.com.
 * 2. Cole este arquivo no editor.
 * 3. Ajuste CONFIG.CALENDAR_ID e CONFIG.TO_EMAIL.
 * 4. Execute setupRenostterBookingDigestTrigger uma vez.
 *
 * Observacao:
 * O script nao depende de API paga. Ele usa CalendarApp, GmailApp e PropertiesService.
 */

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

const SENT_EVENTS_KEY = 'RENOSTTER_SENT_BOOKING_EVENT_IDS';

function setupRenostterBookingDigestTrigger() {
  deleteRenostterBookingDigestTriggers_();

  ScriptApp.newTrigger('sendRenostterBookingDigest')
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_MINUTES)
    .create();

  Logger.log('Gatilho criado. O resumo sera verificado a cada %s minutos.', CONFIG.TRIGGER_MINUTES);
}

function deleteRenostterBookingDigestTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'sendRenostterBookingDigest')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
}

function sendRenostterBookingDigest() {
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) {
    throw new Error('Calendario nao encontrado: ' + CONFIG.CALENDAR_ID);
  }

  const now = new Date();
  const end = new Date(now.getTime() + CONFIG.LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const sentMap = getSentEventsMap_();

  const newEvents = calendar
    .getEvents(now, end)
    .filter(event => shouldNotifyEvent_(event, sentMap))
    .sort((a, b) => a.getStartTime().getTime() - b.getStartTime().getTime())
    .slice(0, CONFIG.MAX_EVENTS_PER_EMAIL);

  if (newEvents.length === 0) {
    Logger.log('Nenhum agendamento novo encontrado.');
    pruneSentEventsMap_(sentMap);
    setSentEventsMap_(sentMap);
    return;
  }

  const subject = buildSubject_(newEvents);
  const htmlBody = buildHtmlBody_(newEvents);
  const plainBody = buildPlainBody_(newEvents);
  const options = {
    name: CONFIG.COMPANY_NAME + ' Agenda',
    htmlBody,
  };

  if (CONFIG.CC_EMAIL) {
    options.cc = CONFIG.CC_EMAIL;
  }

  GmailApp.sendEmail(CONFIG.TO_EMAIL, subject, plainBody, options);

  newEvents.forEach(event => {
    sentMap[event.getId()] = {
      title: event.getTitle(),
      start: event.getStartTime().toISOString(),
      notifiedAt: new Date().toISOString(),
    };
  });

  pruneSentEventsMap_(sentMap);
  setSentEventsMap_(sentMap);
  Logger.log('Resumo enviado com %s agendamento(s).', newEvents.length);
}

function testRenostterBookingDigestEmail() {
  Logger.log('Enviando e-mail de teste para: %s', CONFIG.TO_EMAIL);
  Logger.log('Cota restante de e-mails do dia: %s', MailApp.getRemainingDailyQuota());

  const fakeEvent = {
    getId: () => 'teste-renostter-' + Date.now(),
    getTitle: () => 'Agendamento - Renostter',
    getStartTime: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    getEndTime: () => new Date(Date.now() + 25 * 60 * 60 * 1000),
    getLocation: () => 'Google Meet ou atendimento no local',
    getDescription: () => 'Cliente: Joao Teste\nTelefone: (11) 99999-9999\nServico: Visita tecnica',
    getGuestList: () => [],
  };

  GmailApp.sendEmail(
    CONFIG.TO_EMAIL,
    '[Teste] Novo agendamento Renostter',
    buildPlainBody_([fakeEvent]),
    {
      name: CONFIG.COMPANY_NAME + ' Agenda',
      htmlBody: buildHtmlBody_([fakeEvent]),
    }
  );

  Logger.log('E-mail de teste enviado para %s.', CONFIG.TO_EMAIL);
}

function diagnosticarEnvioEmailRenostter() {
  const activeUser = Session.getActiveUser().getEmail();
  const effectiveUser = Session.getEffectiveUser().getEmail();
  const recipient = CONFIG.TO_EMAIL || activeUser || effectiveUser;

  Logger.log('Usuario ativo: %s', activeUser || 'Nao informado pelo Google');
  Logger.log('Usuario efetivo: %s', effectiveUser || 'Nao informado pelo Google');
  Logger.log('Destinatario configurado: %s', CONFIG.TO_EMAIL);
  Logger.log('Destinatario usado no diagnostico: %s', recipient);
  Logger.log('Calendar ID: %s', CONFIG.CALENDAR_ID);
  Logger.log('Cota restante de e-mails do dia: %s', MailApp.getRemainingDailyQuota());

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  Logger.log('Calendario encontrado: %s', calendar ? 'Sim' : 'Nao');

  MailApp.sendEmail({
    to: recipient,
    subject: '[Diagnostico] Renostter Apps Script - envio de e-mail',
    htmlBody: [
      '<h2>Diagnostico Renostter Apps Script</h2>',
      '<p>Se voce recebeu este e-mail, o envio pelo Apps Script esta funcionando.</p>',
      '<ul>',
      '<li><strong>Destinatario configurado:</strong> ' + escapeHtml_(CONFIG.TO_EMAIL) + '</li>',
      '<li><strong>Usuario efetivo:</strong> ' + escapeHtml_(effectiveUser || 'Nao informado') + '</li>',
      '<li><strong>Calendar ID:</strong> ' + escapeHtml_(CONFIG.CALENDAR_ID) + '</li>',
      '<li><strong>Calendario encontrado:</strong> ' + (calendar ? 'Sim' : 'Nao') + '</li>',
      '</ul>',
    ].join(''),
    body: 'Diagnostico Renostter Apps Script. Se voce recebeu este e-mail, o envio esta funcionando.',
    name: CONFIG.COMPANY_NAME + ' Agenda',
  });

  Logger.log('E-mail de diagnostico enviado para %s.', recipient);
}

function shouldNotifyEvent_(event, sentMap) {
  if (sentMap[event.getId()]) return false;

  const title = String(event.getTitle() || '').toLowerCase();
  const description = String(event.getDescription() || '').toLowerCase();
  const combined = title + ' ' + description;

  return (
    combined.includes('renostter') ||
    combined.includes('agendamento') ||
    combined.includes('cal.com') ||
    combined.includes('visita') ||
    combined.includes('tecnica') ||
    combined.includes('orçamento') ||
    combined.includes('orcamento')
  );
}

function buildSubject_(events) {
  if (events.length === 1) {
    return 'Novo agendamento Renostter - ' + formatDateTime_(events[0].getStartTime());
  }

  return events.length + ' novos agendamentos Renostter';
}

function buildHtmlBody_(events) {
  const rows = events.map(event => {
    const details = extractUsefulDescription_(event.getDescription());
    const whatsappMessage = buildWhatsAppMessage_(event);
    const whatsappUrl = buildWhatsAppUrl_(whatsappMessage);
    const guests = event
      .getGuestList()
      .map(guest => guest.getEmail())
      .filter(Boolean)
      .join(', ');

    return `
      <tr>
        <td style="padding:18px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0284c7;">${escapeHtml_(formatDateTime_(event.getStartTime()))}</div>
          <div style="margin-top:6px;font-size:18px;font-weight:800;color:#0f172a;">${escapeHtml_(event.getTitle())}</div>
          <div style="margin-top:8px;color:#475569;line-height:1.55;">${details}</div>
          ${event.getLocation() ? `<div style="margin-top:10px;color:#334155;"><strong>Local:</strong> ${escapeHtml_(event.getLocation())}</div>` : ''}
          ${guests ? `<div style="margin-top:6px;color:#334155;"><strong>Convidados:</strong> ${escapeHtml_(guests)}</div>` : ''}
          <div style="margin-top:14px;">
            <a href="${whatsappUrl}" style="display:inline-block;padding:11px 16px;border-radius:999px;background:#25d366;color:#052e16;text-decoration:none;font-weight:800;">Enviar este agendamento no WhatsApp</a>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const whatsappUrl = buildWhatsAppUrl_('Ola, equipe Renostter. Segue a agenda interna para acompanhamento dos novos agendamentos.');

  return `
    <div style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:28px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
              <tr>
                <td style="padding:26px 28px;background:linear-gradient(135deg,#07111f,#102033 70%,#1f1308);color:#ffffff;">
                  <div style="font-size:13px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:.08em;">Agenda Renostter</div>
                  <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;">Novo agendamento recebido</h1>
                  <p style="margin:10px 0 0;color:#cbd5e1;">Resumo automatico gerado pelo Google Calendar.</p>
                </td>
              </tr>
              ${rows}
              <tr>
                <td style="padding:22px 28px;background:#f8fafc;">
                  <a href="${whatsappUrl}" style="display:inline-block;padding:13px 18px;border-radius:999px;background:#ff7a00;color:#ffffff;text-decoration:none;font-weight:800;">Abrir WhatsApp</a>
                  <a href="${CONFIG.SITE_URL}" style="display:inline-block;margin-left:10px;padding:13px 18px;border-radius:999px;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-weight:800;">Abrir site</a>
                  <p style="margin:16px 0 0;color:#64748b;font-size:12px;">Para alterar a frequencia, edite CONFIG.TRIGGER_MINUTES no Apps Script.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildPlainBody_(events) {
  return events.map(event => {
    return [
      'Novo agendamento Renostter',
      'Titulo: ' + event.getTitle(),
      'Data: ' + formatDateTime_(event.getStartTime()),
      'Local: ' + (event.getLocation() || 'Nao informado'),
      'Detalhes:',
      stripHtml_(event.getDescription() || 'Sem detalhes adicionais'),
    ].join('\n');
  }).join('\n\n---\n\n');
}

function buildWhatsAppMessage_(event) {
  const guests = event
    .getGuestList()
    .map(guest => guest.getEmail())
    .filter(Boolean)
    .join(', ');

  const details = stripHtml_(event.getDescription() || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join('\n');

  return [
    '*Novo agendamento Renostter*',
    '',
    '*Titulo:* ' + event.getTitle(),
    '*Data:* ' + formatDateTime_(event.getStartTime()),
    '*Termino:* ' + formatDateTime_(event.getEndTime()),
    '*Local:* ' + (event.getLocation() || 'Nao informado'),
    guests ? '*Convidados:* ' + guests : '',
    details ? '\n*Detalhes:*\n' + details : '',
    '',
    'Origem: Google Calendar / Cal.com',
  ].filter(Boolean).join('\n');
}

function buildWhatsAppUrl_(message) {
  return 'https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
}

function extractUsefulDescription_(description) {
  const clean = stripHtml_(description || '').trim();
  if (!clean) return '<em style="color:#64748b;">Sem detalhes adicionais no evento.</em>';

  return escapeHtml_(clean)
    .split('\n')
    .filter(Boolean)
    .slice(0, 12)
    .map(line => '<div>' + line + '</div>')
    .join('');
}

function getSentEventsMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SENT_EVENTS_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    Logger.log('Nao foi possivel ler eventos ja enviados. Reiniciando mapa.');
    return {};
  }
}

function setSentEventsMap_(sentMap) {
  PropertiesService.getScriptProperties().setProperty(SENT_EVENTS_KEY, JSON.stringify(sentMap));
}

function pruneSentEventsMap_(sentMap) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  Object.keys(sentMap).forEach(eventId => {
    const notifiedAt = Date.parse(sentMap[eventId].notifiedAt || '');
    if (!notifiedAt || notifiedAt < cutoff) {
      delete sentMap[eventId];
    }
  });
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, 'America/Sao_Paulo', "dd/MM/yyyy 'as' HH:mm");
}

function stripHtml_(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n');
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
