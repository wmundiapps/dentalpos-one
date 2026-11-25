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
  var safe=/^[\w\s+\-*\/().,%<>=?:&|!]*$/;
  var fns=cfg.outputs.map(function(o){
    if(!safe.test(o.expr))return function(){return NaN};
    try{return new Function(ids.join(","),"var Math_=Math;with(Math){return ("+o.expr+")}")}catch(e){return function(){return NaN}}
  });
  function calc(){
    var vals=ids.map(function(id){return parseFloat(document.getElementById("in-"+id).value)});
    cfg.inputs.forEach(function(i,k){
      var o=document.getElementById("ov-"+i.id);
      o.textContent=vals[k].toLocaleString("pt-BR")+(i.unit?" "+i.unit:"");
    });
    cfg.outputs.forEach(function(o,k){
      var v=fns[k].apply(null,vals);
      document.getElementById("out-"+k).textContent=isFinite(v)?(fm[o.fmt]||fm.int)(v):"—";
    });
  }
  cfg.inputs.forEach(function(i){document.getElementById("in-"+i.id).addEventListener("input",calc)});
  calc();
})();
