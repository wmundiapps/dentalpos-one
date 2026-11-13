"""BuscarDentistas: busca na Receita Federal (dados abertos do CNPJ) as clínicas e consultórios odontológicos
ativos nas cidades pedidas e manda para a lista de captação da AlignSystem (alignsystem.com.br/painel#/captacao).

Adaptado do BuscarLeads do ClubeFaz (wmundiapps/ifaco). Copia-se o código, nunca a lista de contatos.
Roda no computador da equipe: a Receita só responde a internet brasileira. Pede e-mail, senha e código de
2 etapas de administrador da AlignSystem.

Filtro: situação cadastral ativa (02), UF e municípios, CNAE principal ou secundário mapeado em
lib/data/cnae-dentistas.json. O servidor respeita a lista de quem pediu para sair.
"""
import csv
import getpass
import http.cookiejar
import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile

# A Receita publica os arquivos num compartilhamento público (Nextcloud do SERPRO), uma pasta por mês (AAAA-MM).
# Link oficial, o mesmo do dados.gov.br: https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9
RECEITA_HOST = os.environ.get('RECEITA_HOST', 'https://arquivos.receitafederal.gov.br').rstrip('/')
RECEITA_SHARE = os.environ.get('RECEITA_SHARE', 'YggdBLfdninEJX9')
DAV = RECEITA_HOST + '/public.php/webdav/'
API = os.environ.get('ALIGNSYSTEM_API', 'https://alignsystem.com.br/api').rstrip('/')
SITE = 'https://alignsystem.com.br'
IN_ACTIONS = False
BATCH = 500
BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'
csv.field_size_limit(2_000_000_000 if sys.maxsize > 2**32 else 2_000_000)

cookies = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def log(*a):
    print(*a, flush=True)


def fail(msg):
    log('')
    log('ERRO: ' + msg)
    if not IN_ACTIONS:
        input('\nAperte Enter para fechar.')
    sys.exit(1)


def norm(s):
    return unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().upper().strip()


