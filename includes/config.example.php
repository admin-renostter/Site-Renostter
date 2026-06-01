<?php
declare(strict_types=1);

return [
    'app_url' => 'https://renostter.com',
    'db' => [
        'host' => 'localhost',
        'database' => 'renostter',
        'user' => 'renostter_user',
        'password' => 'troque-esta-senha',
        'charset' => 'utf8mb4',
    ],
    'mail' => [
        'host' => 'smtp.seudominio.com',
        'port' => 587,
        'username' => 'rh@renostter.com.br',
        'password' => 'senha-ou-app-password',
        'encryption' => 'tls',
        'from_email' => 'rh@renostter.com.br',
        'from_name' => 'Renostter RH',
        'rh_email' => 'rh@renostter.com.br',
    ],
    'security' => [
        'session_lifetime' => 3600,
        'max_upload_bytes' => 5 * 1024 * 1024,
    ],
];
