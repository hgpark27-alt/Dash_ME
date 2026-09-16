
(function(){
"use strict";

var COLOR = { blue:"#1e3a5f", orange:"#c2612d", aqua:"#1baf7a", yellow:"#c98a1f",
  magenta:"#b5567a", green:"#0f7a3d", violet:"#4a3aa7", red:"#b91c1c",
  ink:"#0f172a", ink2:"#475569", muted:"#64748b", grid:"#e2e8f0", axis:"#cbd5e1" };

var BU_PALETTE_ORDER = [COLOR.blue,COLOR.orange,COLOR.aqua,COLOR.yellow,COLOR.magenta,COLOR.green,COLOR.violet,COLOR.red];
var OTHER_GREY = "#94a3b8";

var DIVISION_HUES = {
  "TKM": { dark: COLOR.blue, light: "#93b3d6" },
  "NEW": { dark: COLOR.orange, light: "#e3ab84" }
};
function getDivisionHue(div){
  return DIVISION_HUES[div] || { dark: COLOR.violet, light: "#c9c0ec" };
}

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
  tip.style.left = (e.clientX+12)+"px"; tip.style.top = (e.clientY+12)+"px";
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
  var svg = '<svg viewBox="0 0 '+width+' '+height+'" width="100%" height="'+height+'" role="img">';
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
        var dash = s.dashed ? ' stroke="'+s.color+'" stroke-width="1.5" stroke-dasharray="3,2" fill-opacity="0.55"' : '';
        svg += '<rect class="bar" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" fill="'+s.color+'"'+dash+'/>';
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

  var svg = '<svg viewBox="0 0 '+width+' '+height+'" width="100%" height="'+height+'" role="img">';
  var steps = 4;
  for (var i=0;i<=steps;i++){
    var v = maxVal*i/steps;
    var y = mT + yOf(v);
    svg += '<line x1="'+mL+'" x2="'+(width-mR)+'" y1="'+y+'" y2="'+y+'" stroke="'+COLOR.grid+'" stroke-width="1"/>';
    svg += '<text x="'+(mL-8)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="'+COLOR.muted+'">'+formatKRW(v)+'</text>';
  }

  var bandPoints = [];
  categories.forEach(function(cat, ci){
    if (band.high[ci]==null) return;
    bandPoints.push(cx(ci).toFixed(1)+','+(mT+yOf(band.high[ci])).toFixed(1));
  });
  for (var cj=categories.length-1; cj>=0; cj--){
    if (band.low[cj]==null) continue;
    bandPoints.push(cx(cj).toFixed(1)+','+(mT+yOf(Math.max(band.low[cj],0))).toFixed(1));
  }
  if (bandPoints.length>=4){
    svg += '<polygon points="'+bandPoints.join(' ')+'" fill="'+(opts.bandColor||COLOR.violet)+'" opacity="0.16"/>';
  }

  categories.forEach(function(cat, ci){
    var v = actualSeries.values[ci];
    if (v==null) return;
    var x = cx(ci) - barW/2;
    var y = mT + yOf(Math.max(v,0));
    var h = Math.max(0, plotH - yOf(Math.max(v,0)));
    var tip = actualSeries.label+" · "+cat+": "+formatFull(v);
    svg += '<rect class="bar" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" fill="'+actualSeries.color+'"/>';
  });

  var linePoints = [];
  categories.forEach(function(cat, ci){
    if (forecastLine.values[ci]==null) return;
    linePoints.push({ x:cx(ci), y:mT+yOf(Math.max(forecastLine.values[ci],0)), v:forecastLine.values[ci], cat:cat });
  });
  if (linePoints.length){
    var pathD = linePoints.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    svg += '<path d="'+pathD+'" fill="none" stroke="'+forecastLine.color+'" stroke-width="2.5" stroke-dasharray="6,3"/>';
    linePoints.forEach(function(p){
      var tip = forecastLine.label+" · "+p.cat+": "+formatFull(p.v);
      svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="4" fill="'+forecastLine.color+'"/>';
    });
  }

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
  var svg = '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" role="img">';
  var offset = 0;
  segs.forEach(function(it, i){
    var frac = it.value/total;
    var segLen = Math.max(0, frac*circumference - gapPx);
    var color = it.isOther ? OTHER_GREY : BU_PALETTE_ORDER[i % BU_PALETTE_ORDER.length];
    var tip = it.label+" · "+(frac*100).toFixed(1)+"% · "+formatFull(it.value);
    svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+
      '" stroke-width="'+thickness+'" stroke-dasharray="'+segLen.toFixed(2)+' '+(circumference-segLen).toFixed(2)+
      '" stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 '+cx+' '+cy+')"/>';
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
  var tiles = [];
  divisions.forEach(function(d){
    var dRows = rows.filter(function(r){ return r.division===d; });
    var op = opRateOf(dRows);
    tiles.push({ label: d+" 매출총액", value: sum(dRows,"totalRevenue"), note: periodLabel, division: d });
    tiles.push({ label: d+" 영업이익", value: op.value, rate: op.rate, note: periodLabel, division: d });
  });
  if (divisions.length > 1){
    var opAll = opRateOf(rows);
    tiles.push({ label: "합산 매출총액", value: sum(rows,"totalRevenue"), note: periodLabel, division: null });
    tiles.push({ label: "합산 영업이익", value: opAll.value, rate: opAll.rate, note: periodLabel, division: null });
  }
  box.innerHTML = tiles.map(function(t){
    var divClass = t.division==="TKM" ? " div-tkm" : t.division==="NEW" ? " div-new" : "";
    var valueText = formatKRW(t.value) + (t.rate!=null ? ' <span class="kpi-rate">('+t.rate.toFixed(0)+'%)</span>' : '');
    return '<div class="kpi-tile'+divClass+'"><div class="kpi-label">'+escapeHtml(t.label)+'</div>'+
      '<div class="kpi-value">'+valueText+'</div>'+
      '<div class="kpi-note">'+t.note+'</div></div>';
  }).join("");
}

/* ================================================================
   예측 시뮬레이션 — Holt 지수평활 (수준 + 추세, 계절성 제외)
   ================================================================ */
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

  var fc = [], ciLow=[], ciHigh=[];
  var phiCum = 0;
  for (var k=1; k<=h; k++){
    phiCum += Math.pow(phi,k);
    var val = Math.max(0, L + phiCum*T);
    fc.push(val);
    var band = 1.96*rmse*Math.sqrt(k);
    ciLow.push(Math.max(0, val-band));
    ciHigh.push(val+band);
  }
  return { fitted:fitted, forecast:fc, ciLow:ciLow, ciHigh:ciHigh, rmse:rmse, level:L, trend:T };
}

/* 파라미터는 조절 UI 없이 고정한다 — FPP3(Hyndman)이 "자동 예측에서
   가장 신뢰할 수 있는 선택"으로 꼽는 감쇠추세(damped trend) 조합.
   α·β·φ 같은 통계 용어를 직접 만지게 하는 대신, 쓰는 사람이 이해할 수
   있는 축(대상 사업부문 / 예측 개월 / 환율 변동률)만 조절하게 한다. */
var FORECAST_PARAMS = { alpha:0.3, beta:0.1, phi:0.9 };
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
  if (MONTH_KEYS.length < 3){ card.hidden = true; return; }
  card.hidden = false;

  var data = forecastSeries(FC.division);
  var result = holtForecast(data, FORECAST_PARAMS.alpha, FORECAST_PARAMS.beta, FORECAST_PARAMS.phi, FC.horizon);
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
  var bandLow = MONTH_KEYS.map(function(){ return null; }).concat(result.ciLow.map(function(v){ return v*fxAdj; }));
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

  var periodMonthKeys = MONTH_KEYS.filter(function(mk){ return mk>=f.from && mk<=f.to; });
  var combinedSeries = divisions.map(function(d){
    var dRows = rows.filter(function(r){ return r.division===d; });
    var months = monthlyAgg(dRows, periodMonthKeys);
    var hue = getDivisionHue(d);
    return { key:d, label:d, color:hue.dark, values: months.map(function(m){ return m.value; }) };
  });
  drawGroupedBars(document.getElementById("monthlyChartCombined"),
    periodMonthKeys.map(monthKeyLabel), combinedSeries, { height:220 });

  var midGrid = document.getElementById("midGrid");
  var subGrid = document.getElementById("subGrid");
  midGrid.innerHTML = divisions.map(function(d){
    return '<div class="sub-card donut-card"><h3>'+escapeHtml(d)+' 중분류 ('+periodLabel+')</h3><div class="chart-body" id="midChart-'+escapeAttr(d)+'"></div></div>';
  }).join("");
  subGrid.innerHTML = divisions.map(function(d){
    return '<div class="sub-card donut-card"><h3>'+escapeHtml(d)+' 소분류 ('+periodLabel+')</h3><div class="chart-body" id="subChart-'+escapeAttr(d)+'"></div></div>';
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
