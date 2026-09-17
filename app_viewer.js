
(function(){
"use strict";

var COLOR = { blue:"#3b6fe0", orange:"#14b8a6", aqua:"#14b8a6", yellow:"#f0b429",
  magenta:"#a855c9", green:"#10b981", violet:"#6d5ce8", red:"#e0526b",
  ink:"#1c2333", ink2:"#5b6478", muted:"#8890a3", grid:"#edeef7", axis:"#dcdfef" };

var BU_PALETTE_ORDER = [COLOR.blue,COLOR.violet,COLOR.orange,COLOR.magenta,COLOR.yellow,COLOR.green,COLOR.red,"#4c5fd5"];
var OTHER_GREY = "#a8afc0";

/* 색상 보정: hex를 흰색/검정과 섞어 밝게/어둡게 만든다 (그라디언트·글로우용) */
function mix(hex, targetHex, amt){
  var h = hex.replace("#",""), t = targetHex.replace("#","");
  var r1=parseInt(h.substr(0,2),16), g1=parseInt(h.substr(2,2),16), b1=parseInt(h.substr(4,2),16);
  var r2=parseInt(t.substr(0,2),16), g2=parseInt(t.substr(2,2),16), b2=parseInt(t.substr(4,2),16);
  var r=Math.round(r1+(r2-r1)*amt), g=Math.round(g1+(g2-g1)*amt), b=Math.round(b1+(b2-b1)*amt);
  return "#"+[r,g,b].map(function(v){ return Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0"); }).join("");
}
function lighten(hex, amt){ return mix(hex, "#ffffff", amt); }
function darken(hex, amt){ return mix(hex, "#000000", amt); }
var svgDefsUid = 0;

var DIVISION_HUES = {
  "TKM": { dark: COLOR.blue, light: lighten(COLOR.blue,0.45) },
  "NEW": { dark: COLOR.orange, light: lighten(COLOR.orange,0.45) }
};

var ALL_ROWS = [];
var MONTH_KEYS = []; // 임베드된 데이터 전체의 monthKey, 오름차순 정렬 (예: "2025-01")

/* ---------- 유틸 ---------- */
function escapeHtml(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function escapeAttr(s){ return escapeHtml(s); }

function formatKRW(n){
  n = Number(n)||0;
  var sign = n<0 ? "-" : "";
  var abs = Math.abs(n);
  if (abs >= 1e8) return sign + (abs/1e8).toFixed(1) + "억";
  if (abs >= 1e4) return sign + (abs/1e4).toFixed(0) + "만";
  return sign + abs.toLocaleString();
}
function formatFull(n){ return Math.round(Number(n)||0).toLocaleString() + "원"; }
function niceCeil(v){
  if (v<=0) return 1;
  var exp = Math.floor(Math.log10(v));
  var f = v / Math.pow(10, exp);
  var nf = f<=1?1:f<=2?2:f<=5?5:10;
  return nf * Math.pow(10, exp);
}
function monthKeyLabel(mk){
  var parts = mk.split("-");
  return parts[0].slice(2) + "-" + parts[1]; /* 2025-01 -> 25-01 */
}

function sum(rows, key){ return rows.reduce(function(a,r){ return a + (Number(r[key])||0); }, 0); }

/* ---------- 차트: 공통 ---------- */
function attachTooltip(container){
  container.querySelectorAll("[data-tip]").forEach(function(el){
    el.addEventListener("mousemove", function(e){ showTooltip(e, el.getAttribute("data-tip")); });
    el.addEventListener("mouseleave", hideTooltip);
  });
}
function showTooltip(e, text){
  var tip = document.getElementById("tooltip");
  tip.textContent = text; tip.hidden = false;
  var margin = 12;
  var tw = tip.offsetWidth, th = tip.offsetHeight;
  var x = e.clientX + margin;
  if (x + tw > window.innerWidth - 4) x = e.clientX - margin - tw;
  var y = e.clientY + margin;
  if (y + th > window.innerHeight - 4) y = e.clientY - margin - th;
  tip.style.left = Math.max(4,x)+"px"; tip.style.top = Math.max(4,y)+"px";
}
function hideTooltip(){ document.getElementById("tooltip").hidden = true; }

function renderLegend(container, items){
  var legend = container.parentElement.querySelector(".legend[data-for='"+container.id+"']");
  if (!legend){
    legend = document.createElement("div");
    legend.className = "legend";
    legend.setAttribute("data-for", container.id);
    container.insertAdjacentElement("afterend", legend);
  }
  legend.innerHTML = items.map(function(s){
    return '<span class="legend-item"><span class="swatch" style="background:'+s.color+'"></span>'+escapeHtml(s.label)+'</span>';
  }).join("");
}

/* ---------- 차트: 막대(월별 추이 / 예측) ---------- */
function drawGroupedBars(container, categories, series, opts){
  opts = opts || {};
  var width = container.clientWidth || 800;
  var height = opts.height || 300;
  var mL=56, mR=16, mT=16, mB=34;
  var plotW = width-mL-mR, plotH = height-mT-mB;
  var allVals = series.reduce(function(a,s){ return a.concat(s.values.filter(function(v){return v!=null;})); }, []);
  var maxVal = niceCeil(Math.max.apply(null, allVals.concat([1])));
  var yOf = function(v){ return plotH - (v/maxVal)*plotH; };
  var groupW = plotW/categories.length;
  var gap = 2;
  var barW = Math.min(22, (groupW - gap*(series.length+1))/series.length);
  barW = Math.max(barW, 2);
  var uid = ++svgDefsUid;
  var svg = '<svg viewBox="0 0 '+width+' '+height+'" width="100%" height="'+height+'" role="img">';
  svg += '<defs>';
  svg += '<filter id="barShadow'+uid+'" x="-30%" y="-30%" width="160%" height="160%">'+
    '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0f172a" flood-opacity="0.16"/></filter>';
  series.forEach(function(s, si){
    svg += '<linearGradient id="barGrad'+uid+'-'+si+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+lighten(s.color,0.28)+'"/>'+
      '<stop offset="55%" stop-color="'+s.color+'"/>'+
      '<stop offset="100%" stop-color="'+darken(s.color,0.14)+'"/></linearGradient>';
  });
  svg += '</defs>';
  var steps = 4;
  for (var i=0;i<=steps;i++){
    var v = maxVal*i/steps;
    var y = mT + yOf(v);
    svg += '<line x1="'+mL+'" x2="'+(width-mR)+'" y1="'+y+'" y2="'+y+'" stroke="'+COLOR.grid+'" stroke-width="1"/>';
    svg += '<text x="'+(mL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+COLOR.muted+'">'+formatKRW(v)+'</text>';
  }
  var minLabelW = 34;
  var labelStep = Math.max(1, Math.ceil(categories.length * minLabelW / plotW));
  categories.forEach(function(cat, ci){
    var groupX = mL + ci*groupW;
    var innerW = series.length*barW + (series.length+1)*gap;
    var offsetX = groupX + (groupW-innerW)/2;
    series.forEach(function(s, si){
      var v = s.values[ci];
      var x = offsetX + gap + si*(barW+gap);
      if (v==null){
        svg += '<line x1="'+x+'" x2="'+(x+barW)+'" y1="'+(mT+plotH-1)+'" y2="'+(mT+plotH-1)+'" stroke="'+COLOR.axis+'" stroke-width="2" stroke-dasharray="2,2"/>';
      } else {
        var y = mT + yOf(Math.max(v,0));
        var h = Math.max(0, plotH - yOf(Math.max(v,0)));
        var tip = s.label+" · "+cat+": "+formatFull(v);
        var dash = s.dashed ? ' stroke="'+s.color+'" stroke-width="1.5" stroke-dasharray="3,2" fill-opacity="0.55"' : ' filter="url(#barShadow'+uid+')"';
        var fill = s.dashed ? s.color : 'url(#barGrad'+uid+'-'+si+')';
        svg += '<rect class="bar" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3.5" fill="'+fill+'"'+dash+'/>';
      }
    });
    if (ci % labelStep === 0 || ci === categories.length-1){
      svg += '<text x="'+(groupX+groupW/2)+'" y="'+(height-mB+18)+'" text-anchor="middle" font-size="10.5" fill="'+COLOR.muted+'">'+escapeHtml(String(cat))+'</text>';
    }
  });
  svg += '<line x1="'+mL+'" x2="'+(width-mR)+'" y1="'+(mT+plotH)+'" y2="'+(mT+plotH)+'" stroke="'+COLOR.axis+'" stroke-width="1"/>';
  svg += '</svg>';
  container.innerHTML = svg;
  attachTooltip(container);
  renderLegend(container, series.map(function(s){ return { label:s.label, color:s.color }; }));
}

/* ---------- 차트: 예측(실측 막대 + 예측선 + 95% 구간 밴드) ----------
   미래로 갈수록(h가 커질수록) 신뢰구간이 나팔처럼 벌어지는 걸 그대로
   보여준다 — "이 정도 범위 안에서 확실하다"는 것 자체가 근거의 일부. */
function drawForecastChart(container, categories, actualSeries, forecastLine, band, opts){
  opts = opts || {};
  var width = container.clientWidth || 800;
  var height = opts.height || 300;
  var mL=56, mR=16, mT=16, mB=34;
  var plotW = width-mL-mR, plotH = height-mT-mB;

  var allVals = actualSeries.values.filter(function(v){return v!=null;})
    .concat(band.high.filter(function(v){return v!=null;}));
  var maxVal = niceCeil(Math.max.apply(null, allVals.concat([1])));
  var yOf = function(v){ return plotH - (v/maxVal)*plotH; };
  var groupW = plotW/categories.length;
  var barW = Math.min(28, groupW*0.5);
  function cx(ci){ return mL + ci*groupW + groupW/2; }

  var uid = ++svgDefsUid;
  var bandColor = opts.bandColor||COLOR.violet;
  var svg = '<svg viewBox="0 0 '+width+' '+height+'" width="100%" height="'+height+'" role="img">';
  svg += '<defs>'+
    '<linearGradient id="bandGrad'+uid+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+bandColor+'" stop-opacity="0.22"/>'+
      '<stop offset="50%" stop-color="'+bandColor+'" stop-opacity="0.07"/>'+
      '<stop offset="100%" stop-color="'+bandColor+'" stop-opacity="0.22"/></linearGradient>'+
    '<filter id="softBlur'+uid+'" x="-60%" y="-60%" width="220%" height="220%">'+
      '<feGaussianBlur stdDeviation="3.2"/></filter>'+
    '<filter id="lineGlow'+uid+'" x="-60%" y="-60%" width="220%" height="220%">'+
      '<feGaussianBlur stdDeviation="2.4" result="blur"/>'+
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'+
    '<radialGradient id="dotGlow'+uid+'"><stop offset="0%" stop-color="'+forecastLine.color+'" stop-opacity="0.55"/>'+
      '<stop offset="100%" stop-color="'+forecastLine.color+'" stop-opacity="0"/></radialGradient>'+
    '<filter id="barShadowF'+uid+'" x="-30%" y="-30%" width="160%" height="160%">'+
      '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#0f172a" flood-opacity="0.16"/></filter>'+
    '<linearGradient id="barGradF'+uid+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+lighten(actualSeries.color,0.28)+'"/>'+
      '<stop offset="55%" stop-color="'+actualSeries.color+'"/>'+
      '<stop offset="100%" stop-color="'+darken(actualSeries.color,0.14)+'"/></linearGradient>'+
    '</defs>';
  var steps = 4;
  for (var i=0;i<=steps;i++){
    var v = maxVal*i/steps;
    var y = mT + yOf(v);
    svg += '<line x1="'+mL+'" x2="'+(width-mR)+'" y1="'+y+'" y2="'+y+'" stroke="'+COLOR.grid+'" stroke-width="1"/>';
    svg += '<text x="'+(mL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+COLOR.muted+'">'+formatKRW(v)+'</text>';
  }

  var topPts = [], botPts = [];
  categories.forEach(function(cat, ci){
    if (band.high[ci]==null) return;
    topPts.push({ x:cx(ci), y:mT+yOf(band.high[ci]), v:band.high[ci], cat:cat });
  });
  categories.forEach(function(cat, ci){
    if (band.low[ci]==null) return;
    botPts.push({ x:cx(ci), y:mT+yOf(Math.max(band.low[ci],0)), v:Math.max(band.low[ci],0), cat:cat });
  });
  var bandPoints = topPts.map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); })
    .concat(botPts.slice().reverse().map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); }));
  if (bandPoints.length>=4){
    svg += '<polygon points="'+bandPoints.join(' ')+'" fill="url(#bandGrad'+uid+')" filter="url(#softBlur'+uid+')"/>';
    svg += '<polygon points="'+bandPoints.join(' ')+'" fill="url(#bandGrad'+uid+')"/>';
    var topEdge = topPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    var botEdge = botPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    svg += '<path d="'+topEdge+'" fill="none" stroke="'+bandColor+'" stroke-width="1" stroke-opacity="0.4" stroke-linecap="round"/>';
    svg += '<path d="'+botEdge+'" fill="none" stroke="'+bandColor+'" stroke-width="1" stroke-opacity="0.4" stroke-linecap="round"/>';
  }

  categories.forEach(function(cat, ci){
    var v = actualSeries.values[ci];
    if (v==null) return;
    var x = cx(ci) - barW/2;
    var y = mT + yOf(Math.max(v,0));
    var h = Math.max(0, plotH - yOf(Math.max(v,0)));
    var tip = actualSeries.label+" · "+cat+": "+formatFull(v);
    svg += '<rect class="bar" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3.5" fill="url(#barGradF'+uid+')" filter="url(#barShadowF'+uid+')"/>';
  });

  var linePoints = [];
  categories.forEach(function(cat, ci){
    if (forecastLine.values[ci]==null) return;
    linePoints.push({ x:cx(ci), y:mT+yOf(Math.max(forecastLine.values[ci],0)), v:forecastLine.values[ci], cat:cat });
  });
  if (linePoints.length){
    var pathD = linePoints.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    svg += '<path d="'+pathD+'" fill="none" stroke="'+forecastLine.color+'" stroke-width="2.5" stroke-dasharray="6,3" stroke-linecap="round" filter="url(#lineGlow'+uid+')"/>';
    linePoints.forEach(function(p){
      var tip = forecastLine.label+" · "+p.cat+": "+formatFull(p.v);
      svg += '<circle data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="11" fill="url(#dotGlow'+uid+')"/>';
      svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="4" fill="'+forecastLine.color+'" stroke="#fff" stroke-width="1.2"/>';
    });
  }

  /* 신뢰구간 상단/하단 경계에도 호버 포인트를 찍어 상향/하향 예측값을 바로 확인할 수 있게 한다 */
  topPts.forEach(function(p){
    var tip = "상향(95%) · "+p.cat+": "+formatFull(p.v);
    svg += '<circle data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="9" fill="url(#dotGlow'+uid+')"/>';
    svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="2.6" fill="'+lighten(bandColor,0.2)+'" stroke="#fff" stroke-width="1"/>';
  });
  botPts.forEach(function(p){
    var tip = "하향(95%) · "+p.cat+": "+formatFull(p.v);
    svg += '<circle data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="9" fill="url(#dotGlow'+uid+')"/>';
    svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="2.6" fill="'+lighten(bandColor,0.2)+'" stroke="#fff" stroke-width="1"/>';
  });

  var minLabelW = 34;
  var labelStep = Math.max(1, Math.ceil(categories.length * minLabelW / plotW));
  categories.forEach(function(cat, ci){
    if (ci % labelStep === 0 || ci === categories.length-1){
      svg += '<text x="'+cx(ci).toFixed(1)+'" y="'+(height-mB+18)+'" text-anchor="middle" font-size="10.5" fill="'+COLOR.muted+'">'+escapeHtml(String(cat))+'</text>';
    }
  });
  svg += '<line x1="'+mL+'" x2="'+(width-mR)+'" y1="'+(mT+plotH)+'" y2="'+(mT+plotH)+'" stroke="'+COLOR.axis+'" stroke-width="1"/>';
  svg += '</svg>';
  container.innerHTML = svg;
  attachTooltip(container);
  renderLegend(container, [
    { label:actualSeries.label, color:actualSeries.color },
    { label:forecastLine.label, color:forecastLine.color },
    { label:"95% 예측구간", color: opts.bandColor||COLOR.violet }
  ]);
}

/* ---------- 차트: 도넛(구성 비중) ---------- */
function drawDonut(container, items){
  var total = items.reduce(function(a,it){ return a + Math.max(0, it.value||0); }, 0);
  if (total <= 0){
    container.innerHTML = '<p class="empty-state">표시할 데이터가 없습니다.</p>';
    return;
  }
  var size = 190, thickness = 26;
  var r = (size - thickness) / 2;
  var cx = size/2, cy = size/2;
  var circumference = 2 * Math.PI * r;
  var MAX_SLOTS = 7;
  var sorted = items.filter(function(it){ return (it.value||0) > 0; })
    .sort(function(a,b){ return b.value - a.value; });
  var segs = sorted.slice(0, MAX_SLOTS);
  var rest = sorted.slice(MAX_SLOTS);
  if (rest.length){
    var restSum = rest.reduce(function(a,it){ return a + it.value; }, 0);
    segs.push({ label: "기타 ("+rest.length+"개)", value: restSum, isOther:true });
  }
  var gapPx = segs.length>1 ? 3 : 0;
  var uid = ++svgDefsUid;
  var svg = '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" role="img">';
  svg += '<defs>';
  svg += '<filter id="donutShadow'+uid+'" x="-30%" y="-30%" width="160%" height="160%">'+
    '<feDropShadow dx="0" dy="1" stdDeviation="1.8" flood-color="#0f172a" flood-opacity="0.18"/></filter>';
  segs.forEach(function(it, i){
    var color = it.isOther ? OTHER_GREY : BU_PALETTE_ORDER[i % BU_PALETTE_ORDER.length];
    svg += '<linearGradient id="donutGrad'+uid+'-'+i+'" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0%" stop-color="'+lighten(color,0.22)+'"/>'+
      '<stop offset="100%" stop-color="'+darken(color,0.1)+'"/></linearGradient>';
  });
  svg += '</defs>';
  var offset = 0;
  segs.forEach(function(it, i){
    var frac = it.value/total;
    var segLen = Math.max(0, frac*circumference - gapPx);
    var tip = it.label+" · "+(frac*100).toFixed(1)+"% · "+formatFull(it.value);
    svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="url(#donutGrad'+uid+'-'+i+')"'+
      ' stroke-width="'+thickness+'" stroke-dasharray="'+segLen.toFixed(2)+' '+(circumference-segLen).toFixed(2)+
      '" stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 '+cx+' '+cy+')" filter="url(#donutShadow'+uid+')"/>';
    offset += frac*circumference;
  });
  var top = segs[0];
  svg += '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="17" font-weight="700" fill="'+COLOR.ink+'">'+(top.value/total*100).toFixed(0)+'%</text>';
  svg += '<text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="10.5" fill="'+COLOR.muted+'">'+escapeHtml(top.label)+'</text>';
  svg += '</svg>';
  container.innerHTML = svg;
  attachTooltip(container);
  renderLegend(container, segs.map(function(it, i){
    var color = it.isOther ? OTHER_GREY : BU_PALETTE_ORDER[i % BU_PALETTE_ORDER.length];
    return { label: it.label+" "+(it.value/total*100).toFixed(1)+"%", color: color };
  }));
}

/* ---------- 집계 ---------- */
function groupAgg(rows, keyField){
  var groups = {};
  rows.forEach(function(r){
    var label = r[keyField];
    if (!label) return;
    var k = r.division+"|"+label;
    if (!groups[k]) groups[k] = { label: label, division:r.division, value:0 };
    groups[k].value += r.totalRevenue||0;
  });
  return Object.keys(groups).map(function(k){ return groups[k]; })
    .sort(function(a,b){ return b.value-a.value; });
}

function monthlyAgg(rows, monthKeys){
  var byMonth = {};
  monthKeys.forEach(function(mk){ byMonth[mk] = 0; });
  rows.forEach(function(r){ if (byMonth[r.monthKey]!==undefined) byMonth[r.monthKey] += r.totalRevenue||0; });
  return monthKeys.map(function(mk){ return { monthKey:mk, value: byMonth[mk] }; });
}

/* ---------- 기간 프리셋 ---------- */
function buildPresets(){
  if (!MONTH_KEYS.length) return [];
  var first = MONTH_KEYS[0], last = MONTH_KEYS[MONTH_KEYS.length-1];
  var presets = [{ label:"전체", from:first, to:last }];
  var byYear = {};
  MONTH_KEYS.forEach(function(mk){ var y = mk.slice(0,4); (byYear[y]=byYear[y]||[]).push(mk); });
  Object.keys(byYear).sort().forEach(function(y){
    var ys = byYear[y];
    presets.push({ label:y+"년", from:ys[0], to:ys[ys.length-1] });
  });
  if (MONTH_KEYS.length >= 6) presets.push({ label:"최근 6개월", from:MONTH_KEYS[MONTH_KEYS.length-6], to:last });
  if (MONTH_KEYS.length >= 12) presets.push({ label:"최근 12개월", from:MONTH_KEYS[MONTH_KEYS.length-12], to:last });
  return presets;
}

/* ---------- 필터 ---------- */
function populateFilters(rows){
  var divSel = document.getElementById("divisionFilter");
  var midSel = document.getElementById("midFilter");
  var prevDiv = divSel.value, prevMid = midSel.value;
  var divisions = Array.from(new Set(rows.map(function(r){ return r.division; }))).sort();
  divSel.innerHTML = ['<option value="__ALL__">전체</option>'].concat(divisions.map(function(d){
    return '<option value="'+escapeAttr(d)+'">'+escapeHtml(d)+'</option>';
  })).join("");
  if (divisions.indexOf(prevDiv)!==-1) divSel.value = prevDiv;

  var scopedDivision = divSel.value;
  var scopeRows = scopedDivision === "__ALL__" ? rows : rows.filter(function(r){ return r.division===scopedDivision; });
  var mids = Array.from(new Set(scopeRows.map(function(r){ return r.midCategory; }).filter(Boolean))).sort();
  midSel.innerHTML = ['<option value="__ALL__">전체</option>'].concat(mids.map(function(m){
    return '<option value="'+escapeAttr(m)+'">'+escapeHtml(m)+'</option>';
  })).join("");
  if (mids.indexOf(prevMid)!==-1) midSel.value = prevMid;
}

var periodControlsInited = false;
function initPeriodControls(){
  var fromSel = document.getElementById("periodFrom");
  var toSel = document.getElementById("periodTo");
  var prevFrom = fromSel.value, prevTo = toSel.value;
  var opts = MONTH_KEYS.map(function(mk){ return '<option value="'+mk+'">'+monthKeyLabel(mk)+'</option>'; }).join("");
  fromSel.innerHTML = opts; toSel.innerHTML = opts;
  fromSel.value = MONTH_KEYS.indexOf(prevFrom)!==-1 ? prevFrom : MONTH_KEYS[0];
  toSel.value = MONTH_KEYS.indexOf(prevTo)!==-1 ? prevTo : MONTH_KEYS[MONTH_KEYS.length-1];

  var presets = buildPresets();
  var presetsBox = document.getElementById("periodPresets");
  presetsBox.innerHTML = presets.map(function(p, i){
    return '<button type="button" class="period-btn'+(i===0?' active':'')+'" data-from="'+p.from+'" data-to="'+p.to+'">'+escapeHtml(p.label)+'</button>';
  }).join("");

  function syncPresetActive(){
    var f = fromSel.value, t = toSel.value;
    presetsBox.querySelectorAll(".period-btn").forEach(function(btn){
      btn.classList.toggle("active", btn.getAttribute("data-from")===f && btn.getAttribute("data-to")===t);
    });
  }
  presetsBox.querySelectorAll(".period-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      fromSel.value = btn.getAttribute("data-from");
      toSel.value = btn.getAttribute("data-to");
      syncPresetActive();
      renderAll();
    });
  });
  syncPresetActive();

  if (!periodControlsInited){
    fromSel.addEventListener("change", function(){ syncPresetActive(); renderAll(); });
    toSel.addEventListener("change", function(){ syncPresetActive(); renderAll(); });
    periodControlsInited = true;
  }
}

