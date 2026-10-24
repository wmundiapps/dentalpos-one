# EduMaster Pro – teste local

PowerShell, a partir da pasta do repositório:

    cd deploy\edumaster-local
    .\INICIAR.ps1

Na primeira vez demora alguns minutos (instala dependências, cria banco local e carrega dados de demonstração).
Quando aparecer PRONTO, abra http://localhost:5173

- Admin: admin@ravel.edu.br / Ravel@2026
- Aluno: aluno@ravel.edu.br / Aluno@2026
- Segurança e 2FA: menu da conta > Segurança (QR code para Google Authenticator/Authy)
- LGPD: Configurações > Central LGPD; páginas públicas /privacidade, /termos e /portal-titular (acrescente ?i=ravel-ies)
- Para parar: Ctrl+C. Os dados ficam em .dados (apague a pasta para recomeçar).

Nada aqui usa Supabase nem produção.
