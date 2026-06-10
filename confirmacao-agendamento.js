(function () {
    'use strict';

    const WHATSAPP_NUMBER = '5511952730593';
    const fallback = 'A confirmar';
    const params = new URLSearchParams(window.location.search);

    const aliases = {
        nome: ['nome', 'name', 'guest.name', 'attendee.name', 'customerName', 'firstName'],
        email: ['email', 'guest.email', 'attendee.email', 'customerEmail'],
        telefone: ['telefone', 'phone', 'guest.phone', 'attendee.phone', 'rescheduleUid'],
        data: ['data', 'date', 'time', 'startTime', 'start', 'start_time', 'booking.startTime'],
        servico: ['servico', 'service', 'event', 'eventType', 'eventType.title', 'eventTitle', 'title'],
    };

    function getParam(keys) {
        for (const key of keys) {
            const value = params.get(key);
            if (value && value.trim()) return value.trim();
        }
        return '';
    }

    function normalizeDate(value) {
        if (!value) return '';

        const decoded = decodeLoose(value);
        const asDate = new Date(decoded);
        if (!Number.isNaN(asDate.getTime())) {
            return asDate.toLocaleString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        }

        return decoded;
    }

    function decodeLoose(value) {
        try {
            return decodeURIComponent(String(value).replace(/\+/g, ' '));
        } catch (_) {
            return String(value).replace(/\+/g, ' ');
        }
    }

    function safeText(value) {
        const text = decodeLoose(value || '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 180);
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = value || fallback;
    }

    const booking = {
        nome: safeText(getParam(aliases.nome)),
        email: safeText(getParam(aliases.email)),
        telefone: safeText(getParam(aliases.telefone)),
        data: normalizeDate(getParam(aliases.data)),
        servico: safeText(getParam(aliases.servico)) || 'Agendamento Renostter',
    };

    setText('confirm-name', booking.nome);
    setText('confirm-email', booking.email);
    setText('confirm-phone', booking.telefone);
    setText('confirm-date', booking.data);
    setText('confirm-service', booking.servico);

    const title = booking.nome
        ? `Agendamento recebido, ${booking.nome.split(' ')[0]}.`
        : 'Agendamento recebido.';
    setText('confirm-title', title);

    const toastText = document.getElementById('confirm-toast-text');
    if (toastText) {
        toastText.textContent = booking.data
            ? `Recebemos sua solicitação para ${booking.data}. A equipe Renostter acompanhará os próximos passos.`
            : 'Recebemos sua solicitação. A equipe Renostter acompanhará os próximos passos.';
    }

    const whatsapp = document.getElementById('confirm-whatsapp');
    if (whatsapp) {
        const message = [
            '*Confirmação de agendamento - Renostter*',
            '',
            `Nome: ${booking.nome || fallback}`,
            `E-mail: ${booking.email || fallback}`,
            `Telefone: ${booking.telefone || fallback}`,
            `Data/Horário: ${booking.data || fallback}`,
            `Serviço: ${booking.servico || fallback}`,
            '',
            'Acabei de concluir o agendamento pelo Cal.com e gostaria de confirmar o recebimento.',
        ].join('\n');

        whatsapp.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    }

    document.getElementById('confirm-toast-close')?.addEventListener('click', () => {
        document.getElementById('confirm-toast')?.remove();
    });

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
        event: 'renostter_booking_confirmation_view',
        booking_service: booking.servico,
        booking_has_email: Boolean(booking.email),
        booking_has_phone: Boolean(booking.telefone),
    });
})();
