// Fixtures do monitor do DOU (testes e demo): NÃO dependem de rede.
// Instituição fictícia: "Instituto Ravel de Ensino Superior" (CNPJ 12.345.678/0001-90, e-MEC 4321).

export const DOU_PALAVRAS_DEMO = [
  { termo: 'Instituto Ravel de Ensino Superior', tipo: 'INSTITUICAO', peso: 10 },
  { termo: '12.345.678/0001-90', tipo: 'CNPJ', peso: 10 },
  { termo: '4321', tipo: 'EMEC', peso: 8 },
  { termo: 'Odontologia', tipo: 'CURSO', peso: 6 },
  { termo: 'Enfermagem', tipo: 'CURSO', peso: 6 },
]

export const DOU_XML_INLABS = `<?xml version="1.0" encoding="UTF-8"?>
<xml>
<article id="30001" name="PORTARIA Nº 812, DE 27 DE OUTUBRO DE 2026" idOficio="9001" pubName="DO1" artType="Portaria" pubDate="28/10/2026" artClass="00012345" artCategory="Ministério da Educação/Secretaria de Regulação e Supervisão da Educação Superior" artSize="12" artNotes="" numberPage="41" pdfPage="https://www.in.gov.br/web/dou/-/portaria-812" editionNumber="205" highlightType="" highlightPriority="" highlightimage="" highlightimagename="" idMateria="30001">
<body>
<Identifica><![CDATA[PORTARIA Nº 812, DE 27 DE OUTUBRO DE 2026]]></Identifica>
<Data><![CDATA[28/10/2026]]></Data>
<Ementa><![CDATA[Reconhece o curso de Odontologia, bacharelado, ministrado pelo Instituto Ravel de Ensino Superior, CNPJ 12.345.678/0001-90, e-MEC 4321, em Ribeirão Preto/SP.]]></Ementa>
<Titulo/>
<SubTitulo/>
<Texto><![CDATA[<p>O SECRETÁRIO DE REGULAÇÃO E SUPERVISÃO DA EDUCAÇÃO SUPERIOR resolve:</p><p>Art. 1º Fica reconhecido o curso de Odontologia, 120 vagas anuais. Art. 2º A instituição deverá protocolar o aditamento no prazo de 30 (trinta) dias.</p>]]></Texto>
</body>
<Autores/>
</article>
<article id="30002" name="PORTARIA Nº 5.100, DE 20 DE OUTUBRO DE 2026" pubName="DO1" artType="Portaria" pubDate="28/10/2026" artCategory="Ministério da Educação/Gabinete do Ministro" numberPage="42" pdfPage="https://www.in.gov.br/web/dou/-/portaria-5100" idMateria="30002">
<body>
<Identifica><![CDATA[PORTARIA Nº 5.100, DE 20 DE OUTUBRO DE 2026]]></Identifica>
<Ementa><![CDATA[Institui diretrizes para o calendário do Cadastro e-MEC e regulamenta o fluxo de processos de regulação.]]></Ementa>
<Texto><![CDATA[<p>Art. 1º Ficam instituídas as diretrizes para o calendário do cadastro e-MEC.</p>]]></Texto>
</body>
</article>
<article id="30003" name="DESPACHO" pubName="DO2" artType="Despacho" pubDate="28/10/2026" artCategory="Ministério da Fazenda/Secretaria do Tesouro" numberPage="7" idMateria="30003">
<body>
<Identifica><![CDATA[DESPACHO Nº 77, DE 26 DE OUTUBRO DE 2026]]></Identifica>
<Ementa><![CDATA[Aprova a abertura de crédito suplementar em favor da Secretaria do Tesouro.]]></Ementa>
<Texto><![CDATA[<p>Aprovo a abertura de crédito suplementar.</p>]]></Texto>
</body>
</article>
<article id="30004" name="PORTARIA Nº 900" pubName="DO1" artType="Portaria" pubDate="28/10/2026" artCategory="Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira" numberPage="55" idMateria="30004">
<body>
<Identifica><![CDATA[PORTARIA Nº 900, DE 27 DE OUTUBRO DE 2026]]></Identifica>
<Ementa><![CDATA[Divulga o cronograma do ENADE 2026 e os cursos de Enfermagem e Odontologia que participarão do exame, com prazo de 10 (dez) dias para a inscrição dos estudantes.]]></Ementa>
<Texto><![CDATA[<p>Art. 1º Estão convocados os cursos de Enfermagem e Odontologia.</p>]]></Texto>
</body>
</article>
</xml>`

export const DOU_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>DOU - Seção 1</title>
<item>
<title>Resolução CNE/CES nº 3, de 22 de outubro de 2026</title>
<link>https://www.in.gov.br/web/dou/-/resolucao-cne-ces-3</link>
<description><![CDATA[Altera as Diretrizes Curriculares Nacionais dos cursos de Odontologia. Conselho Nacional de Educação.]]></description>
<pubDate>Wed, 28 Oct 2026 08:00:00 -0300</pubDate>
<guid>rss-cne-ces-3-2026</guid>
<category>Conselho Nacional de Educação</category>
</item>
<item>
<title>Portaria nº 3, de 2 de outubro de 2026 - Ministério dos Transportes</title>
<link>https://www.in.gov.br/web/dou/-/portaria-3-transportes</link>
<description>Dispõe sobre faixas de rolamento.</description>
<pubDate>Wed, 28 Oct 2026 08:00:00 -0300</pubDate>
<guid>rss-transp-3-2026</guid>
</item>
</channel></rss>`

export const DOU_TEXTO_COLADO = `Diário Oficial da União - Seção 1 - 29/10/2026
MINISTÉRIO DA EDUCAÇÃO
PORTARIA Nº 1.234, DE 28 DE OUTUBRO DE 2026
Aplica medida cautelar de suspensão de ingresso de novos estudantes nos cursos de Enfermagem do Instituto Ravel de Ensino Superior, com prazo de 15 (quinze) dias para manifestação.
Art. 1º Fica suspenso o ingresso.
---
Diário Oficial da União - Seção 1 - 29/10/2026
MINISTÉRIO DA EDUCAÇÃO
DESPACHO Nº 55, DE 28 DE OUTUBRO DE 2026
Homologa parecer do Conselho Nacional de Educação sobre o Prouni.
---
Diário Oficial da União - Seção 3 - 29/10/2026
EDITAL Nº 9/2026
Pregão eletrônico para aquisição de material de escritório da Universidade Federal de Exemplo.`
