<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/layout.php';

$perPage = 20;
$page = max(1, (int) ($_GET['pagina'] ?? 1));
$offset = ($page - 1) * $perPage;
$q = trim((string) ($_GET['q'] ?? ''));
$area = trim((string) ($_GET['area'] ?? ''));
$localidade = trim((string) ($_GET['localidade'] ?? ''));
$tipo = trim((string) ($_GET['tipo_contrato'] ?? ''));

$where = ["status = 'aberta'", "(data_expiracao is null or data_expiracao >= curdate())"];
$params = [];
if ($q !== '') {
    $where[] = '(titulo like :q or descricao like :q)';
    $params['q'] = '%' . $q . '%';
}
if ($area !== '') {
    $where[] = 'area = :area';
    $params['area'] = $area;
}
if ($localidade !== '') {
    $where[] = 'localidade like :localidade';
    $params['localidade'] = '%' . $localidade . '%';
}
if ($tipo !== '') {
    $where[] = 'tipo_contrato = :tipo';
    $params['tipo'] = $tipo;
}

$whereSql = implode(' and ', $where);
$countStmt = db()->prepare("select count(*) from vagas where $whereSql");
$countStmt->execute($params);
$total = (int) $countStmt->fetchColumn();
$pages = max(1, (int) ceil($total / $perPage));

$stmt = db()->prepare("select * from vagas where $whereSql order by data_criacao desc limit :limit offset :offset");
foreach ($params as $key => $value) {
    $stmt->bindValue(':' . $key, $value);
}
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$vagas = $stmt->fetchAll();

$areas = db()->query("select distinct area from vagas where area is not null and area <> '' order by area")->fetchAll(PDO::FETCH_COLUMN);
$tipos = ['CLT', 'PJ', 'Estágio', 'Freelancer'];
$modalidades = ['Presencial', 'Remoto', 'Híbrido'];

render_header('Trabalhe Conosco', 'Veja vagas abertas e envie seu currículo para a Renostter.');
?>
<main class="careers-page-main">
    <div class="careers-page-container">
        <section class="careers-hero-band">
            <h1>Trabalhe Conosco</h1>
            <p>Na Renostter, tecnologia, qualidade técnica e atendimento humano caminham juntos. Procuramos pessoas comprometidas, pontuais e com vontade de crescer no setor de climatização.</p>
        </section>

        <section class="careers-filter-card">
            <form class="careers-filters" method="get">
                <input class="careers-input" type="search" name="q" value="<?= e($q) ?>" placeholder="Buscar por cargo, palavra-chave ou descrição">
                <select class="careers-select" name="area">
                    <option value="">Todas as áreas</option>
                    <?php foreach ($areas as $item): ?>
                        <option value="<?= e($item) ?>" <?= $area === $item ? 'selected' : '' ?>><?= e($item) ?></option>
                    <?php endforeach; ?>
                </select>
                <select class="careers-select" name="localidade">
                    <option value="">Todas as modalidades</option>
                    <?php foreach ($modalidades as $item): ?>
                        <option value="<?= e($item) ?>" <?= $localidade === $item ? 'selected' : '' ?>><?= e($item) ?></option>
                    <?php endforeach; ?>
                </select>
                <select class="careers-select" name="tipo_contrato">
                    <option value="">Todos os contratos</option>
                    <?php foreach ($tipos as $item): ?>
                        <option value="<?= e($item) ?>" <?= $tipo === $item ? 'selected' : '' ?>><?= e($item) ?></option>
                    <?php endforeach; ?>
                </select>
                <button class="careers-btn careers-btn-primary" type="submit">Buscar</button>
                <a class="careers-btn careers-btn-ghost" href="/trabalhe-conosco/">Limpar</a>
            </form>
        </section>

        <section class="careers-list">
            <?php if (!$vagas): ?>
                <div class="careers-card">
                    <h2>Nenhuma vaga aberta agora</h2>
                    <p class="careers-empty">No momento não temos vagas abertas, mas você pode enviar seu currículo para cadastro de talentos pelo WhatsApp da Renostter.</p>
                    <a class="careers-btn careers-btn-primary" href="https://wa.me/5511952730593?text=Ol%C3%A1!%20Gostaria%20de%20enviar%20meu%20curr%C3%ADculo%20para%20cadastro%20de%20talentos." target="_blank" rel="noopener">Enviar currículo</a>
                </div>
            <?php endif; ?>
            <?php foreach ($vagas as $vaga): ?>
                <article class="careers-card">
                    <div class="careers-card-top">
                        <div>
                            <h2><?= e($vaga['titulo']) ?></h2>
                            <p class="careers-meta"><?= e($vaga['localidade']) ?> · <?= e($vaga['tipo_contrato']) ?> · <?= e($vaga['area']) ?></p>
                        </div>
                        <a class="careers-btn careers-btn-primary" href="/candidatar/?vaga=<?= (int) $vaga['id'] ?>">Ver detalhes</a>
                    </div>
                    <p><?= e(strlen(strip_tags($vaga['descricao'])) > 220 ? substr(strip_tags($vaga['descricao']), 0, 220) . '...' : strip_tags($vaga['descricao'])) ?></p>
                </article>
            <?php endforeach; ?>
        </section>

        <?php if ($pages > 1): ?>
            <nav class="careers-pagination" aria-label="Paginação de vagas">
                <?php for ($i = 1; $i <= $pages; $i++): ?>
                    <?php $query = http_build_query(array_merge($_GET, ['pagina' => $i])); ?>
                    <?= $i === $page ? '<span class="active">' . $i . '</span>' : '<a href="?' . e($query) . '">' . $i . '</a>' ?>
                <?php endfor; ?>
            </nav>
        <?php endif; ?>
    </div>
</main>
<?php render_footer(); ?>