function currentFilters(){
  var fromSel = document.getElementById("periodFrom");
  var toSel = document.getElementById("periodTo");
  var from = fromSel.value, to = toSel.value;
  if (from > to){ var t = from; from = to; to = t; }
  return {
    division: document.getElementById("divisionFilter").value,
    mid: document.getElementById("midFilter").value,
    from: from, to: to
  };
}

/* ---------- KPI ---------- */
function opRateOf(rows){
  var totalRevenue = sum(rows,"totalRevenue");
  var opProfit = sum(rows,"opProfit");
  return { value: opProfit, rate: totalRevenue!==0 ? (opProfit/totalRevenue*100) : 0 };
}

function renderKPI(rows, divisions, periodLabel){
  var box = document.getElementById("kpiRow");
  function tileHtml(t){
    var valueText = formatKRW(t.value) + (t.rate!=null ? ' <span class="kpi-rate">('+t.rate.toFixed(0)+'%)</span>' : '');
    return '<div class="kpi-tile"><div class="kpi-label">'+escapeHtml(t.label)+'</div>'+
      '<div class="kpi-value">'+valueText+'</div>'+
      '<div class="kpi-note">'+t.note+'</div></div>';
  }
  var groups = divisions.map(function(d){
    var dRows = rows.filter(function(r){ return r.division===d; });
    var op = opRateOf(dRows);
    var tiles = [
      { label: "매출총액", value: sum(dRows,"totalRevenue"), note: periodLabel },
      { label: "영업이익", value: op.value, rate: op.rate, note: periodLabel }
    ];
    return '<div class="kpi-division">'+
      '<div class="kpi-division-label">'+escapeHtml(d)+'</div>'+
      '<div class="kpi-division-row">'+tiles.map(tileHtml).join("")+'</div></div>';
  });
  if (divisions.length > 1){
    var opAll = opRateOf(rows);
    var totalTiles = [
      { label: "합산 매출총액", value: sum(rows,"totalRevenue"), note: periodLabel },
      { label: "합산 영업이익", value: opAll.value, rate: opAll.rate, note: periodLabel }
    ];
    groups.push('<div class="kpi-division">'+
      '<div class="kpi-division-label">합산</div>'+
      '<div class="kpi-division-row">'+totalTiles.map(tileHtml).join("")+'</div></div>');
  }
  box.innerHTML = groups.join("");
}

