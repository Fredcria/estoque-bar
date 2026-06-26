// =============================================
// ESTOQUE BAR — app.js v4
// Lógica: Inventario + Entradas - Vendas = Esperado
// =============================================

var API = '';
var db  = {produtos:[], inventarios:[], entradas:[], vendas:[], contagens:[], categorias:[]};
var charts = {};

// ---- Utilitários ----
function brl(v){ return 'R$\u00a0' + parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function brlN(v){ return parseFloat(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(v){ return (parseFloat(v||0)*100).toFixed(1)+'%'; }
function today(){
  var d=new Date(), m=d.getMonth()+1, dia=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0'+m:m)+'-'+(dia<10?'0'+dia:dia);
}
function fmt(iso){
  if(!iso) return '';
  var p=String(iso).slice(0,10).split('-');
  return p[2]+'/'+p[1]+'/'+p[0];
}
function toast(msg,ok){
  var t=document.getElementById('toast');
  t.textContent=msg;
  t.style.background=ok===false?'#c0392b':'#222';
  t.style.display='block';
  clearTimeout(t._t);
  t._t=setTimeout(function(){t.style.display='none';},3000);
}
function loading(msg){
  document.getElementById('loadMsg').textContent=msg||'Carregando...';
  document.getElementById('loading').style.display='flex';
}
function stopLoad(){ document.getElementById('loading').style.display='none'; }
function catOf(sku){
  var p=db.produtos.find(function(x){return x.sku===sku;});
  return p ? String(p.categoria||'OUTROS') : 'OUTROS';
}
function custoOf(sku){
  var p=db.produtos.find(function(x){return x.sku===sku;});
  return p ? Number(p.custoUnit||0) : 0;
}
function precoOf(sku){
  var p=db.produtos.find(function(x){return x.sku===sku;});
  return p ? Number(p.precoVenda||0) : 0;
}

// ---- API ----
async function api_get(action){
  var r=await fetch(API+'?action='+action);
  return r.json();
}
async function api_post(payload){
  var r=await fetch(API,{method:'POST',body:JSON.stringify(payload)});
  return r.json();
}

// ---- CÁLCULO CENTRAL ----
// Retorna estoque esperado de um SKU em uma data específica
// Fórmula: último inventário anterior à data + entradas até a data - vendas até a data
function calcEsperado(sku, dataRef){
  // 1. Encontrar o inventário mais recente <= dataRef
  var invRows = db.inventarios
    .filter(function(i){ return i.sku===sku && String(i.data).slice(0,10)<=dataRef; })
    .sort(function(a,b){ return String(b.data).localeCompare(String(a.data)); });

  var base = 0, baseData = '1900-01-01';
  if(invRows.length){
    base     = Number(invRows[0].qtd||0);
    baseData = String(invRows[0].data).slice(0,10);
  }

  // 2. Entradas entre baseData (exclusive) e dataRef (inclusive)
  var entradas = db.entradas
    .filter(function(e){
      var d=String(e.data).slice(0,10);
      return e.sku===sku && d>baseData && d<=dataRef;
    })
    .reduce(function(s,e){ return s+Number(e.qtd||0); }, 0);

  // 3. Vendas entre baseData (exclusive) e dataRef (inclusive)
  var vendas = db.vendas
    .filter(function(v){
      var d=String(v.data).slice(0,10);
      return v.sku===sku && d>baseData && d<=dataRef;
    })
    .reduce(function(s,v){ return s+Number(v.qtd||0); }, 0);

  return base + entradas - vendas;
}

// ---- SETUP / CONEXÃO ----
async function conectar(){
  var url=document.getElementById('apiUrl').value.trim();
  if(!url){ showSetupErr('Cole o URL do Apps Script'); return; }
  loading('Testando conexão...');
  try{
    var r=await fetch(url+'?action=init');
    var data=await r.json();
    if(data.error){ stopLoad(); showSetupErr('Erro: '+data.error); return; }
    localStorage.setItem('bar_api',url);
    API=url;
    await carregar();
  }catch(e){ stopLoad(); showSetupErr('Não foi possível conectar. Verifique o URL.'); }
}
function showSetupErr(msg){
  var el=document.getElementById('setupErr');
  el.textContent=msg; el.style.display='block'; stopLoad();
}
async function carregar(){
  loading('Carregando dados...');
  try{
    var data=await api_get('read');
    if(data.error){ toast('Erro: '+data.error,false); stopLoad(); return; }
    db.produtos    = data.produtos    || [];
    db.inventarios = data.inventarios || [];
    db.entradas    = data.entradas    || [];
    db.vendas      = data.vendas      || [];
    db.contagens   = data.contagens   || [];
    db.categorias  = data.categorias  || [];
    document.getElementById('setup').style.display='none';
    document.getElementById('app').style.display='block';
    preencherFiltros();
    renderAll();
  }catch(e){ toast('Erro de conexão',false); }
  stopLoad();
}
async function sincronizar(){ loading('Sincronizando...'); await carregar(); }
function desconectar(){
  if(confirm('Desconectar?')){ localStorage.removeItem('bar_api'); location.reload(); }
}

function preencherFiltros(){
  var cats=db.categorias.slice().sort();
  ['catEst','catInv','catCnt','catEnt','catVnd','catPed','catProd','novCat',
   'r1cat','r2cat','r4cat','r6cat','r7cat','r9cat'].forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    sel.innerHTML='<option value="">Todas as categorias</option>';
    cats.forEach(function(c){ sel.innerHTML+='<option>'+c+'</option>'; });
  });
  var entSku=document.getElementById('entSku');
  if(entSku){
    entSku.innerHTML='<option value="">Selecione...</option>';
    db.produtos.forEach(function(p){
      entSku.innerHTML+='<option value="'+p.sku+'">'+p.sku+' ['+p.categoria+']</option>';
    });
  }
  var r8=document.getElementById('r8forn');
  if(r8){
    var forns=[...new Set(db.entradas.map(function(e){return String(e.fornecedor||'').trim();}).filter(Boolean))].sort();
    r8.innerHTML='<option value="">Todos fornecedores</option>';
    forns.forEach(function(f){ r8.innerHTML+='<option>'+f+'</option>'; });
  }
}

// ---- DASHBOARD ----
function renderDash(){
  var dataRef=today();
  var totalFat=0,totalLucro=0,totalFaltas=0,valFaltas=0,totalSobras=0,valSobras=0;
  db.vendas.forEach(function(v){ totalFat+=Number(v.faturado||0); totalLucro+=Number(v.lucro||0); });

  // Ultima contagem de cada produto vs esperado na data da contagem
  var contPorSku={};
  db.contagens.forEach(function(c){
    var d=String(c.data).slice(0,10);
    if(!contPorSku[c.sku]||d>contPorSku[c.sku].data)
      contPorSku[c.sku]={data:d,qtd:Number(c.qtd||0)};
  });

  var difArr=[];
  db.produtos.forEach(function(p){
    var ult=contPorSku[p.sku]; if(!ult) return;
    var esp=calcEsperado(p.sku,ult.data);
    var diff=ult.qtd-esp;
    var cu=Number(p.custoUnit||0);
    var val=diff*cu;
    if(diff<0){ totalFaltas++; valFaltas+=Math.abs(val); }
    else if(diff>0){ totalSobras++; valSobras+=val; }
    if(diff!==0) difArr.push({sku:p.sku,diff:diff,val:val});
  });

  document.getElementById('kpiGrid').innerHTML=
    '<div class="kpi gold"><div class="lbl">Faturamento total</div><div class="val">'+brl(totalFat)+'</div></div>'+
    '<div class="kpi green"><div class="lbl">Lucro total</div><div class="val">'+brl(totalLucro)+'</div></div>'+
    '<div class="kpi red"><div class="lbl">Itens com falta</div><div class="val">'+totalFaltas+'</div></div>'+
    '<div class="kpi red"><div class="lbl">Valor em falta</div><div class="val">'+brl(valFaltas)+'</div></div>';

  // Chart: faturamento por categoria
  var catFat={};
  db.vendas.forEach(function(v){ var c=catOf(v.sku); catFat[c]=(catFat[c]||0)+Number(v.faturado||0); });
  var catL=Object.keys(catFat).sort(function(a,b){return catFat[b]-catFat[a];});
  var colors=['#1F3864','#2e86de','#10ac84','#f39c12','#e74c3c','#8e44ad','#00b894','#636e72','#fd79a8','#fdcb6e','#6c5ce7'];
  if(charts['cCat'])charts['cCat'].destroy();
  if(catL.length){
    charts['cCat']=new Chart(document.getElementById('cCat'),{
      type:'doughnut',
      data:{labels:catL,datasets:[{data:catL.map(function(c){return catFat[c].toFixed(2);}),backgroundColor:colors.slice(0,catL.length),borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:12}}}}
    });
  }

  // Chart: top faltas
  var topF=difArr.filter(function(d){return d.diff<0;}).sort(function(a,b){return a.val-b.val;}).slice(0,8);
  if(charts['cFaltas'])charts['cFaltas'].destroy();
  if(topF.length){
    document.getElementById('cFaltas').parentElement.style.height=(topF.length*38+50)+'px';
    charts['cFaltas']=new Chart(document.getElementById('cFaltas'),{
      type:'bar',
      data:{labels:topF.map(function(d){return d.sku.slice(0,26);}),datasets:[{label:'R$',data:topF.map(function(d){return Math.abs(d.val).toFixed(2);}),backgroundColor:'#c0392b',borderRadius:4}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{callback:function(v){return 'R$'+v;}}}}}
    });
  }

  // Chart: mais vendidos
  var vndAgg={};
  db.vendas.forEach(function(v){ vndAgg[v.sku]=(vndAgg[v.sku]||0)+Number(v.qtd||0); });
  var topV=Object.keys(vndAgg).map(function(k){return{sku:k,qtd:vndAgg[k]};}).sort(function(a,b){return b.qtd-a.qtd;}).slice(0,10);
  if(charts['cVendas'])charts['cVendas'].destroy();
  if(topV.length){
    document.getElementById('cVendas').parentElement.style.height=(topV.length*38+50)+'px';
    charts['cVendas']=new Chart(document.getElementById('cVendas'),{
      type:'bar',
      data:{labels:topV.map(function(d){return d.sku.slice(0,26);}),datasets:[{label:'Qtd',data:topV.map(function(d){return d.qtd;}),backgroundColor:'#1F3864',borderRadius:4}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
    });
  }
}

// ---- ESTOQUE (esperado numa data) ----
function renderEstoque(){
  var dataRef=document.getElementById('estData').value || today();
  var busca=document.getElementById('srchEst').value.toLowerCase();
  var catF=document.getElementById('catEst').value;
  var mostrar=document.getElementById('estFiltro').value;

  // Ultima contagem de cada sku
  var contMap={};
  db.contagens.forEach(function(c){
    var d=String(c.data).slice(0,10);
    if(!contMap[c.sku]||d>contMap[c.sku].data)
      contMap[c.sku]={data:d,qtd:Number(c.qtd||0)};
  });

  var tb=document.getElementById('tbEst'); tb.innerHTML='';
  var linhas=[];
  db.produtos.forEach(function(p){
    if(busca&&p.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&p.categoria!==catF) return;
    var esp=calcEsperado(p.sku,dataRef);
    var ult=contMap[p.sku];
    var diff=ult?ult.qtd-esp:null;
    if(mostrar==='falta'&&(diff===null||diff>=0)) return;
    if(mostrar==='sobra'&&(diff===null||diff<=0)) return;
    if(mostrar==='ok'&&(diff===null||diff!==0)) return;
    linhas.push({p:p,esp:esp,ult:ult,diff:diff});
  });

  // Atualiza contador
  document.getElementById('estCount').textContent=linhas.length+' produto(s)';

  linhas.forEach(function(row){
    var p=row.p,esp=row.esp,ult=row.ult,diff=row.diff;
    var diffH=diff===null?'<span class="badge m">—</span>':
      diff<0?'<span class="badge r">'+diff+'</span>':
      diff>0?'<span class="badge g">+'+diff+'</span>':
      '<span class="badge m">0</span>';
    var valH=diff===null?'—':diff!==0?'<span style="color:'+(diff<0?'#c0392b':'#1e8449')+';">'+brl(diff*Number(p.custoUnit||0))+'</span>':'—';
    var tr=document.createElement('tr');
    tr.innerHTML='<td>'+p.sku+'</td>'+
      '<td><span class="cat-tag">'+p.categoria+'</span></td>'+
      '<td style="text-align:center;font-weight:600;">'+esp+'</td>'+
      '<td style="text-align:center;">'+(ult?ult.qtd+' <small style="color:#999;font-size:10px;">('+fmt(ult.data)+')</small>':'—')+'</td>'+
      '<td style="text-align:center;">'+diffH+'</td>'+
      '<td style="text-align:right;">'+valH+'</td>';
    tb.appendChild(tr);
  });
}

// ---- INVENTÁRIO ----
var invRascunho={}; // sku -> qtd digitada (ou null = assumir esperado)

function renderInventario(){
  var dataRef=document.getElementById('invData').value || today();
  var busca=document.getElementById('srchInv').value.toLowerCase();
  var catF=document.getElementById('catInv').value;
  var mostrar=document.getElementById('invFiltro').value;

  var el=document.getElementById('invLista'); el.innerHTML='';
  var total=0, alterados=0, perdaTotal=0;

  db.produtos.forEach(function(p,i){
    if(busca&&p.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&p.categoria!==catF) return;

    var esp=calcEsperado(p.sku,dataRef);
    var digitado=invRascunho[p.sku]; // undefined=não tocou, número=digitou
    var contado=(digitado!==undefined&&digitado!==null)?digitado:null;
    var diff=contado!==null?contado-esp:0; // assumindo igual se não tocou

    if(mostrar==='alterado'&&(digitado===undefined||digitado===null)) return;
    if(mostrar==='falta'&&diff>=0) return;

    total++;
    if(digitado!==undefined&&digitado!==null){
      alterados++;
      if(diff<0) perdaTotal+=Math.abs(diff)*Number(p.custoUnit||0);
    }

    var div=document.createElement('div');
    var hasEdit=(digitado!==undefined&&digitado!==null);
    var diffColor=diff<0?'#c0392b':diff>0?'#1e8449':'#999';
    div.className='inv-row'+(hasEdit?' edited':'');
    div.innerHTML=
      '<div class="inv-nome">'+p.sku+'<div class="inv-cat"><span class="cat-tag">'+p.categoria+'</span></div></div>'+
      '<div class="inv-esp" title="Estoque esperado"><b>'+esp+'</b><div style="font-size:10px;color:#999;">esperado</div></div>'+
      '<input type="number" min="0" inputmode="numeric" placeholder="'+esp+'" value="'+(hasEdit?digitado:'')+'" class="inv-inp" id="iinp'+i+'">'+
      '<div class="inv-diff" style="color:'+diffColor+';width:50px;text-align:center;font-size:13px;font-weight:600;">'+
        (hasEdit?(diff>0?'+':'')+diff:'—')+
      '</div>'+
      '<button type="button" class="inv-clr" id="iclr'+i+'" style="display:'+(hasEdit?'flex':'none')+';" onclick="invClear(\''+p.sku+'\')">✕</button>';
    el.appendChild(div);

    // Listener no input
    (function(sku, idx){
      var inp=document.getElementById('iinp'+idx);
      if(inp){
        inp.addEventListener('input',function(){
          var v=this.value.trim();
          if(v==='') invRascunho[sku]=null;
          else invRascunho[sku]=parseFloat(v)||0;
          renderInventario();
        });
      }
    })(p.sku,i);
  });

  // Atualizar resumo
  document.getElementById('invResumo').innerHTML=
    '<b>'+alterados+'</b> produto(s) com divergência &nbsp;|&nbsp; '+
    'Perda estimada: <b style="color:#c0392b;">'+brl(perdaTotal)+'</b>';
}

function invClear(sku){ delete invRascunho[sku]; renderInventario(); }

async function salvarInventario(){
  var data=document.getElementById('invData').value;
  if(!data){ toast('Selecione a data do inventário',false); return; }
  if(!confirm('Confirmar inventário de '+fmt(data)+'? Isso vai substituir qualquer inventário desta data e virar o novo ponto zero do estoque.')) return;

  // Montar todas as linhas
  var rows=[];
  db.produtos.forEach(function(p){
    var esp=calcEsperado(p.sku,data);
    var digitado=invRascunho[p.sku];
    var qtd=(digitado!==undefined&&digitado!==null)?digitado:esp;
    rows.push([data,p.sku,qtd]);
  });

  var total=rows.length;
  var LOTE=25; // 25 produtos por envio para não estourar o timeout do Apps Script
  var enviados=0;

  try{
    // Primeiro envio: apaga inventário do dia e grava o primeiro lote
    loading('Salvando inventário... 0/'+total);
    var primeiro=rows.slice(0,LOTE);
    var r=await api_post({action:'salvarInventario',data:data,rows:primeiro});
    if(r.error){ toast('Erro: '+r.error,false); stopLoad(); return; }
    enviados+=primeiro.length;

    // Lotes seguintes: apenas append (não apaga mais)
    var i=LOTE;
    while(i<rows.length){
      var lote=rows.slice(i,i+LOTE);
      loading('Salvando inventário... '+enviados+'/'+total);
      var r2=await api_post({action:'appendInventario',data:data,rows:lote});
      if(r2 && r2.error){ toast('Erro no lote: '+r2.error,false); stopLoad(); return; }
      enviados+=lote.length;
      i+=LOTE;
    }

    invRascunho={};
    toast('Inventário salvo! '+total+' produtos gravados.');
    stopLoad();
    // Recarregar com delay para dar tempo ao Apps Script processar
    setTimeout(async function(){
      loading('Atualizando dados...');
      try{ await carregar(); }
      catch(e){ stopLoad(); }
    }, 2000);
  }catch(e){
    toast('Erro de conexão: '+e.message,false);
    stopLoad();
  }
}

// ---- CONTAGEM DIÁRIA ----
var cntTotais={};

function renderContagem(){
  var dataRef=document.getElementById('cntData').value || today();
  var busca=document.getElementById('srchCnt').value.toLowerCase();
  var catF=document.getElementById('catCnt').value;
  var filtro=document.getElementById('filtCnt').value;

  var el=document.getElementById('cntList'); el.innerHTML='';
  var total=0,conf=0;

  db.produtos.forEach(function(p,i){
    if(busca&&p.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&p.categoria!==catF) return;
    var esp=calcEsperado(p.sku,dataRef);
    var tot=cntTotais[p.sku];
    var isOk=(tot!==undefined);
    total++; if(isOk)conf++;
    if(filtro==='pend'&&isOk) return;
    if(filtro==='ok'&&!isOk) return;

    var diff=isOk?tot-esp:null;
    var diffColor=diff===null?'#999':diff<0?'#c0392b':diff>0?'#1e8449':'#999';
    var diffStr=diff===null?'—':diff===0?'OK':(diff>0?'+':'')+diff;

    var div=document.createElement('div');
    div.className='cnt-item'+(isOk?' ok':'');

    var dNome=document.createElement('div');
    dNome.style.flex='1';
    dNome.innerHTML='<div style="font-size:13px;line-height:1.3;">'+p.sku+'</div>'+
      '<div style="font-size:10px;margin-top:2px;"><span class="cat-tag">'+p.categoria+'</span>'+
      ' <span style="color:#999;">esp: <b>'+esp+'</b></span></div>';

    var dTot=document.createElement('div');
    dTot.className='cnt-total'+(isOk?'':' z');
    dTot.id='ct'+i;
    dTot.textContent=isOk?tot:'—';

    var dDiff=document.createElement('div');
    dDiff.style.cssText='width:36px;text-align:center;font-size:11px;font-weight:600;color:'+diffColor+';';
    dDiff.textContent=diffStr;

    var inp=document.createElement('input');
    inp.type='number'; inp.min='0'; inp.inputMode='numeric';
    inp.placeholder='0'; inp.className='cnt-inp';
    inp.id='ci'+i;

    var bAdd=document.createElement('button');
    bAdd.className='cnt-add'; bAdd.textContent='+'; bAdd.type='button';
    bAdd.addEventListener('click',(function(sku,idx){return function(){cntAdd(sku,idx);};})(p.sku,i));

    div.appendChild(dNome);
    div.appendChild(dTot);
    div.appendChild(dDiff);
    div.appendChild(inp);
    div.appendChild(bAdd);

    if(isOk){
      var bClr=document.createElement('button');
      bClr.className='cnt-clr'; bClr.textContent='✕'; bClr.type='button';
      bClr.addEventListener('click',(function(sku){return function(){delete cntTotais[sku];renderContagem();};})(p.sku));
      div.appendChild(bClr);
    }

    el.appendChild(div);

    var inp2=document.getElementById('ci'+i);
    if(inp2) inp2.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();cntAdd(p.sku,i);}});
  });

  document.getElementById('cntStats').textContent=conf+'/'+total+' conferidos';
}

