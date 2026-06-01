<?php
declare(strict_types=1);

function render_header(string $title, string $description = ''): void
{
    ?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e($title) ?> - Renostter</title>
    <meta name="description" content="<?= e($description ?: 'Trabalhe Conosco na Renostter Climatização.') ?>">
    <link rel="icon" type="image/png" href="/assets/logo.png">
    <link rel="stylesheet" href="/styles.css?v=20260528">
    <link rel="stylesheet" href="/assets/css/careers-pages.css?v=20260528">
</head>
<body class="careers-page-body">
    <nav class="navbar scrolled">
        <div class="container nav-inner">
            <a href="/" class="nav-logo">
                <img src="/assets/logo.png" alt="Renostter Climatização" class="logo-img-static">
            </a>
            <ul class="nav-links">
                <li><a href="/trabalhe-conosco/">Trabalhe Conosco</a></li>
                <li><a href="/#servicos">Serviços</a></li>
                <li><a href="/#portfolio">Portfólio</a></li>
                <li><a href="/#mapa">Cobertura</a></li>
                <li><a href="/#agendar">Agendar</a></li>
                <li><a href="/#contato" class="btn-nav">Orçamento Grátis</a></li>
            </ul>
        </div>
    </nav>
    <?php
}

function render_footer(): void
{
    ?>
    <footer class="careers-simple-footer">
        <p>© <?= date('Y') ?> Renostter Climatização. Todos os direitos reservados.</p>
        <a href="/admin/vagas/">Painel do Recrutador</a>
    </footer>
</body>
</html>
    <?php
}
