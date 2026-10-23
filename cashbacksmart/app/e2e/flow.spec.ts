import { test, expect, Page, BrowserContext } from '@playwright/test';
import fs from 'fs';
import { Pool } from 'pg';
import { totpAt } from '../lib/security';

const db = new Pool({ connectionString: process.env.E2E_DATABASE_URL || 'postgres://postgres@localhost:5433/cashbacksmart_e2e' });

const SHOTS = 'e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString().slice(-6);
const bizEmail = `loja${stamp}@e2e.com`;
const cliEmail = `cliente${stamp}@e2e.com`;

async function login(page: Page, email: string, password: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe.serial('fluxo completo empresa + cliente', () => {
  let biz: BrowserContext, cli: BrowserContext;
  let bizPage: Page, cliPage: Page;
  let memberCode = '';

  test.beforeAll(async ({ browser }) => {
    biz = await browser.newContext();
    cli = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    bizPage = await biz.newPage();
    cliPage = await cli.newPage();
  });
  test.afterAll(async () => {
    await biz.close();
    await cli.close();
  });

  test('landing page carrega com chamadas e calculadora', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dinheiro de volta');
    await expect(page.getByRole('link', { name: 'Criar conta grátis' }).first()).toBeVisible();
    await expect(page.getByText('APROVEITE: 6 meses de mensalidade grátis. Cadastre sua loja!')).toBeVisible();
    await expect(page.getByText(/cancele quando quiser, sem multa e sem perguntas/).first()).toBeVisible();
    await expect(page.locator('.lp-calc-total dd')).toHaveText(/R\$\s?189,90/); // 49,90 + 20% de (70% de 20.000 × 5%)
    await page.screenshot({ path: `${SHOTS}/landing-desktop.png`, fullPage: true });
  });

  test('empresa se cadastra com cashback percentual', async () => {
    await bizPage.goto('/cadastro/empresa');
    await bizPage.getByLabel('Nome da empresa', { exact: true }).fill('Açaí do Teste');
    await bizPage.getByLabel('Ramo', { exact: true }).selectOption('Alimentação');
    await bizPage.getByLabel('CNPJ', { exact: true }).fill('19.131.243/0001-97');
    await bizPage.getByLabel('Bairro', { exact: true }).fill('Zona 7');
    await bizPage.getByLabel('Cidade', { exact: true }).fill('Maringá');
    await bizPage.getByLabel('Valor do cashback', { exact: true }).fill('10');
    await bizPage.getByLabel('Seu nome', { exact: true }).fill('Dona Teste');
    await bizPage.getByLabel('E-mail', { exact: true }).fill(bizEmail);
    await bizPage.getByLabel('Celular com DDD', { exact: true }).fill('44999998888');
    await bizPage.getByLabel('Senha', { exact: true }).fill('senha12345');
    await bizPage.getByRole('checkbox').check();
    await bizPage.getByRole('button', { name: 'Cadastrar minha loja' }).click();
    await expect(bizPage).toHaveURL(/\/painel/);
    await expect(bizPage.getByText('Empresa cadastrada!')).toBeVisible();
    await expect(bizPage.getByText(/Sem mensalidade até/)).toBeVisible();
  });

  test('empresa cria regra de valor fixo', async () => {
    await bizPage.goto('/painel/regras');
    await bizPage.getByLabel('Nome da regra', { exact: true }).fill('Combo R$ 5 de volta');
    await bizPage.getByText('Valor fixo R$').click();
    await bizPage.getByLabel('Valor por compra (R$)', { exact: true }).fill('5,00');
    await bizPage.getByLabel('Compra mínima (R$, opcional)', { exact: true }).fill('80,00');
    await bizPage.getByRole('button', { name: 'Salvar regra' }).click();
    await expect(bizPage.getByText('Regra salva')).toBeVisible();
    await expect(bizPage.getByText('R$ 5,00 de volta por compra · em compras a partir de R$ 80,00')).toBeVisible();
  });

  test('validação de formulário mostra erro claro', async () => {
    await cliPage.goto('/cadastro');
    await cliPage.getByLabel('Nome completo', { exact: true }).fill('Teste Erro');
    await cliPage.getByLabel('E-mail', { exact: true }).fill('erro@e2e.com');
    await cliPage.getByLabel('Celular com DDD', { exact: true }).fill('44999990000');
    await cliPage.getByLabel('CPF', { exact: true }).fill('123.456.789-00');
    await cliPage.getByLabel('Cidade', { exact: true }).fill('Maringá');
    await cliPage.getByLabel('Senha', { exact: true }).fill('senha12345');
    await cliPage.getByRole('checkbox').check();
    await cliPage.getByRole('button', { name: 'Criar conta grátis' }).click();
    await expect(cliPage.locator('p.alert.error')).toHaveText('CPF inválido');
  });

  test('cliente se cadastra no celular e vê as lojas da cidade', async () => {
    await cliPage.goto('/cadastro');
    await cliPage.getByLabel('Nome completo', { exact: true }).fill('Carlos Cliente');
    await cliPage.getByLabel('E-mail', { exact: true }).fill(cliEmail);
    await cliPage.getByLabel('Celular com DDD', { exact: true }).fill('44977776666');
    await cliPage.getByLabel('CPF', { exact: true }).fill('111.444.777-35');
    await cliPage.getByLabel('Cidade', { exact: true }).fill('maringá');
    await cliPage.getByLabel('Senha', { exact: true }).fill('senha12345');
    await cliPage.getByRole('checkbox').check();
    await cliPage.getByRole('button', { name: 'Criar conta grátis' }).click();
    await expect(cliPage).toHaveURL(/\/app/);
    await expect(cliPage.getByText(/Sua conta é grátis/)).toBeVisible();
    await expect(cliPage.locator('.store', { hasText: 'Açaí do Teste' })).toBeVisible();
    await expect(cliPage.locator('.store', { hasText: 'Padaria Trigo Bom' })).toBeVisible();
    await cliPage.screenshot({ path: `${SHOTS}/cliente-inicio-mobile.png`, fullPage: true });
    await cliPage.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Meu código' }).click();
    memberCode = (await cliPage.getByTestId('member-code').innerText()).replace(/\s/g, '');
    expect(memberCode).toMatch(/^[A-Z0-9]{8}$/);
    await cliPage.screenshot({ path: `${SHOTS}/cliente-codigo-mobile.png` });
  });

  test('loja lança a primeira compra: cliente novo ganha a promoção de 30%', async () => {
    await bizPage.goto('/painel/lancar');
    await bizPage.getByLabel('Cliente', { exact: true }).fill(memberCode);
    await bizPage.getByLabel('Valor da compra (R$)', { exact: true }).fill('45,90');
    await bizPage.getByRole('button', { name: 'Registrar compra' }).click();
    const r = bizPage.getByTestId('purchase-result');
    await expect(r).toContainText('Carlos Cliente');
    await expect(r.locator('.amount')).toHaveText(/\+R\$\s?13,77/);
    await bizPage.screenshot({ path: `${SHOTS}/empresa-lancamento.png`, fullPage: true });
  });

  test('loja encontra o cliente pelo CPF', async () => {
    await bizPage.getByLabel('Cliente', { exact: true }).fill('111.444.777-35'); // pelo CPF
    await bizPage.getByLabel('Valor da compra (R$)', { exact: true }).fill('30,00');
    await bizPage.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(bizPage.getByTestId('purchase-result').locator('.amount')).toHaveText(/\+R\$\s?3,00/);
    await bizPage.getByLabel('Cliente', { exact: true }).fill(memberCode);
    await bizPage.getByLabel('Valor da compra (R$)', { exact: true }).fill('40');
    await bizPage.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(bizPage.getByTestId('purchase-result').locator('.amount')).toHaveText(/\+R\$\s?4,00/);
  });

  test('cliente vê saldo na carteira e gera código de resgate', async () => {
    await cliPage.goto('/app/carteira');
    await expect(cliPage.getByTestId('wallet-total')).toHaveText(/R\$\s?20,77/);
    await cliPage.locator('.store', { hasText: 'Açaí do Teste' }).click();
    await cliPage.getByRole('button', { name: 'Usar meu saldo nesta loja' }).click();
    await expect(cliPage.getByTestId('redemption-code')).toHaveText(/^\d{6}$/);
    await cliPage.screenshot({ path: `${SHOTS}/cliente-resgate-mobile.png`, fullPage: true });
  });

  test('loja aplica o código de resgate e calcula cashback sobre o valor pago', async () => {
    const code = await cliPage.getByTestId('redemption-code').innerText();
    await bizPage.goto('/painel/lancar');
    await bizPage.getByLabel('Cliente', { exact: true }).fill(memberCode);
    await bizPage.getByLabel('Valor da compra (R$)', { exact: true }).fill('40,00');
    await bizPage.getByText('Cliente quer usar o saldo').click();
    await bizPage.getByLabel('Código de resgate (6 números do app do cliente)', { exact: true }).fill(code);
    await bizPage.getByRole('button', { name: 'Registrar compra' }).click();
    const r = bizPage.getByTestId('purchase-result');
    await expect(r).toContainText(/Saldo usado pelo cliente: −R\$\s?20,77/);
    await expect(r).toContainText(/Cobrar do cliente: R\$\s?19,23/);
    await expect(r.locator('.amount')).toHaveText(/\+R\$\s?1,92/);
  });

  test('painel mostra as compras e permite cancelar', async () => {
    await bizPage.goto('/painel');
    await expect(bizPage.locator('table tbody tr')).toHaveCount(4);
    bizPage.once('dialog', (d) => d.accept());
    await bizPage.locator('table tbody tr').first().getByRole('button', { name: 'Cancelar' }).click();
    await expect(bizPage.locator('table tbody tr').first().getByText('Cancelada')).toBeVisible();
    await bizPage.screenshot({ path: `${SHOTS}/empresa-painel.png`, fullPage: true });
    // o saldo usado volta para o cliente
    await cliPage.goto('/app/carteira');
    await expect(cliPage.getByTestId('wallet-total')).toHaveText(/R\$\s?20,77/);
  });

  test('loja envia campanha local e a oferta aparece no app do cliente', async () => {
    await bizPage.goto('/painel/campanhas');
    await bizPage.getByLabel('Assunto', { exact: true }).fill('Sexta tem açaí em dobro');
    await bizPage.getByLabel('Mensagem', { exact: true }).fill('Toda sexta, 20% de volta no açaí de 500 ml.\n\nRua das Flores, 100.');
    await bizPage.getByRole('button', { name: 'Enviar campanha' }).click();
    await expect(bizPage.getByText(/Campanha enviada para \d+ pessoas/)).toBeVisible();
    await bizPage.reload();
    await expect(bizPage.locator('table', { hasText: 'Sexta tem açaí em dobro' })).toContainText('Enviada');
    await bizPage.screenshot({ path: `${SHOTS}/empresa-campanhas.png`, fullPage: true });
    await cliPage.goto('/app');
    await expect(cliPage.getByText('Sexta tem açaí em dobro')).toBeVisible();
  });

  test('campanha nacional sem pacote é recusada; compra de pacote gera fatura', async () => {
    await bizPage.getByText('Nacional (pacote)').click();
    await bizPage.getByLabel('Assunto', { exact: true }).fill('Oferta para o Brasil');
    await bizPage.getByLabel('Mensagem', { exact: true }).fill('Mensagem de alcance nacional.');
    await bizPage.getByRole('button', { name: 'Enviar campanha' }).click();
    await expect(bizPage.locator('p.alert.error')).toContainText('Compre um pacote');
    await bizPage.locator('form', { hasText: '10.000 e-mails' }).getByRole('button', { name: 'Comprar' }).click();
    await expect(bizPage.getByText('Pedido criado')).toBeVisible();
    await bizPage.goto('/painel/faturas');
    await expect(bizPage.getByText('Nacional 10 mil e-mails')).toBeVisible();
    await expect(bizPage.getByText('A pagar')).toBeVisible();
  });

  test('admin é obrigado a ativar 2FA, depois dá baixa na fatura e a loja recebe os créditos', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, 'admin@e2e.com', 'Painel#Seguro2026');
    await expect(page).toHaveURL(/\/seguranca/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/seguranca\?obrigatorio=1/);
    await expect(page.getByText('Administradores precisam ativar')).toBeVisible();
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
    const secret = (await page.getByTestId('totp-secret').innerText()).trim();
    await page.getByLabel('Código do aplicativo', { exact: true }).fill(totpAt(secret));
    await page.getByRole('button', { name: 'Confirmar e ativar' }).click();
    await expect(page.getByTestId('recovery-codes')).toContainText('Pronto, está ativa');
    await page.screenshot({ path: `${SHOTS}/seguranca-2fa.png`, fullPage: true });
    await page.goto('/admin');
    await expect(page.getByText('Empresas', { exact: true }).first()).toBeVisible();
    await page.goto('/admin/faturas?q=Açaí');
    await page.getByRole('button', { name: 'Dar baixa' }).first().click();
    await expect(page.getByText(/^Paga /).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/admin-faturas.png`, fullPage: true });
    // novo login pede o código
    await ctx.clearCookies();
    await login(page, 'admin@e2e.com', 'Painel#Seguro2026');
    await expect(page).toHaveURL(/\/entrar\/verificar/);
    await page.getByLabel('Código', { exact: true }).fill('000000');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.locator('p.alert.error')).toContainText('Código inválido');
    await page.getByLabel('Código', { exact: true }).fill(totpAt(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page).toHaveURL(/\/admin/);
    await ctx.close();
    await bizPage.goto('/painel/campanhas');
    await expect(bizPage.locator('.stat', { hasText: 'e-mails nacionais' }).locator('.v')).toHaveText('10.000');
  });

  test('operador de caixa entra e só vê o necessário', async ({ browser }) => {
    await bizPage.goto('/painel/empresa');
    await bizPage.locator('form', { hasText: 'Senha inicial' }).getByLabel('Nome', { exact: true }).fill('Caixa Um');
    await bizPage.locator('form', { hasText: 'Senha inicial' }).getByLabel('E-mail', { exact: true }).fill(`caixa${stamp}@e2e.com`);
    await bizPage.getByLabel('Senha inicial', { exact: true }).fill('senha12345');
    await bizPage.getByRole('button', { name: 'Adicionar' }).click();
    await expect(bizPage.getByText('Operador adicionado')).toBeVisible();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, `caixa${stamp}@e2e.com`, 'senha12345');
    await expect(page).toHaveURL(/\/painel/);
    await page.goto('/painel/faturas');
    await expect(page).toHaveURL(/\/painel$/);
    await page.goto('/painel/lancar');
    await page.getByLabel('Cliente', { exact: true }).fill(memberCode);
    await page.getByLabel('Valor da compra (R$)', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(page.getByTestId('purchase-result').locator('.amount')).toHaveText(/\+R\$\s?1,00/);
    await ctx.close();
  });

  test('robô de atendimento responde o saldo no app', async () => {
    await cliPage.goto('/app');
    await cliPage.getByRole('link', { name: 'Ajuda' }).click();
    await expect(cliPage).toHaveURL(/\/app\/ajuda/);
    await cliPage.getByLabel('Mensagem', { exact: true }).fill('qual o meu saldo?');
    await cliPage.getByRole('button', { name: 'Enviar' }).click();
    await expect(cliPage.getByTestId('chat-log')).toContainText(/Açaí do Teste: R\$\s?\d/);
    await cliPage.screenshot({ path: `${SHOTS}/cliente-ajuda-mobile.png`, fullPage: true });
  });

  test('kit do caixa: cliente aponta para o QR da loja, envia a foto da nota e a loja confirma', async () => {
    await bizPage.goto('/painel/kit');
    await expect(bizPage.getByRole('button', { name: 'Imprimir ou salvar em PDF' })).toBeVisible();
    const link = (await bizPage.getByText(/Link do seu QR:/).innerText()).replace('Link do seu QR:', '').trim();
    expect(link).toMatch(/\/n\/[0-9A-F]{8}$/);
    await bizPage.screenshot({ path: `${SHOTS}/empresa-kit-caixa.png`, fullPage: true });
    await cliPage.goto(new URL(link).pathname + '?modo=foto');
    await expect(cliPage.getByRole('heading', { name: 'Açaí do Teste' })).toBeVisible();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await cliPage.getByLabel('Foto da nota fiscal', { exact: true }).setInputFiles({ name: 'nota.png', mimeType: 'image/png', buffer: png });
    await cliPage.getByLabel('Valor total (R$)', { exact: true }).fill('25,00');
    await cliPage.getByLabel('Número da nota', { exact: true }).fill('4321');
    await cliPage.getByRole('button', { name: 'Enviar nota' }).click();
    await expect(cliPage.getByText(/Nota enviada para a Açaí do Teste/)).toBeVisible();
    await cliPage.screenshot({ path: `${SHOTS}/cliente-nota-foto-mobile.png`, fullPage: true });
    await bizPage.goto('/painel');
    await expect(bizPage.getByText('Notas enviadas por clientes (1)')).toBeVisible();
    await expect(bizPage.getByAltText('Foto da nota enviada pelo cliente')).toBeVisible();
    await bizPage.getByRole('button', { name: 'Confirmar compra' }).click();
    await expect(bizPage.getByText('Notas enviadas por clientes (1)')).toBeHidden();
    await expect(bizPage.locator('table tbody tr').first()).toContainText(/R\$\s?25,00/);
  });

  test('cliente escolhe receber avisos por SMS', async () => {
    await cliPage.goto('/app/conta');
    await cliPage.getByLabel('Canal de aviso', { exact: true }).selectOption('sms');
    await cliPage.getByRole('button', { name: 'Salvar' }).click();
    await expect(async () => {
      await cliPage.reload();
      await expect(cliPage.getByLabel('Canal de aviso', { exact: true })).toHaveValue('sms', { timeout: 1000 });
    }).toPass({ timeout: 10000 });
    const r = await db.query(`select count(*) n from message_outbox m join users u on u.id=m.user_id where u.email=$1 and m.kind='cashback'`, [cliEmail]);
    expect(Number(r.rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  test('cliente pode parar de receber e-mails e sair', async () => {
    await cliPage.goto('/app/conta');
    await expect(cliPage.getByText('Conta grátis', { exact: true }).first()).toBeVisible();
    await cliPage.getByRole('button', { name: 'Parar de receber por e-mail' }).click();
    await expect(cliPage.getByRole('button', { name: 'Voltar a receber por e-mail' })).toBeVisible();
    await cliPage.screenshot({ path: `${SHOTS}/cliente-conta-mobile.png`, fullPage: true });
    await cliPage.getByRole('button', { name: 'Sair' }).click();
    await expect(cliPage).toHaveURL('/');
    await cliPage.goto('/app');
    await expect(cliPage).toHaveURL(/\/entrar/);
  });
});

test('LGPD: cliente baixa os dados e exclui a conta', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `lgpd${Date.now()}@e2e.com`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome completo', { exact: true }).fill('Cliente Lgpd');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Celular com DDD', { exact: true }).fill('44991230000');
  await page.getByLabel('CPF', { exact: true }).fill('168.995.350-09');
  await page.getByLabel('Cidade', { exact: true }).fill('Maringá');
  await page.getByLabel('Senha', { exact: true }).fill('senha12345');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta grátis' }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto('/app/conta');
  const res = await page.request.get('/api/conta/exportar');
  expect(res.status()).toBe(200);
  expect((await res.json()).conta.email).toBe(email);
  await page.locator('summary', { hasText: 'Excluir minha conta' }).click();
  await page.getByLabel('Senha', { exact: true }).fill('senha12345');
  await page.getByLabel('Digite EXCLUIR para confirmar').fill('EXCLUIR');
  await page.getByRole('button', { name: 'Excluir minha conta para sempre' }).click();
  await expect(page).toHaveURL(/\/entrar\?conta=excluida/);
  await expect(page.getByText('Sua conta foi excluída')).toBeVisible();
  await login(page, email, 'senha12345');
  await expect(page.locator('p.alert.error')).toHaveText('E-mail ou senha incorretos');
  await ctx.close();
});

test('recuperação de senha por link de uso único', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('cliente@demo.cashbacksmart.com.br');
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText('Se houver uma conta com este e-mail')).toBeVisible();
  const r = await db.query(`select html from email_outbox where kind='reset' and to_email='cliente@demo.cashbacksmart.com.br' order by id desc limit 1`);
  const link = r.rows[0].html.match(/redefinir-senha\?t=([A-Za-z0-9_-]+)/)[0];
  await page.goto('/' + link);
  await page.getByLabel('Nova senha', { exact: true }).fill('NovaSenha#2026');
  await page.getByLabel('Repita a nova senha', { exact: true }).fill('NovaSenha#2026');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page).toHaveURL(/\/entrar\?senha=1/);
  await login(page, 'cliente@demo.cashbacksmart.com.br', 'NovaSenha#2026');
  await expect(page).toHaveURL(/\/app/);
  await page.goto('/' + link);
  await page.getByLabel('Nova senha', { exact: true }).fill('OutraSenha#2026');
  await page.getByLabel('Repita a nova senha', { exact: true }).fill('OutraSenha#2026');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.locator('p.alert.error')).toContainText('inválido ou vencido');
});

test('cabeçalhos de segurança e monitor de saúde', async ({ request }) => {
  const r = await request.get('/');
  const h = r.headers();
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['strict-transport-security']).toContain('max-age');
  expect(h['x-powered-by']).toBeUndefined();
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).db).toBe(true);
});

test('segurança: rotas protegidas e agendador exigem autenticação', async ({ request, page }) => {
  expect((await request.get('/api/cron')).status()).toBe(401);
  const ok = await request.get('/api/cron?job=billing', { headers: { Authorization: 'Bearer e2e-cron' } });
  expect(ok.status()).toBe(200);
  expect((await request.post('/api/webhooks/asaas', { data: {} })).status()).toBe(401);
  expect((await request.post('/api/webhooks/stripe', { data: {} })).status()).toBe(401);
  expect((await request.get('/api/nota-foto/00000000-0000-0000-0000-000000000000')).status()).toBe(401);
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/entrar/);
  await login(page, 'farmacia@demo.cashbacksmart.com.br', 'errada');
  await expect(page.locator('p.alert.error')).toHaveText('E-mail ou senha incorretos');
});

test('QR do caixa sem login leva ao cadastro e volta para a loja', async ({ page }) => {
  await page.goto('/n/PADARIA1');
  await expect(page.getByRole('heading', { name: 'Padaria Trigo Bom' })).toBeVisible();
  await expect(page.getByText('Ganhe 10% de volta nesta compra')).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta grátis' }).click();
  await expect(page).toHaveURL(/\/cadastro\?volta=%2Fn%2FPADARIA1/);
  await page.getByLabel('Nome completo', { exact: true }).fill('Lia Caixa');
  await page.getByLabel('E-mail', { exact: true }).fill(`lia${stamp}@e2e.com`);
  await page.getByLabel('Celular com DDD', { exact: true }).fill('44966665555');
  await page.getByLabel('CPF', { exact: true }).fill('390.533.447-05');
  await page.getByLabel('Cidade', { exact: true }).fill('Maringá');
  await page.getByLabel('Senha', { exact: true }).fill('Cliente#2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar conta grátis' }).click();
  await expect(page).toHaveURL(/\/n\/PADARIA1/);
  await expect(page.getByRole('tab', { name: 'Foto da nota' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/cliente-qr-caixa.png`, fullPage: true });
});

