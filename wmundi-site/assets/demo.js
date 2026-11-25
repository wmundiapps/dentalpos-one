(function(){
  var fm={
    brl:function(v){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0})},
    int:function(v){return Math.round(v).toLocaleString("pt-BR")},
    pct:function(v){return v.toLocaleString("pt-BR",{maximumFractionDigits:1})+"%"},
    dec1:function(v){return v.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})},
    min:function(v){return Math.round(v).toLocaleString("pt-BR")+" min"}
  };
  var box=document.getElementById("sim");if(!box)return;
  var cfg;try{cfg=JSON.parse(document.getElementById("sim-data").textContent)}catch(e){return}
  var ids=cfg.inputs.map(function(i){return i.id});
  var FN=["min","max","round","ceil","floor","abs"];
  /* só aceita números, ids dos sliders, operadores e Math.min/max/round/ceil/floor/abs: sem outros identificadores nem acesso a propriedades */
  function ok(expr){
    var re=/\s*(\d+\.?\d*|[A-Za-z_]\w*|[-+*\/(),%<>=?:&|!.])/y,m,prev="",prev2="",pos=0;
    while(pos<expr.length){
      re.lastIndex=pos;m=re.exec(expr);if(!m)return /^\s*$/.test(expr.slice(pos));
      var t=m[1];pos=re.lastIndex;
      if(/^[A-Za-z_]/.test(t)){
        if(prev==="."){if(prev2!=="Math"||FN.indexOf(t)<0)return false}
        else if(t!=="Math"&&ids.indexOf(t)<0)return false;
      }else if(t==="."&&prev!=="Math"&&!/^\d+$/.test(prev))return false;
      prev2=prev;prev=t;
    }
    return true;
  }
  var fns=cfg.outputs.map(function(o){
    if(!ok(o.expr))return function(){return NaN};
    try{return new Function(ids.join(","),"return ("+o.expr+")")}catch(e){return function(){return NaN}}
  });
  function calc(){
    var vals=ids.map(function(id){return parseFloat(document.getElementById("in-"+id).value)});
    cfg.inputs.forEach(function(i,k){
      document.getElementById("ov-"+i.id).textContent=vals[k].toLocaleString("pt-BR")+(i.unit?" "+i.unit:"");
    });
    cfg.outputs.forEach(function(o,k){
      var v=fns[k].apply(null,vals);
      document.getElementById("out-"+k).textContent=isFinite(v)?(fm[o.fmt]||fm.int)(v):"—";
    });
  }
  cfg.inputs.forEach(function(i){document.getElementById("in-"+i.id).addEventListener("input",calc)});
  calc();
})();