/* ================================================================
   예측 시뮬레이션 — Holt 지수평활 (수준 + 추세, 계절성 제외)
   ================================================================ */
/* alpha·beta를 고정값으로 두면(예: 0.3/0.1) 실제 데이터의 변동성과 안 맞아
   신뢰구간이 근거 없이 넓어지는 문제가 있어, 과거 실적의 1-step 잔차제곱합이
   최소가 되는 조합을 격자 탐색으로 찾는다(φ는 FPP3 권장 감쇠값 0.9로 고정). */
function fitHoltParams(data, phi){
  var n = data.length;
  var skip = Math.min(3, Math.floor(n*0.25));
  var bestAlpha = 0.3, bestBeta = 0.1, bestSSE = Infinity;
  for (var a=1; a<=19; a++){
    var alpha = a*0.05;
    for (var b=1; b<=19; b++){
      var beta = b*0.05;
      var L = data[0], T = data[1]-data[0], sse = 0;
      for (var t=1; t<n; t++){
        var Lp=L, Tp=T;
        var pred = Lp + phi*Tp;
        if (t>=skip){ var e = data[t]-pred; sse += e*e; }
        L = alpha*data[t] + (1-alpha)*(Lp+phi*Tp);
        T = beta*(L-Lp) + (1-beta)*phi*Tp;
      }
      if (sse < bestSSE){ bestSSE = sse; bestAlpha = alpha; bestBeta = beta; }
    }
  }
  return { alpha:bestAlpha, beta:bestBeta };
}

