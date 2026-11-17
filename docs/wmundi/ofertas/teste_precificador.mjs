import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict'
const h=readFileSync(new URL('./src/precificador.html',import.meta.url),'utf8');const core=h.match(/<script id="core">([\s\S]*?)<\/script>/)[1]
const c={};vm.runInNewContext(core+';this.f={precoEquilibrio,precoMeta,ocupEquilibrio,prazo,hotel,lucroHotel,saude,produto,servico,locacao}',c);const f=c.f
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,a+' vs '+b)
// preço de equilíbrio: vender N a esse preço dá lucro zero
const p=f.precoEquilibrio(10000,20,100,.1,.05);near(100*(p*(1-.15)-20)-10000,0)
const pm=f.precoMeta(10000,20,100,.1,.05,3000);near(100*(pm*.85-20)-10000,3000)
// ocupação de equilíbrio devolve lucro zero
const oc=f.ocupEquilibrio(10000,20,10,30,200,.1,.05);near(10*30*oc*(200*.85-20)-10000,0)
near(f.prazo(100,.02,60),100*1.02**2)
const a={quartos:[{n:40,fator:1},{n:30,fator:1.25},{n:15,fator:1.6},{n:5,fator:2.2}],occ:.65,F:180000,V:45,t:.085,c:.09,L:60000,i:.015,d:60}
const r=f.hotel(a);const rec=r.porNivel.reduce((s,x,i)=>s+a.quartos[i].n*30*a.occ*x.preco,0)
near(rec*(1-.175)-a.V*r.vend-a.F,60000,1e-3)           // soma dos níveis entrega o lucro desejado
near(f.lucroHotel(a,.65),60000,1e-3);assert.ok(f.lucroHotel(a,r.ocEq*0+0.2)<0)
const s=f.saude({F:22000,V:38,t:.06,c:.03,n:120,L:15000,p:260,up:30});assert.ok(s.lucroMais>s.lucroHoje);near(s.nEq*s.mc>=22000?0:1,0)
const pr=f.produto({c:48,fr:6,t:.08,k:.12,m:.25});near(pr.preco*(1-.08-.12)-54,pr.lucro)
const sv=f.servico({s:8000,f:3500,h:100,hs:3,m:60,t:.06,l:.2});near(sv.preco*(1-.26)-sv.custo,0)
const lo=f.locacao({v:90000,u:60,r:30000,m:900,d:18,i:.012,t:.08});assert.ok(lo.paybackMeses>0&&lo.paybackMeses<200)
console.log('ok',r.pm.toFixed(2),(r.ocEq*100).toFixed(1)+'%',lo.paybackMeses.toFixed(1))
