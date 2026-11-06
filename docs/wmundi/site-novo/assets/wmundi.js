(function(){
  function onForm(form){
    var box=form.parentNode,ok=box.querySelector(".okmsg"),err=form.querySelector(".errmsg");
    form.addEventListener("submit",function(e){
      e.preventDefault();err.hidden=true;
      var body=new URLSearchParams(new FormData(form)).toString();
      fetch("/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body})
        .then(function(r){if(!r.ok)throw new Error("x");form.hidden=true;ok.hidden=false;ok.scrollIntoView({block:"center"})})
        .catch(function(){err.hidden=false});
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("form[data-wm-form]"),onForm);
  var fp=document.getElementById("ptab");if(fp&&location.pathname.indexOf("/parceiros")===0)fp.remove();
  /* botões "Quero este produto" preenchem o pedido */
  Array.prototype.forEach.call(document.querySelectorAll("[data-produto]"),function(a){
    a.addEventListener("click",function(){var s=document.getElementById("produto");if(s){s.value=a.getAttribute("data-produto")}});
  });
  /* filtros do catálogo */
  var fb=document.querySelectorAll(".filters button");
  Array.prototype.forEach.call(fb,function(b){b.addEventListener("click",function(){
    var c=b.getAttribute("data-c");
    Array.prototype.forEach.call(fb,function(x){x.setAttribute("aria-pressed",x===b)});
    Array.prototype.forEach.call(document.querySelectorAll(".pgrid .pc"),function(p){p.hidden=!(c==="todos"||p.getAttribute("data-cat")===c)});
  })});
})();