function holtForecast(data, alpha, beta, phi, h){
  var n = data.length;
  if (n < 2) return null;
  var L = data[0];
  var T = data[1]-data[0];
  var fitted = [data[0]];
  for (var t=1; t<n; t++){
    var Lp=L, Tp=T;
    var pred = Lp + phi*Tp;
    fitted.push(pred);
    L = alpha*data[t] + (1-alpha)*(Lp+phi*Tp);
    T = beta*(L-Lp) + (1-beta)*phi*Tp;
  }
  var skip = Math.min(3, Math.floor(n*0.25));
  var res = data.slice(skip).map(function(d,i){ return d - fitted[i+skip]; });
  var rmse = res.length ? Math.sqrt(res.reduce(function(s,r){ return s+r*r; },0)/res.length) : 0;

  /* 신뢰구간: ETS(A,Ad,N)(감쇠추세) h-step 예측분산 공식(FPP3 8장) 사용.
     sigma_h^2 = rmse^2 * [1 + sum_{j=1..h-1} (alpha + beta*phiCum_j)^2],
     phiCum_j = phi + phi^2 + ... + phi^j. */
  var fc = [], ciLow=[], ciHigh=[];
  var phiCumArr = [];
  var pc = 0;
  for (var i=1; i<=h; i++){ pc += Math.pow(phi,i); phiCumArr.push(pc); }

  var varSum = 1;
  for (var k=1; k<=h; k++){
    var phiCumK = phiCumArr[k-1];
    var val = Math.max(0, L + phiCumK*T);
    fc.push(val);
    if (k>1){
      var theta = alpha + beta*phiCumArr[k-2];
      varSum += theta*theta;
    }
    var band = 1.96*rmse*Math.sqrt(varSum);
    ciLow.push(Math.max(0, val-band));
    ciHigh.push(val+band);
  }
  return { fitted:fitted, forecast:fc, ciLow:ciLow, ciHigh:ciHigh, rmse:rmse, level:L, trend:T };
}

