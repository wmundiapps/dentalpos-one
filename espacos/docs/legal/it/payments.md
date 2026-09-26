# Pagamenti Internazionali

Versione 2026-09-24 · In vigore dal 24/09/2026

## 1. Oggetto

1.1. Il presente documento fa parte integrante dei Termini di Utilizzo e disciplina l'addebito, l'elaborazione, il versamento, i rimborsi e le trattenute degli importi relativi alle Prenotazioni.

1.2. I pagamenti sono elaborati da istituti di pagamento e acquirer partner, debitamente autorizzati in ciascuna giurisdizione. L'Operatore agisce come agente di riscossione limitato dell'Host: il pagamento effettuato dal Locatario alla Piattaforma estingue l'obbligazione del Locatario nei confronti dell'Host.

## 2. Valuta

2.1. Ogni Spazio è prezzato nella **valuta ufficiale del Paese in cui si trova** (ad esempio, BRL in Brasile, EUR in Portogallo, USD negli Stati Uniti, in Ecuador, a Panama e a El Salvador). La Prenotazione viene addebitata in tale valuta.

2.2. La Piattaforma può mostrare importi approssimativi nella valuta del Locatario solo a titolo di riferimento. Se il mezzo di pagamento del Locatario è in un'altra valuta, la **conversione viene effettuata dall'emittente** della carta o del conto, con tasso, commissioni e imposte (come l'IOF in Brasile) definiti da quest'ultimo, sui quali l'Operatore non ha controllo.

2.3. Gli importi vengono arrotondati secondo i decimali della valuta (ad esempio, zero decimali per JPY e CLP).

## 3. Composizione del prezzo

3.1. Il totale pagato dal Locatario è composto da:

| Componente | Calcolo |
|---|---|
| Valore Base | Somma, per Fascia prenotata, di ore × prezzo orario, o prezzo giornaliero per Fasce prenotate di 6 ore o più quando più vantaggioso |
| Commissione di Pulizia | Importo fisso per Fascia prenotata, definito dall'Host, limitato al 30% del Valore Base |
| Commissione di servizio del Locatario | **15%** su (Valore Base + Commissione di Pulizia) |
| Imposta sulla Commissione di servizio | Aliquota di riferimento del Paese (es.: ISS 5% in Brasile, IVA 16% in Messico, IVA 23% in Portogallo) applicata sulla Commissione di servizio |
| **Totale** | Somma delle voci sopra indicate |

3.2. Il versamento all'Host è:

| Componente | Calcolo |
|---|---|
| Valore Base + Commissione di Pulizia | Integrale |
| (–) Commissione di servizio dell'Host | **5%** su (Valore Base + Commissione di Pulizia) |
| (–) Trattenute legali, penali e rettifiche | Quando applicabili |
| **Versamento** | Risultato |

3.3. **Esempio (Brasile).** Prenotazione di 4 ore a R$ 80/ora, Commissione di Pulizia di R$ 30. Valore Base: R$ 320. Commissione di servizio del Locatario: 15% × R$ 350 = R$ 52,50. ISS di riferimento (5%) sulla Commissione di servizio: R$ 2,63. Totale pagato: R$ 405,13. Commissione dell'Host: 5% × R$ 350 = R$ 17,50. Versamento all'Host: R$ 332,50.

3.4. Il dettaglio completo viene mostrato prima della conferma. Non vi sono addebiti nascosti.

## 4. Mezzi di pagamento per Paese

4.1. I mezzi accettati variano in base al Paese dello Spazio:

| Paese | Mezzi di pagamento |
|---|---|
| Brasile | Pix, carta, boleto bancario, Apple Pay, Google Pay, Mercado Pago |
| Argentina | Carta, Mercado Pago, bonifico bancario |
| Bolivia | Carta, bonifico bancario |
| Cile | Carta, Webpay, Mercado Pago, bonifico bancario |
| Colombia | Carta, PSE, Mercado Pago, bonifico bancario |
| Ecuador | Carta, bonifico bancario, PayPal |
| Paraguay | Carta, bonifico bancario |
| Perù | Carta, Yape, Mercado Pago, bonifico bancario |
| Uruguay | Carta, Mercado Pago, bonifico bancario |
| Panama | Carta, bonifico bancario, PayPal |
| Costa Rica | Carta, bonifico bancario, PayPal |
| Guatemala | Carta, bonifico bancario |
| El Salvador | Carta, bonifico bancario |
| Honduras | Carta, bonifico bancario |
| Nicaragua | Carta, bonifico bancario |
| Belize | Carta, bonifico bancario, PayPal |
| Messico | Carta, OXXO, SPEI, Mercado Pago, PayPal, Apple Pay, Google Pay |
| Stati Uniti | Carta, ACH bank debit, Apple Pay, Google Pay, PayPal |
| Canada | Carta, Interac, Pre-authorized debit (PAD), Apple Pay, Google Pay, PayPal |
| Portogallo | Carta, MB WAY, Multibanco, SEPA Direct Debit, Apple Pay, Google Pay, PayPal |
| Spagna | Carta, Bizum, SEPA Direct Debit, Apple Pay, Google Pay, PayPal |
| Italia | Carta, Satispay, SEPA Direct Debit, Klarna, Apple Pay, Google Pay, PayPal |
| Francia | Carta, Cartes Bancaires, SEPA Direct Debit, Klarna, Apple Pay, Google Pay, PayPal |
| Germania | Carta, SEPA Direct Debit, Klarna, Wero, PayPal, Apple Pay, Google Pay |
| Regno Unito | Carta, Pay by bank (Open Banking), Bacs Direct Debit, Apple Pay, Google Pay, PayPal, Klarna |
| Emirati Arabi Uniti | Carta, Apple Pay, Google Pay, bonifico bancario |
| Israele | Carta, Bit, Apple Pay, Google Pay, PayPal, bonifico bancario |
| Cina | Alipay, WeChat Pay, UnionPay, carta |
| Giappone | Carta, JCB, Konbini, PayPay, Apple Pay, Google Pay |
| India | UPI, carta, RuPay, net banking, PayPal |
| Australia | Carta, PayID, BPAY, Apple Pay, Google Pay, PayPal |

4.2. Per "carta" si intendono Visa, Mastercard e American Express, in base alla disponibilità del processore.

4.3. **Pagamenti asincroni.** Pix, boleto, OXXO, SPEI, Multibanco, konbini, bonifico bancario, BPAY, PSE, net banking, UPI, Bizum, MB WAY, Bit, PayID e Yape vengono confermati solo dopo la compensazione. La Prenotazione viene confermata solo dopo la ricezione, e i pagamenti non compensati entro il termine indicato scadono. Questi mezzi non consentono la pre-autorizzazione del Deposito cauzionale, applicandosi il documento Garante e Deposito Cauzionale.

## 5. Autorizzazione, addebito e pre-autorizzazione

5.1. **Prenotazione su richiesta.** L'importo viene **autorizzato** (riservato) e viene **addebitato** solo quando l'Host accetta. Il rifiuto o la scadenza entro 24 ore rilasciano l'autorizzazione.

5.2. **Prenotazione con Garante.** L'importo rimane autorizzato fino all'accettazione del Garante (termine di 48 ore).

5.3. **Prenotazione istantanea.** L'addebito avviene alla conferma.

5.4. **Deposito cauzionale.** Pre-autorizzazione aggiuntiva, limitata a 3 volte il Valore Base, rilasciata 72 ore dopo il check-out se non vi è alcun Incidente.

5.5. **Prenotazioni ricorrenti.** Nelle serie, l'importo totale può essere addebitato alla conferma oppure, quando la normativa locale lo richieda o il Locatario opti diversamente, in rate per Fascia prenotata, nel rispetto delle regole locali sui pagamenti ricorrenti (ad esempio, gli *e-mandate* della RBI in India).

## 6. Versamento all'Host

6.1. Il versamento viene rilasciato **24 ore dopo l'inizio della prima Fascia prenotata** della Prenotazione, sul conto registrato dall'Host, dedotte la Commissione di servizio dell'Host ed eventuali trattenute. Nelle serie, la Piattaforma può rilasciare il versamento per Fascia prenotata, 24 ore dopo l'inizio di ciascuna.

6.2. L'accredito sul conto dell'Host dipende dai termini del mezzo di trasferimento e della banca di destinazione. I versamenti internazionali possono essere soggetti a commissioni bancarie e conversione valutaria.

6.3. L'Host deve mantenere un conto bancario a proprio nome (o della persona giuridica titolare dell'Annuncio) e dati fiscali aggiornati.