function cntAdd(sku,idx){
  var inp=document.getElementById('ci'+idx);
  var v=parseInt(inp.value,10);
  if(isNaN(v)||v<0){ toast('Digite uma quantidade válida',false); return; }
  cntTotais[sku]=(cntTotais[sku]||0)+v;
  inp.value='';
  renderContagem();
}

async function salvarContagem(){
  var data=document.getElementById('cntData').value;
  var resp=document.getElementById('cntResp').value.trim();
  if(!data){ toast('Selecione a data',false); return; }
  var skus=Object.keys(cntTotais);
  if(!skus.length){ toast('Nenhum item contado',false); return; }
  loading('Salvando contagem...');
  var rows=skus.map(function(sku){ return [data,sku,cntTotais[sku],resp]; });
  try{
    var r=await api_post({action:'salvarContagem',data:data,rows:rows});
    if(r.error){ toast('Erro: '+r.error,false); stopLoad(); return; }
    cntTotais={};
    toast(skus.length+' itens salvos!');
    stopLoad();
    setTimeout(async function(){
      loading('Atualizando dados...');
      try{ await carregar(); }
      catch(e){ stopLoad(); }
    }, 2000);
  }catch(e){ toast('Erro de conexão',false); stopLoad(); }
}

// ---- ENTRADAS ----
function renderEntradas(){
  var busca=document.getElementById('srchEnt').value.toLowerCase();
  var catF=document.getElementById('catEnt').value;
  var tb=document.getElementById('tbEnt'); tb.innerHTML='';
  db.entradas.slice().reverse().forEach(function(e,i){
    var idx=db.entradas.length-1-i;
    var cat=catOf(e.sku);
    if(busca&&e.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&cat!==catF) return;
    var tr=document.createElement('tr');
    tr.innerHTML='<td>'+fmt(e.data)+'</td>'+
      '<td style="font-size:12px;">'+e.sku+'</td>'+
      '<td><span class="cat-tag">'+cat+'</span></td>'+
      '<td style="text-align:center;">'+e.qtd+'</td>'+
      '<td style="text-align:right;">'+brl(e.custoUnit)+'</td>'+
      '<td style="text-align:right;">'+brl(Number(e.qtd)*Number(e.custoUnit))+'</td>'+
      '<td>'+e.fornecedor+'</td>'+
      '<td>'+e.nota+'</td>'+
      '<td><button onclick="delEntrada('+idx+')" style="background:none;border:none;color:#c0392b;font-size:18px;cursor:pointer;">×</button></td>';
    tb.appendChild(tr);
  });
}

