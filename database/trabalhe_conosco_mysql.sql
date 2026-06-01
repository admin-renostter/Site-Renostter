create table if not exists vagas (
    id int auto_increment primary key,
    titulo varchar(150) not null,
    descricao text not null,
    requisitos text,
    beneficios text,
    localidade varchar(100),
    tipo_contrato enum('CLT','PJ','Estágio','Freelancer') not null,
    area varchar(100),
    status enum('aberta','pausada','preenchida') default 'aberta',
    data_expiracao date null,
    data_criacao timestamp default current_timestamp,
    updated_at timestamp default current_timestamp on update current_timestamp,
    index idx_vagas_status (status),
    index idx_vagas_area (area),
    index idx_vagas_tipo (tipo_contrato),
    fulltext index ft_vagas_busca (titulo, descricao)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists candidaturas (
    id int auto_increment primary key,
    vaga_id int not null,
    nome varchar(100) not null,
    email varchar(100) not null,
    telefone varchar(20),
    mensagem text,
    curriculo_nome varchar(255),
    data_candidatura timestamp default current_timestamp,
    foreign key (vaga_id) references vagas(id) on delete cascade,
    index idx_candidaturas_vaga (vaga_id),
    index idx_candidaturas_data (data_candidatura)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists usuarios_admin (
    id int auto_increment primary key,
    nome varchar(100) not null,
    email varchar(100) unique not null,
    senha_hash varchar(255) not null,
    papel enum('recrutador','admin') default 'recrutador',
    ativo tinyint(1) not null default 1,
    ultimo_login timestamp null,
    data_criacao timestamp default current_timestamp
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

insert into vagas (titulo, descricao, requisitos, beneficios, localidade, tipo_contrato, area, status)
values
('Técnico de Manutenção de Ar-Condicionado', 'Atendimento técnico em campo para instalação, manutenção preventiva, corretiva e higienização de equipamentos de climatização.', 'Experiência com split hi-wall\nConhecimento básico em elétrica\nCNH será um diferencial', 'Treinamento técnico\nPossibilidade de crescimento\nAmbiente colaborativo', 'São Paulo/SP - Presencial', 'PJ', 'Operações', 'aberta'),
('Auxiliar Técnico', 'Apoio aos técnicos em campo, organização de ferramentas, preparação de materiais e atendimento ao cliente.', 'Organização\nPontualidade\nVontade de aprender', 'Formação prática\nPlano de evolução\nEquipe experiente', 'São Paulo/SP - Presencial', 'CLT', 'Operações', 'aberta');