## 7. Trattenute

7.1. La Piattaforma può trattenere, in tutto o in parte, i versamenti all'Host quando: (a) vi sia un Incidente aperto dal Locatario o una controversia pendente; (b) vi sia indizio di frode, riciclaggio di denaro, account compromesso o violazione grave; (c) manchino dati di identificazione, fiscali o bancari; (d) vi sia un debito dell'Host nei confronti della Piattaforma (penali per cancellazione, rimborsi dovuti); (e) vi sia un ordine giudiziale o amministrativo; (f) vi sia un *chargeback* in corso.

7.2. La trattenuta viene comunicata all'Host con il relativo motivo e perdura solo per il tempo necessario.

7.3. **Trattenute fiscali.** Quando la legge imponga alla Piattaforma la trattenuta di imposte sui versamenti (ad esempio, IVA/ISR in Messico, TCS ai sensi del GST in India), gli importi trattenuti vengono versati e comunicati all'Host con la relativa ricevuta.

## 8. Rimborsi

8.1. I rimborsi seguono la Politica di Cancellazione e Rimborso e vengono restituiti tramite lo stesso mezzo di pagamento: carta entro 5-10 giorni lavorativi secondo l'emittente; Pix e bonifici entro 5 giorni lavorativi; boleto, OXXO, konbini e simili tramite bonifico sul conto bancario indicato dal Locatario.