async function addEntrada(){
  var data=document.getElementById('entData').value;
  var sku=document.getElementById('entSku').value;
  var qtd=parseFloat(document.getElementById('entQtd').value);
  var custo=parseFloat(document.getElementById('entCusto').value)||0;
  var forn=document.getElementById('entForn').value.trim();
  var nota=document.getElementById('entNota').value.trim();
  if(!data||!sku||isNaN(qtd)||qtd<=0){ toast('Preencha data, produto e quantidade',false); return; }
  loading('Salvando...');
  try{
    var r=await api_post({action:'append',sheet:'Entradas',row:[data,sku,qtd,custo,forn,nota]});
    if(r.error){ toast('Erro: '+r.error,false); stopLoad(); return; }
    ['entQtd','entCusto','entForn','entNota'].forEach(function(id){ document.getElementById(id).value=''; });
    toast('Entrada registrada!');
    stopLoad();
    setTimeout(async function(){
      loading('Atualizando dados...');
      try{ await carregar(); }
      catch(e){ stopLoad(); }
    }, 2000);
  }catch(e){ toast('Erro de conexão',false); stopLoad(); }
}

async function delEntrada(idx){
  if(!confirm('Remover esta entrada?')) return;
  loading('Removendo...');
  try{ await api_post({action:'delete',sheet:'Entradas',rowIndex:idx}); toast('Removida.'); await carregar(); }
  catch(e){ toast('Erro',false); }
  stopLoad();
}