def data_file(name):
    base = getattr(sys, '_MEIPASS', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(base, 'data', name)
    return os.path.join(base, 'lib', 'data', name)


# ------------------------------------------------------------------ download da Receita

SHARE_AUTH = 'Basic ' + __import__('base64').b64encode(f'{RECEITA_SHARE}:'.encode()).decode()


def download(url, dest=None):
    headers = {'User-Agent': BROWSER_UA}
    if url.startswith(RECEITA_HOST):
        headers['Authorization'] = SHARE_AUTH
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                if dest is None:
                    return r.read()
                total = int(r.headers.get('Content-Length') or 0)
                done, last = 0, 0
                with open(dest + '.part', 'wb') as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        if total and not IN_ACTIONS and time.time() - last > 1:
                            last = time.time()
                            print(f'\r  {os.path.basename(dest)}: {done * 100 // total}% de {total // 1_000_000} MB   ', end='', flush=True)
                os.replace(dest + '.part', dest)
                if not IN_ACTIONS:
                    print(f'\r  {os.path.basename(dest)}: baixado ({done // 1_000_000} MB)          ', flush=True)
                return dest
        except Exception as e:  # noqa: BLE001
            log(f'\n  falha ao baixar {url} ({e}); tentativa {attempt + 1}/5')
            time.sleep(10 * (attempt + 1))
    fail(f'Não foi possível baixar {url}. Confira a internet e tente de novo mais tarde.')


def list_dir(path=''):
    """Nomes dentro de uma pasta do compartilhamento (WebDAV PROPFIND)."""
    req = urllib.request.Request(DAV + path, method='PROPFIND', headers={
        'User-Agent': BROWSER_UA, 'Authorization': SHARE_AUTH, 'Depth': '1', 'Content-Type': 'application/xml'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                xml = r.read().decode('utf-8', 'replace')
            hrefs = re.findall(r'<(?:\w+:)?href>([^<]+)</(?:\w+:)?href>', xml)
            names = [urllib.parse.unquote(h.rstrip('/').rsplit('/', 1)[-1]) for h in hrefs]
            own = path.rstrip('/').rsplit('/', 1)[-1] if path else 'webdav'
            return [n for n in names if n and n != own]
        except Exception as e:  # noqa: BLE001
            log(f'  falha ao listar a pasta da Receita ({e}); tentativa {attempt + 1}/5')
            time.sleep(10 * (attempt + 1))
    fail('Não consegui abrir a pasta da Receita. Confira a internet e tente de novo mais tarde.')


MONTH_FILES = {}


def cached(month, name, folder):
    real = MONTH_FILES.get(name.lower(), name)
    path = os.path.join(folder, name)
    if os.path.exists(path) and zipfile.is_zipfile(path):
        log(f'  {name}: já baixado antes, reaproveitando')
        return path
    return download(DAV + month + '/' + urllib.parse.quote(real), path)


def latest_month():
    months = sorted(n for n in list_dir() if re.fullmatch(r'\d{4}-\d{2}', n))
    if not months:
        fail('Nenhuma pasta de mês encontrada no compartilhamento da Receita.')
    return months[-1]


def rows_of(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            with z.open(name) as raw:
                yield from csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''), delimiter=';', quotechar='"')


def digits(s):
    return re.sub(r'\D', '', s or '')


def phone_of(ddd, tel):
    ddd, tel = digits(ddd).lstrip('0'), digits(tel)
    if len(ddd) != 2 or len(tel) not in (8, 9):
        return None
    return ddd + tel


# ------------------------------------------------------------------ envio para a AlignSystem

def api(method, path, payload=None, allow_code=False):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {'Content-Type': 'application/json', 'User-Agent': 'BuscarDentistas/1.0'}
    for attempt in range(6):
        req = urllib.request.Request(API + path, data=body, method=method, headers=headers)
        try:
            with opener.open(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                data = json.loads(e.read().decode('utf-8', 'replace'))
            except Exception:  # noqa: BLE001
                data = {}
            if e.code == 401 and data.get('needCode') and allow_code:
                return data
            if e.code in (400, 401, 403, 404, 409, 423, 429):
                fail(data.get('error') or f'A AlignSystem recusou ({e.code}).')
            log(f"  AlignSystem {e.code} {data.get('error', '')}; tentativa {attempt + 1}/6")
        except Exception as e:  # noqa: BLE001
            log(f'  erro de rede ({e}); tentativa {attempt + 1}/6')
        time.sleep(5 * (attempt + 1))
    fail('A AlignSystem não respondeu. Tente de novo mais tarde.')


def ask(question, default=''):
    answer = input(f'{question}' + (f' [{default}]' if default else '') + ': ').strip()
    return answer or default


# ------------------------------------------------------------------ programa

def main():
    with open(data_file('cnae-dentistas.json'), encoding='utf-8') as f:
        raw = json.load(f)
    mapping = {k: v for k, v in raw.items() if not k.startswith('_')}

    log('=' * 64)
    log(' BuscarDentistas · AlignSystem')
    log(' Busca clínicas e consultórios odontológicos na Receita Federal')
    log(' e manda para a sua lista de captação. Leva de 30 a 60 minutos')
    log(' na primeira vez no mês.')
    log('=' * 64)
    email = ask('\nSeu e-mail de administrador da AlignSystem')
    password = getpass.getpass('Sua senha (não aparece enquanto digita): ')
    login = api('POST', '/auth/login', {'email': email, 'password': password}, allow_code=True)
    if login.get('needCode'):
        code = ask('Código de 6 números do aplicativo autenticador (ou um código de recuperação)')
        api('POST', '/auth/login', {'email': email, 'password': password, 'code': code})
    me = api('GET', '/auth/me')
    if (me.get('user') or {}).get('role') != 'admin':
        fail('Esta conta não é de administrador.')
    log(f"Entrou como {me['user']['name']}.\n")

    uf = ask('Estado (sigla)', 'PR').upper()
    cities = [c.strip() for c in ask('Cidades, separadas por vírgula', 'Maringá, Sarandi, Paiçandu, Marialva').split(',') if c.strip()]
    slugs = list(mapping)
    log('\nCategorias:')
    for i, slug in enumerate(slugs, 1):
        log(f'  {i:>2}. {mapping[slug].get("nome", slug)}')
    picked = ask('Números das categorias separados por vírgula (Enter = todas)')
    chosen = slugs if not picked else [slugs[int(n) - 1] for n in re.findall(r'\d+', picked) if 0 < int(n) <= len(slugs)]
    if not chosen:
        fail('Nenhuma categoria escolhida.')
    folder = os.path.join(os.environ.get('LOCALAPPDATA') or tempfile.gettempdir(), 'BuscarDentistas')

    principal = {cnae: cat for cat in chosen for cnae in mapping[cat].get('principal', [])}
    secundario = {cnae: cat for cat in chosen for cnae in mapping[cat].get('secundario', [])}
    log('\nProcurando o arquivo mais recente da Receita...')
    month = latest_month()
    MONTH_FILES.update({n.lower(): n for n in list_dir(month + '/')})
    if 'estabelecimentos0.zip' not in MONTH_FILES:
        fail(f'A pasta {month} da Receita ainda não tem os arquivos completos. Tente de novo mais tarde.')
    month_folder = os.path.join(folder, month)
    os.makedirs(month_folder, exist_ok=True)
    # Arquivo de mês antigo não serve mais: libera espaço
    for old in os.listdir(folder):
        if old != month and re.fullmatch(r'\d{4}-\d{2}', old):
            shutil.rmtree(os.path.join(folder, old), ignore_errors=True)
    log(f'Arquivo da Receita: {month} · {uf} · {", ".join(cities)} · {len(chosen)} categoria(s)\n')

    wanted = {norm(c) for c in cities}
    city_codes = {r[0]: r[1].strip().title() for r in rows_of(cached(month, 'Municipios.zip', month_folder)) if len(r) >= 2 and norm(r[1]) in wanted}
    missing = wanted - {norm(n) for n in city_codes.values()}
    if not city_codes:
        fail(f'Nenhuma cidade encontrada com esses nomes: {", ".join(cities)}')
    if missing:
        log(f'Atenção: não achei na Receita: {", ".join(sorted(missing))} (confira a grafia)')

    found = {}
    for i in range(10):
        path = cached(month, f'Estabelecimentos{i}.zip', month_folder)
        n = 0
        for r in rows_of(path):
            if len(r) < 28 or r[5] != '02' or r[19] != uf or r[20] not in city_codes:
                continue
            cnae, cat = r[11], principal.get(r[11])
            if not cat:
                hit = next((c for c in (r[12] or '').split(',') if c.strip() in secundario), None)
                if not hit:
                    continue
                cnae, cat = hit.strip(), secundario[hit.strip()]
            email = (r[27] or '').strip().lower()
            found[r[0] + r[1] + r[2]] = {
                'basico': r[0], 'fantasia': r[4].strip(), 'cnae': cnae, 'category': cat, 'city': city_codes[r[20]],
                'phone': phone_of(r[21], r[22]) or phone_of(r[23], r[24]),
                'email': email if re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email) else None,
            }
            n += 1
        log(f'  parte {i + 1}/10: {n} clínicas ativas encontradas')

    basicos = {v['basico'] for v in found.values()}
    empresas = {}
    log('\nBuscando os nomes das empresas...')
    for i in range(10):
        path = cached(month, f'Empresas{i}.zip', month_folder)
        for r in rows_of(path):
            if len(r) >= 3 and r[0] in basicos:
                empresas[r[0]] = r[1].strip()

    items = []
    for cnpj, v in found.items():
        razao = empresas.get(v['basico'], '')
        name = (v['fantasia'] or re.sub(r'^[\d.\-/ ]+', '', razao) or razao)[:200]
        if not name or not (v['phone'] or v['email']):
            continue
        items.append({'cnpj': cnpj, 'name': name, 'category': v['category'], 'cnae': v['cnae'],
                      'city': v['city'][:80], 'phone': v['phone'], 'email': v['email']})

    log(f'\nEnviando {len(items)} contatos com telefone ou e-mail para a AlignSystem...')
    saved = 0
    for start in range(0, len(items), BATCH):
        res = api('POST', '/admin/prospects/import', {'uf': uf, 'sourceMonth': month, 'rows': items[start:start + BATCH]})
        saved += res.get('saved', 0)
        time.sleep(0.3)
    celulares = sum(1 for x in items if x['phone'] and len(x['phone']) == 11 and x['phone'][2] == '9')
    log(f'\nPronto: {saved} contatos na lista de captação ({celulares} com celular).')

    log('Os arquivos da Receita ficam guardados neste computador para a próxima busca do mesmo mês.')
    if ask('Apagar agora os arquivos baixados? (s/n)', 'n').lower().startswith('s'):
        shutil.rmtree(month_folder, ignore_errors=True)
    log('\nAbrindo a tela de captação no painel.')
    webbrowser.open(f'{SITE}/painel#/captacao')
    input('\nAperte Enter para fechar.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        fail('Busca cancelada.')