/* φ(감쇠계수)는 FPP3(Hyndman)이 "자동 예측에서 가장 신뢰할 수 있는 선택"으로
   꼽는 감쇠추세(damped trend) 표준값으로 고정한다. α·β는 매 조회마다 실제
   데이터에 맞춰 자동 적합(fitHoltParams)하므로 고정하지 않는다. 쓰는 사람은
   α·β·φ 같은 통계 용어를 직접 만지는 대신, 이해할 수 있는 축(대상 사업부문 /
   예측 개월 / 환율 변동률)만 조절한다. */
var FORECAST_PARAMS = { phi:0.9 };
var FC = { division:"ALL", horizon:3, fxChange:0 };

function forecastSeries(division){
  var rows = ALL_ROWS;
  if (division !== "ALL") rows = rows.filter(function(r){ return r.division===division; });
  return monthlyAgg(rows, MONTH_KEYS).map(function(m){ return m.value; });
}

/* 사업부문별 수출 비중 — U열(거래처명)이 정확히 A사인
   매출만 환율 영향을 받는 수출분으로 본다 (그 외 국내거래처 포함 전부 국내). */
function exportRatioOf(division){
  var rows = ALL_ROWS;
  if (division !== "ALL") rows = rows.filter(function(r){ return r.division===division; });
  var total = sum(rows, "totalRevenue");
  if (total <= 0) return 0;
  var exportSum = sum(rows.filter(function(r){ return r.isExport; }), "totalRevenue");
  return exportSum / total;
}