// ---- VENDAS ----
function renderVendas(){
  var busca=document.getElementById('srchVnd').value.toLowerCase();
  var catF=document.getElementById('catVnd').value;
  var tb=document.getElementById('tbVnd'); tb.innerHTML='';
  db.vendas.slice().reverse().slice(0,300).forEach(function(v,i){
    var idx=db.vendas.length-1-i;
    var cat=catOf(v.sku);
    if(busca&&v.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&cat!==catF) return;
    var tr=document.createElement('tr');
    tr.innerHTML='<td>'+fmt(v.data)+'</td>'+
      '<td style="font-size:12px;">'+v.sku+'</td>'+
      '<td><span class="cat-tag">'+cat+'</span></td>'+
      '<td style="text-align:center;">'+v.qtd+'</td>'+
      '<td style="text-align:right;">'+brl(v.faturado)+'</td>'+
      '<td style="text-align:right;">'+brl(v.custo)+'</td>'+
      '<td style="text-align:right;">'+brl(v.lucro)+'</td>'+
      '<td><button onclick="delVenda('+idx+')" style="background:none;border:none;color:#c0392b;font-size:18px;cursor:pointer;">×</button></td>';
    tb.appendChild(tr);
  });
}

async function importarVendas(){
  var data=document.getElementById('vndData').value;
  var txt=document.getElementById('vndTA').value.trim();
  if(!data){ toast('Selecione a data',false); return; }
  if(!txt){ toast('Cole o conteúdo',false); return; }
  loading('Importando...');
  var linhas=txt.split('\n'); var ok=0;
  try{
    for(var i=0;i<linhas.length;i++){
      var cols=linhas[i].split('\t');
      if(cols.length<2) continue;
      var sku=cols[0].trim();
      if(!sku||sku==='Total'||sku==='SKU') continue;
      var qtd=parseFloat(cols[1])||0;
      var vu=parseFloat(cols[2])||0;
      var fat=parseFloat(cols[3])||qtd*vu;
      var custo=parseFloat(cols[4])||0;
      var lucro=parseFloat(cols[5])||fat-custo;
      var r=await api_post({action:'append',sheet:'Vendas',row:[data,sku,qtd,vu,fat,custo,lucro]});
      if(!r.error) ok++;
    }
    toast(ok+' linha(s) importadas!');
    document.getElementById('vndTA').value='';
    await carregar();
  }catch(e){ toast('Erro de conexão',false); }
  stopLoad();
}

async function delVenda(idx){
  if(!confirm('Remover esta venda?')) return;
  loading('Removendo...');
  try{ await api_post({action:'delete',sheet:'Vendas',rowIndex:idx}); toast('Removida.'); await carregar(); }
  catch(e){ toast('Erro',false); }
  stopLoad();
}

