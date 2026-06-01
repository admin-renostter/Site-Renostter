<?php
declare(strict_types=1);

require_once __DIR__ . '/../../includes/bootstrap.php';
require_once __DIR__ . '/../../includes/layout.php';

$admin = require_admin();
$errors = [];
$editing = null;

if (isset($_GET['editar'])) {
    $stmt = db()->prepare('select * from vagas where id = :id');
    $stmt->execute(['id' => (int) $_GET['editar']]);
    $editing = $stmt->fetch();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = $_POST['action'] ?? '';
    $id = (int) ($_POST['id'] ?? 0);

    if ($action === 'delete') {
        $count = db()->prepare('select count(*) from candidaturas where vaga_id = :id');
        $count->execute(['id' => $id]);
        if ((int) $count->fetchColumn() > 0) {
            db()->prepare("update vagas set status = 'preenchida' where id = :id")->execute(['id' => $id]);
        } else {
            db()->prepare('delete from vagas where id = :id')->execute(['id' => $id]);
        }
        redirect_to('/admin/vagas/');
    }

    if ($action === 'duplicate') {
        $stmt = db()->prepare("insert into vagas (titulo, descricao, requisitos, beneficios, localidade, tipo_contrato, area, status, data_expiracao)
            select concat(titulo, ' (cópia)'), descricao, requisitos, beneficios, localidade, tipo_contrato, area, 'pausada', data_expiracao from vagas where id = :id");
        $stmt->execute(['id' => $id]);
        redirect_to('/admin/vagas/');
    }

    $payload = [
        'titulo' => trim((string) ($_POST['titulo'] ?? '')),
        'descricao' => trim((string) ($_POST['descricao'] ?? '')),
        'requisitos' => trim((string) ($_POST['requisitos'] ?? '')),
        'beneficios' => trim((string) ($_POST['beneficios'] ?? '')),
        'localidade' => trim((string) ($_POST['localidade'] ?? '')),
        'tipo_contrato' => (string) ($_POST['tipo_contrato'] ?? 'CLT'),
        'area' => trim((string) ($_POST['area'] ?? '')),
        'status' => (string) ($_POST['status'] ?? 'aberta'),
        'data_expiracao' => $_POST['data_expiracao'] ?: null,
    ];

    if ($payload['titulo'] === '') $errors[] = 'Título é obrigatório.';
    if ($payload['descricao'] === '') $errors[] = 'Descrição é obrigatória.';

    if (!$errors) {
        if ($id > 0) {
            $stmt = db()->prepare('update vagas set titulo=:titulo, descricao=:descricao, requisitos=:requisitos, beneficios=:beneficios, localidade=:localidade, tipo_contrato=:tipo_contrato, area=:area, status=:status, data_expiracao=:data_expiracao where id=:id');
            $payload['id'] = $id;
            $stmt->execute($payload);
        } else {
            $stmt = db()->prepare('insert into vagas (titulo, descricao, requisitos, beneficios, localidade, tipo_contrato, area, status, data_expiracao) values (:titulo, :descricao, :requisitos, :beneficios, :localidade, :tipo_contrato, :area, :status, :data_expiracao)');
            $stmt->execute($payload);
        }
        redirect_to('/admin/vagas/');
    }
}

$vagas = db()->query('select v.*, count(c.id) as total_candidaturas from vagas v left join candidaturas c on c.vaga_id = v.id group by v.id order by v.data_criacao desc')->fetchAll();

render_header('Painel do Recrutador', 'Gerencie vagas da Renostter.');
?>
<main class="careers-page-main">
    <div class="careers-page-container">
        <section class="careers-hero-band">
            <h1>Painel do Recrutador</h1>
            <p>Olá, <?= e($admin['nome']) ?>. Gerencie vagas abertas, pausadas e preenchidas.</p>
            <a class="careers-btn careers-btn-ghost" href="/admin/logout.php">Sair</a>
        </section>

        <?php if ($errors): ?><div class="alert alert-error"><?= e(implode(' ', $errors)) ?></div><?php endif; ?>

        <div class="admin-layout">
            <section class="admin-card">
                <h2><?= $editing ? 'Editar vaga' : 'Nova vaga' ?></h2>
                <form class="admin-form" method="post">
                    <?= csrf_field() ?>
                    <input type="hidden" name="id" value="<?= (int) ($editing['id'] ?? 0) ?>">
                    <input type="hidden" name="action" value="save">
                    <label>Título
                        <input class="careers-input" name="titulo" required value="<?= e($editing['titulo'] ?? '') ?>">
                    </label>
                    <label>Descrição
                        <textarea class="careers-textarea" name="descricao" rows="7" required><?= e($editing['descricao'] ?? '') ?></textarea>
                    </label>
                    <label>Requisitos
                        <textarea class="careers-textarea" name="requisitos" rows="4"><?= e($editing['requisitos'] ?? '') ?></textarea>
                    </label>
                    <label>Benefícios
                        <textarea class="careers-textarea" name="beneficios" rows="4"><?= e($editing['beneficios'] ?? '') ?></textarea>
                    </label>
                    <div class="form-grid-2">
                        <label>Localidade
                            <input class="careers-input" name="localidade" value="<?= e($editing['localidade'] ?? '') ?>">
                        </label>
                        <label>Área
                            <input class="careers-input" name="area" value="<?= e($editing['area'] ?? '') ?>">
                        </label>
                        <label>Contrato
                            <select class="careers-select" name="tipo_contrato">
                                <?php foreach (['CLT', 'PJ', 'Estágio', 'Freelancer'] as $item): ?>
                                    <option <?= ($editing['tipo_contrato'] ?? '') === $item ? 'selected' : '' ?>><?= e($item) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label>Status
                            <select class="careers-select" name="status">
                                <?php foreach (['aberta', 'pausada', 'preenchida'] as $item): ?>
                                    <option <?= ($editing['status'] ?? 'aberta') === $item ? 'selected' : '' ?>><?= e($item) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                    </div>
                    <label>Data de expiração
                        <input class="careers-input" type="date" name="data_expiracao" value="<?= e($editing['data_expiracao'] ?? '') ?>">
                    </label>
                    <button class="careers-btn careers-btn-primary" type="submit">Salvar vaga</button>
                    <?php if ($editing): ?><a class="careers-btn careers-btn-ghost" href="/admin/vagas/">Cancelar edição</a><?php endif; ?>
                </form>
            </section>

            <section class="admin-card">
                <h2>Vagas cadastradas</h2>
                <div style="overflow:auto">
                    <table class="admin-table">
                        <thead>
                            <tr><th>Título</th><th>Status</th><th>Candidaturas</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                        <?php foreach ($vagas as $vaga): ?>
                            <tr>
                                <td>
                                    <strong><?= e($vaga['titulo']) ?></strong><br>
                                    <span class="careers-meta"><?= e($vaga['area']) ?> · <?= e($vaga['localidade']) ?> · <?= e($vaga['tipo_contrato']) ?></span>
                                </td>
                                <td><?= e($vaga['status']) ?></td>
                                <td><?= (int) $vaga['total_candidaturas'] ?></td>
                                <td>
                                    <div class="admin-actions">
                                        <a class="careers-btn careers-btn-ghost" href="/admin/vagas/?editar=<?= (int) $vaga['id'] ?>">Editar</a>
                                        <form method="post">
                                            <?= csrf_field() ?>
                                            <input type="hidden" name="id" value="<?= (int) $vaga['id'] ?>">
                                            <input type="hidden" name="action" value="duplicate">
                                            <button class="careers-btn careers-btn-ghost" type="submit">Duplicar</button>
                                        </form>
                                        <form method="post" onsubmit="return confirm('Excluir esta vaga? Se houver candidaturas vinculadas, ela será marcada como preenchida.');">
                                            <?= csrf_field() ?>
                                            <input type="hidden" name="id" value="<?= (int) $vaga['id'] ?>">
                                            <input type="hidden" name="action" value="delete">
                                            <button class="careers-btn careers-btn-ghost" type="submit">Excluir</button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    </div>
</main>
<?php render_footer(); ?>
