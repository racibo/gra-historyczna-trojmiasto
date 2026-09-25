const DATA_URL="./data/mapa-db.kml";let map,points=[],current=null,target=null,visited=new Set(),moves=0,choiceLocked=false,candidateMarkers=[],currentMarker,startMarker,targetMarker,routeLine=null,routePoints=[];const missionEl=document.getElementById("mission"),tasksEl=document.getElementById("tasks"),progressEl=document.getElementById("progress"),movesEl=document.getElementById("moves"),choiceEl=document.getElementById("choice"),revealEl=document.getElementById("reveal"),statusEl=document.getElementById("status");let activeTasks=[],completed=new Set(),missionHits=new Map(),gameDistance=0;
function parseKml(txt){const xml=new DOMParser().parseFromString(txt,"text/xml");return [...xml.querySelectorAll("Placemark")].map((p,i)=>{const name=p.querySelector("name")?.textContent?.trim()||"Obiekt",desc=p.querySelector("description")?.textContent||"",c=p.querySelector("coordinates")?.textContent?.trim()?.split(",")||[],lon=parseFloat(c[0]),lat=parseFloat(c[1]);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const clean=desc.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim(),date=(clean.match(/Data wybudowania:\s*([0-9]{3,4}(?:-[0-9]{2,4})?)/i)||[])[1]||"",architect=(clean.match(/Architekt:\s*([^<]+)/i)||[])[1]?.trim()||"";return{id:i,name,lat,lon,raw:clean,date,architect}}).filter(Boolean).filter(p=>p.lat>53.9&&p.lat<54.7&&p.lon>18.2&&p.lon<19.1)}
function year(p){const m=p.date.match(/(1[0-9]{3}|20[0-9]{2})/);return m?+m[1]:null}function distance(a,b){const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}function bearing(a,b){const y=Math.sin((b.lon-a.lon)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lon-a.lon)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360}function dirAngle(d){return{up:0,right:90,down:180,left:270}[d]}function angleDiff(a,b){return Math.abs((a-b+180)%360-180)}function icon(cls){return L.divIcon({className:cls,iconSize:[28,28],iconAnchor:[14,14]})}
function setCurrent(p,showHere=true){if(currentMarker)map.removeLayer(currentMarker);currentMarker=L.marker([p.lat,p.lon],{icon:icon("current-marker"),zIndexOffset:1000}).addTo(map);if(showHere)currentMarker.bindTooltip("TU JESTEŚ",{permanent:true,direction:"top",className:"current-label"});map.panTo([p.lat,p.lon],{animate:true,duration:.5})}
function updateRoute(){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#f5a623",weight:4,opacity:.9,dashArray:"9 8",lineCap:"round"}).addTo(map)}
function placeLabel(p){let n=String(p.name||"Obiekt").replace(/^\\d{2}-\\d{3}\\s+[^,]+,\\s*/,"").replace(/^[^,]+,\\s*/,"");if(!n)n=p.name||"Obiekt";return n.length>42?n.slice(0,39)+"…":n}
function showCandidates(dir){if(choiceLocked)return;candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];const a=dirAngle(dir),MIN=120,START_RADIUS=1000,MAX=5000;let tolerance=45;let c=[];for(let radius=START_RADIUS;radius<=MAX;radius+=1000){c=points.filter(p=>!visited.has(p.id)&&p.id!==current.id&&distance(current,p)>=MIN&&distance(current,p)<=radius).map(p=>({...p,d:distance(current,p),bd:bearing(current,p),ad:angleDiff(bearing(current,p),a)})).filter(p=>p.ad<=tolerance);if(c.length>=2||radius===MAX)break}c.sort((x,y)=>(x.d-y.d)||(x.ad-y.ad));const GOAL_UNLOCK=800;const goalDistance=distance(current,target),goalBearing=bearing(current,target),goalDiff=angleDiff(goalBearing,a);if(goalDistance>=MIN&&goalDistance<=GOAL_UNLOCK&&goalDiff<=tolerance){c=c.filter(p=>p.id!==target.id);c.unshift({...target,d:goalDistance,bd:goalBearing,ad:goalDiff,isTarget:true})}const chosen=[];for(const p of c){if(chosen.length>=2)break;if(!chosen.some(q=>distance(p,q)<120))chosen.push(p)}if(chosen.length<2){statusEl.textContent="W tym kierunku nie ma dwóch dostępnych punktów — wybierz inną strzałkę.";return}choiceLocked=true;chosen.forEach((p,i)=>{const m=L.marker([p.lat,p.lon],{icon:icon(i?"candidate-b":"candidate-a")}).addTo(map);candidateMarkers.push(m);m.on("click",()=>choose(p));const btn=document.getElementById(i?"choiceB":"choiceA");btn.className=i?"choice-b":"choice-a";btn.innerHTML="<span class=\"letter\">"+(i?"B":"A")+"</span> "+(p.isTarget?"META":"okolice "+esc(placeLabel(p)));});choiceEl.classList.remove("hidden");document.getElementById("choiceA").onclick=()=>choose(chosen[0]);document.getElementById("choiceB").onclick=()=>choose(chosen[1])}
function taskForGame(){
  const all=points.filter(p=>p.date),pool=[
    {type:"19",text:"Odwiedź obiekt z XIX wieku",test:p=>{const y=year(p);return y>=1800&&y<=1899}},
    {type:"1900-14",text:"Odwiedź obiekt z lat 1900–1914",test:p=>{const y=year(p);return y>=1900&&y<=1914}},
    {type:"1918-39",text:"Odwiedź obiekt z lat 1918–1939",test:p=>{const y=year(p);return y>=1918&&y<=1939}},
    {type:"1945-89",text:"Odwiedź obiekt z lat 1945–1989",test:p=>{const y=year(p);return y>=1945&&y<=1989}},
    {type:"1990-99",text:"Odwiedź obiekt z lat 1990–1999",test:p=>{const y=year(p);return y>=2000?false:y>=1990}},
    {type:"2000+",text:"Odwiedź obiekt wybudowany po 2000 roku",test:p=>{const y=year(p);return y>=2001&&y<=2099}}
  ].filter(t=>all.some(t.test));
  const architectNames=[...new Set(all.map(p=>{
    const m=String(p.architect||"").match(/\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\b/);
    return m?m[0]:null
  }).filter(Boolean))];
  if(architectNames.length){
    const name=architectNames[Math.floor(Math.random()*architectNames.length)];
    pool.push({type:"arch:"+name,text:"Odwiedź obiekt z architektem: "+name,test:p=>String(p.architect||"").includes(name)});
  }
  const count=gameDistance<2000?2:gameDistance<4000?3:gameDistance<6000?4:gameDistance<9000?5:6;
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  return pool.slice(0,count);
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
    if(current.id===target.id)finish();
  };
  hits.forEach(h=>completed.add(h.type))
}
function choose(p){choiceLocked=false;choiceEl.classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];current=p;visited.add(p.id);moves++;movesEl.textContent="Ruchy: "+moves;routePoints.push(p);updateRoute();setCurrent(p);reveal(p)}
function finish(){
  const rows=[...visited].map(id=>points.find(p=>p.id===id)).filter(Boolean);
  let html="<h2>Podsumowanie wyprawy</h2><p>Dotarłeś do mety po <b>"+moves+" ruchach</b>.</p>";
  html+="<div class='summary-list'>";
  rows.forEach((p,i)=>{
    const hit=missionHits.get(p.id)||[];
    html+="<div class='summary-item'><b>"+(i+1)+". "+esc(p.name)+"</b>";
    html+=p.date?"<span>"+esc(p.date)+"</span>":"<span>Brak daty budowy w bazie</span>";
    if(hit.length){
      const labels=hit.map(type=>activeTasks.find(t=>t.type===type)?.text).filter(Boolean);
      html+="<div class='summary-mission'>✓ "+labels.map(esc).join(" • ")+"</div>";
    }
    html+="</div>";
  });
  html+="</div><button id='restart' style='margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#1976d2;color:#fff;font-weight:700'>NOWA GRA</button>";
  revealEl.innerHTML=html;
  revealEl.classList.remove("hidden");
  document.getElementById("restart").onclick=()=>location.reload();
}
function updateProgress(){const done=activeTasks.filter(t=>completed.has(t.type)).length;progressEl.textContent="Zadania: "+done+"/"+activeTasks.length+" • Odwiedzone: "+visited.size;tasksEl.innerHTML=activeTasks.map(t=>"<div class=\""+(completed.has(t.type)?"task-done":"")+"\">"+(completed.has(t.type)?"✓":"○")+" "+esc(t.text)+"</div>").join("")}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function start(){document.getElementById("start").classList.add("hidden");moves=0;visited=new Set();completed=new Set();missionHits=new Map();current=points[Math.floor(Math.random()*points.length)];target=points[Math.floor(Math.random()*points.length)];while(target.id===current.id)target=points[Math.floor(Math.random()*points.length)];gameDistance=distance(current,target);activeTasks=taskForGame();routePoints=[current];updateRoute();missionEl.innerHTML="<b>META:</b> "+esc(target.name);updateProgress();if(startMarker)map.removeLayer(startMarker);startMarker=L.marker([current.lat,current.lon],{icon:icon("start-marker"),zIndexOffset:1100}).addTo(map).bindTooltip("START", {permanent:true,direction:"top",className:"start-label"});setCurrent(current,false);if(targetMarker)map.removeLayer(targetMarker);targetMarker=L.marker([target.lat,target.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("META: "+esc(target.name),{permanent:true,direction:"top",className:"target-label"});statusEl.textContent="Wybierz kierunek strzałką."}
async function init(){map=L.map("map",{zoomControl:false}).setView([54.38,18.62],12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);try{const r=await fetch(DATA_URL);points=parseKml(await r.text());if(points.length<20)throw Error("Za mało punktów");statusEl.textContent="Załadowano "+points.length+" punktów historycznych."}catch(e){statusEl.textContent="Błąd danych: "+e.message}}document.getElementById("startBtn").onclick=start;document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>showCandidates(b.dataset.dir));document.addEventListener("keydown",e=>{const d={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[e.key];if(d){e.preventDefault();showCandidates(d)}});init();