// ---- RELATÓRIOS ----
function tbl(headers,rows,totalRow){
  if(!rows.length) return '<div class="rel-empty">Nenhum dado encontrado.</div>';
  var h=headers.map(function(h){return '<th>'+h+'</th>';}).join('');
  var r=rows.map(function(row){return '<tr>'+row.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('');
  var tot=totalRow?'<tr class="total">'+totalRow.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>':'';
  return '<table><thead><tr>'+h+'</tr></thead><tbody>'+r+tot+'</tbody></table>';
}

function pdfRel(sectionId){
  var el=document.getElementById(sectionId);
  var title=el.querySelector('h3').textContent;
  var bodyEl=el.querySelector('.rel-body');
  var css=[
    'body{font-family:Arial,sans-serif;font-size:12px;padding:20px;}',
    'h1{font-size:16px;color:#1F3864;margin-bottom:4px;}',
    'p{font-size:11px;color:#666;margin-bottom:14px;}',
    'table{width:100%;border-collapse:collapse;}',
    'th{padding:7px 8px;text-align:left;background:#1F3864;color:#fff;font-size:11px;}',
    'td{padding:7px 8px;border-bottom:1px solid #eee;font-size:11px;}',
    'tr.total td{font-weight:bold;background:#f5f5f5;border-top:2px solid #1F3864;}',
    '.badge,.alert-tag,.cat-tag{font-size:10px;padding:2px 5px;border-radius:4px;}',
    '.badge.r,.alert-tag.crit{background:#fdecea;color:#c0392b;}',
    '.badge.g,.alert-tag.ok{background:#e8f5e9;color:#1e8449;}',
    '.badge.m{background:#f5f5f5;color:#666;}',
    '.alert-tag.warn{background:#fff8e1;color:#f39c12;}',
    '.cat-tag{background:#e8eef7;color:#1F3864;}'
  ].join('');
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+title+'</title><style>'+css+'</style></head><body><h1>'+title+'</h1><p>Gerado em '+new Date().toLocaleString('pt-BR')+'</p></body></html>');
  w.document.close();
  var clone=bodyEl.cloneNode(true);
  w.document.body.appendChild(clone);
  setTimeout(function(){w.print();},400);
}

function initRelFiltros(){
  document.getElementById('r1date').value=today();
  document.getElementById('r1dateFim').value=today();
}

// R1 — Estoque em período
function runR1(){
  var dataIni=document.getElementById('r1date').value;
  var dataFim=document.getElementById('r1dateFim').value||dataIni;
  var catF=document.getElementById('r1cat').value;
  if(!dataIni){ toast('Selecione a data',false); return; }
  var rows=[], totFalta=0, totSobra=0, totValFalta=0, totValSobra=0;
  var contMap={};
  db.contagens.filter(function(c){
    var d=String(c.data).slice(0,10);
    return d>=dataIni&&d<=dataFim;
  }).forEach(function(c){
    if(!contMap[c.sku]||String(c.data).slice(0,10)>contMap[c.sku].data)
      contMap[c.sku]={data:String(c.data).slice(0,10),qtd:Number(c.qtd||0)};
  });
  db.produtos.forEach(function(p){
    if(catF&&p.categoria!==catF) return;
    // Esp.Ini = estoque esperado no inicio do periodo (dia anterior ao inicio)
    var espIni=calcEsperado(p.sku,dataIni);
    // Movimentos DENTRO do periodo
    var entr=db.entradas.filter(function(e){
      var d=String(e.data).slice(0,10);
      return e.sku===p.sku&&d>=dataIni&&d<=dataFim;
    }).reduce(function(s,e){return s+Number(e.qtd||0);},0);
    var vnd=db.vendas.filter(function(v){
      var d=String(v.data).slice(0,10);
      return v.sku===p.sku&&d>=dataIni&&d<=dataFim;
    }).reduce(function(s,v){return s+Number(v.qtd||0);},0);
    // Esp.Fim = Esp.Ini + entradas do periodo - vendas do periodo
    var espFim=espIni+entr-vnd;
    var cont=contMap[p.sku];
    var diff=cont?cont.qtd-espFim:null;
    if(espIni===0&&entr===0&&vnd===0&&!cont) return;
    var cu=Number(p.custoUnit||0);
    if(diff!==null){
      if(diff<0){totFalta++;totValFalta+=Math.abs(diff)*cu;}
      else if(diff>0){totSobra++;totValSobra+=diff*cu;}
    }
    var diffH=diff===null?'<span class="badge m">—</span>':diff<0?'<span class="badge r">'+diff+'</span>':diff>0?'<span class="badge g">+'+diff+'</span>':'<span class="badge m">0</span>';
    rows.push(['<span class="cat-tag">'+p.categoria+'</span>',p.sku,espIni,entr,vnd,espFim,cont?cont.qtd:'—',diffH]);
  });
  var tot=['<b>Total</b>','','','','','','','<b>Faltas:'+totFalta+' R$ '+brlN(totValFalta)+' | Sobras:'+totSobra+' R$ '+brlN(totValSobra)+'</b>'];
  document.getElementById('r1body').innerHTML=rows.length?tbl(['Cat.','Produto','Esp.Ini','Entradas','Vendas','Esp.Fim','Contagem','Dif.'],rows,tot):'<div class="rel-empty">Nenhum movimento no período.</div>';
}

// R2 — Estoque mínimo
function runR2(){
  var catF=document.getElementById('r2cat').value;
  var dataRef=today();
  var rows=[];
  db.produtos.forEach(function(p){
    if(catF&&p.categoria!==catF) return;
    var min=Number(p.estoqueMin||0); if(min<=0) return;
    var esp=calcEsperado(p.sku,dataRef);
    if(esp>=min) return;
    var status=esp<=0?'<span class="alert-tag crit">CRITICO</span>':'<span class="alert-tag warn">BAIXO</span>';
    rows.push(['<span class="cat-tag">'+p.categoria+'</span>',p.sku,min,esp,Math.max(0,min-esp),status]);
  });
  document.getElementById('r2body').innerHTML=rows.length?tbl(['Cat.','Produto','Min.','Atual','Repor','Status'],rows):'<div class="rel-empty">Todos acima do mínimo (ou mínimos não configurados).</div>';
}

// R3 — CMV por categoria
function runR3(){
  var catData={};
  db.categorias.forEach(function(c){catData[c]={fat:0,custo:0,lucro:0};});
  db.vendas.forEach(function(v){
    var c=catOf(v.sku); if(!catData[c])catData[c]={fat:0,custo:0,lucro:0};
    catData[c].fat+=Number(v.faturado||0);
    catData[c].custo+=Number(v.custo||0);
    catData[c].lucro+=Number(v.lucro||0);
  });
  var rows=[],tFat=0,tCusto=0,tLucro=0;
  Object.keys(catData).sort(function(a,b){return catData[b].fat-catData[a].fat;}).forEach(function(c){
    var d=catData[c]; if(!d.fat&&!d.custo) return;
    tFat+=d.fat;tCusto+=d.custo;tLucro+=d.lucro;
    var cmv=d.fat>0?d.custo/d.fat:0;
    var mg=d.fat>0?d.lucro/d.fat:0;
    rows.push([c,'R$ '+brlN(d.fat),'R$ '+brlN(d.custo),pct(cmv),'R$ '+brlN(d.lucro),pct(mg)]);
  });
  var tot=['<b>TOTAL</b>','<b>R$ '+brlN(tFat)+'</b>','<b>R$ '+brlN(tCusto)+'</b>','<b>'+pct(tFat>0?tCusto/tFat:0)+'</b>','<b>R$ '+brlN(tLucro)+'</b>','<b>'+pct(tFat>0?tLucro/tFat:0)+'</b>'];
  document.getElementById('r3body').innerHTML=tbl(['Categoria','Faturamento','CMV (R$)','CMV %','Lucro','Margem'],rows,tot);
}

// R4 — Margem por produto
function runR4(){
  var catF=document.getElementById('r4cat').value;
  var ord=document.getElementById('r4ord').value;
  var prodData={};
  db.vendas.forEach(function(v){
    if(catF&&catOf(v.sku)!==catF) return;
    if(!prodData[v.sku])prodData[v.sku]={fat:0,custo:0,lucro:0,qtd:0,cat:catOf(v.sku)};
    prodData[v.sku].fat+=Number(v.faturado||0);
    prodData[v.sku].custo+=Number(v.custo||0);
    prodData[v.sku].lucro+=Number(v.lucro||0);
    prodData[v.sku].qtd+=Number(v.qtd||0);
  });
  var arr=Object.keys(prodData).map(function(k){var d=prodData[k];var mg=d.fat>0?d.lucro/d.fat:0;return Object.assign({sku:k,mg:mg},d);});
  arr.sort(function(a,b){return ord==='margem_asc'?a.mg-b.mg:ord==='lucro_desc'?b.lucro-a.lucro:ord==='fat_desc'?b.fat-a.fat:b.mg-a.mg;});
  var rows=arr.slice(0,60).map(function(d){
    var c=d.mg>=0.4?'#1e8449':d.mg>=0.2?'#f39c12':'#c0392b';
    return['<span class="cat-tag">'+d.cat+'</span>',d.sku,d.qtd,'R$ '+brlN(d.fat),'R$ '+brlN(d.custo),'R$ '+brlN(d.lucro),'<b style="color:'+c+'">'+pct(d.mg)+'</b>'];
  });
  document.getElementById('r4body').innerHTML=tbl(['Cat.','Produto','Qtd','Faturado','Custo','Lucro','Margem'],rows);
}

// R5 — Giro por categoria
function runR5(){
  var catData={};
  db.categorias.forEach(function(c){catData[c]={vendido:0,esperado:0,n:0};});
  db.produtos.forEach(function(p){
    var c=String(p.categoria||'OUTROS'); if(!catData[c])catData[c]={vendido:0,esperado:0,n:0};
    catData[c].vendido+=db.vendas.filter(function(v){return v.sku===p.sku;}).reduce(function(s,v){return s+Number(v.qtd||0);},0);
    catData[c].esperado+=Math.abs(calcEsperado(p.sku,today()));
    catData[c].n++;
  });
  var rows=Object.keys(catData).filter(function(c){return catData[c].vendido>0;}).map(function(c){
    var d=catData[c];
    var giro=d.esperado>0?d.vendido/d.esperado:0;
    return[c,d.n,d.vendido,d.esperado,giro.toFixed(2)+'x'];
  }).sort(function(a,b){return parseFloat(b[4])-parseFloat(a[4]);});
  document.getElementById('r5body').innerHTML=tbl(['Categoria','Produtos','Vendido','Em estoque','Giro'],rows);
}

// R6 — Histórico de perdas
function runR6(){
  var catF=document.getElementById('r6cat').value;
  var perdas={};
  db.contagens.forEach(function(c){
    var p=db.produtos.find(function(x){return x.sku===c.sku;}); if(!p) return;
    if(catF&&p.categoria!==catF) return;
    var data=String(c.data).slice(0,10);
    var esp=calcEsperado(c.sku,data);
    var diff=Number(c.qtd||0)-esp;
    if(diff<0){
      if(!perdas[data])perdas[data]={data:data,itens:0,val:0};
      perdas[data].itens++;
      perdas[data].val+=Math.abs(diff)*Number(p.custoUnit||0);
    }
  });
  var rows=Object.values(perdas).sort(function(a,b){return a.data.localeCompare(b.data);}).map(function(d){
    return[fmt(d.data),d.itens,'<b style="color:#c0392b;">R$ '+brlN(d.val)+'</b>'];
  });
  var totVal=Object.values(perdas).reduce(function(s,d){return s+d.val;},0);
  document.getElementById('r6body').innerHTML=rows.length?tbl(['Data','Itens com falta','Valor da perda'],rows,['<b>Total</b>','','<b style="color:#c0392b;">R$ '+brlN(totVal)+'</b>']):'<div class="rel-empty">Nenhuma perda registrada ainda.</div>';
}

// R7 — Ranking de quebras
function runR7(){
  var catF=document.getElementById('r7cat').value;
  var quebras={};
  db.contagens.forEach(function(c){
    var p=db.produtos.find(function(x){return x.sku===c.sku;}); if(!p) return;
    if(catF&&p.categoria!==catF) return;
    var data=String(c.data).slice(0,10);
    var esp=calcEsperado(c.sku,data);
    var diff=Number(c.qtd||0)-esp;
    if(diff<0){
      if(!quebras[c.sku])quebras[c.sku]={sku:c.sku,cat:p.categoria,n:0,totalDiff:0,totalVal:0};
      quebras[c.sku].n++;
      quebras[c.sku].totalDiff+=Math.abs(diff);
      quebras[c.sku].totalVal+=Math.abs(diff)*Number(p.custoUnit||0);
    }
  });
  var rows=Object.values(quebras).sort(function(a,b){return b.totalVal-a.totalVal;}).slice(0,30).map(function(d,i){
    return['<b>'+(i+1)+'</b>','<span class="cat-tag">'+d.cat+'</span>',d.sku,d.n,d.totalDiff.toFixed(0),'<b style="color:#c0392b;">R$ '+brlN(d.totalVal)+'</b>'];
  });
  document.getElementById('r7body').innerHTML=rows.length?tbl(['#','Cat.','Produto','Ocorrências','Total un. faltante','Valor'],rows):'<div class="rel-empty">Nenhuma quebra registrada.</div>';
}

// R8 — Entradas por fornecedor
function runR8(){
  var fornF=document.getElementById('r8forn').value;
  var fornData={};
  db.entradas.forEach(function(e){
    var f=String(e.fornecedor||'Sem fornecedor').trim()||'Sem fornecedor';
    if(fornF&&f!==fornF) return;
    if(!fornData[f])fornData[f]={n:0,total:0,itens:[]};
    fornData[f].n++;
    fornData[f].total+=Number(e.qtd||0)*Number(e.custoUnit||0);
    fornData[f].itens.push(e);
  });
  var rows=[];
  Object.values(fornData).sort(function(a,b){return b.total-a.total;}).forEach(function(f2){
    rows.push(['<b>'+Object.keys(fornData).find(function(k){return fornData[k]===f2;})+'</b>','<b>'+f2.n+' compras</b>','','','<b>R$ '+brlN(f2.total)+'</b>','']);
    f2.itens.sort(function(a,b){return String(b.data).localeCompare(String(a.data));}).forEach(function(e){
      rows.push(['',fmt(e.data),e.sku,e.qtd,'R$ '+brlN(Number(e.qtd)*Number(e.custoUnit)),e.nota||'']);
    });
  });
  document.getElementById('r8body').innerHTML=rows.length?tbl(['Fornecedor','Data','Produto','Qtd','Total','NF'],rows):'<div class="rel-empty">Nenhuma entrada registrada.</div>';
}

// R9 — Custo compra vs cadastro
function runR9(){
  var catF=document.getElementById('r9cat').value;
  var rows=[];var difPos=0,difNeg=0;
  db.produtos.forEach(function(p){
    if(catF&&p.categoria!==catF) return;
    var ent=db.entradas.filter(function(e){return e.sku===p.sku;});
    if(!ent.length) return;
    var tQtd=ent.reduce(function(s,e){return s+Number(e.qtd||0);},0);
    var tVal=ent.reduce(function(s,e){return s+Number(e.qtd||0)*Number(e.custoUnit||0);},0);
    var cMed=tQtd>0?tVal/tQtd:0;
    var cCad=Number(p.custoUnit||0);
    var dif=cMed-cCad;
    var difPct=cCad>0?dif/cCad:0;
    var difH=Math.abs(dif)<0.01?'<span class="alert-tag ok">Igual</span>':
      dif>0?'<span class="alert-tag crit">+R$ '+brlN(dif)+' ('+pct(Math.abs(difPct))+')</span>':
      '<span class="alert-tag ok">-R$ '+brlN(Math.abs(dif))+' ('+pct(Math.abs(difPct))+')</span>';
    if(dif>0.01)difPos++;else if(dif<-0.01)difNeg++;
    rows.push(['<span class="cat-tag">'+p.categoria+'</span>',p.sku,ent.length,'R$ '+brlN(cMed),'R$ '+brlN(cCad),difH]);
  });
  rows.sort(function(a,b){return String(a[5]).indexOf('crit')>=0?-1:1;});
  document.getElementById('r9body').innerHTML=rows.length?tbl(['Cat.','Produto','Compras','Custo médio','Custo cadastrado','Diferença'],rows,['','<b>'+rows.length+' produtos</b>','','','','<b>'+difPos+' acima | '+difNeg+' abaixo</b>']):'<div class="rel-empty">Nenhuma entrada registrada.</div>';
}

// ---- PEDIDOS ----
var pedSelecionados={};
var pedItens={};

function initPedidos(){
  document.getElementById('pedData').value=today();
  var cats=db.categorias.slice().sort();
  var sel=document.getElementById('catPed');
  sel.innerHTML='<option value="">Todas as categorias</option>';
  cats.forEach(function(c){ sel.innerHTML+='<option>'+c+'</option>'; });
  renderPedLista();
}

function renderPedLista(){
  var busca=document.getElementById('srchPed').value.toLowerCase();
  var catF=document.getElementById('catPed').value;
  var el=document.getElementById('pedLista'); el.innerHTML='';
  db.produtos.forEach(function(p){
    if(busca&&p.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&p.categoria!==catF) return;
    var est=calcEsperado(p.sku,today());
    var isSel=!!pedSelecionados[p.sku];
    var div=document.createElement('div');
    div.className='ped-item'+(isSel?' sel':'');
    var chk=document.createElement('input'); chk.type='checkbox'; chk.checked=isSel;
    chk.addEventListener('change',function(){ togglePedSel(p.sku); });
    var dNome=document.createElement('div'); dNome.className='pi-nome';
    dNome.innerHTML=p.sku+'<div class="pi-cat"><span class="cat-tag">'+p.categoria+'</span></div>';
    var dEst=document.createElement('div'); dEst.className='pi-est';
    dEst.style.color=est<=0?'#c0392b':est<5?'#f39c12':'#1e8449';
    dEst.textContent=est;
    div.appendChild(chk); div.appendChild(dNome); div.appendChild(dEst);
    div.addEventListener('click',function(e){ if(e.target===chk)return; togglePedSel(p.sku); });
    el.appendChild(div);
  });
  atualizaContSel();
}

function togglePedSel(sku){
  if(pedSelecionados[sku])delete pedSelecionados[sku];
  else pedSelecionados[sku]=true;
  renderPedLista();
}
function atualizaContSel(){
  document.getElementById('pedSelCount').textContent=Object.keys(pedSelecionados).length+' produto(s) selecionado(s)';
}
function addSelecionados(){
  var skus=Object.keys(pedSelecionados);
  if(!skus.length){ toast('Selecione ao menos um produto',false); return; }
  skus.forEach(function(sku){
    if(!pedItens[sku]){ var p=db.produtos.find(function(x){return x.sku===sku;})||{}; pedItens[sku]={qtd:1,preco:Number(p.custoUnit)||0}; }
  });
  pedSelecionados={};
  renderPedLista(); renderPedItens();
  document.getElementById('pedItensBox').style.display='block';
  document.getElementById('pedItensBox').scrollIntoView({behavior:'smooth'});
}
function renderPedItens(){
  var el=document.getElementById('pedItensLista'); el.innerHTML='';
  var skus=Object.keys(pedItens);
  skus.forEach(function(sku){
    var item=pedItens[sku];
    var est=calcEsperado(sku,today());
    var p=db.produtos.find(function(x){return x.sku===sku;})||{};
    var div=document.createElement('div'); div.className='ped-row';
    var dN=document.createElement('div'); dN.className='pr-nome';
    dN.innerHTML=sku+'<div style="font-size:10px;margin-top:2px;"><span class="cat-tag">'+(p.categoria||'')+'</span></div>';
    var dE=document.createElement('div'); dE.className='pr-est';
    dE.innerHTML='<b style="color:'+(est<=0?'#c0392b':est<5?'#f39c12':'#111')+'">'+est+'</b><br><span style="font-size:10px;">atual</span>';
    var iQ=document.createElement('input'); iQ.type='number'; iQ.min='0'; iQ.step='1'; iQ.placeholder='Qtd'; iQ.value=item.qtd; iQ.style.cssText='width:80px;';
    iQ.addEventListener('input',(function(s){return function(){pedItens[s].qtd=parseFloat(this.value)||0;atualizaTotais();};})(sku));
    var iP=document.createElement('input'); iP.type='number'; iP.min='0'; iP.step='0.01'; iP.placeholder='R$'; iP.value=item.preco.toFixed(2); iP.style.cssText='width:90px;';
    iP.addEventListener('input',(function(s){return function(){pedItens[s].preco=parseFloat(this.value)||0;atualizaTotais();};})(sku));
    var bD=document.createElement('button'); bD.className='pr-del'; bD.textContent='\u00d7'; bD.type='button';
    bD.addEventListener('click',(function(s){return function(){removerPedItem(s);};})(sku));
    div.appendChild(dN); div.appendChild(dE); div.appendChild(iQ); div.appendChild(iP); div.appendChild(bD);
    el.appendChild(div);
  });
  atualizaTotais();
  if(!skus.length)document.getElementById('pedItensBox').style.display='none';
}
function removerPedItem(sku){ delete pedItens[sku]; renderPedItens(); }
function atualizaTotais(){
  var itens=Object.keys(pedItens).length,unid=0,val=0;
  Object.values(pedItens).forEach(function(i){unid+=i.qtd;val+=i.qtd*i.preco;});
  document.getElementById('pedTotItens').textContent=itens;
  document.getElementById('pedTotUnid').textContent=unid;
  document.getElementById('pedTotVal').textContent='R$ '+brlN(val);
}
function limparPedido(){
  if(!confirm('Limpar todo o pedido?'))return;
  pedItens={}; pedSelecionados={};
  renderPedLista(); renderPedItens();
  document.getElementById('pedItensBox').style.display='none';
}
function gerarPedidoPDF(){
  var forn=document.getElementById('pedForn').value.trim()||'-';
  var dataPed=document.getElementById('pedData').value;
  var dataEnt=document.getElementById('pedEntrega').value;
  var obs=document.getElementById('pedObs').value.trim();
  var skus=Object.keys(pedItens);
  if(!skus.length){ toast('Adicione ao menos um item',false); return; }
  var totalUnid=0,totalVal=0,linhas='';
  skus.forEach(function(sku,i){
    var item=pedItens[sku],est=calcEsperado(sku,today()),sub=item.qtd*item.preco;
    totalUnid+=item.qtd; totalVal+=sub;
    var bg=i%2===1?'background:#f9fafb;':'';
    linhas+='<tr style="'+bg+'">'+
      '<td style="text-align:center;padding:8px;">'+(i+1)+'<\/td>'+
      '<td style="padding:8px;">'+sku+'<\/td>'+
      '<td style="text-align:center;padding:8px;">'+est+'<\/td>'+
      '<td style="text-align:center;padding:8px;">'+item.qtd+'<\/td>'+
      '<td style="text-align:center;padding:8px;">R$ '+brlN(item.preco)+'<\/td>'+
      '<td style="text-align:center;padding:8px;font-weight:700;">R$ '+brlN(sub)+'<\/td><\/tr>';
  });
  var obsHtml=obs?'<div style="margin-top:16px;background:#fffbe6;border:1px solid #f39c12;border-radius:6px;padding:10px 14px;"><b>Obs:<\/b> '+obs+'<\/div>':'';
  var css='body{font-family:Arial,sans-serif;font-size:12px;padding:32px 40px;}'
    +'h1{font-size:18px;color:#1F3864;margin-bottom:4px;}'
    +'.info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;}'
    +'.box{background:#f5f7fa;border-radius:6px;padding:10px 14px;}'
    +'.box .l{font-size:10px;color:#888;text-transform:uppercase;margin-bottom:3px;}'
    +'.box .v{font-size:14px;font-weight:600;}'
    +'table{width:100%;border-collapse:collapse;margin-top:8px;}'
    +'th{background:#1F3864;color:#fff;padding:8px;font-size:11px;text-align:center;}'
    +'th.l{text-align:left;}'
    +'.tot td{background:#1F3864;color:#fff;font-weight:700;font-size:13px;padding:10px 8px;text-align:center;}'
    +'.ass{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;}'
    +'.ass div{border-top:1px solid #333;padding-top:8px;font-size:11px;color:#666;text-align:center;}'
    +'.ft{margin-top:24px;text-align:center;font-size:10px;color:#aaa;}';
  var html='<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido - '+forn+'<\/title><style>'+css+'<\/style><\/head><body>'
    +'<h1>Pedido de Compra<\/h1>'
    +'<p style="font-size:12px;color:#666;margin-bottom:16px;">Gerado em '+new Date().toLocaleString('pt-BR')+'<\/p>'
    +'<div class="info">'
    +'<div class="box"><div class="l">Fornecedor<\/div><div class="v">'+forn+'<\/div><\/div>'
    +'<div class="box"><div class="l">Data do pedido<\/div><div class="v">'+(fmt(dataPed)||'-')+'<\/div><\/div>'
    +'<div class="box"><div class="l">Previsao de entrega<\/div><div class="v">'+(fmt(dataEnt)||'-')+'<\/div><\/div>'
    +'<div class="box"><div class="l">Total de itens<\/div><div class="v">'+skus.length+' produtos<\/div><\/div>'
    +'<\/div>'
    +'<table><thead><tr><th style="width:30px;">#<\/th><th class="l">Produto<\/th><th style="width:70px;">Est. atual<\/th><th style="width:70px;">Qtd pedida<\/th><th style="width:90px;">Preco unit.<\/th><th style="width:100px;">Subtotal<\/th><\/tr><\/thead>'
    +'<tbody>'+linhas+'<tr class="tot"><td colspan="3">TOTAL DO PEDIDO<\/td><td>'+totalUnid+' un<\/td><td>-<\/td><td>R$ '+brlN(totalVal)+'<\/td><\/tr><\/tbody><\/table>'
    +obsHtml
    +'<div class="ass"><div>Solicitante<\/div><div>Fornecedor \/ Aprovacao<\/div><\/div>'
    +'<div class="ft">Sistema de controle de estoque do bar.<\/div>'
    +'<\/body><\/html>';
  var w=window.open('','_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();},500);
}


// ---- PRODUTOS (cadastro) ----
function renderProdutos(){
  var busca=document.getElementById('srchProd').value.toLowerCase();
  var catF=document.getElementById('catProd').value;
  var tb=document.getElementById('tbProd'); tb.innerHTML='';
  var count=0;
  db.produtos.forEach(function(p,i){
    if(busca&&p.sku.toLowerCase().indexOf(busca)<0) return;
    if(catF&&p.categoria!==catF) return;
    count++;
    var tr=document.createElement('tr');
    tr.innerHTML='<td style="font-size:12px;">'+p.sku+'</td>'+
      '<td><span class="cat-tag">'+p.categoria+'</span></td>'+
      '<td style="text-align:right;">'+brl(p.custoUnit)+'</td>'+
      '<td style="text-align:right;">'+brl(p.precoVenda)+'</td>'+
      '<td style="text-align:center;">'+(Number(p.estoqueMin)||0)+'</td>';
    tb.appendChild(tr);
  });
  document.getElementById('prodCount').textContent=count+' produto(s)';
}

async function addProduto(){
  var sku=document.getElementById('novSku').value.trim().toUpperCase();
  var cat=document.getElementById('novCat').value;
  var custo=parseFloat(document.getElementById('novCusto').value)||0;
  var venda=parseFloat(document.getElementById('novVenda').value)||0;
  var min=parseInt(document.getElementById('novMin').value)||0;
  if(!sku){ toast('Digite o nome do produto',false); return; }
  if(!cat){ toast('Selecione a categoria',false); return; }
  var existe=db.produtos.find(function(p){return p.sku===sku;});
  if(existe){ toast('Produto já cadastrado!',false); return; }
  loading('Cadastrando produto...');
  try{
    var r=await api_post({action:'append',sheet:'Produtos',row:[sku,custo,venda,min,'un',cat]});
    if(r.error){ toast('Erro: '+r.error,false); stopLoad(); return; }
    toast('Produto "'+sku+'" cadastrado!');
    ['novSku','novCusto','novVenda','novMin'].forEach(function(id){document.getElementById(id).value='';});
    await carregar();
  }catch(e){ toast('Erro de conexão',false); }
  stopLoad();
}

// ---- RENDER ALL ----
function renderAll(){
  renderDash();
  renderEstoque();
  renderContagem();
  renderEntradas();
  renderVendas();
  renderProdutos();
  preencherFiltros();
}

// ---- TABS ----
var relIniciado=false;
var pedIniciado=false;

document.querySelectorAll('.tab').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(b){b.className='tab';});
    document.querySelectorAll('.pane').forEach(function(p){p.className='pane';});
    btn.className='tab on';
    var paneId=btn.getAttribute('data-pane');
    document.getElementById('pane-'+paneId).className='pane on';
    if(paneId==='relatorios'&&!relIniciado){
      relIniciado=true;
      initRelFiltros();
      runR1();runR2();runR3();runR4();runR5();runR6();runR7();runR8();runR9();
    }
    if(paneId==='pedidos'&&!pedIniciado){ pedIniciado=true; initPedidos(); }
    if(paneId==='produtos'){ renderProdutos(); }
  });
});

