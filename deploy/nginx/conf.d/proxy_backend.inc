# Parametros compartilhados de proxy para o Django.
#
# proxy_pass com VARIAVEL (nao com nome literal) e proposital:
# um "proxy_pass http://web:8000" resolve o DNS UMA VEZ, no carregamento da
# config, e guarda o IP para sempre. Quando o Docker reinicia, o container web
# ganha outro IP e o nginx continua batendo no antigo - resultado: 502 eterno
# ate alguem reiniciar o nginx. Foi exatamente o que aconteceu apos o restart
# do Docker (upstream 172.19.0.6 recusando conexao).
#
# Com a variavel, o nginx resolve a cada requisicao usando o DNS interno do
# Docker (127.0.0.11), declarado no bloco server.
# ATENCAO: com variavel o nginx NAO monta a URI sozinho - dai o $request_uri.
set $upstream_web web:8000;
proxy_pass http://$upstream_web$request_uri;

# X-Forwarded-Proto fixo em "https": o TLS termina no Cloudflare e o tunnel
# entrega HTTP puro aqui. Usar $scheme faria o Django ver "http" e entrar em
# loop de redirect com SECURE_SSL_REDIRECT=True.
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $real_client_ip;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Host  $host;
proxy_redirect off;
proxy_http_version 1.1;
proxy_connect_timeout 30s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;