test('captação de leads: contato chega no painel da loja', async ({ page, browser }) => {
  await page.goto('/l/cafe-da-manha-gratis');
  await expect(page.getByRole('heading', { name: 'Café da manhã com 30% de volta' })).toBeVisible();
  await page.getByLabel('Seu nome', { exact: true }).fill('Marina Lead');
  await page.getByLabel('WhatsApp com DDD', { exact: true }).fill('(44) 98888-1234');
  await page.getByRole('button', { name: 'Quero a oferta' }).click();
  await expect(page.locator('p.alert.error')).toContainText('autorização');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Quero a oferta' }).click();
  await expect(page.getByText(/A loja vai falar com você/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/lead-pagina.png`, fullPage: true });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, 'padaria@demo.cashbacksmart.com.br', 'Demo#2026');
  await expect(p2).toHaveURL(/\/painel/);
  await p2.goto('/painel/leads');
  await expect(p2.getByText('Marina Lead')).toBeVisible();
  await expect(p2.getByRole('link', { name: 'Chamar no WhatsApp' }).first()).toHaveAttribute('href', /wa\.me\/5544988881234/);
  await p2.screenshot({ path: `${SHOTS}/empresa-leads.png`, fullPage: true });
  await ctx.close();
});

test.afterAll(async () => {
  await db.end();
});
