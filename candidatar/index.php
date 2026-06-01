<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/layout.php';
require_once __DIR__ . '/../includes/mailer.php';

$vagaId = (int) ($_GET['vaga'] ?? $_POST['vaga_id'] ?? 0);
$stmt = db()->prepare("select * from vagas where id = :id and status = 'aberta' and (data_expiracao is null or data_expiracao >= curdate())");
$stmt->execute(['id' => $vagaId]);
$vaga = $stmt->fetch();

$errors = [];
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();

    if (!$vaga) {
        $errors[] = 'Esta vaga não está mais aberta.';
    }

    $candidate = [
        'nome' => trim((string) ($_POST['nome'] ?? '')),
        'email' => trim((string) ($_POST['email'] ?? '')),
        'telefone' => trim((string) ($_POST['telefone'] ?? '')),
        'mensagem' => trim((string) ($_POST['mensagem'] ?? '')),
    ];

    if (strlen($candidate['nome']) < 3) $errors[] = 'Informe seu nome completo.';
    if (!filter_var($candidate['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Informe um e-mail válido.';

    $file = $_FILES['curriculo'] ?? null;
    $allowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errors[] = 'Anexe seu currículo.';
    } else {
        if ($file['size'] > (int) config_value('security.max_upload_bytes', 5 * 1024 * 1024)) {
            $errors[] = 'O currículo deve ter no máximo 5 MB.';
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!in_array($mime, $allowed, true)) {
            $errors[] = 'Envie um arquivo PDF, DOC ou DOCX.';
        }
    }

    if (!$errors && $vaga) {
        db()->beginTransaction();
        try {
            $insert = db()->prepare('insert into candidaturas (vaga_id, nome, email, telefone, mensagem, curriculo_nome) values (:vaga_id, :nome, :email, :telefone, :mensagem, :curriculo_nome)');
            $insert->execute([
                'vaga_id' => $vaga['id'],
                'nome' => $candidate['nome'],
                'email' => $candidate['email'],
                'telefone' => $candidate['telefone'],
                'mensagem' => $candidate['mensagem'],
                'curriculo_nome' => $file['name'],
            ]);
            db()->commit();
        } catch (Throwable $e) {
            if (db()->inTransaction()) {
                db()->rollBack();
            }
            error_log($e->getMessage());
            $errors[] = 'Não foi possível enviar sua candidatura agora. Tente novamente em alguns minutos.';
        }

        if (!$errors) {
            try {
                send_rh_notification($candidate, $vaga, $file);
                send_candidate_confirmation($candidate, $vaga);
                $success = true;
            } catch (Throwable $e) {
                error_log($e->getMessage());
                $errors[] = 'Sua candidatura foi registrada, mas houve falha no envio dos e-mails. Nosso time foi notificado para revisar.';
            }
        }
    }
}

render_header('Candidatar-se', 'Envie sua candidatura para uma vaga da Renostter.');
?>
<main class="careers-page-main">
    <div class="careers-page-container">
        <?php if (!$vaga): ?>
            <section class="careers-card">
                <h1>Vaga indisponível</h1>
                <p>Esta vaga não está aberta ou não foi encontrada.</p>
                <a class="careers-btn careers-btn-primary" href="/trabalhe-conosco/">Ver vagas abertas</a>
            </section>
        <?php else: ?>
            <div class="application-grid">
                <section class="careers-card">
                    <p class="careers-meta"><?= e($vaga['area']) ?> · <?= e($vaga['localidade']) ?> · <?= e($vaga['tipo_contrato']) ?></p>
                    <h1><?= e($vaga['titulo']) ?></h1>
                    <p><?= nl2br(e($vaga['descricao'])) ?></p>
                    <?php if ($vaga['requisitos']): ?>
                        <h3>Requisitos</h3>
                        <ul><?php foreach (split_lines($vaga['requisitos']) as $line): ?><li><?= e($line) ?></li><?php endforeach; ?></ul>
                    <?php endif; ?>
                    <?php if ($vaga['beneficios']): ?>
                        <h3>Benefícios</h3>
                        <ul><?php foreach (split_lines($vaga['beneficios']) as $line): ?><li><?= e($line) ?></li><?php endforeach; ?></ul>
                    <?php endif; ?>
                </section>

                <section class="careers-card">
                    <h2>Enviar candidatura</h2>
                    <?php if ($success): ?>
                        <div class="alert alert-success">Candidatura enviada com sucesso! Em breve entraremos em contato.</div>
                    <?php endif; ?>
                    <?php if ($errors): ?>
                        <div class="alert alert-error"><?= e(implode(' ', $errors)) ?></div>
                    <?php endif; ?>
                    <form class="application-form" method="post" enctype="multipart/form-data" novalidate>
                        <?= csrf_field() ?>
                        <input type="hidden" name="vaga_id" value="<?= (int) $vaga['id'] ?>">
                        <label>Nome completo
                            <input class="careers-input" name="nome" required value="<?= e($_POST['nome'] ?? '') ?>">
                        </label>
                        <label>E-mail
                            <input class="careers-input" type="email" name="email" required value="<?= e($_POST['email'] ?? '') ?>">
                        </label>
                        <label>Telefone
                            <input class="careers-input" name="telefone" value="<?= e($_POST['telefone'] ?? '') ?>">
                        </label>
                        <label>Mensagem opcional
                            <textarea class="careers-textarea" name="mensagem" rows="4"><?= e($_POST['mensagem'] ?? '') ?></textarea>
                        </label>
                        <label>Currículo PDF, DOC ou DOCX até 5 MB
                            <input class="careers-input" type="file" name="curriculo" accept=".pdf,.doc,.docx" required>
                        </label>
                        <button class="careers-btn careers-btn-primary" type="submit">Enviar candidatura</button>
                    </form>
                </section>
            </div>
        <?php endif; ?>
    </div>
</main>
<script>
document.querySelector('.application-form')?.addEventListener('submit', event => {
    const file = event.currentTarget.curriculo.files[0];
    if (file && file.size > 5 * 1024 * 1024) {
        event.preventDefault();
        alert('O currículo deve ter no máximo 5 MB.');
    }
});
</script>
<?php render_footer(); ?>
