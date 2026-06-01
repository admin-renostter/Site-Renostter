<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function phpmailer_instance(): PHPMailer\PHPMailer\PHPMailer
{
    $autoload = __DIR__ . '/../vendor/autoload.php';
    if (!file_exists($autoload)) {
        throw new RuntimeException('PHPMailer não instalado. Execute composer install antes de enviar e-mails.');
    }
    require_once $autoload;
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = config_value('mail.host');
    $mail->SMTPAuth = true;
    $mail->Username = config_value('mail.username');
    $mail->Password = config_value('mail.password');
    $mail->SMTPSecure = config_value('mail.encryption', 'tls');
    $mail->Port = (int) config_value('mail.port', 587);
    $mail->CharSet = 'UTF-8';
    $mail->setFrom(config_value('mail.from_email'), config_value('mail.from_name'));
    $mail->isHTML(true);
    return $mail;
}

function send_candidate_confirmation(array $candidate, array $vaga): void
{
    $mail = phpmailer_instance();
    $mail->addAddress($candidate['email'], $candidate['nome']);
    $mail->Subject = 'Recebemos sua candidatura - Renostter';
    $mail->Body = '<h2>Recebemos sua candidatura</h2>'
        . '<p>Olá, ' . e($candidate['nome']) . '.</p>'
        . '<p>Sua candidatura para <strong>' . e($vaga['titulo']) . '</strong> foi recebida com sucesso.</p>'
        . '<p>Nosso time de RH analisará seu perfil e entrará em contato se houver aderência à vaga.</p>'
        . '<p>Obrigado pelo interesse em fazer parte da Renostter.</p>';
    $mail->AltBody = 'Recebemos sua candidatura para ' . $vaga['titulo'] . '. Em breve entraremos em contato se houver aderência.';
    $mail->send();
}

function send_rh_notification(array $candidate, array $vaga, array $file): void
{
    $mail = phpmailer_instance();
    $mail->addAddress(config_value('mail.rh_email'), 'RH Renostter');
    $mail->Subject = 'Nova candidatura: ' . $candidate['nome'] . ' - ' . $vaga['titulo'];
    $mail->Body = '<h2>Nova candidatura recebida</h2>'
        . '<p><strong>Vaga:</strong> ' . e($vaga['titulo']) . '</p>'
        . '<p><strong>Nome:</strong> ' . e($candidate['nome']) . '</p>'
        . '<p><strong>E-mail:</strong> ' . e($candidate['email']) . '</p>'
        . '<p><strong>Telefone:</strong> ' . e($candidate['telefone'] ?: '-') . '</p>'
        . '<p><strong>Mensagem:</strong><br>' . nl2br(e($candidate['mensagem'] ?: '-')) . '</p>';
    $mail->AltBody = "Nova candidatura para {$vaga['titulo']}\nNome: {$candidate['nome']}\nE-mail: {$candidate['email']}";
    $mail->addAttachment($file['tmp_name'], $file['name']);
    $mail->send();
}
