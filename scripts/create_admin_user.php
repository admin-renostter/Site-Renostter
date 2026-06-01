<?php
declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    exit('Execute pelo terminal.');
}

$nome = $argv[1] ?? null;
$email = $argv[2] ?? null;
$senha = $argv[3] ?? null;
$papel = $argv[4] ?? 'admin';

if (!$nome || !$email || !$senha || !in_array($papel, ['recrutador', 'admin'], true)) {
    echo "Uso: php scripts/create_admin_user.php \"Nome\" email@dominio.com \"senha-forte\" admin\n";
    exit(1);
}

$stmt = db()->prepare('insert into usuarios_admin (nome, email, senha_hash, papel) values (:nome, :email, :senha_hash, :papel)
    on duplicate key update nome = values(nome), senha_hash = values(senha_hash), papel = values(papel), ativo = 1');
$stmt->execute([
    'nome' => $nome,
    'email' => $email,
    'senha_hash' => password_hash($senha, PASSWORD_BCRYPT),
    'papel' => $papel,
]);

echo "Usuário administrador criado/atualizado com sucesso.\n";