function renderForecast(){
  var card = document.getElementById("forecastCard");
  if (MONTH_KEYS.length < 3){
    card.hidden = true;
    document.getElementById("forecastChart").innerHTML = '<p class="empty-state">예측에는 최소 3개월치 데이터가 필요합니다.</p>';
    document.getElementById("forecastKPI").innerHTML = "";
    return;
  }
  card.hidden = false;

  var data = forecastSeries(FC.division);
  var fitted = fitHoltParams(data, FORECAST_PARAMS.phi);
  var result = holtForecast(data, fitted.alpha, fitted.beta, FORECAST_PARAMS.phi, FC.horizon);
  if (!result){
    document.getElementById("forecastChart").innerHTML = '<p class="empty-state">예측에 필요한 데이터가 부족합니다.</p>';
    document.getElementById("forecastKPI").innerHTML = "";
    return;
  }

  var futureKeys = [];
  var lastKey = MONTH_KEYS[MONTH_KEYS.length-1];
  var y = parseInt(lastKey.slice(0,4),10), m = parseInt(lastKey.slice(5,7),10);
  for (var i=0;i<FC.horizon;i++){
    m++; if (m>12){ m=1; y++; }
    futureKeys.push(y+"-"+String(m).padStart(2,"0"));
  }

  /* 환율 변동 반영: 수출 비중만큼만 환율 변동률을 곱해서 보정한다.
     adj = 1 + 수출비중 × (환율변동률/100) */
  var exportRatio = exportRatioOf(FC.division);
  var fxAdj = 1 + exportRatio * (FC.fxChange/100);
  var forecastAdj = result.forecast.map(function(v){ return Math.max(0, v*fxAdj); });

  var hue = FC.division==="TKM" ? DIVISION_HUES.TKM : FC.division==="NEW" ? DIVISION_HUES.NEW : { dark:COLOR.violet, light:"#c9c0ec" };
  var categories = MONTH_KEYS.concat(futureKeys).map(monthKeyLabel);
  var actualValues = data.concat(futureKeys.map(function(){ return null; }));
  var forecastValues = MONTH_KEYS.map(function(){ return null; }).concat(forecastAdj);
  var bandLow = MONTH_KEYS.map(function(){ return null; }).concat(result.ciLow.map(function(v){ return Math.max(0, v*fxAdj); }));
  var bandHigh = MONTH_KEYS.map(function(){ return null; }).concat(result.ciHigh.map(function(v){ return v*fxAdj; }));

  drawForecastChart(document.getElementById("forecastChart"), categories,
    { label:(FC.division==="ALL"?"합산":FC.division)+" 실측", color:hue.dark, values:actualValues },
    { label:"예측", color:hue.dark, values:forecastValues },
    { low:bandLow, high:bandHigh },
    { height:260, bandColor:hue.dark }
  );

  var lastForecast = forecastAdj[forecastAdj.length-1];
  var lastBandLow = bandLow[bandLow.length-1];
  var lastBandHigh = bandHigh[bandHigh.length-1];
  var horizonSum = forecastAdj.reduce(function(a,b){ return a+b; },0);
  var lastActual = data[data.length-1];
  var growth = lastActual ? ((lastForecast/lastActual-1)*100) : 0;

  var kpis = [
    { label: futureKeys[futureKeys.length-1]+" 예측", value: formatKRW(lastForecast)+"원", sub: "95% 구간 "+formatKRW(lastBandLow)+" ~ "+formatKRW(lastBandHigh) },
    { label: FC.horizon+"개월 합계 예측", value: formatKRW(horizonSum)+"원", sub: monthKeyLabel(futureKeys[0])+" ~ "+monthKeyLabel(futureKeys[futureKeys.length-1]) },
    { label: "최근월 대비 증감", value: (growth>=0?"+":"")+growth.toFixed(1)+"%", sub: monthKeyLabel(lastKey)+" 실측 대비" },
    { label: "수출 비중(환율 영향분)", value: (exportRatio*100).toFixed(1)+"%", sub: "A사向 매출 기준" }
  ];
  document.getElementById("forecastKPI").innerHTML = kpis.map(function(k){
    return '<div class="fc-kpi"><div class="fc-kpi-label">'+escapeHtml(k.label)+'</div>'+
      '<div class="fc-kpi-value">'+escapeHtml(k.value)+'</div>'+
      '<div class="fc-kpi-sub">'+escapeHtml(k.sub)+'</div></div>';
  }).join("");

  /* 산출 근거 — 예측값이 감이 아니라 방정식과 실제 대입값에서 나왔음을
     그대로 보여준다. 정확도보다 "왜 이 숫자인지 설명 가능한가"가 핵심. */
  var phiSumH = 0;
  for (var pk=1; pk<=FC.horizon; pk++) phiSumH += Math.pow(FORECAST_PARAMS.phi, pk);
  var fxPct = exportRatio*100 * (FC.fxChange/100);
  var formulaRows = [
    ["방법", "Holt 지수평활법(감쇠추세) · FPP3(Hyndman) 표준기법"],
    ["추정식", "Y(t+h) = L + (φ+φ²+...+φʰ)·T"],
    ["현재 수준 L", formatKRW(result.level)+"원"],
    ["월별 추세 T", formatKRW(result.trend)+"원/월"],
    ["평활 계수 α, β", "α="+fitted.alpha.toFixed(2)+", β="+fitted.beta.toFixed(2)+" (과거 실적 오차 최소화로 자동 적합)"],
    ["감쇠계수 φ", FORECAST_PARAMS.phi.toFixed(2)+" (h="+FC.horizon+" 합 Σφᵏ = "+phiSumH.toFixed(2)+")"],
    ["환율 반영식", "Y_조정 = Y × (1 + 수출비중 × Δ환율%)"],
    ["대입값", "수출비중 "+(exportRatio*100).toFixed(1)+"% × 환율 "+(FC.fxChange>=0?"+":"")+FC.fxChange+"% = 보정 "+(fxPct>=0?"+":"")+fxPct.toFixed(2)+"%p"],
    ["모델 적합오차(RMSE)", formatKRW(result.rmse)+"원 (과거 실적 대비)"]
  ];
  document.getElementById("fcFormula").innerHTML = '<div class="fc-formula-title">산출 근거</div><table>'+
    formulaRows.map(function(r){ return '<tr><td>'+escapeHtml(r[0])+'</td><td>'+escapeHtml(r[1])+'</td></tr>'; }).join("")+
    '</table>';
}