8.2. I rimborsi derivanti da un'inadempienza dell'Host vengono detratti dai suoi versamenti futuri o addebitati a quest'ultimo.

## 9. Addebiti aggiuntivi

9.1. Il ritardo nell'uscita, i danni, la pulizia straordinaria, le multe condominiali e le penalità decise in un Incidente vengono addebitati nell'ordine: Deposito cauzionale, mezzo di pagamento registrato e Garante (Penalità e Provvedimenti). Il Locatario autorizza espressamente tali addebiti accettando i Termini e riceve il dettaglio di ciascuno.

## 10. Contestazioni (chargeback)

10.1. Il Locatario deve rivolgersi prima al Centro di Risoluzione prima di contestare un addebito presso l'emittente. Ciò non limita i diritti del titolare della carta.

10.2. In caso di *chargeback*, la Piattaforma presenterà all'emittente le prove della Prenotazione (accettazione dei Termini e delle regole, check-in/check-out, messaggi, foto). Se il *chargeback* viene ritenuto fondato a causa di un'inadempienza dell'Host, l'importo verrà addebitato sui versamenti di quest'ultimo. I *chargeback* fraudolenti o abusivi assoggettano il Locatario alla sospensione e all'addebito dell'importo, con relative commissioni.

## 11. Divieto di pagamento al di fuori della Piattaforma

11.1. Ogni pagamento relativo alle Prenotazioni deve essere effettuato tramite la Piattaforma. Richiedere, offrire o accettare pagamenti al di fuori di essa (incluso "sconto per pagare direttamente", deposito su conto, Pix diretto, contanti) costituisce infrazione grave che comporta l'esclusione degli account coinvolti. I pagamenti effettuati al di fuori della Piattaforma non godono di alcuna protezione della stessa.

## 12. Ricevute e documenti fiscali

12.1. Il Locatario riceve una ricevuta elettronica per ciascun pagamento, con il dettaglio delle componenti. L'Operatore emette il documento fiscale relativo alla **Commissione di servizio** secondo la legislazione del Paese (in Brasile, nota fiscal de serviço eletrônica — NFS-e).

12.2. Il documento fiscale relativo al **Valore Base e alla Commissione di Pulizia**, quando richiesto, è di responsabilità dell'Host, che deve emetterlo al Locatario secondo la propria legislazione. La Piattaforma mette a disposizione i dati necessari.

12.3. I Locatari persona giuridica devono fornire la propria identificazione fiscale (ad esempio, CNPJ, RFC, NIF, partita IVA) da riportare nei documenti.

## 13. Prevenzione delle frodi, AML e KYC

13.1. La Piattaforma adotta procedure di **conosci il tuo cliente (KYC)** e di **prevenzione del riciclaggio di denaro e del finanziamento del terrorismo (AML/CFT)**, inclusa la verifica dell'identità e della titolarità dei conti bancari, il controllo su liste di sanzioni, il monitoraggio di transazioni atipiche, i limiti operativi e la verifica rafforzata (3-D Secure, conferma tramite *link*).

13.2. La Piattaforma può rifiutare, cancellare o trattenere pagamenti e versamenti con indizi di frode, uso di carte di terzi, operazioni simulate o incompatibili con il profilo, e segnalarli alle autorità competenti secondo la legge.

13.3. I dati della carta vengono tokenizzati da processori certificati PCI DSS; la Piattaforma non conserva il numero completo della carta né il codice di sicurezza.