// ---- LISTENERS ----
document.getElementById('srchEst').addEventListener('input',renderEstoque);
document.getElementById('catEst').addEventListener('change',renderEstoque);
document.getElementById('estData').addEventListener('change',renderEstoque);
document.getElementById('estFiltro').addEventListener('change',renderEstoque);

document.getElementById('srchInv').addEventListener('input',renderInventario);
document.getElementById('catInv').addEventListener('change',renderInventario);
document.getElementById('invData').addEventListener('change',function(){ invRascunho={}; renderInventario(); });
document.getElementById('invFiltro').addEventListener('change',renderInventario);

document.getElementById('srchCnt').addEventListener('input',renderContagem);
document.getElementById('catCnt').addEventListener('change',renderContagem);
document.getElementById('cntData').addEventListener('change',function(){ cntTotais={}; renderContagem(); });
document.getElementById('filtCnt').addEventListener('change',renderContagem);

document.getElementById('srchEnt').addEventListener('input',renderEntradas);
document.getElementById('catEnt').addEventListener('change',renderEntradas);
document.getElementById('srchVnd').addEventListener('input',renderVendas);
document.getElementById('catVnd').addEventListener('change',renderVendas);
document.getElementById('srchPed').addEventListener('input',renderPedLista);
document.getElementById('srchProd').addEventListener('input',renderProdutos);
document.getElementById('catProd').addEventListener('change',renderProdutos);
document.getElementById('catPed').addEventListener('change',renderPedLista);

// ---- INIT ----
document.getElementById('estData').value=today();
document.getElementById('invData').value=today();
document.getElementById('cntData').value=today();
document.getElementById('entData').value=today();
document.getElementById('vndData').value=today();

function instalarApp(){
  if(window.deferredPrompt){
    window.deferredPrompt.prompt();
    window.deferredPrompt.userChoice.then(function(){
      window.deferredPrompt=null;
      var b=document.getElementById('btnInstalar'); if(b)b.style.display='none';
    });
  }
}

var savedApi=localStorage.getItem('bar_api');
if(savedApi){ API=savedApi; carregar(); }
