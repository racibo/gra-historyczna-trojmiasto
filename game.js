const SHEET_ID="1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI",DATA_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;let map,points=[],current=null,gameStart=null,target=null,visited=new Set(),moves=0,choiceLocked=false,candidateMarkers=[],currentMarker,startMarker,targetMarker,routeLine=null,routePoints=[],visitedHistory=[];const missionEl=document.getElementById("mission"),tasksEl=document.getElementById("tasks"),progressEl=document.getElementById("progress"),movesEl=document.getElementById("moves"),choiceEl=document.getElementById("choice"),revealEl=document.getElementById("reveal"),statusEl=document.getElementById("status");let activeTasks=[],completed=new Set(),missionHits=new Map(),gameDistance=0,searchZone=null,settings={count:4,age:true,periods:true,architects:true,distanceRange:"random",startCity:"random"},pathGraph=null;
function getSheetVal(obj,searchStrings){const keys=Object.keys(obj||{});for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const exact=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"")===clean);if(exact&&String(obj[exact]??"").trim()!=="")return String(obj[exact]).trim()}for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const partial=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"").includes(clean));if(partial&&String(obj[partial]??"").trim()!=="")return String(obj[partial]).trim()}return""}
function parseSheetRows(data){return data.map((item,i)=>{const name=getSheetVal(item,["adres","nazwa","obiekt","name"])||"Nieznany",date=getSheetVal(item,["datawybudowania","rokbudowy","data","rok","czas","wiek"])||"",notes=getSheetVal(item,["uwagi","opis","informacje","info","inne"]),architect=getSheetVal(item,["architekt","projektant","autor"]),gps=getSheetVal(item,["pozycjagps","gps","wspolrzedne","współrzędne","lokalizacja"]);let lat,lng;if(gps){const matches=String(gps).replace(/;/g,",").match(/-?\d+[\.,]\d+/g)||[];if(matches.length>=2){lat=parseFloat(matches[0].replace(",","."));lng=parseFloat(matches[1].replace(",","."))}}if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;return{id:i,name,lat,lon:lng,raw:notes,date,architect,notes}}).filter(Boolean).filter(p=>p.lat>53.9&&p.lat<54.7&&p.lon>18.2&&p.lon<19.1)}
function year(p){const m=p.date.match(/(1[0-9]{3}|20[0-9]{2})/);return m?+m[1]:null}function distance(a,b){const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}function bearing(a,b){const y=Math.sin((b.lon-a.lon)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lon-a.lon)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360}function dirAngle(d){return{up:0,right:90,down:180,left:270}[d]}function angleDiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d}function icon(cls){return L.divIcon({className:cls,iconSize:[28,28],iconAnchor:[14,14]})}
function setCurrent(p,showHere=true){if(currentMarker)map.removeLayer(currentMarker);currentMarker=L.marker([p.lat,p.lon],{icon:icon("current-marker"),zIndexOffset:1000}).addTo(map);if(showHere)currentMarker.bindTooltip("TU JESTEŚ",{permanent:true,direction:"top",className:"current-label"});map.panTo([p.lat,p.lon],{animate:true,duration:.5})}
function updateRoute(){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#f5a623",weight:4,opacity:.9,dashArray:"9 8",lineCap:"round"}).addTo(map)}
function visitedLabelHtml(p,index){
  let html="<b>"+(index+1)+". "+esc(p.date||"brak daty")+"</b>";
  if(p.architect)html+="<br><span>"+esc(p.architect)+"</span>";
  if(p.notes)html+="<br><span>"+esc(p.notes.length>180?p.notes.slice(0,177)+"…":p.notes)+"</span>";
  return html
}
function updateVisitedLabels(){
  document.querySelectorAll(".visited-label-marker").forEach(el=>el.remove());
  visitedHistory.forEach((p,i)=>{
    const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:"visited-label-marker",html:"<div>"+visitedLabelHtml(p,i)+"</div>",iconSize:null,iconAnchor:[0,0]}),zIndexOffset:200+i}).addTo(map);
    marker.bindPopup(visitedLabelHtml(p,i),{closeButton:true,autoClose:true});
  });
}
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
  const a=dirAngle(dir),START_RADIUS=1000,MAX_RADIUS=10000,tolerance=45;
  let c=[],searchRadius=MAX_RADIUS;
  for(let radius=START_RADIUS;radius<=MAX_RADIUS;radius+=1000){
    c=points.filter(p=>!seen.has(p.id)&&p.id!==from.id&&distance(from,p)<=radius)
      .map(p=>({...p,d:distance(from,p),bd:bearing(from,p),ad:angleDiff(bearing(from,p),a)}))
      .filter(p=>p.ad<=tolerance);
    if(c.length>=2){searchRadius=radius;break}
  }
  c.searchRadius=searchRadius;
  c.sectorAngle=tolerance;
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
  const d=distance(m.start,m.target)/1000,r=settings.distanceRange||"random";
  if(r==="random")return true;
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
function clearSearchZone(){if(searchZone){map.removeLayer(searchZone);searchZone=null}}
function drawSearchZone(dir,radius,count){
  clearSearchZone();
  const center=[current.lat,current.lon],start=dirAngle(dir)-45,stop=dirAngle(dir)+45,steps=36;
  const latStep=radius/6371000*180/Math.PI;
  const lonScale=1/Math.cos(current.lat*Math.PI/180);
  const pts=[center];
  for(let i=0;i<=steps;i++){
    const a=(start+(stop-start)*i/steps)*Math.PI/180;
    pts.push([
      current.lat+latStep*Math.cos(a),
      current.lon+latStep*lonScale*Math.sin(a)
    ]);
  }
  pts.push(center);
  searchZone=L.polygon(pts,{color:"#1565c0",weight:2,opacity:.9,fillColor:"#42a5f5",fillOpacity:.14,dashArray:"7 6",interactive:true}).addTo(map);
  searchZone.bindTooltip("Strefa wyszukiwania: ±45° • promień "+(radius/1000)+" km<br>Znaleziono: "+count+" punktów",{sticky:true,direction:"top"});
}
function revealTarget(){
  if(!target||targetMarker)return;
  targetMarker=L.marker([target.lat,target.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("META: "+esc(target.name),{permanent:true,direction:"top",className:"target-label"});
  missionEl.innerHTML="<b>META:</b> "+esc(target.name);
  statusEl.textContent="Wszystkie misje zaliczone. Meta została ujawniona.";
}
function showCandidates(dir){
  if(choiceLocked)return;
  statusEl.textContent="";
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  clearSearchZone()
  let c=directionCandidates(current,visited,dir);
  const searchRadius=c.searchRadius||10000;
  const missionsDone=completed.size===activeTasks.length;
  if(!missionsDone)c=c.filter(p=>p.id!==target.id);
  // Meta nie może być dostępna w pierwszym ruchu. Od drugiego ruchu
  // jest specjalnym punktem: można do niej wrócić nawet po wcześniejszym odwiedzeniu.
  if(moves===0)c=c.filter(p=>p.id!==target.id);
  const foundBeforeGoal=c.length;
  const GOAL_UNLOCK=800;
  const goalDistance=distance(current,target),goalBearing=bearing(current,target),goalDiff=angleDiff(goalBearing,dirAngle(dir));
  if(missionsDone&&goalDistance<=GOAL_UNLOCK&&goalDiff<=45&&!c.some(p=>p.id===target.id))
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
    let msg;
    if(foundBeforeGoal===0){
      msg="W tym kierunku znaleziono 0 punktów w sektorze ±45° nawet w promieniu "+(searchRadius/1000)+" km. Wybierz inną strzałkę.";
    }else{
      msg="W tym kierunku znaleziono tylko "+foundBeforeGoal+" dostępny punkt w promieniu "+(searchRadius/1000)+" km i sektorze ±45°. Do wyboru potrzebne są 2.";
    }
    statusEl.textContent=msg;
    setTimeout(()=>{if(!choiceLocked&&statusEl.textContent===msg)statusEl.textContent="Wybierz inny kierunek."},5000);
    return;
  }
  const selectedInfo="Znaleziono "+c.length+" punktów w sektorze ±45° do "+(searchRadius/1000)+" km. Wybrano 2: możliwie blisko Ciebie, z preferencją odległości około 300 m między nimi"+(c.length>4?" i zróżnicowania dat budowy":"")+".";
  statusEl.textContent=selectedInfo;
  drawSearchZone(dir,searchRadius,c.length);
  statusEl.style.cursor="pointer";
  statusEl.title="Kliknij, aby pokazać/ukryć strefę wyszukiwania";
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
function loadSettings(){try{const x=JSON.parse(localStorage.getItem("trojmiastoGameSettings")||"null");if(x)settings={...settings,...x};if(!["random","0-3","3-5","5-10","10-20","20+"].includes(settings.distanceRange))settings.distanceRange="random"}catch(e){}}
function saveSettings(){const oldRange=settings.distanceRange,oldCity=settings.startCity;settings.count=+document.getElementById("missionCount").value;settings.age=document.getElementById("catAge").checked;settings.periods=document.getElementById("catPeriods").checked;settings.architects=document.getElementById("catArchitects").checked;settings.distanceRange=document.getElementById("distanceRange").value;settings.startCity=document.getElementById("startCity").value;localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));return oldRange!==settings.distanceRange||oldCity!==settings.startCity}
function openSettings(){document.getElementById("missionCount").value=settings.count;document.getElementById("catAge").checked=settings.age;document.getElementById("catPeriods").checked=settings.periods;document.getElementById("catArchitects").checked=settings.architects;document.getElementById("distanceRange").value=settings.distanceRange||"random";document.getElementById("startCity").value=settings.startCity||"random";document.getElementById("settings").classList.remove("hidden")}
function missionPoints(){
  if(!gameStart||!target)return points;
  const local=points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&distance(p,gameStart)<=5000&&distance(p,target)<=5000);
  return local.length>=8?local:points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&(distance(p,gameStart)<=8000||distance(p,target)<=8000));
}
function personNames(p){
  const text=String(p.architect||"")+" "+String(p.notes||"");
  const names=[];
  const words=text.split(/[,;()]/).map(x=>x.trim()).filter(Boolean);
  for(const part of words){
    const matches=part.match(/\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż-]{2,}\b/g)||[];
    matches.forEach(name=>{
      if(!/studio|pracownia|biuro|architektoniczne|architektura|projektowe|projekty|firma/i.test(name))names.push(name);
    });
  }
  return [...new Set(names)];
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
    people.forEach(name=>pool.push({type:"person:"+name,category:"descriptions",text:"Znajdź miejsce powiązane z hasłem: "+name,test:p=>personMatch(p,name)}));
  }
  const usable=pool.filter(t=>all.some(t.test));
  for(let i=usable.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[usable[i],usable[j]]=[usable[j],usable[i]]}
  return usable.slice(0,Math.min(settings.count,usable.length));
}
function reveal(p){
  const hits=activeTasks.filter(t=>!completed.has(t.type)&&t.test(p)).slice(0,1);
  visitedHistory.push(p);
  let html="<h2>"+esc(p.name)+"</h2>";
  if(p.date)html+="<p><b>Data:</b> "+esc(p.date)+"</p>";
  if(p.architect)html+="<p><b>Architekt:</b> "+esc(p.architect)+"</p>";
  if(hits.length){
    html+="<div class='match'>✓ "+hits[0].text+"</div>";
    missionHits.set(p.id,[...(missionHits.get(p.id)||[]),hits[0].type]);
  }
  revealEl.innerHTML=html+"<div class='reveal-auto'>Okno zamknie się automatycznie…</div>";
  revealEl.classList.remove("hidden");
  choiceLocked=true;
  window.setTimeout(()=>{
    if(!revealEl.classList.contains("hidden"))revealEl.classList.add("hidden");
    choiceLocked=false;
    updateProgress();
    if(completed.size===activeTasks.length&&!targetMarker){
      revealTarget();
      const premiumText="<b>Teraz część premium.</b><br>Możesz swobodnie eksplorować mapę podążając do wyznaczonego celu.<br><b>Twoim nowym celem jest teraz: "+esc(target.name)+"</b>";
      missionEl.innerHTML=premiumText;
      if(current.id!==target.id){
        revealEl.innerHTML="<div class='premium-message'>"+premiumText+"</div>";
        revealEl.className="reveal premium-reveal";
        revealEl.style.zIndex="1400";
        revealEl.style.bottom="auto";
        revealEl.style.top="50%";
        window.setTimeout(()=>{
          if(revealEl.classList.contains("premium-reveal")){
            revealEl.classList.add("hidden");
            revealEl.classList.remove("premium-reveal");
            revealEl.style.zIndex="";
            revealEl.style.top="";
            revealEl.style.bottom="";
          }
        },3500);
      }
    }
    if(current.id===target.id){if(completed.size===activeTasks.length)finish();else{statusEl.textContent="Jeszcze za szybko na metę, zalicz wszystkie misje";}}
  },1500);
  hits.forEach(h=>completed.add(h.type));
  updateTagCloud();
}
function choose(p){choiceEl.classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];clearSearchZone();statusEl.style.cursor="";statusEl.title="";current=p;visited.add(p.id);moves++;movesEl.textContent="Ruchy: "+moves;routePoints.push(p);updateRoute();setCurrent(p);reveal(p)}
function finish(){
  document.querySelectorAll(".summary-overlay,.summary-card").forEach(el=>el.remove());
  document.querySelectorAll(".summary-overlay,.summary-card").forEach(el=>{el.removeAttribute("style");});
  choiceEl.classList.add("hidden");
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  if(routePoints.length>1)map.fitBounds(routePoints.map(p=>[p.lat,p.lon]),{padding:[70,70],maxZoom:15});
  const travelledDistance=routePoints.reduce((sum,p,i)=>i?sum+distance(routePoints[i-1],p):0,0);
  const distanceKm=travelledDistance/1000;
  const missionMoves=Math.max(0,moves-1);
  revealEl.innerHTML="<div class='finish-message'><div class='finish-kicker'>GRA ZALICZONA</div><h2>"+moves+" "+(moves===1?"ruch":"ruchów")+"</h2><p>W "+missionMoves+" "+(missionMoves===1?"ruchu":"ruchach")+" zaliczyłeś wszystkie misje. Łączny dystans od startu do mety: <b>"+distanceKm.toFixed(1)+" km</b>.</p><div class='finish-actions'><button id='hideSummary' class='summary-hide'>UKRYJ PODSUMOWANIE</button><button id='restart' class='summary-restart'>NOWA GRA</button></div></div>";
  revealEl.className="reveal finish-reveal";
  revealEl.style.zIndex="1400";
  revealEl.style.bottom="auto";
  revealEl.style.top="50%";
  document.getElementById("hideSummary").onclick=()=>{
    revealEl.classList.add("hidden");
    revealEl.classList.remove("finish-reveal");
    revealEl.style.zIndex="";
    revealEl.style.top="";
    revealEl.style.bottom="";
    updateVisitedLabels();
  };
  document.getElementById("restart").onclick=()=>location.reload();
}
function updateTagCloud(){
  const years=[...new Set(visitedHistory.map(p=>year(p)).filter(y=>y!==null))].sort((a,b)=>b-a);
  const cloud=document.getElementById("tagCloud");if(!cloud)return;
  cloud.querySelector(".tag-list").innerHTML=years.map(y=>{
    const missionYear=visitedHistory.some(p=>year(p)===y&&(missionHits.get(p.id)||[]).length);
    return "<button class=\"year-tag"+(missionYear?" mission-tag":"")+"\" data-year=\""+y+"\">"+y+"</button>";
  }).join("")||"<div class=\"tag-empty\">Odwiedzone daty pojawią się tutaj.</div>";
  cloud.querySelectorAll(".year-tag").forEach(btn=>btn.onclick=()=>showYearObject(+btn.dataset.year));
  if(years.length)cloud.classList.remove("closed");
}
function showYearObject(y){
  const matches=visitedHistory.filter(p=>year(p)===y);
  if(!matches.length)return;
  let p=matches[matches.length-1];
  if(current&&p.id===current.id&&matches.length>1)p=matches[matches.length-2];
  map.panTo([p.lat,p.lon],{animate:true,duration:.5});
  const html="<b>"+esc(p.name)+"</b><br><span>Data budowy: "+esc(p.date||"brak danych")+"</span>"+(p.architect?"<br><span>Architekt: "+esc(p.architect)+"</span>":"");
  L.popup({closeButton:true,autoClose:true}).setLatLng([p.lat,p.lon]).setContent(html).openOn(map);
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
async function start(){if(choiceLocked)return;choiceLocked=true;const startBtn=document.getElementById("startBtn");startBtn.disabled=true;startBtn.textContent="LOSOWANIE TRASY…";statusEl.textContent="Trwa przygotowanie gry i wyszukiwanie możliwej trasy…";await new Promise(r=>setTimeout(r,40));document.getElementById("start").classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];clearSearchZone();document.querySelectorAll(".visited-label-marker").forEach(el=>el.remove());if(routeLine){map.removeLayer(routeLine);routeLine=null}if(targetMarker){map.removeLayer(targetMarker);targetMarker=null}if(startMarker){map.removeLayer(startMarker);startMarker=null}moves=0;visited=new Set();visitedHistory=[];completed=new Set();missionHits=new Map();activeTasks=[];const audited=chooseStartAndTarget();
  if(!audited){choiceLocked=false;statusEl.textContent="Nie udało się znaleźć gry dla wybranych ustawień. Wybierz inny zakres odległości lub miejsce startu.";document.getElementById("start").classList.remove("hidden");startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ";return}
  current=audited.start;gameStart=audited.start;target=audited.target;gameDistance=distance(current,target);activeTasks=taskForGame();routePoints=[current];updateRoute();missionEl.innerHTML="";updateProgress();startMarker=L.marker([current.lat,current.lon],{icon:icon("start-marker"),zIndexOffset:1100}).addTo(map);setCurrent(current,true);targetMarker=null;
  if(activeTasks.length===0){
    choiceLocked=false;
    statusEl.textContent="Nie udało się przygotować żadnej misji. Włącz co najmniej jedną kategorię misji w ustawieniach i rozpocznij nową grę.";
    document.getElementById("settings").classList.remove("hidden");
  }else{statusEl.textContent="Wybierz kierunek strzałką.";choiceLocked=false}
  startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ"}
async function init(){try{if(typeof L==="undefined")throw new Error("Leaflet nie został załadowany");const mapEl=document.getElementById("map");if(!mapEl)throw new Error("Brak elementu mapy");map=L.map(mapEl,{zoomControl:false}).setView([54.38,18.62],12);if(!map||typeof map.addLayer!=="function")throw new Error("Nie udało się utworzyć mapy Leaflet");L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);loadSettings();document.getElementById("startBtn").onclick=start;document.getElementById("settingsBtn").onclick=openSettings;document.getElementById("newGameSettings").onclick=async()=>{document.getElementById("settings").classList.add("hidden");choiceLocked=false;await start()};const tagToggle=document.getElementById("tagToggle"),tagCloud=document.getElementById("tagCloud");if(tagToggle&&tagCloud)tagToggle.onclick=()=>tagCloud.classList.toggle("closed");updateTagCloud();statusEl.addEventListener("click",()=>{if(!searchZone)return;searchZone.setStyle({fillOpacity:searchZone.options.fillOpacity>0?0:.14,opacity:searchZone.options.opacity>0?0:.9})});document.getElementById("saveSettings").onclick=async()=>{const btn=document.getElementById("saveSettings");btn.disabled=true;btn.textContent="ZAPISYWANIE…";statusEl.textContent="Trwa zapisywanie ustawień…";await new Promise(r=>setTimeout(r,350));saveSettings();document.getElementById("settings").classList.add("hidden");btn.disabled=false;btn.textContent="ZAPISZ";if(document.getElementById("start").classList.contains("hidden")){await start()}else statusEl.textContent="Ustawienia zapisane. Kliknij „ROZPOCZNIJ GRĘ”.";};document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>showCandidates(b.dataset.dir));document.addEventListener("keydown",e=>{const d={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[e.key];if(d){e.preventDefault();showCandidates(d)}});try{if(typeof Papa==="undefined")throw Error("Nie załadowano parsera CSV");const r=await fetch(DATA_URL,{cache:"no-store"});if(!r.ok)throw Error("Arkusz Google zwrócił HTTP "+r.status);const csv=await r.text();const parsed=Papa.parse(csv,{header:true,skipEmptyLines:true});if(parsed.errors?.length)console.warn("Ostrzeżenia CSV:",parsed.errors);points=parseSheetRows(parsed.data);if(points.length<20)throw Error("Za mało poprawnych punktów GPS w arkuszu");statusEl.textContent="Załadowano "+points.length+" punktów z Google Sheets (wierszy CSV: "+parsed.data.length+")."}catch(e){console.error("Błąd ładowania Google Sheets:",e);statusEl.textContent="Błąd danych: "+e.message}try{if(L.control&&L.control.scale) L.control.scale({imperial:false,metric:true,position:"bottomleft"}).addTo(map)}catch(e){console.warn("Kontrolka skali pominięta:",e)} }catch(e){console.error("Błąd inicjalizacji gry:",e);statusEl.textContent="BŁĄD MAPY: "+e.message;statusEl.title=e.stack||"";document.getElementById("start").classList.remove("hidden")}}init();