function initForecastControls(){
  function seg(id, key, after){
    document.querySelectorAll("#"+id+" .seg-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        document.querySelectorAll("#"+id+" .seg-btn").forEach(function(b){ b.classList.remove("active"); });
        btn.classList.add("active");
        FC[key] = btn.getAttribute("data-val");
        if (after) after();
        renderForecast();
      });
    });
  }
  seg("fcDivisionSeg", "division");

  function slider(id, key, fmt){
    var el = document.getElementById(id);
    var val = document.getElementById(id+"V");
    el.addEventListener("input", function(){
      FC[key] = parseFloat(el.value);
      val.textContent = fmt ? fmt(FC[key]) : el.value;
      renderForecast();
    });
  }
  slider("fcHorizon", "horizon", function(v){ return v+"개월"; });
  slider("fcFx", "fxChange", function(v){ return (v>0?"+":"")+v+"%"; });
}

/* ---------- 렌더 파이프라인 ---------- */
function renderAll(){
  if (!ALL_ROWS.length) return;
  populateFilters(ALL_ROWS);
  initPeriodControls();
  var f = currentFilters();
  var rows = ALL_ROWS.filter(function(r){
    if (f.division !== "__ALL__" && r.division !== f.division) return false;
    if (f.mid !== "__ALL__" && r.midCategory !== f.mid) return false;
    return true;
  });
  var periodRows = rows.filter(function(r){ return r.monthKey>=f.from && r.monthKey<=f.to; });
  var periodLabel = monthKeyLabel(f.from)+" ~ "+monthKeyLabel(f.to);
  document.getElementById("periodInfo").textContent = "조회 기간: "+periodLabel;
  document.getElementById("headerMeta").textContent = "조회 기간 "+periodLabel+" · 데이터 "+ALL_ROWS.length.toLocaleString()+"행";

  var divisions = Array.from(new Set(rows.map(function(r){ return r.division; }))).sort();
  document.getElementById("execTitle").textContent = periodLabel+" 누적 실적 지표";
  document.getElementById("execMeta").textContent = "대분류명 기준 TKM/NEW 분류 · 단위: 억원";
  renderKPI(periodRows, divisions, periodLabel);

  var drillGrid = document.getElementById("drillGrid");
  drillGrid.innerHTML = divisions.map(function(d){
    return '<div class="drill-division">'+
      '<div class="drill-division-label">'+escapeHtml(d)+'</div>'+
      '<div class="drill-division-pair">'+
      '<div class="sub-card donut-card"><h3>중분류</h3><div class="chart-body" id="midChart-'+escapeAttr(d)+'"></div></div>'+
      '<div class="sub-card donut-card"><h3>소분류</h3><div class="chart-body" id="subChart-'+escapeAttr(d)+'"></div></div>'+
      '</div></div>';
  }).join("");

  divisions.forEach(function(d){
    var dRows = periodRows.filter(function(r){ return r.division===d; });
    var midItems = groupAgg(dRows, "midCategory").map(function(g){ return { label:g.label, value:g.value }; });
    var subItems = groupAgg(dRows, "subCategory").map(function(g){ return { label:g.label, value:g.value }; });
    drawDonut(document.getElementById("midChart-"+d), midItems);
    drawDonut(document.getElementById("subChart-"+d), subItems);
  });

  renderForecast();
}

function resetFilters(){
  document.getElementById("divisionFilter").value = "__ALL__";
  document.getElementById("midFilter").value = "__ALL__";
  document.getElementById("periodFrom").value = MONTH_KEYS[0];
  document.getElementById("periodTo").value = MONTH_KEYS[MONTH_KEYS.length-1];
  document.querySelectorAll(".period-btn").forEach(function(btn, i){ btn.classList.toggle("active", i===0); });
  renderAll();
}

function seedReportData(rows){
  ALL_ROWS = rows;
  MONTH_KEYS = Array.from(new Set(rows.map(function(r){ return r.monthKey; }))).sort();
  renderAll();
}
window.seedReportData = seedReportData;

window.addEventListener("DOMContentLoaded", function(){
  document.getElementById("divisionFilter").addEventListener("change", renderAll);
  document.getElementById("midFilter").addEventListener("change", renderAll);
  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
  initForecastControls();
  window.addEventListener("resize", function(){ if (ALL_ROWS.length) renderAll(); });

  if (window.EMBEDDED_ROWS && window.EMBEDDED_ROWS.length) seedReportData(window.EMBEDDED_ROWS);
});
})();
