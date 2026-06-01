<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/layout.php';

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $email = trim((string) ($_POST['email'] ?? ''));
    $password = (string) ($_POST['senha'] ?? '');
    $stmt = db()->prepare('select * from usuarios_admin where email = :email and ativo = 1 limit 1');
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['senha_hash'])) {
        session_regenerate_id(true);
        $_SESSION['admin_user'] = [
            'id' => (int) $user['id'],
            'nome' => $user['nome'],
            'email' => $user['email'],
            'papel' => $user['papel'],
        ];
        $_SESSION['admin_last_seen'] = time();
        db()->prepare('update usuarios_admin set ultimo_login = now() where id = :id')->execute(['id' => $user['id']]);
        redirect_to('/admin/vagas/');
    }
    $error = 'E-mail ou senha inválidos.';
}

render_header('Login do Recrutador', 'Acesso restrito ao painel de vagas da Renostter.');
?>
<main class="careers-page-main">
    <div class="careers-page-container" style="max-width:520px">
        <section class="careers-card">
            <h1>Login do Recrutador</h1>
            <?php if ($error): ?><div class="alert alert-error"><?= e($error) ?></div><?php endif; ?>
            <form class="application-form" method="post">
                <?= csrf_field() ?>
                <label>E-mail
                    <input class="careers-input" type="email" name="email" required>
                </label>
                <label>Senha
                    <input class="careers-input" type="password" name="senha" required>
                </label>
                <button class="careers-btn careers-btn-primary" type="submit">Entrar</button>
            </form>
        </section>
    </div>
</main>
<?php render_footer(); ?>
