/**
 * Teste de fumaça do site no ar: npm run smoke -- https://cashbacksmart.com.br
 * Confere saúde, páginas públicas, cabeçalhos de segurança e que as áreas protegidas continuam protegidas.
 */
const base = (process.argv[2] || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
async function check(name: string, fn: () => Promise<string | true>) {
  try {
    const r = await fn();
    if (r === true) console.log(`ok       ${name}`);
    else {
      failed++;
      console.log(`FALHOU   ${name} → ${r}`);
    }
  } catch (e) {
    failed++;
    console.log(`FALHOU   ${name} → ${(e as Error).message}`);
  }
}
const get = (p: string, init: RequestInit = {}) => fetch(base + p, { redirect: 'manual', ...init });
const expectStatus = (p: string, status: number | number[], init?: RequestInit) => async () => {
  const r = await get(p, init);
  return [status].flat().includes(r.status) ? true : `status ${r.status}`;
};

(async () => {
  console.log(`Testando ${base}\n`);
  await check('saúde e banco (/api/health)', async () => {
    const r = await get('/api/health');
    const j = (await r.json()) as { db?: boolean };
    return r.status === 200 && j.db ? true : `status ${r.status}, db=${j.db}`;
  });
  await check('página inicial', expectStatus('/', 200));
  await check('termos e privacidade', expectStatus('/termos', 200));
  await check('endereço curto /privacidade', expectStatus('/privacidade', [307, 308]));
  await check('robots.txt', expectStatus('/robots.txt', 200));
  await check('sitemap.xml', expectStatus('/sitemap.xml', 200));
  await check('cadastro do cliente', expectStatus('/cadastro', 200));
  await check('cadastro da empresa', expectStatus('/cadastro/empresa', 200));
  await check('versão do app (/api/version)', expectStatus('/api/version', 200));
  await check('painel exige login', async () => {
    const r = await get('/painel');
    return r.status >= 300 && r.status < 400 && (r.headers.get('location') || '').includes('/entrar') ? true : `status ${r.status}`;
  });
  await check('admin exige login', async () => {
    const r = await get('/admin');
    return r.status >= 300 && r.status < 400 && (r.headers.get('location') || '').includes('/entrar') ? true : `status ${r.status}`;
  });
  await check('agendador recusa quem não tem o segredo', expectStatus('/api/cron', 401));
  await check('webhook do Asaas recusa sem token', expectStatus('/api/webhooks/asaas', [401, 403], { method: 'POST', body: '{}' }));
  await check('webhook do Stripe recusa sem assinatura', expectStatus('/api/webhooks/stripe', [400, 401, 403], { method: 'POST', body: '{}' }));
  await check('exportar dados exige login', expectStatus('/api/conta/exportar', 401));
  await check('cabeçalhos de segurança', async () => {
    const h = (await get('/')).headers;
    const miss = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy'].filter((k) => !h.get(k));
    if (base.startsWith('https://') && !h.get('strict-transport-security')) miss.push('strict-transport-security');
    if (h.get('x-powered-by')) miss.push('x-powered-by deve sumir');
    return miss.length ? `faltando: ${miss.join(', ')}` : true;
  });
  console.log(failed ? `\n${failed} verificação(ões) falharam.` : '\nTudo certo.');
  process.exit(failed ? 1 : 0);
})();
