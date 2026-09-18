
(function(){
"use strict";

var COLOR = { blue:"#3b6fe0", orange:"#14b8a6", aqua:"#14b8a6", yellow:"#f0b429",
  magenta:"#a855c9", green:"#10b981", violet:"#6d5ce8", red:"#e0526b", accent:"#3ca3f9",
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
/* 첫 진입/필터 적용 시에만 등장 애니메이션을 재생한다. 리사이즈 등
   레이아웃 재계산만 필요한 재렌더링에서는 false로 두어 애니메이션이
   불필요하게 다시 재생되지 않게 한다(모바일 스크롤 중 주소창이 접혔다
   펼쳐지며 resize가 반복 발생하는 경우가 대표적). */
var RENDER_ANIMATE = true;
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

/* ---------- 새로고침/필터 적용 시 숫자 카운트업 애니메이션 ----------
   CSS 쪽(도넛 회전, 바 성장)과 동일한 "저속-고속-저속" 곡선(--ease-load,
   cubic-bezier(0.65,0,0.35,1))을 그대로 재현해서, 숫자가 올라가는 속도감이
   그래프 모션과 어긋나지 않게 맞춘다. */
function makeBezierEasing(mX1, mY1, mX2, mY2){
  function A(a1,a2){ return 1-3*a2+3*a1; }
  function B(a1,a2){ return 3*a2-6*a1; }
  function C(a1){ return 3*a1; }
  function calcBezier(t,a1,a2){ return ((A(a1,a2)*t+B(a1,a2))*t+C(a1))*t; }
  function getSlope(t,a1,a2){ return 3*A(a1,a2)*t*t+2*B(a1,a2)*t+C(a1); }
  function getTForX(x){
    var t = x;
    for (var i=0;i<8;i++){
      var diff = calcBezier(t,mX1,mX2)-x;
      var slope = getSlope(t,mX1,mX2);
      if (Math.abs(slope) < 1e-6) break;
      t -= diff/slope;
    }
    return t;
  }
  return function(x){ return calcBezier(getTForX(x), mY1, mY2); };
}
var easeLoad = makeBezierEasing(0.65, 0, 0.35, 1);

function animateNumber(el, target, duration, formatFn){
  if (!RENDER_ANIMATE){ el.textContent = formatFn(target); return; }
  var start = performance.now();
  function tick(now){
    var t = Math.min(1, (now-start)/duration);
    el.textContent = formatFn(target*easeLoad(t));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* 등장 애니메이션 중엔 그림자 필터를 뺐다가(성능), 애니메이션이 끝나는
   시점에 data-restore-filter에 적어둔 필터를 다시 붙인다. */
function restoreFilterAfterAnimation(container, delayMs){
  setTimeout(function(){
    container.querySelectorAll("[data-restore-filter]").forEach(function(el){
      el.setAttribute("filter", el.getAttribute("data-restore-filter"));
    });
  }, delayMs);
}

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
        /* 성장 애니메이션과 그림자 필터를 동시에 적용하면(특히 저사양 GPU에서)
           매 프레임 필터를 다시 계산해야 해 버벅거림의 주 원인이 된다 —
           애니메이션 재생 중에는 필터를 빼고, 끝나는 시점에 다시 붙인다
           (restoreFilterAfterAnimation). */
        var dash = s.dashed ? ' stroke="'+s.color+'" stroke-width="1.5" stroke-dasharray="3,2" fill-opacity="0.55"'
          : (RENDER_ANIMATE ? ' data-restore-filter="url(#barShadow'+uid+')"' : ' filter="url(#barShadow'+uid+')"');
        var fill = s.dashed ? s.color : 'url(#barGrad'+uid+'-'+si+')';
        svg += '<rect class="bar'+(RENDER_ANIMATE?' bar-grow-v':'')+'" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3.5" fill="'+fill+'"'+dash+'/>';
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
  if (RENDER_ANIMATE) restoreFilterAfterAnimation(container, 700);
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

  /* 예측선(심지)이 점→점으로 이어그리며 완성된 다음에야 신뢰구간이
     벌어지기 시작한다 — 그래서 선을 그리는 데 걸리는 시간(lineDrawMs)을
     먼저 계산해두고, 아래 밴드 애니메이션의 시작 시각(begin)으로 쓴다. */
  var linePoints = [];
  categories.forEach(function(cat, ci){
    if (forecastLine.values[ci]==null) return;
    linePoints.push({ x:cx(ci), y:mT+yOf(Math.max(forecastLine.values[ci],0)), v:forecastLine.values[ci], cat:cat, ci:ci });
  });
  var lineCumDist = [0], lineTotalDist = 0;
  for (var li=1; li<linePoints.length; li++){
    var dx = linePoints[li].x-linePoints[li-1].x, dy = linePoints[li].y-linePoints[li-1].y;
    lineTotalDist += Math.sqrt(dx*dx+dy*dy);
    lineCumDist.push(lineTotalDist);
  }
  var lineDrawMs = linePoints.length>1 ? Math.min(550, Math.max(200, (linePoints.length-1)*100)) : 0;

  /* 신뢰구간은 '심지'(예측선 값)에서 상단/하단이 갈라지며 벌어지는 모양으로
     등장한다 — cy는 그 지점의 예측선(중심값) y좌표, y는 실제 상/하단 y좌표. */
  var topPts = [], botPts = [];
  categories.forEach(function(cat, ci){
    if (band.high[ci]==null) return;
    var cy = mT+yOf(Math.max(forecastLine.values[ci]||0,0));
    topPts.push({ x:cx(ci), y:mT+yOf(band.high[ci]), cy:cy, v:band.high[ci], cat:cat });
  });
  categories.forEach(function(cat, ci){
    if (band.low[ci]==null) return;
    var cy = mT+yOf(Math.max(forecastLine.values[ci]||0,0));
    botPts.push({ x:cx(ci), y:mT+yOf(Math.max(band.low[ci],0)), cy:cy, v:Math.max(band.low[ci],0), cat:cat });
  });
  var bandPointsTo = topPts.map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); })
    .concat(botPts.slice().reverse().map(function(p){ return p.x.toFixed(1)+','+p.y.toFixed(1); }));
  var BAND_DUR = 0.42;
  var bandBeginS = (lineDrawMs/1000).toFixed(2);
  if (bandPointsTo.length>=4){
    var bandPointsFrom = topPts.map(function(p){ return p.x.toFixed(1)+','+p.cy.toFixed(1); })
      .concat(botPts.slice().reverse().map(function(p){ return p.x.toFixed(1)+','+p.cy.toFixed(1); }));
    var bandBase = RENDER_ANIMATE ? bandPointsFrom.join(' ') : bandPointsTo.join(' ');
    var bandAnim = RENDER_ANIMATE
      ? '<animate attributeName="points" begin="'+bandBeginS+'s" from="'+bandPointsFrom.join(' ')+'" to="'+bandPointsTo.join(' ')+
        '" dur="'+BAND_DUR+'s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.35 1"/>'
      : '';
    var glowFilter = RENDER_ANIMATE ? ' data-restore-filter="url(#softBlur'+uid+')"' : ' filter="url(#softBlur'+uid+')"';
    svg += '<polygon points="'+bandBase+'" fill="url(#bandGrad'+uid+')"'+glowFilter+'>'+bandAnim+'</polygon>';
    svg += '<polygon points="'+bandBase+'" fill="url(#bandGrad'+uid+')">'+bandAnim+'</polygon>';
    var topEdgeTo = topPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    var botEdgeTo = botPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    var topEdgeAnim = "", botEdgeAnim = "", topEdgeBase = topEdgeTo, botEdgeBase = botEdgeTo;
    if (RENDER_ANIMATE){
      var topEdgeFrom = topPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.cy.toFixed(1); }).join(' ');
      var botEdgeFrom = botPts.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.cy.toFixed(1); }).join(' ');
      topEdgeBase = topEdgeFrom; botEdgeBase = botEdgeFrom;
      topEdgeAnim = '<animate attributeName="d" begin="'+bandBeginS+'s" from="'+topEdgeFrom+'" to="'+topEdgeTo+'" dur="'+BAND_DUR+'s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.35 1"/>';
      botEdgeAnim = '<animate attributeName="d" begin="'+bandBeginS+'s" from="'+botEdgeFrom+'" to="'+botEdgeTo+'" dur="'+BAND_DUR+'s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.35 1"/>';
    }
    svg += '<path d="'+topEdgeBase+'" fill="none" stroke="'+bandColor+'" stroke-width="1" stroke-opacity="0.4" stroke-linecap="round">'+topEdgeAnim+'</path>';
    svg += '<path d="'+botEdgeBase+'" fill="none" stroke="'+bandColor+'" stroke-width="1" stroke-opacity="0.4" stroke-linecap="round">'+botEdgeAnim+'</path>';
  }

  /* 왼쪽(과거) 데이터부터 오른쪽으로 순서대로 훑으며 자라난다 — 막대 개수와
     무관하게 전체 훑는 시간은 항상 160ms 안쪽으로 맞춰 빠르게 느껴지게 한다.
     이 차트만 다른 막대 차트보다 빠르게 가려고 지속시간을 직접 지정한다. */
  var BAR_GROW_MS = 380;
  var actualCount = actualSeries.values.filter(function(v){ return v!=null; }).length;
  var barStagger = actualCount>1 ? Math.min(24, 160/actualCount) : 0;
  categories.forEach(function(cat, ci){
    var v = actualSeries.values[ci];
    if (v==null) return;
    var x = cx(ci) - barW/2;
    var y = mT + yOf(Math.max(v,0));
    var h = Math.max(0, plotH - yOf(Math.max(v,0)));
    var tip = actualSeries.label+" · "+cat+": "+formatFull(v);
    var barFilter = RENDER_ANIMATE ? ' data-restore-filter="url(#barShadowF'+uid+')"' : ' filter="url(#barShadowF'+uid+')"';
    var barDelay = RENDER_ANIMATE ? ' style="animation-delay:'+(ci*barStagger).toFixed(0)+'ms;animation-duration:'+BAR_GROW_MS+'ms"' : '';
    svg += '<rect class="bar'+(RENDER_ANIMATE?' bar-grow-v':'')+'" data-tip="'+escapeAttr(tip)+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3.5" fill="url(#barGradF'+uid+')"'+barFilter+barDelay+'/>';
  });

  if (linePoints.length){
    var pathD = linePoints.map(function(p,i){ return (i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ');
    var lineFilter = RENDER_ANIMATE ? ' data-restore-filter="url(#lineGlow'+uid+')"' : ' filter="url(#lineGlow'+uid+')"';
    var lineEl = '<path d="'+pathD+'" fill="none" stroke="'+forecastLine.color+'" stroke-width="2.5" stroke-dasharray="6,3" stroke-linecap="round"'+lineFilter+'/>';
    var firstX = linePoints[0].x, lastX = linePoints[linePoints.length-1].x;
    /* 점을 왼쪽에서 오른쪽으로 하나씩 이어그리는 효과 — 클립 사각형의 폭을
       0에서 전체 폭까지 넓혀서, 데코용 점선 패턴(6,3)은 그대로 두고
       "얼마나 그려졌는지"만 가린다. */
    if (RENDER_ANIMATE && linePoints.length>1){
      var revealW = (lastX-firstX)+12;
      svg += '<clipPath id="lineReveal'+uid+'"><rect x="'+(firstX-6).toFixed(1)+'" y="0" width="0" height="'+height+'">'+
        '<animate attributeName="width" from="0" to="'+revealW.toFixed(1)+'" dur="'+(lineDrawMs/1000)+'s" fill="freeze" calcMode="linear"/>'+
        '</rect></clipPath>';
      svg += '<g clip-path="url(#lineReveal'+uid+')">'+lineEl+'</g>';
    } else {
      svg += lineEl;
    }
    linePoints.forEach(function(p){
      var tip = (forecastLine.tips && forecastLine.tips[p.ci]) || (forecastLine.label+" · "+p.cat+": "+formatFull(p.v));
      var delayMs = (RENDER_ANIMATE && linePoints.length>1) ? ((p.x-firstX)/(lastX-firstX))*lineDrawMs : 0;
      var popAttrs = RENDER_ANIMATE ? ' class="point-pop" style="animation-delay:'+delayMs.toFixed(0)+'ms"' : '';
      var popAttrsDot = RENDER_ANIMATE ? ' class="bar point-pop" style="animation-delay:'+delayMs.toFixed(0)+'ms"' : ' class="bar"';
      svg += '<circle data-tip="'+escapeAttr(tip)+'"'+popAttrs+' cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="11" fill="url(#dotGlow'+uid+')"/>';
      svg += '<circle data-tip="'+escapeAttr(tip)+'"'+popAttrsDot+' cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="4" fill="'+forecastLine.color+'" stroke="#fff" stroke-width="1.2"/>';
    });
  }

  /* 신뢰구간 상단/하단 경계에도 호버 포인트를 찍어 상향/하향 예측값을 바로 확인할 수 있게 한다.
     선이 지나갈 때 심지 위치에서 나타났다가, 밴드가 벌어질 때 같이 실제 경계까지 이동한다. */
  function boundaryDotSvg(p, tipLabel){
    var tip = tipLabel+" · "+p.cat+": "+formatFull(p.v);
    var popDelay = (RENDER_ANIMATE && linePoints.length>1) ? ((p.x-firstX)/(lastX-firstX))*lineDrawMs : 0;
    var popAttrs = RENDER_ANIMATE ? ' class="point-pop" style="animation-delay:'+popDelay.toFixed(0)+'ms"' : '';
    var popAttrsDot = RENDER_ANIMATE ? ' class="bar point-pop" style="animation-delay:'+popDelay.toFixed(0)+'ms"' : ' class="bar"';
    var cyBase = RENDER_ANIMATE ? p.cy.toFixed(1) : p.y.toFixed(1);
    var moveAnim = RENDER_ANIMATE
      ? '<animate attributeName="cy" begin="'+bandBeginS+'s" from="'+p.cy.toFixed(1)+'" to="'+p.y.toFixed(1)+'" dur="'+BAND_DUR+'s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.35 1"/>'
      : '';
    var out = '<circle data-tip="'+escapeAttr(tip)+'"'+popAttrs+' cx="'+p.x.toFixed(1)+'" cy="'+cyBase+'" r="9" fill="url(#dotGlow'+uid+')">'+moveAnim+'</circle>';
    out += '<circle data-tip="'+escapeAttr(tip)+'"'+popAttrsDot+' cx="'+p.x.toFixed(1)+'" cy="'+cyBase+'" r="2.6" fill="'+lighten(bandColor,0.2)+'" stroke="#fff" stroke-width="1">'+moveAnim+'</circle>';
    return out;
  }
  topPts.forEach(function(p){ svg += boundaryDotSvg(p, "상향(95%)"); });
  botPts.forEach(function(p){ svg += boundaryDotSvg(p, "하향(95%)"); });

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
  if (RENDER_ANIMATE){
    var barSweepMs = actualCount>1 ? (actualCount-1)*barStagger + BAR_GROW_MS : BAR_GROW_MS;
    restoreFilterAfterAnimation(container, barSweepMs + 20);
    var lineBandTotalMs = lineDrawMs + (bandPointsTo.length>=4 ? BAND_DUR*1000 : 0);
    restoreFilterAfterAnimation(container, lineBandTotalMs + 20);
  }
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
    var growAnim = RENDER_ANIMATE
      ? '<animate attributeName="stroke-dasharray" from="0 '+circumference.toFixed(2)+'" to="'+segLen.toFixed(2)+' '+(circumference-segLen).toFixed(2)+
        '" dur="0.72s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.35 1"/>'
      : '';
    /* 도넛도 바 차트와 같은 이유로 — 원호 펼침 애니메이션 중에는 그림자
       필터를 빼서 매 프레임 필터 재계산 비용을 없애고, 끝나는 시점에 다시 붙인다. */
    var donutFilter = RENDER_ANIMATE ? ' data-restore-filter="url(#donutShadow'+uid+')"' : ' filter="url(#donutShadow'+uid+')"';
    svg += '<circle class="bar" data-tip="'+escapeAttr(tip)+'" cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="url(#donutGrad'+uid+'-'+i+')"'+
      ' stroke-width="'+thickness+'" stroke-dasharray="'+segLen.toFixed(2)+' '+(circumference-segLen).toFixed(2)+
      '" stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 '+cx+' '+cy+')"'+donutFilter+'>'+
      growAnim+'</circle>';
    offset += frac*circumference;
  });
  var top = segs[0];
  svg += '<g class="'+(RENDER_ANIMATE ? 'donut-fade' : '')+'">';
  svg += '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="17" font-weight="700" fill="'+COLOR.ink+'">'+(top.value/total*100).toFixed(0)+'%</text>';
  svg += '<text x="'+cx+'" y="'+(cy+15)+'" text-anchor="middle" font-size="10.5" fill="'+COLOR.muted+'">'+escapeHtml(top.label)+'</text>';
  svg += '</g>';
  svg += '</svg>';
  container.innerHTML = svg;
  attachTooltip(container);
  renderLegend(container, segs.map(function(it, i){
    var color = it.isOther ? OTHER_GREY : BU_PALETTE_ORDER[i % BU_PALETTE_ORDER.length];
    return { label: it.label+" "+(it.value/total*100).toFixed(1)+"%", color: color };
  }));
  if (RENDER_ANIMATE) restoreFilterAfterAnimation(container, 740);
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
    var rateHtml = t.rate!=null ? ' <span class="kpi-rate">('+t.rate.toFixed(0)+'%)</span>' : '';
    return '<div class="kpi-tile"><div class="kpi-label">'+escapeHtml(t.label)+'</div>'+
      '<div class="kpi-value"><span class="kpi-num" data-target="'+t.value+'">0</span>'+rateHtml+'</div>'+
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
  box.querySelectorAll(".kpi-num[data-target]").forEach(function(el){
    animateNumber(el, Number(el.getAttribute("data-target"))||0, 900, formatKRW);
  });
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

/* 계절/패턴 지수 — 최소 12개월 이상 쌓였을 때만 월별 계절지수를 추정해서
   추세 성분과 분리한다(데이터가 1년 미만이면 추정 자체가 불안정하므로
   적용하지 않는다 = 전부 1). 이렇게 분리한 뒤 추세만 홀트 평활에 태우고,
   예측값은 다시 계절지수를 곱해 되돌린다. */
function computeSeasonalIndex(monthKeys, values){
  if (monthKeys.length < 12) return null;
  var mean = values.reduce(function(a,b){ return a+b; }, 0) / values.length;
  if (mean <= 0) return null;
  var byMonth = {};
  monthKeys.forEach(function(mk, i){
    var mm = mk.slice(5,7);
    (byMonth[mm] = byMonth[mm] || []).push(values[i]/mean);
  });
  var idx = {};
  for (var mo=1; mo<=12; mo++){
    var key = String(mo).padStart(2,"0");
    var arr = byMonth[key];
    idx[key] = arr && arr.length ? arr.reduce(function(a,b){ return a+b; },0)/arr.length : 1;
  }
  var idxMean = Object.keys(idx).reduce(function(s,k){ return s+idx[k]; }, 0) / 12;
  Object.keys(idx).forEach(function(k){
    /* 데이터가 짧아 특정 달이 1~2개 표본뿐이면 지수가 과도하게 튈 수 있어
       ±30%로 완충한다. */
    idx[k] = Math.max(0.7, Math.min(1.3, idx[k]/idxMean));
  });
  return idx;
}

/* 과거 데이터가 짧을수록 먼 미래로 갈수록 예측구간이 나팔처럼 급격히
   벌어지므로, 보유 개월수의 절반을 넘는 horizon은 신뢰도가 떨어진다고
   보고 자동으로 줄인다(사용자가 슬라이더로 6개월을 선택해도 데이터가
   4개월뿐이면 2개월까지만 보여준다). */
function effectiveHorizon(monthCount, requestedHorizon){
  return Math.max(1, Math.min(requestedHorizon, Math.ceil(monthCount/2)));
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
var FC = { horizon:3, fxChange:0 };

/* 상단 필터(사업부문/중분류/기간)로 걸러진 행·월 목록. renderAll()이 매번
   갱신하고, 예측도 이 걸러진 데이터를 그대로 대상으로 삼는다 — 화면에 보이는
   실적과 다른 모집단으로 예측하면 앞뒤가 안 맞기 때문. */
var FC_ROWS = [];
var FC_MONTH_KEYS = [];
var FC_DIVISION_LABEL = null; // "TKM" | "NEW" | null(전체/복수 합산)

function forecastSeries(rows, monthKeys){
  return monthlyAgg(rows, monthKeys).map(function(m){ return m.value; });
}

/* 수출 비중 — U열(거래처명)이 정확히 A사인 매출만 환율 영향을 받는
   수출분으로 본다 (그 외 국내거래처 포함 전부 국내). */
function exportRatioOf(rows){
  var total = sum(rows, "totalRevenue");
  if (total <= 0) return 0;
  var exportSum = sum(rows.filter(function(r){ return r.isExport; }), "totalRevenue");
  return exportSum / total;
}

function renderForecast(animate){
  /* animate가 명시적으로 넘어올 때만 강제로 켜고/끈다 — renderAll()이 내부에서
     인자 없이 부를 때는 renderAll 쪽에서 이미 정해둔 RENDER_ANIMATE를 그대로 쓴다. */
  if (animate !== undefined) RENDER_ANIMATE = animate !== false;
  var card = document.getElementById("forecastCard");
  var monthKeys = FC_MONTH_KEYS;
  var rows = FC_ROWS;
  var subEl = document.getElementById("monthlyChartSub");
  if (monthKeys.length < 3){
    card.hidden = true;
    document.getElementById("forecastChart").innerHTML = '<p class="empty-state">예측에는 최소 3개월치 데이터가 필요합니다.</p>';
    document.getElementById("forecastKPI").innerHTML = "";
    return;
  }
  card.hidden = false;

  var data = forecastSeries(rows, monthKeys);
  var effH = effectiveHorizon(monthKeys.length, FC.horizon);
  if (subEl){
    subEl.textContent = (FC_DIVISION_LABEL || "사업부문 통합") + " · 95% 예측구간 포함"+
      (effH < FC.horizon ? " · 데이터가 짧아 예측 "+effH+"개월로 자동 조정" : "");
  }

  var futureKeys = [];
  var lastKey = monthKeys[monthKeys.length-1];
  var y = parseInt(lastKey.slice(0,4),10), m = parseInt(lastKey.slice(5,7),10);
  for (var i=0;i<effH;i++){
    m++; if (m>12){ m=1; y++; }
    futureKeys.push(y+"-"+String(m).padStart(2,"0"));
  }

  /* 계절/패턴 지수를 분리한 뒤 추세만 홀트 평활에 태우고, 예측이 나오면
     다시 계절지수를 곱해 되돌린다(데이터 1년 미만이면 지수는 전부 1). */
  var seasonalIdx = computeSeasonalIndex(monthKeys, data);
  var deseason = seasonalIdx ? data.map(function(v,i){ return v/seasonalIdx[monthKeys[i].slice(5,7)]; }) : data;
  var fitted = fitHoltParams(deseason, FORECAST_PARAMS.phi);
  var result = holtForecast(deseason, fitted.alpha, fitted.beta, FORECAST_PARAMS.phi, effH);
  if (!result){
    document.getElementById("forecastChart").innerHTML = '<p class="empty-state">예측에 필요한 데이터가 부족합니다.</p>';
    document.getElementById("forecastKPI").innerHTML = "";
    return;
  }
  if (seasonalIdx){
    result.forecast = result.forecast.map(function(v,i){ return v*seasonalIdx[futureKeys[i].slice(5,7)]; });
    result.ciLow = result.ciLow.map(function(v,i){ return v*seasonalIdx[futureKeys[i].slice(5,7)]; });
    result.ciHigh = result.ciHigh.map(function(v,i){ return v*seasonalIdx[futureKeys[i].slice(5,7)]; });
  }

  /* 환율 변동 반영: 수출 비중만큼만 환율 변동률을 곱해서 보정한다.
     adj = 1 + 수출비중 × (환율변동률/100) */
  var exportRatio = exportRatioOf(rows);
  var fxAdj = 1 + exportRatio * (FC.fxChange/100);
  var forecastAdj = result.forecast.map(function(v){ return Math.max(0, v*fxAdj); });

  var hue = FC_DIVISION_LABEL==="TKM" ? DIVISION_HUES.TKM : FC_DIVISION_LABEL==="NEW" ? DIVISION_HUES.NEW : { dark:COLOR.accent, light:lighten(COLOR.accent,0.45) };
  var categories = monthKeys.concat(futureKeys).map(monthKeyLabel);
  var actualValues = data.concat(futureKeys.map(function(){ return null; }));
  var forecastValues = monthKeys.map(function(){ return null; }).concat(forecastAdj);
  var bandLow = monthKeys.map(function(){ return null; }).concat(result.ciLow.map(function(v){ return Math.max(0, v*fxAdj); }));
  var bandHigh = monthKeys.map(function(){ return null; }).concat(result.ciHigh.map(function(v){ return v*fxAdj; }));

  /* 예측 포인트에 마우스를 올리면 "왜 이 숫자인지"를 문장으로 바로 보여준다. */
  var phiCumArrTip = [];
  var pcAccTip = 0;
  for (var pci=1; pci<=effH; pci++){ pcAccTip += Math.pow(FORECAST_PARAMS.phi, pci); phiCumArrTip.push(pcAccTip); }
  var forecastTips = futureKeys.map(function(fk, i){
    var phiCumK = phiCumArrTip[i];
    var deseasonVal = result.level + phiCumK*result.trend;
    var mm = fk.slice(5,7);
    var parts = [];
    if (seasonalIdx) parts.push("계절지수 "+seasonalIdx[mm].toFixed(2)+"배 반영");
    if (FC.fxChange !== 0) parts.push("환율 "+(FC.fxChange>=0?"+":"")+FC.fxChange+"%(수출비중 "+(exportRatio*100).toFixed(0)+"%) 반영");
    var tail = parts.length ? "이 "+parts.join(", ")+"해서" : "이";
    return monthKeyLabel(fk)+" 예측 — 현재 수준 "+formatKRW(result.level)+"원에 월 추세 "+formatKRW(result.trend)+
      "원을 "+phiCumK.toFixed(2)+"배(감쇠누적, "+(i+1)+"개월째) 반영한 값"+tail+" "+formatKRW(forecastAdj[i])+"원입니다.";
  });
  var forecastTipsFull = monthKeys.map(function(){ return null; }).concat(forecastTips);

  drawForecastChart(document.getElementById("forecastChart"), categories,
    { label:(FC_DIVISION_LABEL||"합산")+" 실측", color:hue.dark, values:actualValues },
    { label:"예측", color:hue.dark, values:forecastValues, tips:forecastTipsFull },
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
    { label: futureKeys[futureKeys.length-1]+" 예측", raw: lastForecast, fmt: function(v){ return formatKRW(v)+"원"; }, sub: "95% 구간 "+formatKRW(lastBandLow)+" ~ "+formatKRW(lastBandHigh) },
    { label: effH+"개월 합계 예측", raw: horizonSum, fmt: function(v){ return formatKRW(v)+"원"; }, sub: monthKeyLabel(futureKeys[0])+" ~ "+monthKeyLabel(futureKeys[futureKeys.length-1]) },
    { label: "최근월 대비 증감", raw: growth, fmt: function(v){ return (v>=0?"+":"")+v.toFixed(1)+"%"; }, sub: monthKeyLabel(lastKey)+" 실측 대비" },
    { label: "수출 비중(환율 영향분)", raw: exportRatio*100, fmt: function(v){ return v.toFixed(1)+"%"; }, sub: "A사向 매출 기준" }
  ];
  document.getElementById("forecastKPI").innerHTML = kpis.map(function(k, i){
    return '<div class="fc-kpi"><div class="fc-kpi-label">'+escapeHtml(k.label)+'</div>'+
      '<div class="fc-kpi-value" data-idx="'+i+'">'+escapeHtml(k.fmt(0))+'</div>'+
      '<div class="fc-kpi-sub">'+escapeHtml(k.sub)+'</div></div>';
  }).join("");
  document.querySelectorAll('#forecastKPI .fc-kpi-value[data-idx]').forEach(function(el){
    var k = kpis[Number(el.getAttribute("data-idx"))];
    animateNumber(el, k.raw, 900, k.fmt);
  });

  /* 산출 근거 — 예측값이 감이 아니라 방정식과 실제 대입값에서 나왔음을
     그대로 보여준다. 정확도보다 "왜 이 숫자인지 설명 가능한가"가 핵심. */
  var phiSumH = 0;
  for (var pk=1; pk<=effH; pk++) phiSumH += Math.pow(FORECAST_PARAMS.phi, pk);
  var fxPct = exportRatio*100 * (FC.fxChange/100);
  var formulaRows = [
    ["방법", "Holt 지수평활법(감쇠추세) · FPP3(Hyndman) 표준기법"],
    ["추정식", "Y(t+h) = L + (φ+φ²+...+φʰ)·T"],
    ["계절/패턴 지수", seasonalIdx ? "월별 계절지수 반영 (12개월 이상 데이터 확보)" : "미반영 (12개월 미만 — 추정 불안정)"],
    ["예측 개월", effH+"개월"+(effH<FC.horizon ? " (선택 "+FC.horizon+"개월 → 데이터 길이의 절반로 자동 축소)" : "")],
    ["현재 수준 L", formatKRW(result.level)+"원"+(seasonalIdx?" (계절조정)":"")],
    ["월별 추세 T", formatKRW(result.trend)+"원/월"],
    ["평활 계수 α, β", "α="+fitted.alpha.toFixed(2)+", β="+fitted.beta.toFixed(2)+" (과거 실적 오차 최소화로 자동 적합)"],
    ["감쇠계수 φ", FORECAST_PARAMS.phi.toFixed(2)+" (h="+effH+" 합 Σφᵏ = "+phiSumH.toFixed(2)+")"],
    ["환율 반영식", "Y_조정 = Y × (1 + 수출비중 × Δ환율%)"],
    ["대입값", "수출비중 "+(exportRatio*100).toFixed(1)+"% × 환율 "+(FC.fxChange>=0?"+":"")+FC.fxChange+"% = 보정 "+(fxPct>=0?"+":"")+fxPct.toFixed(2)+"%p"],
    ["모델 적합오차(RMSE)", formatKRW(result.rmse)+"원 (계절조정 후 과거 실적 대비)"]
  ];
  document.getElementById("fcFormula").innerHTML = '<div class="fc-formula-title">산출 근거</div><table>'+
    formulaRows.map(function(r){ return '<tr><td>'+escapeHtml(r[0])+'</td><td>'+escapeHtml(r[1])+'</td></tr>'; }).join("")+
    '</table>';
}

function initForecastControls(){
  function slider(id, key, fmt){
    var el = document.getElementById(id);
    var val = document.getElementById(id+"V");
    el.addEventListener("input", function(){
      FC[key] = parseFloat(el.value);
      val.textContent = fmt ? fmt(FC[key]) : el.value;
      /* 슬라이더를 조절하는 동안 매번 등장 애니메이션이 재생되면 값이 계속
         흔들리는 것처럼 보여 가독성이 떨어진다 — 여기서는 애니메이션 없이
         바로 최종 상태로 그린다. */
      renderForecast(false);
    });
  }
  slider("fcHorizon", "horizon", function(v){ return v+"개월"; });
  slider("fcFx", "fxChange", function(v){ return (v>0?"+":"")+v+"%"; });
}

/* ---------- 렌더 파이프라인 ---------- */
function renderAll(animate){
  if (!ALL_ROWS.length) return;
  RENDER_ANIMATE = animate !== false;
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

  /* 품목 구성비중 하단: 사업부문이 둘 이상일 때만 NEW:TKM 매출 비중을
     얇은 막대 하나로 심플하게 보여준다. */
  var ratioBox = document.getElementById("divisionRatio");
  if (divisions.length > 1){
    var ratioData = divisions.map(function(d){
      return { d:d, v:sum(periodRows.filter(function(r){ return r.division===d; }), "totalRevenue") };
    });
    var ratioTotal = ratioData.reduce(function(s,x){ return s+x.v; }, 0);
    ratioBox.hidden = false;
    /* 세그먼트가 동시에 각자 왼쪽에서 자라나면 사이가 뜬 것처럼 보인다 —
       앞 세그먼트가 다 자란 뒤에 다음 세그먼트가 이어서 자라도록 순서를 줘서
       바 전체가 왼쪽부터 하나로 이어져 채워지게 한다. */
    var RATIO_SWEEP_MS = 600;
    var cumFrac = 0;
    ratioBox.innerHTML =
      '<div class="division-ratio-bar">'+ratioData.map(function(x){
        var pct = ratioTotal>0 ? (x.v/ratioTotal*100) : 0;
        var hue = DIVISION_HUES[x.d] || { dark: COLOR.accent };
        var frac = pct/100;
        var style = 'width:'+pct.toFixed(2)+'%;background:'+hue.dark+';';
        if (RENDER_ANIMATE){
          style += 'animation-delay:'+(cumFrac*RATIO_SWEEP_MS).toFixed(0)+'ms;animation-duration:'+(frac*RATIO_SWEEP_MS).toFixed(0)+'ms;';
        }
        cumFrac += frac;
        return '<div class="seg'+(RENDER_ANIMATE?'':' no-anim')+'" style="'+style+'"></div>';
      }).join("")+'</div>'+
      '<div class="division-ratio-label">'+ratioData.map(function(x){
        var pct = ratioTotal>0 ? (x.v/ratioTotal*100) : 0;
        return escapeHtml(x.d)+' '+pct.toFixed(0)+'%';
      }).join(" : ")+'</div>';
  } else {
    ratioBox.hidden = true;
  }

  FC_ROWS = periodRows;
  FC_MONTH_KEYS = Array.from(new Set(periodRows.map(function(r){ return r.monthKey; }))).sort();
  FC_DIVISION_LABEL = f.division !== "__ALL__" ? f.division : null;
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

/* ================================================================
   인쇄 미리보기 — A4 한 페이지 요약. 인터랙티브 화면과 별개로
   자체 필터(사업부문/중분류/기간)와 옵션(가로세로/컬러흑백/포함항목)을
   가지며, 실제 프린터로 넘기기 전 눈으로 확인하는 모달이다.
   ================================================================ */
var PP = { orient:"portrait", mono:false, includeForecast:true, includeFormula:true };

function currentPrintFilters(){
  var fromSel = document.getElementById("printFrom");
  var toSel = document.getElementById("printTo");
  var from = fromSel.value, to = toSel.value;
  if (from > to){ var t=from; from=to; to=t; }
  return { division: document.getElementById("printDivision").value,
    mid: document.getElementById("printMid").value, from:from, to:to };
}

function refreshPrintMidOptions(){
  var divSel = document.getElementById("printDivision");
  var midSel = document.getElementById("printMid");
  var prevMid = midSel.value;
  var scopeRows = divSel.value==="__ALL__" ? ALL_ROWS : ALL_ROWS.filter(function(r){ return r.division===divSel.value; });
  var mids = Array.from(new Set(scopeRows.map(function(r){ return r.midCategory; }).filter(Boolean))).sort();
  midSel.innerHTML = ['<option value="__ALL__">전체</option>'].concat(mids.map(function(m){
    return '<option value="'+escapeAttr(m)+'">'+escapeHtml(m)+'</option>';
  })).join("");
  if (mids.indexOf(prevMid)!==-1) midSel.value = prevMid;
}

function populatePrintFilters(){
  var mainF = currentFilters();
  var divSel = document.getElementById("printDivision");
  var divisions = Array.from(new Set(ALL_ROWS.map(function(r){ return r.division; }))).sort();
  divSel.innerHTML = ['<option value="__ALL__">전체</option>'].concat(divisions.map(function(d){
    return '<option value="'+escapeAttr(d)+'">'+escapeHtml(d)+'</option>';
  })).join("");
  divSel.value = divisions.indexOf(mainF.division)!==-1 ? mainF.division : "__ALL__";
  refreshPrintMidOptions();
  var midSel = document.getElementById("printMid");
  if (Array.from(midSel.options).some(function(o){ return o.value===mainF.mid; })) midSel.value = mainF.mid;

  var fromSel = document.getElementById("printFrom");
  var toSel = document.getElementById("printTo");
  var opts = MONTH_KEYS.map(function(mk){ return '<option value="'+mk+'">'+monthKeyLabel(mk)+'</option>'; }).join("");
  fromSel.innerHTML = opts; toSel.innerHTML = opts;
  fromSel.value = MONTH_KEYS.indexOf(mainF.from)!==-1 ? mainF.from : MONTH_KEYS[0];
  toSel.value = MONTH_KEYS.indexOf(mainF.to)!==-1 ? mainF.to : MONTH_KEYS[MONTH_KEYS.length-1];
}

/* 인쇄용 월별 매출총액 추이 미니차트 — 인터랙티브 차트의 글로우/그림자 없이
   가볍게(잉크절약 흑백에서도 선명하게) 막대+예측선+구간만 그린다. */
function buildPrintTrendSVG(monthKeys, actualVals, futureKeys, forecastVals, bandLow, bandHigh, color, mono){
  var W = 680, H = 130, mL=44, mR=8, mT=8, mB=16;
  var plotW = W-mL-mR, plotH = H-mT-mB;
  var allMonths = monthKeys.concat(futureKeys || []);
  var allVals = actualVals.concat(bandHigh || forecastVals || []).filter(function(v){ return v!=null; });
  var maxVal = Math.max.apply(null, allVals.concat([1])) * 1.15;
  var n = allMonths.length;
  var stepX = n ? plotW/n : plotW;
  function xOf(i){ return mL + i*stepX + stepX/2; }
  function yOf(v){ return mT + plotH - (Math.max(v,0)/maxVal)*plotH; }

  var barColor = mono ? "#888888" : color;
  var lineColor = mono ? "#333333" : color;
  var bandColor = mono ? "#aaaaaa" : color;

  var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'">';
  svg += '<line x1="'+mL+'" x2="'+(W-mR)+'" y1="'+(mT+plotH)+'" y2="'+(mT+plotH)+'" stroke="#dcdfef" stroke-width="1"/>';

  if (bandLow && bandHigh){
    var topPts = [], botPts = [];
    futureKeys.forEach(function(fk, i){
      if (bandHigh[i]==null) return;
      topPts.push(xOf(monthKeys.length+i).toFixed(1)+','+yOf(bandHigh[i]).toFixed(1));
    });
    futureKeys.forEach(function(fk, i){
      if (bandLow[i]==null) return;
      botPts.push(xOf(monthKeys.length+i).toFixed(1)+','+yOf(bandLow[i]).toFixed(1));
    });
    if (topPts.length && botPts.length){
      svg += '<polygon points="'+topPts.concat(botPts.reverse()).join(' ')+'" fill="'+bandColor+'" opacity="'+(mono?0.15:0.16)+'"/>';
    }
  }

  actualVals.forEach(function(v, i){
    if (v==null) return;
    var bw = stepX*0.5;
    var x = xOf(i)-bw/2;
    var y = yOf(v);
    var h = (mT+plotH)-y;
    svg += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+barColor+'" '+
      (mono ? 'stroke="#333" stroke-width="1"' : 'opacity="0.85"')+'/>';
  });

  if (forecastVals && futureKeys && futureKeys.length){
    var lastActualIdx = actualVals.length-1;
    var d = 'M'+xOf(lastActualIdx).toFixed(1)+','+yOf(actualVals[lastActualIdx]).toFixed(1);
    futureKeys.forEach(function(fk, i){
      d += ' L'+xOf(monthKeys.length+i).toFixed(1)+','+yOf(forecastVals[i]).toFixed(1);
    });
    svg += '<path d="'+d+'" fill="none" stroke="'+lineColor+'" stroke-width="1.8" stroke-dasharray="4,2"/>';
    futureKeys.forEach(function(fk, i){
      svg += '<circle cx="'+xOf(monthKeys.length+i).toFixed(1)+'" cy="'+yOf(forecastVals[i]).toFixed(1)+'" r="2.2" fill="'+lineColor+'"/>';
    });
  }

  var labelStep = Math.max(1, Math.ceil(n/8));
  allMonths.forEach(function(mk, i){
    if (i%labelStep===0 || i===n-1){
      svg += '<text x="'+xOf(i).toFixed(1)+'" y="'+(H-2)+'" font-size="7" text-anchor="middle" fill="#5b6478">'+escapeHtml(monthKeyLabel(mk))+'</text>';
    }
  });
  svg += '</svg>';
  return svg;
}

function renderPrintPage(){
  var pf = currentPrintFilters();
  var rows = ALL_ROWS.filter(function(r){
    if (pf.division !== "__ALL__" && r.division !== pf.division) return false;
    if (pf.mid !== "__ALL__" && r.midCategory !== pf.mid) return false;
    return r.monthKey>=pf.from && r.monthKey<=pf.to;
  });
  var divisions = Array.from(new Set(rows.map(function(r){ return r.division; }))).sort();
  var periodLabel = monthKeyLabel(pf.from)+" ~ "+monthKeyLabel(pf.to);
  var mono = PP.mono;
  var pal = mono
    ? { TKM:"#333333", NEW:"#767676" }
    : { TKM: DIVISION_HUES.TKM.dark, NEW: DIVISION_HUES.NEW.dark };
  function hueOf(d){ return pal[d] || (mono ? "#454545" : COLOR.accent); }

  var kpiHtml = divisions.map(function(d){
    var dRows = rows.filter(function(r){ return r.division===d; });
    var op = opRateOf(dRows);
    return '<div class="pp-kpi"><div class="pp-kpi-label">'+escapeHtml(d)+' 매출총액</div>'+
      '<div class="pp-kpi-value">'+formatKRW(sum(dRows,"totalRevenue"))+'원</div></div>'+
      '<div class="pp-kpi"><div class="pp-kpi-label">'+escapeHtml(d)+' 영업이익</div>'+
      '<div class="pp-kpi-value">'+formatKRW(op.value)+'원 <span style="font-size:9px;">('+op.rate.toFixed(0)+'%)</span></div></div>';
  }).join("");
  if (divisions.length>1){
    var opAll = opRateOf(rows);
    kpiHtml += '<div class="pp-kpi"><div class="pp-kpi-label">합산 매출총액</div>'+
      '<div class="pp-kpi-value">'+formatKRW(sum(rows,"totalRevenue"))+'원</div></div>'+
      '<div class="pp-kpi"><div class="pp-kpi-label">합산 영업이익</div>'+
      '<div class="pp-kpi-value">'+formatKRW(opAll.value)+'원 <span style="font-size:9px;">('+opAll.rate.toFixed(0)+'%)</span></div></div>';
  }

  var compHtml = divisions.map(function(d, di){
    var dRows = rows.filter(function(r){ return r.division===d; });
    var items = groupAgg(dRows, "midCategory").slice(0,5);
    var dTotal = sum(dRows, "totalRevenue");
    var barsHtml = items.map(function(it){
      var pct = dTotal>0 ? (it.value/dTotal*100) : 0;
      var fillStyle = mono ? "" : ("background:"+hueOf(d)+";");
      var fillClass = mono ? (di%2===0 ? "" : "b") : "";
      return '<div class="pp-bar-row"><div class="pp-bar-label">'+escapeHtml(it.label)+'</div>'+
        '<div class="pp-bar-track"><div class="pp-bar-fill '+fillClass+'" style="width:'+pct.toFixed(1)+'%;'+fillStyle+'"></div></div>'+
        '<div class="pp-bar-value">'+pct.toFixed(0)+'% · '+formatKRW(it.value)+'</div></div>';
    }).join("");
    return '<div><div class="pp-section-title" style="'+(mono?"":"color:"+hueOf(d)+";")+'">'+escapeHtml(d)+' 중분류 비중</div>'+
      (barsHtml || '<p class="empty-state" style="font-size:9px;">데이터 없음</p>')+'</div>';
  }).join("");

  var forecastHtml = "", formulaHtml = "", chartFutureKeys = null, chartForecastAdj = null, chartBandLow = null, chartBandHigh = null;
  var fcMonthKeys = Array.from(new Set(rows.map(function(r){ return r.monthKey; }))).sort();
  var monthlyActual = monthlyAgg(rows, fcMonthKeys).map(function(mo){ return mo.value; });
  if ((PP.includeForecast || PP.includeFormula) && fcMonthKeys.length>=3){
    var data = forecastSeries(rows, fcMonthKeys);
    var effH = effectiveHorizon(fcMonthKeys.length, FC.horizon);
    var seasonalIdx2 = computeSeasonalIndex(fcMonthKeys, data);
    var deseason2 = seasonalIdx2 ? data.map(function(v,i){ return v/seasonalIdx2[fcMonthKeys[i].slice(5,7)]; }) : data;
    var fitted = fitHoltParams(deseason2, FORECAST_PARAMS.phi);
    var result = holtForecast(deseason2, fitted.alpha, fitted.beta, FORECAST_PARAMS.phi, effH);
    if (result){
      var futureKeys = [];
      var lastKey = fcMonthKeys[fcMonthKeys.length-1];
      var y = parseInt(lastKey.slice(0,4),10), m = parseInt(lastKey.slice(5,7),10);
      for (var i=0;i<effH;i++){ m++; if (m>12){ m=1; y++; } futureKeys.push(y+"-"+String(m).padStart(2,"0")); }
      if (seasonalIdx2){
        result.forecast = result.forecast.map(function(v,i){ return v*seasonalIdx2[futureKeys[i].slice(5,7)]; });
        result.ciLow = result.ciLow.map(function(v,i){ return v*seasonalIdx2[futureKeys[i].slice(5,7)]; });
        result.ciHigh = result.ciHigh.map(function(v,i){ return v*seasonalIdx2[futureKeys[i].slice(5,7)]; });
      }
      var exportRatio = exportRatioOf(rows);
      var fxAdj = 1 + exportRatio*(FC.fxChange/100);
      var forecastAdj = result.forecast.map(function(v){ return Math.max(0, v*fxAdj); });
      var lastForecast = forecastAdj[forecastAdj.length-1];
      var horizonSum = forecastAdj.reduce(function(a,b){ return a+b; },0);
      if (PP.includeForecast){
        chartFutureKeys = futureKeys;
        chartForecastAdj = forecastAdj;
        chartBandLow = result.ciLow.map(function(v){ return Math.max(0, v*fxAdj); });
        chartBandHigh = result.ciHigh.map(function(v){ return v*fxAdj; });
        forecastHtml = '<div class="pp-section"><div class="pp-section-title">예측 ('+effH+'개월)</div>'+
          '<div class="pp-kpi-grid">'+
          '<div class="pp-kpi"><div class="pp-kpi-label">'+monthKeyLabel(futureKeys[futureKeys.length-1])+' 예측</div>'+
          '<div class="pp-kpi-value">'+formatKRW(lastForecast)+'원</div></div>'+
          '<div class="pp-kpi"><div class="pp-kpi-label">'+effH+'개월 합계</div><div class="pp-kpi-value">'+formatKRW(horizonSum)+'원</div></div>'+
          '<div class="pp-kpi"><div class="pp-kpi-label">수출 비중</div><div class="pp-kpi-value">'+(exportRatio*100).toFixed(1)+'%</div></div>'+
          '</div></div>';
      }
      if (PP.includeFormula){
        var phiSumH = 0;
        for (var pk=1; pk<=effH; pk++) phiSumH += Math.pow(FORECAST_PARAMS.phi, pk);
        var fxPct = exportRatio*100*(FC.fxChange/100);
        var rowsF = [
          ["방법", "Holt 지수평활(감쇠추세) · FPP3(Hyndman)"],
          ["계절/패턴 지수", seasonalIdx2 ? "반영(12개월 이상)" : "미반영(12개월 미만)"],
          ["수준 L / 추세 T", formatKRW(result.level)+"원 / "+formatKRW(result.trend)+"원/월"],
          ["평활계수 α, β", "α="+fitted.alpha.toFixed(2)+", β="+fitted.beta.toFixed(2)+" (자동 적합)"],
          ["감쇠계수 φ", FORECAST_PARAMS.phi.toFixed(2)+" (Σφᵏ="+phiSumH.toFixed(2)+")"],
          ["환율 보정", "수출비중 "+(exportRatio*100).toFixed(1)+"% × "+(FC.fxChange>=0?"+":"")+FC.fxChange+"% = "+(fxPct>=0?"+":"")+fxPct.toFixed(2)+"%p"],
          ["모델 적합오차(RMSE)", formatKRW(result.rmse)+"원"]
        ];
        formulaHtml = '<div class="pp-section pp-formula"><div class="pp-section-title">산출 근거</div><table>'+
          rowsF.map(function(r){ return '<tr><td>'+escapeHtml(r[0])+'</td><td>'+escapeHtml(r[1])+'</td></tr>'; }).join("")+
          '</table></div>';
      }
    }
  }

  var trendColor = FC_DIVISION_LABEL==="TKM" ? DIVISION_HUES.TKM.dark : FC_DIVISION_LABEL==="NEW" ? DIVISION_HUES.NEW.dark : COLOR.accent;
  var trendSvg = buildPrintTrendSVG(fcMonthKeys, monthlyActual, chartFutureKeys, chartForecastAdj, chartBandLow, chartBandHigh, trendColor, mono);
  var chartHtml = '<div class="pp-section"><div class="pp-section-title">월별 매출총액 추이'+(chartForecastAdj?" · 예측":"")+'</div>'+trendSvg+'</div>';

  var page = document.getElementById("printPage");
  page.className = "print-page"+(PP.orient==="landscape" ? " landscape" : "")+(mono ? " mono" : "");
  page.innerHTML =
    '<div class="pp-header"><h1>TKM · NEW 손익 현황 요약</h1>'+
    '<div class="pp-meta">조회기간 '+escapeHtml(periodLabel)+' · 사업부문 '+escapeHtml(pf.division==="__ALL__"?"전체":pf.division)+
    ' · 중분류 '+escapeHtml(pf.mid==="__ALL__"?"전체":pf.mid)+'<br>생성일 '+new Date().toLocaleDateString("ko-KR")+'</div></div>'+
    '<div class="pp-section"><div class="pp-section-title">누적 실적 지표</div><div class="pp-kpi-grid">'+kpiHtml+'</div></div>'+
    chartHtml+
    '<div class="pp-section"><div class="pp-cols">'+compHtml+'</div></div>'+
    forecastHtml+formulaHtml+
    '<div class="pp-footer">다차원 손익현황(S) 기준 · 예측은 참고용, 검토 필요 · 본 문서는 자동 생성된 요약본입니다.</div>';

  fitPrintPageToStage();
}

/* 확대율 — null이면 창 크기에 맞춰 자동으로 맞추고(맞춤), 숫자(0.4~2.0)면
   사용자가 슬라이더로 직접 고른 배율을 그대로 쓴다. */
var PP_ZOOM = null;

function setPrintPageScale(scale){
  var wrap = document.getElementById("printPageWrap");
  var page = document.getElementById("printPage");
  page.style.transform = "none";
  var rect = page.getBoundingClientRect();
  page.style.transform = "scale("+scale+")";
  wrap.style.width = (rect.width*scale)+"px";
  wrap.style.height = (rect.height*scale)+"px";
  var pct = Math.round(scale*100);
  document.getElementById("printZoom").value = pct;
  document.getElementById("printZoomVal").textContent = pct+"%";
}

function fitPrintPageToStage(){
  if (PP_ZOOM != null){ setPrintPageScale(PP_ZOOM); return; }
  var stage = document.getElementById("printModalStage");
  var page = document.getElementById("printPage");
  page.style.transform = "none";
  var rect = page.getBoundingClientRect();
  var availW = stage.clientWidth - 56, availH = stage.clientHeight - 56;
  var scale = Math.min(availW/rect.width, availH/rect.height, 1);
  setPrintPageScale(scale);
}

function openPrintPreview(){
  if (!ALL_ROWS.length) return;
  PP_ZOOM = null;
  populatePrintFilters();
  document.getElementById("printModal").hidden = false;
  renderPrintPage();
}
function closePrintPreview(){
  document.getElementById("printModal").hidden = true;
}
function doActualPrint(){
  document.getElementById("pageOrientStyle").textContent = "@page{ size: A4 "+PP.orient+"; margin: 0; }";
  window.print();
}
window.openPrintPreview = openPrintPreview;

window.addEventListener("DOMContentLoaded", function(){
  document.getElementById("divisionFilter").addEventListener("change", renderAll);
  document.getElementById("midFilter").addEventListener("change", renderAll);
  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
  initForecastControls();
  var lastResizeWidth = window.innerWidth;
  window.addEventListener("resize", function(){
    /* 모바일은 스크롤 중 주소창이 접혔다 펼쳐지며 세로 높이만 바뀌어도
       resize가 발생한다 — 가로 폭이 실제로 바뀐 경우에만 재렌더링한다. */
    if (window.innerWidth === lastResizeWidth) return;
    lastResizeWidth = window.innerWidth;
    if (ALL_ROWS.length) renderAll(false);
    if (!document.getElementById("printModal").hidden) fitPrintPageToStage();
  });

  document.getElementById("printModalClose").addEventListener("click", closePrintPreview);
  document.getElementById("printModalPrint").addEventListener("click", doActualPrint);
  document.getElementById("printZoom").addEventListener("input", function(e){
    PP_ZOOM = Number(e.target.value)/100;
    setPrintPageScale(PP_ZOOM);
  });
  document.getElementById("printZoomFit").addEventListener("click", function(){
    PP_ZOOM = null;
    fitPrintPageToStage();
  });
  document.getElementById("printDivision").addEventListener("change", function(){ refreshPrintMidOptions(); renderPrintPage(); });
  document.getElementById("printMid").addEventListener("change", renderPrintPage);
  document.getElementById("printFrom").addEventListener("change", renderPrintPage);
  document.getElementById("printTo").addEventListener("change", renderPrintPage);
  document.querySelectorAll("#printOrientSeg .seg-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll("#printOrientSeg .seg-btn").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      PP.orient = btn.getAttribute("data-val");
      renderPrintPage();
    });
  });
  document.querySelectorAll("#printColorSeg .seg-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll("#printColorSeg .seg-btn").forEach(function(b){ b.classList.remove("active"); });
      btn.classList.add("active");
      PP.mono = btn.getAttribute("data-val")==="mono";
      renderPrintPage();
    });
  });
  document.getElementById("printIncludeForecast").addEventListener("change", function(e){ PP.includeForecast = e.target.checked; renderPrintPage(); });
  document.getElementById("printIncludeFormula").addEventListener("change", function(e){ PP.includeFormula = e.target.checked; renderPrintPage(); });

  if (window.EMBEDDED_ROWS && window.EMBEDDED_ROWS.length) seedReportData(window.EMBEDDED_ROWS);
});
})();
