const DATA_URL="./data/mapa-db.kml";let map,points=[],current=null,target=null,visited=new Set(),moves=0,choiceLocked=false,candidateMarkers=[],currentMarker,startMarker,targetMarker,routeLine=null,routePoints=[];const missionEl=document.getElementById("mission"),tasksEl=document.getElementById("tasks"),progressEl=document.getElementById("progress"),movesEl=document.getElementById("moves"),choiceEl=document.getElementById("choice"),revealEl=document.getElementById("reveal"),statusEl=document.getElementById("status");let activeTasks=[],completed=new Set(),missionHits=new Map(),gameDistance=0,settings={count:4,age:true,periods:true,architects:true,distanceRange:"0-3",startCity:"random"},pathGraph=null;
function parseKml(txt){const xml=new DOMParser().parseFromString(txt,"text/xml");return [...xml.querySelectorAll("Placemark")].map((p,i)=>{const name=p.querySelector("name")?.textContent?.trim()||"Obiekt",desc=p.querySelector("description")?.textContent||"",c=p.querySelector("coordinates")?.textContent?.trim()?.split(",")||[],lon=parseFloat(c[0]),lat=parseFloat(c[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const clean=desc.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim(),date=(clean.match(/Data wybudowania:\s*([0-9]{3,4}(?:-[0-9]{2,4})?)/i)||[])[1]||"",architect=(clean.match(/Architekt:\s*([^<]+)/i)||[])[1]?.trim()||"";const notes=(clean.match(/Uwagi:\s*([^<]+)/i)||[])[1]?.trim()||"";return{id:i,name,lat,lon,raw:clean,date,architect,notes}}).filter(Boolean).filter(p=>p.lat>53.9&&p.lat<54.7&&p.lon>18.2&&p.lon<19.1)}
function year(p){const m=p.date.match(/(1[0-9]{3}|20[0-9]{2})/);return m?+m[1]:null}function distance(a,b){const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}function bearing(a,b){const y=Math.sin((b.lon-a.lon)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lon-a.lon)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360}function dirAngle(d){return{up:0,right:90,down:180,left:270}[d]}function angleDiff(a,b){return Math.abs((a-b+180)%360-180)}function icon(cls){return L.divIcon({className:cls,iconSize:[28,28],iconAnchor:[14,14]})}
function setCurrent(p,showHere=true){if(currentMarker)map.removeLayer(currentMarker);currentMarker=L.marker([p.lat,p.lon],{icon:icon("current-marker"),zIndexOffset:1000}).addTo(map);if(showHere)currentMarker.bindTooltip("TU JESTEŚ",{permanent:true,direction:"top",className:"current-label"});map.panTo([p.lat,p.lon],{animate:true,duration:.5})}
function updateRoute(){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#f5a623",weight:4,opacity:.9,dashArray:"9 8",lineCap:"round"}).addTo(map)}
function placeLabel(p){let n=String(p.name||"Obiekt").replace(/^\\d{2}-\\d{3}\\s+[^,]+,\\s*/,"").replace(/^[^,]+,\\s*/,"");if(!n)n=p.name||"Obiekt";return n.length>42?n.slice(0,39)+"…":n}
function chooseBestPair(candidates){
  if(candidates.length<2)return candidates;
  const pairs=[];
  const maxD=Math.max(...candidates.map(p=>p.d),1);
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const x=candidates[i],y=candidates[j],pairDistance=distance(x,y);
    const distanceScore=(x.d+y.d)/(2*maxD);
    const pairScore=Math.abs(pairDistance-300)/300;
    let dateBonus=0;
    if(candidates.length>4){
      const xa=year(x),yb=year(y);
      if(xa!==null&&yb!==null){
        const yearDiff=Math.abs(xa-yb);
        dateBonus=yearDiff>=50?0.45:yearDiff>=20?0.3:yearDiff>=10?0.15:0;
      }
    }
    pairs.push({x,y,score:distanceScore*0.6+pairScore*0.4-dateBonus});
  }
  pairs.sort((m,n)=>m.score-n.score);
  return [pairs[0].x,pairs[0].y];
}
function directionCandidates(from,seen,dir){
  const a=dirAngle(dir),START_RADIUS=1000,MAX_RADIUS=8000,tolerance=45;
  let c=[];
  for(let radius=START_RADIUS;radius<=MAX_RADIUS;radius+=1000){
    c=points.filter(p=>!seen.has(p.id)&&p.id!==from.id&&distance(from,p)<=radius)
      .map(p=>({...p,d:distance(from,p),bd:bearing(from,p),ad:angleDiff(bearing(from,p),a)}))
      .filter(p=>p.ad<=tolerance);
    if(c.length>=2||radius===MAX_RADIUS)break;
  }
  return c;
}
function moveCandidates(from,seen){
  const result=[];
  for(const dir of ["up","right","down","left"]){const pair=chooseBestPair(directionCandidates(from,seen,dir));if(pair.length===2)result.push(...pair)}
  return [...new Map(result.map(p=>[p.id,p])).values()];
}
function auditPath(start,maxDepth=10){
  const queue=[{p:start,seen:new Set([start.id]),path:[start]}],paths=[],stateKeys=new Set();
  let examined=0;
  while(queue.length&&examined<3500){
    const state=queue.shift(),key=state.p.id+"|"+[...state.seen].sort((a,b)=>a-b).join(",");
    if(stateKeys.has(key))continue;
    stateKeys.add(key);examined++;
    if(state.path.length>=4)paths.push(state.path);
    if(state.path.length>=maxDepth)continue;
    for(const next of moveCandidates(state.p,state.seen)){
      if(state.seen.has(next.id))continue;
      const seen=new Set(state.seen);seen.add(next.id);
      queue.push({p:next,seen,path:[...state.path,next]});
    }
  }
  return {paths,examined};
}
function cityMatch(p,city){
  if(city==="random")return true;
  const n=String(p.name||"").toLowerCase();
  return city==="gdansk"?/gdańsk|gdańsku|gdańską|gdańska/.test(n):city==="sopot"?/sopot/.test(n):city==="gdynia"?/gdynia|gdyń/.test(n):true;
}
function distanceRangeMatch(m){
  const d=distance(m.start,m.target)/1000,r=settings.distanceRange||"0-3";
  return r==="0-3"?d<=3:r==="3-5"?d>3&&d<=5:r==="5-10"?d>5&&d<=10:r==="10-20"?d>10&&d<=20:d>20;
}
function chooseStartAndTarget(){
  const pool=points.filter(p=>cityMatch(p,settings.startCity||"random"));
  if(!pool.length)return null;
  const matching=[];
  for(let attempt=0;attempt<100;attempt++){
    const start=pool[Math.floor(Math.random()*pool.length)];
    const audit=auditPath(start,10);
    for(const path of audit.paths.filter(path=>path.length>=4&&path.length<=10)){
      const target=path[path.length-1];
      if(distanceRangeMatch({start,target}))matching.push({start,target,auditMoves:path.length-1,auditedStates:audit.examined});
    }
    if(matching.length>=10)break;
  }
  if(matching.length)return matching[Math.floor(Math.random()*matching.length)];
  for(let attempt=0;attempt<500;attempt++){
    const start=pool[Math.floor(Math.random()*pool.length)];
    const candidates=points.filter(p=>p.id!==start.id&&distanceRangeMatch({start,target:p}));
    if(candidates.length){
      const target=candidates[Math.floor(Math.random()*candidates.length)];
      return {start,target,auditMoves:0,auditedStates:0};
    }
  }
  return null;
}
function showCandidates(dir){
  if(choiceLocked)return;
  statusEl.textContent="";
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  let c=directionCandidates(current,visited,dir);
  const GOAL_UNLOCK=800;
  const goalDistance=distance(current,target),goalBearing=bearing(current,target),goalDiff=angleDiff(goalBearing,dirAngle(dir));
  if(goalDistance<=GOAL_UNLOCK&&goalDiff<=45&&!visited.has(target.id)&&!c.some(p=>p.id===target.id))
    c.push({...target,d:goalDistance,bd:goalBearing,ad:goalDiff,isTarget:true});

  const missionTargets=c.filter(p=>activeTasks.some(t=>!completed.has(t.type)&&t.test(p)));
  let chosen=chooseBestPair(c);
  if(missionTargets.length){
    const forced=missionTargets.sort((a,b)=>a.d-b.d)[0];
    if(!chosen.some(p=>p.id===forced.id)){
      const companion=c.filter(p=>p.id!==forced.id).sort((a,b)=>{
        const da=Math.abs(distance(forced,a)-300),db=Math.abs(distance(forced,b)-300);
        return (da+ a.d*0.15)-(db+b.d*0.15);
      })[0];
      if(companion)chosen=[forced,companion];
    }
  }
  if(chosen.length<2){
    const msg="W tym kierunku nie ma dwóch dostępnych punktów — wybierz inną strzałkę.";
    statusEl.textContent=msg;
    setTimeout(()=>{if(!choiceLocked&&statusEl.textContent===msg)statusEl.textContent="Wybierz inny kierunek."},3000);
    return;
  }
  choiceLocked=true;
  chosen.forEach((p,i)=>{
    const m=L.marker([p.lat,p.lon],{icon:icon(i?"candidate-b":"candidate-a")}).addTo(map);
    candidateMarkers.push(m);
    m.on("click",()=>choose(p));
    const btn=document.getElementById(i?"choiceB":"choiceA");
    btn.className=i?"choice-b":"choice-a";
    btn.innerHTML="<span class=\"letter\">"+(i?"B":"A")+"</span> "+(p.isTarget?"META":"okolice "+esc(placeLabel(p)));
  });
  choiceEl.classList.remove("hidden");
  document.getElementById("choiceA").onclick=()=>choose(chosen[0]);
  document.getElementById("choiceB").onclick=()=>choose(chosen[1]);
}
function loadSettings(){try{const x=JSON.parse(localStorage.getItem("trojmiastoGameSettings")||"null");if(x)settings={...settings,...x}}catch(e){}}
function saveSettings(){const oldRange=settings.distanceRange,oldCity=settings.startCity;settings.count=+document.getElementById("missionCount").value;settings.age=document.getElementById("catAge").checked;settings.periods=document.getElementById("catPeriods").checked;settings.architects=document.getElementById("catArchitects").checked;settings.distanceRange=document.getElementById("distanceRange").value;settings.startCity=document.getElementById("startCity").value;localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));return oldRange!==settings.distanceRange||oldCity!==settings.startCity}
function openSettings(){document.getElementById("missionCount").value=settings.count;document.getElementById("catAge").checked=settings.age;document.getElementById("catPeriods").checked=settings.periods;document.getElementById("catArchitects").checked=settings.architects;document.getElementById("distanceRange").value=settings.distanceRange||"0-3";document.getElementById("startCity").value=settings.startCity||"random";document.getElementById("settings").classList.remove("hidden")}
function missionPoints(){
  if(!current||!target)return points;
  return points.filter(p=>distance(p,current)<=5000&&distance(p,target)<=5000);
}
function personNames(p){
  const text=String(p.architect||"")+" "+String(p.notes||"");
  return [...new Set(text.match(/\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\b/g)||[])];
}
function personMatch(p,name){
  const text=String(p.architect||"")+" "+String(p.notes||"");
  return text.toLowerCase().includes(name.toLowerCase());
}
function taskForGame(){
  const all=missionPoints().filter(p=>p.date),pool=[];
  if(settings.age)pool.push(
    {type:"19",category:"age",text:"Odwiedź obiekt z XIX wieku",test:p=>{const y=year(p);return y>=1800&&y<=1899}},
    {type:"20",category:"age",text:"Odwiedź obiekt z XX wieku",test:p=>{const y=year(p);return y>=1900&&y<=1999}},
    {type:"21",category:"age",text:"Odwiedź obiekt z XXI wieku",test:p=>{const y=year(p);return y>=2000&&y<=2099}}
  );
  if(settings.periods)pool.push(
    {type:"1900-14",category:"periods",text:"Odwiedź obiekt z lat 1900–1914",test:p=>{const y=year(p);return y>=1900&&y<=1914}},
    {type:"1918-39",category:"periods",text:"Odwiedź obiekt z lat 1918–1939",test:p=>{const y=year(p);return y>=1918&&y<=1939}},
    {type:"1945-89",category:"periods",text:"Odwiedź obiekt z lat 1945–1989",test:p=>{const y=year(p);return y>=1945&&y<=1989}},
    {type:"1990-99",category:"periods",text:"Odwiedź obiekt z lat 1990–1999",test:p=>{const y=year(p);return y>=1990&&y<=1999}},
    {type:"2000+",category:"periods",text:"Odwiedź obiekt wybudowany po 2000 roku",test:p=>{const y=year(p);return y>=2001&&y<=2099}}
  );
  if(settings.architects){
    const people=[...new Set(all.flatMap(personNames))];
    people.forEach(name=>pool.push({type:"person:"+name,category:"people",text:"Odwiedź miejsce związane z osobą: "+name,test:p=>personMatch(p,name)}));
  }
  const usable=pool.filter(t=>all.some(t.test));
  for(let i=usable.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[usable[i],usable[j]]=[usable[j],usable[i]]}
  return usable.slice(0,Math.min(settings.count,usable.length));
}
function reveal(p){
  const hits=activeTasks.filter(t=>!completed.has(t.type)&&t.test(p)).slice(0,1);
  let html="<h2>"+esc(p.name)+"</h2>";
  if(p.date)html+="<p><b>Data:</b> "+esc(p.date)+"</p>";
  if(p.architect)html+="<p><b>Architekt:</b> "+esc(p.architect)+"</p>";
  if(hits.length){
    html+="<div class='match'>✓ "+hits[0].text+"</div>";
    missionHits.set(p.id,[...(missionHits.get(p.id)||[]),hits[0].type]);
  }
  revealEl.innerHTML=html+"<button id='continue' style='margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#1976d2;color:#fff;font-weight:700'>DALEJ</button>";
  revealEl.classList.remove("hidden");
  document.getElementById("continue").onclick=()=>{
    revealEl.classList.add("hidden");
    updateProgress();
    if(current.id===target.id){if(completed.size===activeTasks.length)finish();else{statusEl.textContent="Jeszcze za szybko na metę, zalicz wszystkie misje";}}
  };
  hits.forEach(h=>completed.add(h.type))
}
function choose(p){choiceLocked=false;choiceEl.classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];current=p;visited.add(p.id);moves++;movesEl.textContent="Ruchy: "+moves;routePoints.push(p);updateRoute();setCurrent(p);reveal(p)}
function finish(){
  const rows=[...visited].map(id=>points.find(p=>p.id===id)).filter(Boolean);
  if(routePoints.length>1)map.fitBounds(routePoints.map(p=>[p.lat,p.lon]),{padding:[70,70],maxZoom:15});
  let html="<div class='summary-overlay'><div class='summary-card'><h2>Podsumowanie wyprawy</h2><div class='summary-intro'>"+moves+" ruchów · odwiedzonych punktów: "+rows.length+"<br>Trasa jest pokazana na mapie.</div><div class='summary-list'>";
  rows.forEach((p,i)=>{
    const hit=missionHits.get(p.id)||[];
    html+="<div class='summary-item'><b>"+(i+1)+". "+esc(p.name)+"</b>";
    html+=p.date?"<span>Data budowy: "+esc(p.date)+"</span>":"<span>Data budowy: brak danych</span>";
    if(hit.length){const labels=hit.map(type=>activeTasks.find(t=>t.type===type)?.text).filter(Boolean);html+="<div class='summary-mission'>✓ MISJA · "+labels.map(esc).join(" • ")+"</div>"}
    html+="</div>";
  });
  html+="</div><button id='restart' class='summary-restart'>NOWA GRA</button></div></div>";
  revealEl.innerHTML=html;revealEl.classList.remove("hidden");document.getElementById("restart").onclick=()=>location.reload();
}
function missionHeat(t){
  if(!current||completed.has(t.type))return "";
  const targets=points.filter(p=>p.id!==current.id&&t.test(p));
  if(!targets.length)return " ❄️";
  const nearest=Math.min(...targets.map(p=>distance(current,p)));
  return nearest<1000?" 🔥":" ❄️";
}
function updateProgress(){
  const done=activeTasks.filter(t=>completed.has(t.type)).length;
  progressEl.textContent="Zadania: "+done+"/"+activeTasks.length+" • Odwiedzone: "+visited.size;
  tasksEl.innerHTML=activeTasks.map(t=>{
    const doneTask=completed.has(t.type);
    return "<div class=\""+(doneTask?"task-done":"")+"\">"+(doneTask?"✓":"○")+" "+esc(t.text)+(doneTask?"":missionHeat(t))+"</div>";
  }).join("");
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function start(){document.getElementById("start").classList.add("hidden");moves=0;visited=new Set();completed=new Set();missionHits=new Map();const audited=chooseStartAndTarget();
  if(!audited){statusEl.textContent="Nie udało się znaleźć gry dla wybranych ustawień. Wybierz inny zakres odległości lub miejsce startu.";document.getElementById("start").classList.remove("hidden");return}
  current=audited.start;target=audited.target;gameDistance=distance(current,target);activeTasks=taskForGame();routePoints=[current];updateRoute();missionEl.innerHTML="<b>META:</b> "+esc(target.name);updateProgress();if(startMarker)map.removeLayer(startMarker);startMarker=L.marker([current.lat,current.lon],{icon:icon("start-marker"),zIndexOffset:1100}).addTo(map);setCurrent(current,true);if(targetMarker)map.removeLayer(targetMarker);targetMarker=L.marker([target.lat,target.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("META: "+esc(target.name),{permanent:true,direction:"top",className:"target-label"});statusEl.textContent="Wybierz kierunek strzałką."}
async function init(){map=L.map("map",{zoomControl:false}).setView([54.38,18.62],12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);try{const r=await fetch(DATA_URL);points=parseKml(await r.text());if(points.length<20)throw Error("Za mało punktów");statusEl.textContent="Załadowano "+points.length+" punktów historycznych."}catch(e){statusEl.textContent="Błąd danych: "+e.message}}loadSettings();document.getElementById("startBtn").onclick=start;document.getElementById("settingsBtn").onclick=openSettings;document.getElementById("saveSettings").onclick=()=>{const distanceChanged=saveSettings();document.getElementById("settings").classList.add("hidden");if(document.getElementById("start").classList.contains("hidden")){if(distanceChanged){start()}else{activeTasks=taskForGame();updateProgress()}}};document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>showCandidates(b.dataset.dir));document.addEventListener("keydown",e=>{const d={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[e.key];if(d){e.preventDefault();showCandidates(d)}});init();