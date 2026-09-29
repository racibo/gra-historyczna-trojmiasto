const SHEET_ID="1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI",DATA_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;let map,points=[],current=null,gameStart=null,target=null,visited=new Set(),moves=0,choiceLocked=false,premiumShown=false,candidateMarkers=[],currentMarker,startMarker,targetMarker,routeLine=null,routePoints=[],routePointMarkers=[],visitedHistory=[],visitedMarkers=[],summaryMarkers=[],summaryRouteLines=[],solutionMarkers=[],customStartMarker=null,customStartSelected=null,customStartPickHandler=null,gpsStartSelected=null,premiumStats={directions:0,goodDirections:0,choices:0,goodChoices:0,lastDirectionGood:false};const missionEl=document.getElementById("mission"),tasksEl=document.getElementById("tasks"),progressEl=document.getElementById("progress"),movesEl=document.getElementById("moves"),choiceEl=document.getElementById("choice"),revealEl=document.getElementById("reveal"),statusEl=document.getElementById("status");let activeTasks=[],completed=new Set(),missionHits=new Map(),gameDistance=0,searchZone=null,instructionTimer=null,missionSearchRadius=3000,missionSearchFallback=false,exactDateHintSeen=new Set(),settings={count:2,countRandom:false,randomCategories:true,age:true,periods:true,architects:true,people:true,functions:true,names:true,history:true,institutions:true,creators:true,hints:true,distanceRange:"0-3",startCity:"gps",defaultsVersion:57},pathGraph=null;
function getSheetVal(obj,searchStrings){const keys=Object.keys(obj||{});for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const exact=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"")===clean);if(exact&&String(obj[exact]??"").trim()!=="")return String(obj[exact]).trim()}for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const partial=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"").includes(clean));if(partial&&String(obj[partial]??"").trim()!=="")return String(obj[partial]).trim()}return""}
function parseSheetRows(data){return data.map((item,i)=>{const name=getSheetVal(item,["adres","nazwa","obiekt","name"])||"Nieznany",date=getSheetVal(item,["datawybudowania","rokbudowy","data","rok","czas","wiek"])||"",notes=getSheetVal(item,["uwagi","opis","informacje","info","inne"]),architect=getSheetVal(item,["architekt","arch.","arch","projektant","proj.","proj","autor"])||String(Object.values(item)[3]??"").trim(),gps=getSheetVal(item,["pozycjagps","gps","wspolrzedne","współrzędne","lokalizacja"]);let lat,lng;if(gps){const matches=String(gps).replace(/;/g,",").match(/-?\d+[\.,]\d+/g)||[];if(matches.length>=2){lat=parseFloat(matches[0].replace(",","."));lng=parseFloat(matches[1].replace(",","."))}}if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;return{id:i,name,lat,lon:lng,raw:notes,date,architect,notes}}).filter(Boolean).filter(p=>p.lat>53.9&&p.lat<54.7&&p.lon>18.2&&p.lon<19.1)}
function year(p){const m=String(p.date||"").match(/(1[0-9]{3}|20[0-9]{2})/);return m?+m[1]:null}
function exactBuildDate(p){
  return String(p?.date||"").replace(/\\s*r\\.?\\s*$/i,"").replace(/\\s+/g," ").trim();
}
function exactBuildDateKey(p){return exactBuildDate(p).toLocaleLowerCase()}function distance(a,b){const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}function bearing(a,b){const y=Math.sin((b.lon-a.lon)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lon-a.lon)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360}function dirAngle(d){return{up:0,right:90,down:180,left:270}[d]}function angleDiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d}function icon(cls){return L.divIcon({className:cls,iconSize:[28,28],iconAnchor:[14,14]})}
function isTargetPoint(p){return !!(p&&target&&p.id===target.id);}
function setCurrent(p,showHere=true){if(currentMarker)map.removeLayer(currentMarker);currentMarker=L.marker([p.lat,p.lon],{icon:icon("current-marker"),zIndexOffset:1000}).addTo(map);currentMarker.bindPopup(visitedLabelHtml(p),{closeButton:true,autoClose:true,maxWidth:340});if(showHere)currentMarker.bindTooltip("TU JESTEŚ",{permanent:true,direction:"top",className:"current-label"});map.panTo([p.lat,p.lon],{animate:true,duration:.5})}
function updateRoute(){
  if(routeLine)map.removeLayer(routeLine);
  routePointMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  routePointMarkers=[];
  routeLine=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#2e7d32",weight:4,opacity:.9,dashArray:"2 8",lineCap:"round"}).addTo(map);
  routePoints.forEach((p,i)=>{
    const marker=L.circleMarker([p.lat,p.lon],{radius:3.5,color:"#fff",weight:1.5,fillColor:"#263238",fillOpacity:.95,interactive:false,zIndexOffset:300+i}).addTo(map);
    routePointMarkers.push(marker);
  });
}
function visitedLabelHtml(p,index){
  let html="<div class='visited-full'><h3>"+esc(p.name)+"</h3>";
  if(p.date)html+="<p><b>Data budowy:</b> "+esc(p.date)+"</p>";
  if(p.notes)html+="<p><b>Uwagi:</b><br>"+esc(p.notes).replace(/\n/g,"<br>")+"</p>";
  html+="</div>";
  return html;
}
function updateVisitedLabels(){
  visitedMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  visitedMarkers=[];
  visitedHistory.forEach((p,i)=>{
    const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:"visited-point-marker",html:"<div>"+esc(p.date||"?")+"</div>",iconSize:[34,22],iconAnchor:[17,11]}),zIndexOffset:500+i}).addTo(map);
    marker.bindPopup(visitedLabelHtml(p,i),{closeButton:true,autoClose:true,maxWidth:340});
    visitedMarkers.push(marker);
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
async function auditPath(start,maxDepth=10,onProgress=null){
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
    if(examined%25===0){
      if(onProgress)onProgress(examined,queue.length);
      await new Promise(r=>setTimeout(r,0));
    }
  }
  if(onProgress)onProgress(examined,queue.length);
  return {paths,examined};
}
function missionCoverageLimits(start,target){
  const d=distance(start,target);
  if((settings.distanceRange||"random")==="0-3"){
    // Standardowo wszystkie rozwiązania misji są w promieniu 3 km od startu.
    // Gdy w tym obszarze nie da się ułożyć pełnego zestawu misji,
    // startowo zwiększamy promień o 1 km i próbujemy ponownie.
    return {startMax:missionSearchRadius,targetMax:Infinity};
  }
  return {startMax:d,targetMax:Math.max(d,1500)};
}
function missionCandidatePoints(start,target){
  const limits=missionCoverageLimits(start,target);
  return points.filter(p=>{
    if(p.id===start.id||p.id===target.id||visited.has(p.id))return false;
    return distance(start,p)<=limits.startMax&&distance(p,target)<=limits.targetMax;
  });
}
function missionCandidatesForGame(t,start,target){
  const candidates=missionCandidatePoints(start,target);
  return candidates.filter(p=>t.test(p));
}
function missionFitsGame(t,start,target){
  return missionCandidatesForGame(t,start,target).length>0;
}
function missionCoverageScore(tasks,start,target){
  if(!tasks?.length)return 0;
  return tasks.filter(t=>missionFitsGame(t,start,target)).length;
}
function missionsForRoute(tasks,start,target){
  const usable=tasks.filter(t=>missionFitsGame(t,start,target));
  const limit=Math.min(settings.count||usable.length,usable.length);
  if(!settings.randomCategories)return shuffleArray(usable).slice(0,limit);
  const byCategory={};
  usable.forEach(t=>(byCategory[t.category]??=[]).push(t));
  let selectedCategories=shuffleArray(Object.keys(byCategory));
  if(selectedCategories.length>limit)selectedCategories=selectedCategories.slice(0,limit);
  const quotas=Object.fromEntries(selectedCategories.map(c=>[c,1]));
  let remaining=limit-selectedCategories.length;
  while(remaining>0){
    const candidates=selectedCategories.filter(c=>(quotas[c]||0)<byCategory[c].length);
    if(!candidates.length)break;
    const cat=candidates[Math.floor(Math.random()*candidates.length)];
    quotas[cat]++;remaining--;
  }
  const selected=[];
  selectedCategories.forEach(c=>selected.push(...shuffleArray(byCategory[c]).slice(0,quotas[c])));
  return shuffleArray(selected).slice(0,limit);
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
async function chooseTargetForStart(start,candidateTasks,onProgress=null){
  if(!start||!candidateTasks?.length)return null;
  const targetPool=shuffleArray(points.filter(p=>p.id!==start.id&&distanceRangeMatch({start,target:p})));
  const required=Math.min(settings.count||0,candidateTasks.length);
  if(!required)return null;

  // Dla zakresu 0–3 km najpierw szukamy kompletnego zestawu w promieniu 3 km.
  // Jeśli go nie ma, zwiększamy promień kolejno o 1 km. Grę uruchamiamy
  // dopiero wtedy, gdy rzeczywiście znaleźliśmy pełny zestaw wymaganych misji.
  const baseRadius=(settings.distanceRange||"random")==="0-3"?3000:null;
  const maxRadius=baseRadius?10000:null;
  let best=null;
  let radius=baseRadius||missionSearchRadius||3000;
  let lastTargetCount=targetPool.length;

  while(true){
    missionSearchRadius=radius;
    for(let i=0;i<targetPool.length;i++){
      const target=targetPool[i];
      const usable=missionCandidateTasks(candidateTasks,start,target);
      if(onProgress)onProgress(i+1,targetPool.length,target,usable.length,radius);
      const result={start,target,path:[start],auditMoves:0,auditedStates:0,score:missionCoverageScore(usable,start,target),usableTasks:usable,missionRadius:radius};
      if(!best||usable.length>best.usableTasks.length)best=result;
      if(usable.length>=required){
        missionSearchFallback=!!baseRadius&&radius>baseRadius;
        return result;
      }
      if(i%8===7)await new Promise(r=>setTimeout(r,0));
    }
    if(!baseRadius||radius>=maxRadius)break;
    radius+=1000;
  }
  missionSearchRadius=baseRadius||radius;
  missionSearchFallback=false;
  return null;
}
function missionCandidateTasks(tasks,start,target){
  const candidates=missionCandidatePoints(start,target);
  return tasks.filter(t=>candidates.some(p=>t.test(p)));
}
async function chooseStartAndTarget(candidateTasks,onProgress=null){
  const pool=shuffleArray(points.filter(p=>cityMatch(p,settings.startCity||"random")));
  if(!pool.length)return null;
  const maxStarts=Math.min(24,pool.length);
  for(let attempt=0;attempt<maxStarts;attempt++){
    const start=pool[attempt];
    if(onProgress)onProgress(attempt+1,maxStarts,start,0,0);
    const result=await chooseTargetForStart(start,candidateTasks,(checked,total,target,usable,radius)=>{
      if(onProgress)onProgress(attempt+1,maxStarts,start,checked,total,target,usable,radius);
    });
    if(result)return result;
  }
  return null;
}
function nearestPointToMapClick(latlng){
  if(!points.length)return null;
  let best=null,bestDistance=Infinity;
  points.forEach(p=>{
    const d=distance({lat:latlng.lat,lon:latlng.lng},p);
    if(d<bestDistance){bestDistance=d;best=p}
  });
  return best;
}
function clearCustomStartPick(){
  if(customStartPickHandler){map.off("click",customStartPickHandler);customStartPickHandler=null}
  if(customStartMarker){try{map.removeLayer(customStartMarker)}catch(e){}customStartMarker=null}
  map.getContainer().classList.remove("custom-start-pick");
}
function beginCustomStartPick(){
  clearCustomStartPick();
  customStartSelected=null;
  document.getElementById("settings").classList.add("hidden");
  document.getElementById("start").classList.add("hidden");
  choiceLocked=true;
  statusEl.textContent="Zaznacz na mapie miejsce startu. Najbliższy punkt z bazy zostanie wybrany automatycznie.";
  movesEl.textContent="Kliknij dowolne miejsce na mapie.";
  map.getContainer().classList.add("custom-start-pick");
  customStartPickHandler=async e=>{
    const nearest=nearestPointToMapClick(e.latlng);
    if(!nearest)return;
    customStartSelected=nearest;
    customStartMarker=L.marker([nearest.lat,nearest.lon],{icon:icon("start-marker"),zIndexOffset:1300}).addTo(map)
      .bindTooltip("✓ START • "+esc(nearest.name),{permanent:true,direction:"top",className:"custom-start-label"});
    if(customStartPickHandler){map.off("click",customStartPickHandler);customStartPickHandler=null}
    map.getContainer().classList.remove("custom-start-pick");
    statusEl.textContent="✓ START ZAZNACZONY: "+nearest.name+". Teraz przygotowuję trasę i misje…";
    movesEl.textContent="Układanie trasy…";
    choiceLocked=false;
    await new Promise(r=>setTimeout(r,80));
    await start();
  };
  map.on("click",customStartPickHandler);
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
function premiumDistanceInfo(){
  if(!target||!current)return {icon:"❄️",label:"ponad 3 km"};
  const d=distance(current,target);
  if(d<=200)return {icon:"🔥",label:"do 200 m"};
  if(d<=700)return {icon:"🔥",label:"200–700 m"};
  if(d<=1000)return {icon:"🔥",label:"700 m–1 km"};
  if(d<=2000)return {icon:"❄️",label:"1–2 km"};
  if(d<=3000)return {icon:"❄️",label:"2–3 km"};
  return {icon:"❄️",label:"ponad 3 km"};
}
function updatePremiumHint(){
  if(!target||!current||completed.size!==activeTasks.length)return;
  const info=premiumDistanceInfo();
  const d=distance(current,target);
  if(d<=500&&!targetMarker)revealTarget();
  const suffix=d<=500?"<span class='premium-hot'>META JEST JUŻ W POBLIŻU</span>":"";
  missionEl.innerHTML="<div class='premium-title'>META</div><div class='premium-target'><b>"+esc(target.name)+"</b></div><div class='premium-distance'><span class='premium-heat'>"+info.icon+"</span><span>"+info.label+"</span></div>"+suffix;
}
function revealTarget(){
  if(!target||targetMarker)return;
  targetMarker=L.marker([target.lat,target.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("META: "+esc(target.name),{permanent:true,direction:"top",className:"target-label"});
  statusEl.textContent="Jesteś nie dalej niż 500 m od mety — punkt mety został zaznaczony.";
}
function zoomToChoicePoints(chosen){
  if(!map||!current||!chosen?.length)return;
  const relevant=[current,...chosen].filter(Boolean);
  if(relevant.length<2)return;
  requestAnimationFrame(()=>{
    map.invalidateSize({pan:false});
    const mapEl=map.getContainer();
    const mapRect=mapEl.getBoundingClientRect();
    const missionPanel=document.querySelector(".mission");
    const choicePanel=document.getElementById("choice");
    const missionRect=missionPanel?.getBoundingClientRect();
    const choiceRect=choicePanel?.getBoundingClientRect();
    const topPad=Math.max(35,missionRect?Math.round(missionRect.bottom-mapRect.top+18):35);
    const bottomPad=Math.max(35,choiceRect?Math.round(mapRect.bottom-choiceRect.top+18):35);
    const bounds=L.latLngBounds(relevant.map(p=>[p.lat,p.lon]));
    map.fitBounds(bounds,{
      paddingTopLeft:[24,topPad],
      paddingBottomRight:[24,bottomPad],
      maxZoom:16,
      animate:true,
      duration:.45
    });
  });
}
function singleShowCandidatesBase(dir){
  if(choiceLocked)return;
  statusEl.textContent="";
  candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];
  let c=directionCandidates(current,visited,dir);
  const premiumActive=completed.size===activeTasks.length&&!!target;
  if(premiumActive){
    premiumStats.directions++;
    premiumStats.lastDirectionGood=premiumDirectionIsGood(dir);
    if(premiumStats.lastDirectionGood)premiumStats.goodDirections++;
  }

  // Gdy jesteśmy <=500 m od rozwiązania, dobry kierunek musi pokazać
  // rzeczywiste rozwiązanie jako jeden z dwóch wyborów. Nie wolno go
  // "przeskoczyć" przez pokazanie dwóch innych punktów mijających cel.
  const GOAL_UNLOCK=500;
  let forcedGoal=null;

  // Najpierw szukamy odpowiedzi na niezakończone misje.
  if(completed.size<activeTasks.length){
    const missionSolutions=points
      .filter(p=>p.id!==current.id&&p.id!==target?.id&&!visited.has(p.id))
      .filter(p=>activeTasks.some(t=>!completed.has(t.type)&&t.test(p)))
      .map(p=>({...p,d:distance(current,p),bd:bearing(current,p),ad:angleDiff(bearing(current,p),dirAngle(dir))}))
      .filter(p=>p.d<=GOAL_UNLOCK&&p.ad<=45)
      .sort((x,y)=>x.d-y.d);
    if(missionSolutions.length)forcedGoal={...missionSolutions[0],isMissionSolution:true};
  }

  // Po zaliczeniu misji analogiczna zasada obowiązuje dla mety.
  if(!forcedGoal&&completed.size===activeTasks.length&&target){
    const goalDistance=distance(current,target);
    const goalBearing=bearing(current,target);
    const goalDiff=angleDiff(goalBearing,dirAngle(dir));
    if(goalDistance<=GOAL_UNLOCK&&goalDiff<=45&&!visited.has(target.id)){
      forcedGoal={...target,d:goalDistance,bd:goalBearing,ad:goalDiff,isTarget:true};
    }
  }

  let chosen;
  if(forcedGoal){
    const alternatives=c
      .filter(p=>p.id!==forcedGoal.id&&!visited.has(p.id))
      .sort((x,y)=>x.d-y.d);
    let second=chooseBestPair(alternatives)[0];
    if(!second){
      second=points
        .filter(p=>p.id!==current.id&&p.id!==forcedGoal.id&&!visited.has(p.id))
        .map(p=>({...p,d:distance(current,p),bd:bearing(current,p),ad:angleDiff(bearing(current,p),dirAngle(dir))}))
        .filter(p=>p.ad<=45)
        .sort((x,y)=>x.d-y.d)[0];
    }
    if(!second)second=alternatives[0];
    chosen=[forcedGoal,second].filter(Boolean);
  }else if(premiumActive&&target){
    const sorted=c.filter(p=>p.id!==target.id&&!visited.has(p.id)).sort((x,y)=>premiumChoiceScore(x)-premiumChoiceScore(y));
    const best=sorted[0];
    const pair=chooseBestPair(c.filter(p=>!best||p.id!==best.id));
    chosen=best?[best,...pair.filter(p=>p.id!==best.id).slice(0,1)]:chooseBestPair(c);
  }else{
    chosen=chooseBestPair(c);
  }

  if(chosen.length<2){
    const msg="W tym kierunku nie ma dwóch dostępnych punktów — wybierz inną strzałkę.";
    statusEl.textContent=msg;
    setTimeout(()=>{if(!choiceLocked&&statusEl.textContent===msg)statusEl.textContent="Wybierz inny kierunek."},3000);
    return;
  }
  choiceLocked=true;
  choiceEl.classList.remove("direction-choice-empty");
  document.querySelector(".choice-buttons").style.display="flex";
  document.querySelector(".controls").classList.add("direction-hidden");
  document.querySelector(".choice-title").textContent="Wybierz punkt";
  if(premiumActive&&target){
    const bestDistance=Math.min(...chosen.map(p=>premiumChoiceScore(p)));
    chosen.forEach(p=>p.premiumBest=bestDistance===premiumChoiceScore(p));
  }
  chosen.forEach((p,i)=>{
    const m=L.marker([p.lat,p.lon],{icon:icon(i?"candidate-b":"candidate-a")}).addTo(map);
    candidateMarkers.push(m);m.on("click",()=>choose(p));
    const btn=document.getElementById(i?"choiceB":"choiceA");
    btn.className=i?"choice-b":"choice-a";
    const suffix="";
    btn.innerHTML='<span class="letter">'+(i?"B":"A")+'</span> '+(isTargetPoint(p)?"META":"okolice "+esc(placeLabel(p)));
  });
  choiceEl.classList.remove("hidden");
  document.getElementById("choiceA").onclick=()=>choose(chosen[0]);
  document.getElementById("choiceB").onclick=()=>choose(chosen[1]);
  zoomToChoicePoints(chosen);
}
function updateCategoryCounts(){
  const counts={
    age:points.filter(p=>{const y=year(p);return y>=1800&&y<=2099}).length,
    periods:points.filter(p=>{const y=year(p);return (y>=1900&&y<=1914)||(y>=1918&&y<=1939)||(y>=1945&&y<=1989)||(y>=1990&&y<=1999)||(y>=2001&&y<=2099)}).length,
    architects:points.filter(p=>missionData(p).architects.length).length,
    people:points.filter(p=>missionData(p).people).length,
    functions:points.filter(p=>missionData(p).functions.length).length,
    names:points.filter(p=>missionData(p).names).length,
    history:points.filter(p=>missionData(p).history.length).length,
    institutions:points.filter(p=>missionData(p).institutions.length).length,
    creators:points.filter(p=>missionData(p).creators.length).length
  };
  Object.entries(counts).forEach(([key,count])=>{const el=document.getElementById("count-"+key);if(el)el.textContent=count+" "+(count===1?"obiekt":"obiektów")});
}
function singleLoadSettingsBase(){
  try{
    const x=JSON.parse(localStorage.getItem("trojmiastoGameSettings")||"null");
    if(x)settings={...settings,...x};
    if(x&&!Object.prototype.hasOwnProperty.call(x,"countRandom"))settings.countRandom=false;
    if(!Object.prototype.hasOwnProperty.call(x||{},"distanceRange"))settings.distanceRange="0-3";
    if(!["random","0-3","3-5","5-10","10-20","20+"].includes(settings.distanceRange))settings.distanceRange="0-3";
    if(!["random","gdansk","sopot","gdynia","custom","gps"].includes(settings.startCity))settings.startCity="gps";
    if(settings.defaultsVersion!==57){
      settings.count=2;settings.countRandom=false;settings.distanceRange="0-3";settings.startCity="gps";settings.defaultsVersion=57;
      localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));
    }
  }catch(e){console.warn("Nie udało się wczytać ustawień:",e)}
}
function singleSaveSettingsBase(){const oldRange=settings.distanceRange,oldCity=settings.startCity;settings.countRandom=document.getElementById("missionCount").value==="random";settings.count=settings.countRandom?(settings.count||4):+document.getElementById("missionCount").value;settings.age=document.getElementById("catAge").checked;settings.periods=document.getElementById("catPeriods").checked;settings.architects=document.getElementById("catArchitects").checked;settings.people=document.getElementById("catPeople").checked;settings.functions=document.getElementById("catFunctions").checked;settings.names=document.getElementById("catNames").checked;settings.history=document.getElementById("catHistory").checked;settings.institutions=document.getElementById("catInstitutions").checked;settings.creators=document.getElementById("catCreators").checked;settings.hints=document.getElementById("allowHints").checked;settings.randomCategories=document.getElementById("randomCategories").checked;if(settings.randomCategories){settings.age=settings.periods=settings.architects=settings.people=settings.functions=settings.names=settings.history=settings.institutions=settings.creators=false}else{if(![settings.age,settings.periods,settings.architects,settings.people,settings.functions,settings.names,settings.history,settings.institutions,settings.creators].some(Boolean))settings.age=true}settings.distanceRange=document.getElementById("distanceRange").value;settings.startCity=document.getElementById("startCity").value;settings.defaultsVersion=54;localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));return oldRange!==settings.distanceRange||oldCity!==settings.startCity}
function syncCategoryMode(){
  const random=document.getElementById("randomCategories").checked;
  const ids=["catAge","catPeriods","catArchitects","catPeople","catFunctions","catNames","catHistory","catInstitutions","catCreators"];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.disabled=random;
    if(random)el.checked=false;
  });
}
function singleOpenSettingsBase(){
  document.getElementById("missionCount").value=settings.countRandom?"random":String(settings.count);
  document.getElementById("catAge").checked=settings.age;
  document.getElementById("catPeriods").checked=settings.periods;
  document.getElementById("catArchitects").checked=settings.architects;
  document.getElementById("catPeople").checked=settings.people;
  document.getElementById("catFunctions").checked=settings.functions;
  document.getElementById("catNames").checked=settings.names;
  document.getElementById("catHistory").checked=settings.history;
  document.getElementById("catInstitutions").checked=settings.institutions;
  document.getElementById("catCreators").checked=settings.creators;
  document.getElementById("allowHints").checked=settings.hints;
  document.getElementById("randomCategories").checked=!!settings.randomCategories;
  document.getElementById("distanceRange").value=settings.distanceRange||"0-3";
  document.getElementById("startCity").value=settings.startCity||"random";
  syncCategoryMode();
  document.getElementById("settings").classList.remove("hidden");
}
function missionPoints(){
  if(!gameStart||!target)return points;
  const local=points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&distance(p,gameStart)<=5000&&distance(p,target)<=5000);
  return local.length>=8?local:points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&(distance(p,gameStart)<=8000||distance(p,target)<=8000));
}
function architectText(p){
  const text=String(p.architect||"").replace(/\s+/g," ").trim();
  if(!text)return "";
  const matches=[];
  const re=/(?:^|[;,.|])\s*(?:architekt(?:ka)?|architekci|arch\.?|projektant(?:ka)?|projektanci|proj\.?)\s*[:\-]?\s*([^;,.|\n]+)/gi;
  let m;
  while((m=re.exec(text))) {
    const value=m[1].trim();
    if(value && !/^\d{3,4}$/.test(value)) matches.push(value);
  }
  return [...new Set(matches)].join(", ");
}
function personNames(p){
  const text=architectText(p);
  if(!text)return [];
  const cleaned=text.replace(/^(architekt(?:ka)?|arch\.?|projektant(?:ka)?|proj\.?|autor|architekci|projektanci)\s*[:\-]?\s*/i,"").trim();
  const parts=cleaned.split(/\s*(?:,|;|\/|\\|\s+i\s+|\s+oraz\s+)\s*/i)
    .map(x=>x.trim()).filter(Boolean);
  return [...new Set(parts)];
}
function cleanNote(p){return String(p.notes||"").replace(/\s+/g," ").trim()}
function noteHas(p,re){return re.test(cleanNote(p))}
function missionData(p){
  const n=cleanNote(p), a=String(p.architect||"").trim();
  const lower=n.toLowerCase();

  // Każda kategoria jest niezależna. Ten sam obiekt może należeć do kilku kategorii.
  // Klasyfikacja opiera się przede wszystkim na treści pola „Uwagi”.
  const functionsRe=/\b(?:dawna|dawny|dawne|dawniej|wcześniej|uprzednio|pierwotnie|była tu|był tu|mieścił(?:a)? się tu|znajdowała się tu|znajdował się tu|pełnił(?:a)? funkcję|służył(?:a)? jako|wykorzystywany jako|przeznaczony na|zamieniono na|przekształcono na|przebudowano na|zajezdnia|łaźnia|szpital|hotel|kotłownia|gazownia|biurowiec|hala|ujeżdżalnia|więzienie|komisariat|posterunek|straż pożarna|biblioteka|dworzec|instytut|dom handlowy|dom technika|internat|schronisko|hangar|kino|pensjonat|dom wczasowy|szkoła|klasztor|kościół|magazyn|fabryka|warsztat|ratusz|poczta)\b/i;

  const namesRe=/\b(?:dawna nazwa|dawne nazwy|dawniej nazywan[ay]|wcześniej nazywan[ay]|nos[iłła] nazwę|pod nazwą|znan[ay] jako|występuje pod nazwą|nosił nazwę|koloni[ae]|osiedl[ae]|dzielnic[ae]|kwartał|zespół mieszkaniowy|falkhof|meeresstern|bratniak|zieleniec|ochota|berg|praca|jordana|schichau|przybyszewskiego|lieblingsruh|nowych szkoców|żniwne|dożynki|rzeszy|fińskich domków|słomianych wdów)\b/i;

  const historyRe=/\b(?:histori[ae]|historyczn|powstał[ay]?|założon[ay]|założeni[ae]|zbudowan[ay]|wzniesion[ay]|wybudowan[ay]|odbudow|rozbudow|przebudow|zniszcz|spłon[ąał]|pożar|wojn[ay]|bombard|okupacj|wyzwol|wyburzon|rozebr|zachował|zachowało się|oryginał|pierwotn|najstarsz|pierwsz[ay]|średniowiecz|gotyck|renesans|barok|neogot|modernizm|secesj|eklektyzm|fundacj|konserwacj|restauracj|rewitalizacj|w 1[0-9]{3}|w 20[0-9]{2}|w XIX wieku|w XX wieku|w XXI wieku)\b/i;

  const institutionsRe=/\b(?:spółdzielni[ae]|fundacj[ae]|przedsiębiorstw[oa]|instytut[emu]?|uniwersytet[emu]?|szkoł[ay]|stoczni[ae]|telekomunikacj[ae]|poczt[ay]|zakład(?:y|ów)?|kombinat[emu]?|depot|policj[ai]|marynarki|wojsk[ao]?|straż[ay]|związek(?:u)? zawodow(?:y|ego)|towarzystw[oa]|organizacj[ae]|bractw[oa]|cech[emu]?|parafi[ae]|diecezj[ae]|zakon(?:u|em)?|klasztor[emu]?|urząd[emu]?|ministerstw[oa]|kolej[ae]|przedsiębiorstw[oa]|pzu|nfz|orange|centromor|ppts|koga|gemeinnützige)\b/i;

  const creatorsRe=/\b(?:pomnik(?:a|iem)?|mural(?:u|em)?|sgraffit(?:o|a)|rzeźb[ay]|rzeźbiarz|autor(?:em|ka|ką)?|autorstwa|twórc(?:a|y|ą)|wykonał|wykonan[ay] przez|zaprojektował(?:a)?|projekt(?:u|em)?|dzieł(?:o|a|em)|artyst(?:a|y|ą)|malarz|malowidł(?:o|a)|mozaik[ai]|tablic(?:a|ę)|fontann[ay]|instalacj[ae])\b/i;

  // Osoby i rodziny: szukamy relacji człowiek–obiekt, a nie przypadkowego nazwiska.
  const peopleRe=/\b(?:mieszkał(?:a|y)?|zamieszkiwał(?:a|y)?|urodził(?:a|y) się|żył(?:a|y)|zmarł(?:a|y)|właściciel(?:em|ka|ką)?|właściciel[ae]?|fundator(?:em|ka|ką)?|ufundował|należał do|należała do|dla rodziny|dla pracowników|siedziba rodziny|rodzina|małżeństw[oa]|książę|król|prezydent|burmistrz|profesor|inżynier|artyst[ay]|pisarz|lekarz|przedsiębiorc[ay])\b/i;

  return {
    architects:a?personNames(p):[],
    people:peopleRe.test(lower)?n:"",
    functions:functionsRe.test(lower)?n:"",
    names:namesRe.test(lower)?n:"",
    history:historyRe.test(lower)?n:"",
    institutions:institutionsRe.test(lower)?n:"",
    creators:creatorsRe.test(lower)?n:""
  };
}
function missionLabel(p,category){
  const d=missionData(p),n=cleanNote(p);
  if(category==="architects"&&d.architects.length)return d.architects.join(", ");
  return n;
}
function categoryTasks(all,category,title,matcher){
  const groups=[];
  const matching=all.filter(matcher);

  // Odpowiedź na misję może występować przy wielu obiektach.
  // Misja nie może być związana z jednym wylosowanym punktem.
  if(category==="architects"){
    const byAnswer=new Map();
    matching.forEach(p=>missionData(p).architects.forEach(name=>{
      const label=String(name||"").replace(/\s+/g," ").trim();
      if(!label)return;
      const key=label.toLocaleLowerCase();
      if(!byAnswer.has(key))byAnswer.set(key,label);
    }));
    byAnswer.forEach((label,key)=>groups.push({
      type:category+":"+key,category,text:title+": "+label,
      test:q=>missionData(q).architects.some(name=>String(name||"").replace(/\s+/g," ").trim().toLocaleLowerCase()===key)
    }));
    return groups;
  }

  if(category==="functions"){
    const terms=["zajezdnia","łaźnia","szpital","hotel","kotłownia","gazownia","biurowiec","hala","ujeżdżalnia","więzienie","komisariat","posterunek","straż pożarna","biblioteka","dworzec","instytut","dom handlowy","dom technika","internat","schronisko","hangar","kino","pensjonat","dom wczasowy","szkoła","klasztor","kościół","magazyn","fabryka","warsztat","ratusz","poczta"];
    const byAnswer=new Map();
    matching.forEach(p=>{
      const n=cleanNote(p).toLocaleLowerCase();
      terms.filter(term=>n.includes(term)).forEach(label=>{
        const key=label.toLocaleLowerCase();
        if(!byAnswer.has(key))byAnswer.set(key,label);
      });
    });
    byAnswer.forEach((label,key)=>groups.push({
      type:category+":"+key,category,text:title+": "+label,
      test:q=>cleanNote(q).toLocaleLowerCase().includes(key)
    }));
    return groups;
  }

  // Historia może dotyczyć kilku obiektów jednocześnie. Jeżeli kilka wpisów
  // opisuje ten sam konkretny epizod (np. „Kombinat Budowy Domów nr 3 w Leningradzie”),
  // wszystkie te obiekty są prawidłowymi rozwiązaniami jednej misji.
  if(category==="institutions"){
    const byAnswer=new Map();
    const normalize=s=>String(s||"")
      .replace(/[„”«»"]/g,"")
      .replace(/\s+/g," ")
      .trim();
    const addAnswer=(label)=>{
      const clean=normalize(label);
      if(!clean||clean.length<8)return;
      const key=clean.toLocaleLowerCase();
      if(!byAnswer.has(key))byAnswer.set(key,clean);
    };

    // Instytucja/grupa jest wspólną odpowiedzią wtedy, gdy ta sama nazwa
    // występuje w uwagach przy co najmniej dwóch różnych obiektach.
    // Szczególnie ważne są nazwy typu „Kombinat Budowy Domów nr 3
    // w Leningradzie”, które nie mogą być związane z jednym losowym id.
    const institutionPatterns=[
      /\bKombinat\s+Budowy\s+Domów\s+nr\s+\d+(?:\s+w\s+[A-ZĄĆĘŁŃÓŚŹŻ][^.;!?\n]*)?/g,
      /\b(?:Towarzystwo|Spółdzielnia|Przedsiębiorstwo|Zjednoczenie|Stocznia|Fabryka|Instytut|Uniwersytet|Politechnika|Ministerstwo|Komitet|Związek|Organizacja|Liga|Klub|Bractwo|Cech|Parafia|Drużyna|Jednostka)\s+[A-ZĄĆĘŁŃÓŚŹŻ0-9][^.;!?\n]{3,100}/g
    ];

    matching.forEach(p=>{
      const n=cleanNote(p);
      const quoted=n.match(/[„«"][^„”»"]{8,120}[”»"]/g)||[];
      quoted.forEach(addAnswer);
      institutionPatterns.forEach(re=>{ re.lastIndex=0; (n.match(re)||[]).forEach(addAnswer); });
    });

    const counts=new Map();
    byAnswer.forEach((label,key)=>{
      counts.set(key,matching.filter(p=>
        normalize(cleanNote(p)).toLocaleLowerCase().includes(key)
      ).length);
    });

    // Tylko wspólne nazwy stają się misjami grupowymi.
    // Jeżeli nazwa występuje tylko raz, zachowujemy dotychczasową misję
    // przypisaną do konkretnego obiektu.
    byAnswer.forEach((label,key)=>{
      if((counts.get(key)||0)>=2){
        groups.push({
          type:category+":"+key,
          category,
          text:title+": "+label,
          test:q=>normalize(cleanNote(q)).toLocaleLowerCase().includes(key)
        });
      }
    });

    matching.forEach(p=>{
      const label=missionLabel(p,category);
      if(!label)return;
      const normalized=normalize(label).toLocaleLowerCase();
      const hasShared=[...byAnswer.keys()].some(key=>
        (counts.get(key)||0)>=2&&normalized.includes(key)
      );
      if(!hasShared){
        groups.push({
          type:category+":"+p.id,
          category,
          text:title+": "+label,
          test:q=>q.id===p.id
        });
      }
    });
    return groups;
  }

  if(category==="history"){
    const byAnswer=new Map();
    const normalize=s=>String(s||"").replace(/[„”«»"]/g,"").replace(/\\s+/g," ").trim();
    const addAnswer=(label)=>{
      const clean=normalize(label);
      if(!clean||clean.length<8)return;
      const key=clean.toLocaleLowerCase();
      if(!byAnswer.has(key))byAnswer.set(key,clean);
    };
    const entityRe=/\\b(?:Kombinat|Towarzystwo|Spółdzielnia|Przedsiębiorstwo|Zakład(?:y)?|Stocznia|Fabryka|Instytut|Uniwersytet|Politechnika|Ministerstwo|Przedsiębiorstwo|Zjednoczenie|Osiedle|Kolonia|Zespół|Dom Kultury|Dom Towarowy|Biuro|Komitet|Związek|Organizacja|Liga|Klub|Bractwo|Cech|Parafia|Drużyna|Jednostka)\\b[^.;!?\\n]{5,100}/g;
    matching.forEach(p=>{
      const n=cleanNote(p);
      const quoted=n.match(/[„«"][^„”»"]{8,120}[”»"]/g)||[];
      quoted.forEach(addAnswer);
      (n.match(entityRe)||[]).forEach(addAnswer);
    });
    // Zachowujemy tylko kotwice, które rzeczywiście występują w co najmniej
    // dwóch obiektach. Pojedynczy opis pozostaje klasyczną misją punktową.
    const counts=new Map();
    byAnswer.forEach((label,key)=>{
      counts.set(key,matching.filter(p=>normalize(cleanNote(p)).toLocaleLowerCase().includes(key)).length);
    });
    byAnswer.forEach((label,key)=>{
      if((counts.get(key)||0)>=2){
        groups.push({
          type:category+":"+key,category,text:title+": "+label,
          test:q=>normalize(cleanNote(q)).toLocaleLowerCase().includes(key)
        });
      }
    });
    matching.forEach(p=>{
      const label=missionLabel(p,category);
      if(!label)return;
      const normalized=normalize(label).toLocaleLowerCase();
      const hasShared=[...byAnswer.keys()].some(key=>(counts.get(key)||0)>=2&&normalized.includes(key));
      if(!hasShared){
        groups.push({type:category+":"+p.id,category,text:title+": "+label,test:q=>q.id===p.id});
      }
    });
    return groups;
  }

  matching.forEach(p=>{
    const label=missionLabel(p,category); if(!label)return;
    const id=category+":"+p.id;
    groups.push({type:id,category,text:title+": "+label,test:q=>q.id===p.id});
  });
  return groups;
}
function applyRandomGameSettings(){
  const categories=["age","periods","architects","people","functions","names","history","institutions","creators"];
  if(settings.randomCategories){
    const count=1+Math.floor(Math.random()*categories.length);
    const shuffled=[...categories];
    for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
    categories.forEach(k=>{settings[k]=false});
    shuffled.slice(0,count).forEach(k=>{settings[k]=true});
    categories.forEach(k=>{const el=document.getElementById("cat"+k.charAt(0).toUpperCase()+k.slice(1));if(el)el.checked=settings[k]});
    syncCategoryMode();
  }
  if(settings.countRandom||settings.count==="random"||settings.count===""||settings.count==null){
    settings.count=2+Math.floor(Math.random()*5);
    document.getElementById("missionCount").value=String(settings.count);
  }
}
function shuffleArray(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function taskPoolForGame(){
  const all=missionPoints(),dated=all.filter(p=>p.date),pool=[];
  if(settings.age)dated.length&&pool.push(
    {type:"19",category:"age",text:"Odwiedź obiekt z XIX wieku",test:p=>{const y=year(p);return y>=1800&&y<=1899}},
    {type:"20",category:"age",text:"Odwiedź obiekt z XX wieku",test:p=>{const y=year(p);return y>=1900&&y<=1999}},
    {type:"21",category:"age",text:"Odwiedź obiekt z XXI wieku",test:p=>{const y=year(p);return y>=2000&&y<=2099}}
  );
  if(settings.periods){
    const byDate=new Map();
    dated.forEach(p=>{
      const label=exactBuildDate(p),key=exactBuildDateKey(p);
      if(!label||!key)return;
      if(!byDate.has(key))byDate.set(key,label);
    });
    byDate.forEach((label,key)=>pool.push({
      type:"date:"+key,
      category:"periods",
      exactDate:true,
      text:"Znajdź budynek z dokładną datą budowy: "+label,
      test:p=>exactBuildDateKey(p)===key
    }));
  }
  if(settings.architects)pool.push(...categoryTasks(all,"architects","Znajdź obiekt zaprojektowany przez",p=>missionData(p).architects.length));
  if(settings.people)pool.push(...categoryTasks(all,"people","Znajdź obiekt związany z osobą lub rodziną",p=>missionData(p).people));
  if(settings.functions)pool.push(...categoryTasks(all,"functions","Znajdź obiekt o dawnej funkcji",p=>missionData(p).functions));
  if(settings.names)pool.push(...categoryTasks(all,"names","Znajdź obiekt związany z dawną nazwą lub osiedlem",p=>missionData(p).names));
  if(settings.history)pool.push(...categoryTasks(all,"history","Znajdź obiekt z ciekawym epizodem historycznym",p=>missionData(p).history));
  if(settings.institutions)pool.push(...categoryTasks(all,"institutions","Znajdź obiekt związany z instytucją lub grupą",p=>missionData(p).institutions));
  if(settings.creators)pool.push(...categoryTasks(all,"creators","Znajdź dzieło, którego twórca jest opisany w danych",p=>missionData(p).creators));
  // Nie losujemy jeszcze konkretnych misji.
  // Najpierw wybieramy start/metę i filtrujemy zadania według odległości.
  // Dopiero z misji możliwych w danym obszarze wybieramy finalny zestaw.
  return pool.filter(t=>all.some(t.test));
}
function taskSolutionDistance(t,p){
  const limits=target?missionCoverageLimits(gameStart||p,target):null;
  const targets=points.filter(x=>{
    if(x.id===p.id||visited.has(x.id)||!t.test(x))return false;
    if(!limits)return true;
    return distance(gameStart||p,x)<=limits.startMax&&distance(x,target)<=limits.targetMax;
  });
  if(!targets.length)return null;
  return Math.min(...targets.map(x=>distance(p,x)));
}
function taskSolutionDistanceAt(t,index){
  const seen=new Set(visitedHistory.slice(0,index+1).map(p=>p.id));
  const p=visitedHistory[index];
  const limits=target?missionCoverageLimits(gameStart||p,target):null;
  const targets=points.filter(x=>{
    if(x.id===p.id||seen.has(x.id)||!t.test(x))return false;
    if(!limits)return true;
    return distance(gameStart||p,x)<=limits.startMax&&distance(x,target)<=limits.targetMax;
  });
  if(!targets.length)return null;
  return Math.min(...targets.map(x=>distance(p,x)));
}
function taskAwayStreak(t){
  if(visitedHistory.length<2)return 0;
  let streak=0;
  for(let i=visitedHistory.length-1;i>0;i--){
    const before=taskSolutionDistanceAt(t,i-1);
    const after=taskSolutionDistanceAt(t,i);
    if(before===null||after===null)break;
    if(after-before>1)streak++; else break;
  }
  return streak;
}
function taskHintHtml(t){
  const limits=target?missionCoverageLimits(gameStart||current,target):null;
  const targets=points.filter(p=>{
    if(p.id===current.id||visited.has(p.id)||!t.test(p))return false;
    if(!limits)return true;
    return distance(gameStart||current,p)<=limits.startMax&&distance(p,target)<=limits.targetMax;
  });
  if(!targets.length)return "";
  const d=Math.min(...targets.map(p=>distance(current,p)));
  const text=d<1000?Math.round(d)+" m":(d/1000).toFixed(2)+" km";
  return ' <span class="automatic-hint">PODPOWIEDŹ: '+text+'</span>';
}
function showExactDateHintPopup(){
  if(!settings.hints||!current)return;

  // Szukamy podpowiedzi we wszystkich aktywnych, niezaliczonych
  // misjach dokładnej daty. Nie ograniczamy tutaj punktów do obszaru
  // użytego przy losowaniu misji — podpowiedź ma informować o realnym
  // pasującym obiekcie w bazie, a nie o tym, czy algorytm wybrał go
  // wcześniej do puli gry.
  const currentYear=year(current);
  if(currentYear===null)return;
  const currentDate=exactBuildDate(current);
  if(!currentDate)return;

  const candidates=[];
  activeTasks.filter(t=>!completed.has(t.type)&&t.exactDate).forEach(task=>{
    // Jeśli aktualny obiekt już spełnia tę konkretną misję, nie pokazujemy
    // podpowiedzi dla niej.
    if(task.test(current))return;

    const targets=points.filter(p=>{
      if(p.id===current.id||visited.has(p.id)||!task.test(p))return false;
      const y=year(p);
      if(y===null||Math.abs(y-currentYear)>10)return false;

      // Nie pokazuj podpowiedzi dla identycznej dokładnej daty.
      const targetDate=exactBuildDate(p);
      if(!targetDate||exactBuildDateKey(p)===exactBuildDateKey(current))return false;
      return true;
    });

    targets.forEach(p=>{
      candidates.push({
        task,
        p,
        distance:distance(current,p),
        yearDiff:Math.abs(year(p)-currentYear)
      });
    });
  });

  if(!candidates.length)return;

  candidates.sort((a,b)=>a.distance-b.distance);
  const hit=candidates.find(x=>!exactDateHintSeen.has(x.task.type+"|"+current.id));
  if(!hit)return;

  const key=hit.task.type+"|"+current.id;
  exactDateHintSeen.add(key);
  const targetPoint=hit.p;
  const targetDate=exactBuildDate(targetPoint)||String(year(targetPoint));
  const d=Math.round(hit.distance);

  const popup=document.createElement("div");
  popup.className="exact-date-hint-popup";
  popup.innerHTML="<div class='exact-date-hint-title'>PODPOWIEDŹ</div><div>Znalazłeś budynek z roku <b>"+esc(currentDate)+"</b>.</div><div>To bardzo blisko, ale chodziło mi o inny budynek z roku <b>"+esc(targetDate)+"</b>.</div><div>Znajduje się on dokładnie <b>"+d+" metrów</b> stąd.</div><div class='exact-date-hint-close'>Dotknij, aby zamknąć</div>";
  const close=()=>{
    if(!popup.isConnected)return;
    popup.classList.remove("visible");
    setTimeout(()=>popup.remove(),180);
  };
  popup.onclick=close;
  document.body.appendChild(popup);
  requestAnimationFrame(()=>popup.classList.add("visible"));
  window.setTimeout(close,5000);
}
function taskHint(t){
  const limits=target?missionCoverageLimits(gameStart||current,target):null;
  const targets=points.filter(p=>{
    if(p.id===current.id||visited.has(p.id)||!t.test(p))return false;
    if(!limits)return true;
    return distance(gameStart||current,p)<=limits.startMax&&distance(p,target)<=limits.targetMax;
  });
  if(!targets.length)return "Brak jeszcze dostępnego punktu spełniającego tę misję.";
  const p=targets.reduce((a,b)=>distance(current,a)<distance(current,b)?a:b),d=distance(current,p);
  return "Najbliższy punkt rozwiązania jest dokładnie "+(d<1000?Math.round(d)+" m":(d/1000).toFixed(2)+" km")+" stąd.";
}
function clearSolutionMarkers(){
  solutionMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  solutionMarkers=[];
}
function showSolution(){
  choiceLocked=true;
  choiceEl.classList.add("hidden");
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  clearSearchZone();
  document.querySelector(".controls").classList.remove("direction-hidden");
  renderSummaryMap();
  clearSolutionMarkers();
  const solved=[];
  activeTasks.forEach((t,i)=>{
    let p=visitedHistory.find(x=>(missionHits.get(x.id)||[]).includes(t.type));
    if(!p){
      const limits=target?missionCoverageLimits(gameStart||current,target):null;
      const targets=points.filter(x=>{
        if(x.id===current.id||visited.has(x.id)||!t.test(x))return false;
        if(!limits)return true;
        return distance(gameStart||current,x)<=limits.startMax&&distance(x,target)<=limits.targetMax;
      });
      if(targets.length)p=targets.reduce((a,b)=>distance(current,a)<distance(current,b)?a:b);
    }
    if(p){
      const done=completed.has(t.type);
      solved.push({task:t,point:p,done});
      if(!done){
        const marker=L.marker([p.lat,p.lon],{icon:icon("summary-solution-marker"),zIndexOffset:1300+i}).addTo(map);
        marker.bindPopup("<div class='summary-popup'><h3>Rozwiązanie misji "+(i+1)+"</h3><p><b>"+esc(t.text)+"</b></p><p>Pasujący obiekt: <b>"+esc(p.name)+"</b></p></div>",{maxWidth:360});
        solutionMarkers.push(marker);
      }
    }
  });
  if(target){
    const marker=L.marker([target.lat,target.lon],{icon:icon("summary-meta"),zIndexOffset:1400}).addTo(map);
    marker.bindPopup("<div class='summary-popup'><h3>Cel końcowy</h3><p><b>"+esc(target.name)+"</b></p></div>",{maxWidth:360});
    solutionMarkers.push(marker);
  }
  const allMapPoints=[...routePoints,...solved.map(x=>x.point),target].filter(Boolean);
  if(allMapPoints.length>1)map.fitBounds(allMapPoints.map(p=>[p.lat,p.lon]),{padding:[70,70],maxZoom:15});
  const rows=solved.map(x=>"<div class='summary-mission-row'><b>"+esc(x.point.name)+"</b><span>"+esc(x.task.text)+(x.done?" · ✓ zaliczona":" · rozwiązanie")+"</span></div>").join("");
  revealEl.innerHTML="<div class='finish-message'><div class='finish-kicker'>PODDAŁEŚ SIĘ</div><h2>Rozwiązanie gry</h2><p class='solution-note'>Na mapie pokazano Twoją trasę oraz punkty będące rozwiązaniami misji i punkt końcowy.</p><div class='summary-missions-list'>"+rows+"</div><div class='finish-actions'><button id='hideSolution' class='summary-hide'>UKRYJ ROZWIĄZANIE</button><button id='restart' class='summary-restart'>NOWA GRA</button></div></div>";
  revealEl.className="reveal finish-reveal";
  revealEl.style.zIndex="1400";
  revealEl.style.bottom="auto";
  revealEl.style.top="50%";
  document.getElementById("hideSolution").onclick=()=>{
    revealEl.classList.add("hidden");
    revealEl.classList.remove("finish-reveal");
    revealEl.style.zIndex="";revealEl.style.top="";revealEl.style.bottom="";
    clearSolutionMarkers();
  };
  document.getElementById("restart").onclick=()=>location.reload();
}
function findTaskByType(type){return activeTasks.find(t=>t.type===type)}
function shortestGamePath(start,target,maxDepth=10){
  if(!start||!target)return null;
  const queue=[{p:start,seen:new Set([start.id]),depth:0}],seenStates=new Set();
  let examined=0;
  while(queue.length&&examined<5000){
    const state=queue.shift(),key=state.p.id+"|"+[...state.seen].sort((a,b)=>a-b).join(",");
    if(seenStates.has(key))continue;
    seenStates.add(key);examined++;
    if(state.p.id===target.id)return state.depth;
    if(state.depth>=maxDepth)continue;
    for(const next of moveCandidates(state.p,state.seen)){
      if(state.seen.has(next.id))continue;
      const seen=new Set(state.seen);seen.add(next.id);
      queue.push({p:next,seen,depth:state.depth+1});
    }
  }
  return null;
}
function summaryPointPopup(p){
  const hits=(missionHits.get(p.id)||[]).map(type=>findTaskByType(type)).filter(Boolean);
  let h="<div class='summary-popup'><h3>"+esc(p.name)+"</h3>";
  if(hits.length){
    h+="<div class='summary-missions'><b>Zaliczone misje:</b>";
    hits.forEach(t=>{h+="<div class='summary-mission'>✓ "+esc(t.text)+"</div>"});
    h+="</div>";
  }
  if(p.date)h+="<p><b>Data budowy:</b> "+esc(p.date)+"</p>";
  if(p.architect)h+="<p><b>Architekt / projektant:</b> "+esc(p.architect)+"</p>";
  if(p.notes)h+="<p><b>Informacje:</b><br>"+esc(p.notes).replace(/\n/g,"<br>")+"</p>";
  return h+"</div>";
}
function summaryYearColor(value,minYear,maxYear){
  const stops=[
    [0,[121,85,72]],
    [.25,[211,47,47]],
    [.5,[245,124,0]],
    [.75,[251,192,45]],
    [1,[67,160,71]]
  ];
  const t=maxYear===minYear?.5:Math.max(0,Math.min(1,(value-minYear)/(maxYear-minYear)));
  for(let i=0;i<stops.length-1;i++){
    const a=stops[i],b=stops[i+1];
    if(t<=b[0]){
      const q=(t-a[0])/(b[0]-a[0]),rgb=a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*q));
      return "rgb("+rgb.join(",")+")";
    }
  }
  return "rgb(67,160,71)";
}
function renderSummaryAgeRoute(){
  summaryRouteLines.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  summaryRouteLines=[];
  if(routeLine){try{map.removeLayer(routeLine)}catch(e){};routeLine=null}
  if(routePoints.length<2)return;
  const years=routePoints.map(year).filter(y=>y!==null);
  if(!years.length){
    const line=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#795548",weight:5,opacity:.95,lineCap:"round"}).addTo(map);
    summaryRouteLines.push(line);
    return;
  }
  const minYear=Math.min(...years),maxYear=Math.max(...years),fallback=(minYear+maxYear)/2;
  for(let i=1;i<routePoints.length;i++){
    const a=routePoints[i-1],b=routePoints[i];
    const ya=year(a),yb=year(b);
    const segmentYear=ya!==null&&yb!==null?(ya+yb)/2:(ya!==null?ya:(yb!==null?yb:fallback));
    const line=L.polyline([[a.lat,a.lon],[b.lat,b.lon]],{
      color:summaryYearColor(segmentYear,minYear,maxYear),
      weight:6,
      opacity:.95,
      lineCap:"round",
      lineJoin:"round"
    }).addTo(map);
    summaryRouteLines.push(line);
  }
}
function renderSummaryMap(){
  summaryMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  summaryMarkers=[];
  visitedMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  visitedMarkers=[];
  if(currentMarker){map.removeLayer(currentMarker);currentMarker=null}
  if(startMarker){map.removeLayer(startMarker);startMarker=null}
  if(targetMarker){map.removeLayer(targetMarker);targetMarker=null}
  renderSummaryAgeRoute();
  visitedHistory.forEach((p,i)=>{
    const isStart=p.id===gameStart?.id;
    const isMeta=p.id===target?.id;
    const isMission=(missionHits.get(p.id)||[]).length>0;
    let cls=isStart?"summary-start":isMeta?"summary-meta":isMission?"summary-mission-marker":"summary-point";
    const marker=L.marker([p.lat,p.lon],{icon:icon(cls),zIndexOffset:isStart||isMeta?1200:isMission?900:500+i}).addTo(map);
    marker.bindPopup(summaryPointPopup(p),{maxWidth:360});
    summaryMarkers.push(marker);
  });
  // Małe punkty na trasie pozostają widoczne niezależnie od koloru segmentu.
  routePoints.forEach((p,i)=>{
    const marker=L.circleMarker([p.lat,p.lon],{radius:3.5,color:"#fff",weight:1.5,fillColor:"#263238",fillOpacity:.95,interactive:false}).addTo(map);
    summaryMarkers.push(marker);
  });
  if(target&&(!visitedHistory.some(p=>p.id===target.id))){
    const marker=L.marker([target.lat,target.lon],{icon:icon("summary-meta"),zIndexOffset:1200}).addTo(map);
    summaryMarkers.push(marker);
  }
}
function approachAnalysis(startIndex,endIndex,goal){
  const route=[gameStart,...visitedHistory];
  if(!goal||startIndex<0||endIndex<=startIndex||endIndex>=route.length)return null;
  let toward=0,away=0,flat=0;
  const startDistance=distance(route[startIndex],goal);
  const endDistance=distance(route[endIndex],goal);
  for(let i=startIndex+1;i<=endIndex;i++){
    const before=distance(route[i-1],goal),after=distance(route[i],goal),delta=before-after;
    if(delta>1)toward++;
    else if(delta<-1)away++;
    else flat++;
  }
  const counted=toward+away;
  const towardPct=counted?Math.round(toward/counted*100):100;
  let verdict;
  if(away===0&&toward>0)verdict="Cały czas zbliżanie się";
  else if(toward>away)verdict="Przeważało zbliżanie się";
  else if(away>toward)verdict="Przeważało oddalanie się";
  else verdict="Tyle samo zbliżeń co oddaleń";
  return {startDistance,endDistance,toward,away,flat,towardPct,verdict,moves:endIndex-startIndex};
}
function summaryProgress(){
  const route=[gameStart,...visitedHistory],values=[];let lastIndex=0;
  activeTasks.filter(t=>completed.has(t.type)).forEach(t=>{
    const hit=visitedHistory.findIndex(p=>(missionHits.get(p.id)||[]).includes(t.type));if(hit<0)return;
    const end=hit+1,previous=lastIndex,point=route[end];if(end<previous)return;
    const a=approachAnalysis(previous,end,point);if(a)values.push(a.towardPct);lastIndex=end;
  });
  const targetIndex=route.findIndex(p=>p.id===target?.id);
  if(targetIndex>lastIndex){const a=approachAnalysis(lastIndex,targetIndex,target);if(a)values.push(a.towardPct)}
  if(!values.length)return "";
  return "<div class='summary-progress'><div class='summary-progress-title'>Czy zbliżałeś się do rozwiązań?</div><div class='summary-progress-compact'>W kolejnych etapach: <b>"+values.join("% · ")+"%</b></div></div>";
}
function reveal(p){
  const hits=activeTasks.filter(t=>!completed.has(t.type)&&t.test(p)&&p.id!==target?.id);
  const reachedFinish=!!(target&&p.id===target.id);
  const completesPremium=hits.length>0&&activeTasks.every(t=>completed.has(t.type)||hits.some(h=>h.type===t.type));
  visitedHistory.push(p);

  let html="<h2>"+esc(p.name)+"</h2>";
  if(p.date)html+="<p><b>Data:</b> "+esc(p.date)+"</p>";
  if(p.architect)html+="<p><b>Architekt:</b> "+esc(p.architect)+"</p>";

  if(hits.length){
    hits.forEach(h=>{html+="<div class='match'>✓ "+esc(h.text)+"</div>"});
    missionHits.set(p.id,[...(missionHits.get(p.id)||[]),...hits.map(h=>h.type)]);
    html="<div class='success-message'>"+
      "<div class='success-kicker'>BRAWO!</div>"+
      "<h2>Misja zaliczona</h2>"+
      "<p>Dotarłeś do <b>"+esc(p.name)+"</b>, który spełnia misję:</p>"+
      hits.map(h=>"<div class='success-mission'>"+esc(h.text)+"</div>").join("")+
      (completesPremium?
        "<div class='premium-start-message'>"+
          "<div class='premium-start-kicker'>✨ TERAZ COŚ SPECJALNEGO!</div>"+
          "<p>Wszystkie misje zostały ukończone.</p>"+
          "<p>Wycieczka w stronę wskazanego adresu:</p>"+
          "<div class='premium-start-target'><b>"+esc(target?.name||"celu")+"</b></div>"+
          "<p>Eksploruj i finiszuj owocnie.</p>"+
        "</div>":"")+
      "</div>";
  }else if(reachedFinish&&completed.size===activeTasks.length){
    html="<div class='success-message'><div class='success-kicker'>BRAWO!</div><h2>Meta osiągnięta</h2><p>Dotarłeś do <b>"+esc(p.name)+"</b>, który jest metą.</p></div>";
  }

  revealEl.innerHTML=html+"<div class='reveal-auto'>Okno zamknie się automatycznie…</div>";
  revealEl.classList.remove("hidden");
  choiceLocked=true;

  const revealDuration=(hits.length||reachedFinish)?(completesPremium?5000:3000):1500;

  window.setTimeout(()=>{
    if(!revealEl.classList.contains("hidden"))revealEl.classList.add("hidden");
    choiceLocked=false;
    updateProgress();

    if(completed.size===activeTasks.length&&!premiumShown){
      premiumShown=true;
      updatePremiumHint();
      if(visited.has(target.id)){
        finish();
        return;
      }
    }

    if(current.id===target.id){
      if(completed.size===activeTasks.length)finish();
      else statusEl.textContent="Jeszcze za szybko na metę, zalicz wszystkie misje";
    }
  },revealDuration);

  hits.forEach(h=>completed.add(h.type));
  updateTagCloud();
}
function singleChooseBase(p){
  const premiumActive=completed.size===activeTasks.length&&!!target;
  if(premiumActive&&target){premiumStats.choices++;if(p.premiumBest||isTargetPoint(p))premiumStats.goodChoices++}
  choiceEl.classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];clearSearchZone();
  document.querySelector(".controls").classList.remove("direction-hidden");statusEl.style.cursor="";statusEl.title="";
  current=p;visited.add(p.id);moves++;routePoints.push(p);updateVisitedLabels();updateRoute();setCurrent(p);showExactDateHintPopup();
  document.querySelector(".choice-title").textContent="Wybierz kierunek wycieczki";choiceEl.classList.add("direction-choice-empty");
  document.querySelector(".choice-buttons").style.display="none";document.getElementById("choiceA").textContent="";document.getElementById("choiceB").textContent="";
  choiceEl.classList.remove("hidden");reveal(p);updatePremiumHint();
  if(premiumActive)showPremiumChoiceFeedback(p);
}
function showPremiumChoiceFeedback(p){
  if(!target||!current)return;
  const directionGood=premiumStats.lastDirectionGood;
  const pointGood=!!(p.premiumBest||isTargetPoint(p));
  const directionPct=premiumStats.directions?Math.round(premiumStats.goodDirections/premiumStats.directions*100):0;
  const choicePct=premiumStats.choices?Math.round(premiumStats.goodChoices/premiumStats.choices*100):0;
  let headline="",detail="";
  if(directionGood&&pointGood){
    headline="👍 Dobry kierunek!";
    detail="Zgodność kierunków <b>"+directionPct+"%</b><br>Wybrałeś punkt, który prowadzi najkrótszą drogą do mety.";
  }else if(directionGood){
    headline="👍 Dobry kierunek";
    detail="Zgodność kierunków <b>"+directionPct+"%</b><br>Można było wybrać punkt jeszcze lepiej prowadzący do mety.";
  }else if(pointGood){
    headline="↗ Dobry wybór punktu";
    detail="Ten punkt prowadzi najkrótszą drogą do mety, choć kierunek mógł być lepszy.";
  }else{
    headline="↪ Kierunek oddala od mety";
    detail="Zgodność kierunków <b>"+directionPct+"%</b> · dobre wybory punktów <b>"+choicePct+"%</b>.";
  }
  revealEl.innerHTML="<div class='premium-choice-feedback'><div class='premium-choice-headline'>"+headline+"</div><div>"+detail+"</div><div class='premium-choice-close'>Dotknij, aby zamknąć</div></div>";
  revealEl.className="reveal premium-choice-reveal";
  revealEl.style.zIndex="1600";
  revealEl.style.bottom="auto";
  revealEl.style.top="50%";
  const close=()=>{
    if(!revealEl.classList.contains("premium-choice-reveal"))return;
    revealEl.classList.add("hidden");
    revealEl.classList.remove("premium-choice-reveal");
    revealEl.style.zIndex="";
    revealEl.style.top="";
    revealEl.style.bottom="";
    revealEl.onclick=null;
  };
  revealEl.onclick=close;
  window.setTimeout(close,3000);
}
function summaryTripDistance(){return routePoints.reduce((sum,p,i)=>i?sum+distance(routePoints[i-1],p):0,0)/1000}
function openTripInfo(){
  revealEl.innerHTML="<div class='trip-info-popup'><button id='closeTripInfo' class='trip-info-close' type='button' aria-label='Zamknij'>×</button><h3>🚲 O wycieczce</h3><p>Trasa naszej wycieczki nadaje się na wycieczkę rowerową.</p><p>Autor strony zna przewodnika, który może takie wycieczki zorganizować.</p></div>";
  revealEl.className="reveal trip-info-reveal";revealEl.style.zIndex="1500";revealEl.style.bottom="auto";revealEl.style.top="50%";
  document.getElementById("closeTripInfo").onclick=()=>{revealEl.className="reveal hidden";revealEl.style.zIndex="";revealEl.style.top="";revealEl.style.bottom=""};
}
function summaryMissionPanelHtml(){
  const missionSummary=activeTasks.filter(t=>completed.has(t.type)).map(t=>{const p=visitedHistory.find(x=>(missionHits.get(x.id)||[]).includes(t.type));return "<div class='summary-mission-row'><b>"+esc(p?.name||"Odwiedzony obiekt")+"</b><span>"+esc(t.text)+"</span></div>"}).join("");
  return "<div class='summary-panel-kicker'>GRA ZALICZONA</div><div class='summary-panel-title'>Zaliczone misje:</div>"+missionSummary+"<div class='summary-trip-distance'>Odległość wycieczki: <b>"+summaryTripDistance().toFixed(1)+" km</b></div><button id='tripInfoBtn' class='trip-info-btn' type='button'>🚲 O trasie</button>"+summaryProgress()+"<button id='summaryRestart' class='summary-restart-panel' type='button'>ZACZNIJ OD NOWA</button>";
}
function showFinishInMissionPanel(){
  const missionPanel=document.querySelector(".mission");
  if(!missionPanel)return;
  missionPanel.classList.remove("hidden");
  missionPanel.classList.add("summary-mode");
  missionEl.innerHTML=summaryMissionPanelHtml();
  tasksEl.innerHTML="<div class='summary-panel-note'>Kolor trasy pokazuje wiek odwiedzonych obiektów: od najstarszych do najnowszych.</div>";
  progressEl.textContent="Odwiedzone: "+visited.size+" • Ruchy: "+moves;
  const tagCloud=document.getElementById("tagCloud");
  if(tagCloud)tagCloud.classList.add("hidden");
}
function finish(){
  document.querySelectorAll(".summary-overlay,.summary-card").forEach(el=>el.remove());
  choiceEl.classList.add("hidden");
  candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];
  const missionPanel=document.querySelector(".mission");
  if(missionPanel)missionPanel.classList.add("hidden");
  const tagCloud=document.getElementById("tagCloud");
  if(tagCloud)tagCloud.classList.add("hidden");
  renderSummaryMap();
  if(routePoints.length>1)map.fitBounds(routePoints.map(p=>[p.lat,p.lon]),{padding:[70,70],maxZoom:15});
  showFinishInMissionPanel();
  const restart=document.getElementById("summaryRestart");
  if(restart)restart.onclick=()=>location.reload();const tripInfo=document.getElementById("tripInfoBtn");if(tripInfo)tripInfo.onclick=openTripInfo;
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
  const limits=target?missionCoverageLimits(gameStart||current,target):null;
  const targets=points.filter(p=>{
    if(p.id===current.id||visited.has(p.id)||!t.test(p))return false;
    if(!limits)return true;
    return distance(gameStart||current,p)<=limits.startMax&&distance(p,target)<=limits.targetMax;
  });
  if(!targets.length)return ' <span class="heat heat-snow heat-small" title="Brak dostępnego punktu">❄️</span><small class="heat-range">brak dostępnego</small>';
  const nearest=Math.min(...targets.map(p=>distance(current,p)));
  if(nearest<=200)return ' <span class="heat heat-fire heat-large">🔥</span><small class="heat-range">do 200 m</small>';
  if(nearest<=700)return ' <span class="heat heat-fire heat-medium">🔥</span><small class="heat-range">200–700 m</small>';
  if(nearest<=1000)return ' <span class="heat heat-fire heat-small">🔥</span><small class="heat-range">700 m–1 km</small>';
  if(nearest<=2000)return ' <span class="heat heat-snow heat-small">❄️</span><small class="heat-range">1–2 km</small>';
  if(nearest<=3000)return ' <span class="heat heat-snow heat-medium">❄️</span><small class="heat-range">2–3 km</small>';
  return ' <span class="heat heat-snow heat-large">❄️</span><small class="heat-range">ponad 3 km</small>';
}
function updateMoveInfo(stage){
  if(instructionTimer){clearTimeout(instructionTimer);instructionTimer=null}
  movesEl.classList.remove("instruction-visible");
  movesEl.classList.add("instruction-hidden");
  let text="";
  if(stage===0)text="Teraz za pomocą strzałek wybierz kierunek.";
  else if(stage===1 || stage===2)return;
  else {movesEl.textContent="Ruchy: "+moves;return}
  movesEl.textContent=text;
  requestAnimationFrame(()=>movesEl.classList.add("instruction-visible"));
  instructionTimer=setTimeout(()=>{movesEl.classList.remove("instruction-visible");movesEl.classList.add("instruction-hidden");instructionTimer=null},2500);
}
function updateProgress(){
  const done=activeTasks.filter(t=>completed.has(t.type)).length;
  progressEl.textContent="Misje do zaliczenia · "+done+"/"+activeTasks.length;
  const autoHintTask=settings.hints?activeTasks.find(t=>!completed.has(t.type)&&taskAwayStreak(t)===3):null;
  tasksEl.innerHTML=activeTasks.map(t=>{
    const doneTask=completed.has(t.type);
    const hint=!doneTask&&t===autoHintTask?taskHintHtml(t):"";
    return '<div class="'+(doneTask?"task-done":"")+'"><span class="task-text">'+(doneTask?"✓":"▸")+" "+esc(t.text)+'</span>'+(doneTask?"":(hint||missionHeat(t)))+'</div>';
  }).join("");
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function getGpsStartPoint(){
  if(!window.isSecureContext&&location.hostname!=="localhost"&&location.hostname!=="127.0.0.1")throw new Error("Lokalizacja działa tylko na stronie HTTPS. Otwórz grę przez bezpieczny adres https://.");if(!navigator.geolocation)throw new Error("Ta przeglądarka nie udostępnia lokalizacji GPS.");
  statusEl.textContent="Pobieram lokalizację tylko na potrzeby wyboru startu…";
  movesEl.textContent="Lokalizacja jest używana jednorazowo do znalezienia najbliższego punktu.";
  const position=await new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:10000});
  });
  const raw={lat:position.coords.latitude,lon:position.coords.longitude};
  const nearest=nearestPointToMapClick({lat:raw.lat,lng:raw.lon});
  if(!nearest)throw new Error("Nie znaleziono punktu startowego w bazie.");
  const gpsDistance=distance(raw,nearest);
  gpsStartSelected=nearest;
  return {point:nearest,distance:gpsDistance};
}
function resetPremiumStats(){premiumStats={directions:0,goodDirections:0,choices:0,goodChoices:0,lastDirectionGood:false}}
function premiumDirectionIsGood(dir){return !!(target&&current&&angleDiff(bearing(current,target),dirAngle(dir))<=45)}
function premiumChoiceScore(p){return target&&p?distance(p,target):Infinity}
function premiumLiveMessage(){
  if(!target||!current)return "";
  const directionPct=premiumStats.directions?Math.round(premiumStats.goodDirections/premiumStats.directions*100):0;
  const choicePct=premiumStats.choices?Math.round(premiumStats.goodChoices/premiumStats.choices*100):0;
  const d=distance(current,target);
  if(d<=250)return "🔥 META JEST BARDZO BLISKO — wybieraj punkt prowadzący najkrótszą drogą.";
  if(premiumStats.directions&&premiumStats.lastDirectionGood)return "👍 Dobry kierunek! Zgodność kierunków: <b>"+directionPct+"%</b> · dobry wybór punktu: <b>"+choicePct+"%</b>.";
  if(premiumStats.directions)return "↪ Ten kierunek oddala od najlepszego kursu. Zgodność kierunków: <b>"+directionPct+"%</b> · dobry wybór punktu: <b>"+choicePct+"%</b>.";
  return "🎯 Część premium: wybierz kierunek możliwie zgodny z kierunkiem do mety.";
}
async function singleStartBase(){
  if(choiceLocked)return;
  choiceLocked=true;
  const startBtn=document.getElementById("startBtn");
  startBtn.disabled=true;
  startBtn.textContent="PRZYGOTOWYWANIE…";
  const customMode=settings.startCity==="custom"&&!!customStartSelected;const gpsMode=settings.startCity==="gps";
  if(customMode){
    statusEl.textContent="✓ START ZAZNACZONY. Teraz układam trasę i dobieram misje w jego okolicy…";
    movesEl.textContent="Przygotowuję trasę od wybranego miejsca. Mapa za chwilę pokaże gotowy start.";
    missionEl.innerHTML="<div class='mission-loading'>Ładowanie misji do zaliczenia…</div>";
  }else{
    statusEl.textContent="Trwa przygotowanie gry i wyszukiwanie możliwej trasy. To może potrwać około 10 sekund.";
    movesEl.textContent="Przygotowanie gry — może potrwać około 10 sekund…";
  }
  await new Promise(r=>setTimeout(r,40));
  if(gpsMode&&!gpsStartSelected){
    try{
      const gps=await getGpsStartPoint();
      customStartSelected=gps.point;
      statusEl.textContent="✓ Najbliższy punkt startowy: "+gps.point.name+" ("+(gps.distance<1000?Math.round(gps.distance)+" m":(gps.distance/1000).toFixed(1)+" km")+" od lokalizacji). GPS nie będzie już używany podczas gry.";
      await new Promise(r=>setTimeout(r,250));
    }catch(e){
      choiceLocked=false;statusEl.textContent="Nie udało się pobrać lokalizacji: "+(e?.message||"brak dostępu do GPS")+".";movesEl.textContent="GPS jest używany tylko do jednorazowego wyboru startu.";
      startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ";return;
    }
  }
  document.getElementById("start").classList.add("hidden");
  candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];
  clearSearchZone();
  visitedMarkers.forEach(m=>map.removeLayer(m));visitedMarkers=[];
  if(routeLine){map.removeLayer(routeLine);routeLine=null}
  if(targetMarker){map.removeLayer(targetMarker);targetMarker=null}
  if(startMarker){map.removeLayer(startMarker);startMarker=null}
  if(currentMarker){map.removeLayer(currentMarker);currentMarker=null}
  routePoints=[];
  routePointMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
  routePointMarkers=[];
  moves=0;visited=new Set();visitedHistory=[];completed=new Set();missionHits=new Map();activeTasks=[];premiumShown=false;exactDateHintSeen=new Set();resetPremiumStats();
  if(customStartPickHandler){map.off("click",customStartPickHandler);customStartPickHandler=null}
  map.getContainer().classList.remove("custom-start-pick");
  applyRandomGameSettings();
  missionSearchRadius=3000;
  missionSearchFallback=false;
  missionEl.innerHTML="<div class='mission-loading'>Ładowanie misji do zaliczenia…</div>";
  await new Promise(r=>setTimeout(r,40));
  let audited=null;
  // Start, meta i misje są dobierane wyłącznie na podstawie odległości.
  // Nie liczymy tutaj żadnej trasy, zakrętów ani grafu ruchów.
  const loadingStarted=Date.now();
  const loadingTimer=setInterval(()=>{
    const sec=Math.floor((Date.now()-loadingStarted)/1000);
    missionEl.innerHTML="<div class='mission-loading'>Ładowanie gry… <b>"+sec+" s</b></div>";
    movesEl.textContent="Dobieranie startu, mety i misji… "+sec+" s";
  },250);
  try{
    const candidateTasks=taskPoolForGame();
    if(!candidateTasks.length){
      activeTasks=[];
    }else{
      if(settings.startCity==="custom"&&!customStartSelected){
        clearInterval(loadingTimer);
        beginCustomStartPick();
        startBtn.disabled=false;
        startBtn.textContent="ROZPOCZNIJ GRĘ";
        return;
      }
      const progress=(attempt,max,start,checked,total,target,usable,radius)=>{
        const sec=Math.floor((Date.now()-loadingStarted)/1000);
        const detail=target?(" • meta "+Math.round(distance(start,target))+" m"): "";
        const count=typeof usable==="number"?(" • misje "+usable):"";
        const radiusInfo=radius?(" • promień "+(radius/1000)+" km"):"";
        missionEl.innerHTML="<div class='mission-loading'>Ładowanie gry… <b>"+sec+" s</b><br><small>Start "+attempt+"/"+max+" • sprawdzono "+(checked||0)+"/"+(total||0)+" celów"+radiusInfo+detail+count+"</small></div>";
      };
      if(settings.startCity==="custom"||settings.startCity==="gps"){
        audited=await chooseTargetForStart(customStartSelected,candidateTasks,progress);
      }else{
        audited=await chooseStartAndTarget(candidateTasks,progress);
      }
      if(audited){
        const usable=audited.usableTasks||missionCandidateTasks(candidateTasks,audited.start,audited.target);
        audited.usableTasks=usable;
        activeTasks=missionsForRoute(usable,audited.start,audited.target);
        // Przy starcie zaznaczonym ręcznie zawsze uruchamiamy najlepszą znalezioną
        // konfigurację. Dzięki temu brak pełnego losowego zestawu nie tworzy pętli
        // „ekran startowy → zaznaczenie → ekran startowy”.
        if((settings.startCity==="custom"||settings.startCity==="gps")&&activeTasks.length===0){
          audited=null;
        }
      }
    }
  }finally{
    clearInterval(loadingTimer);
  }
  if(settings.startCity==="custom"||settings.startCity==="gps")customStartSelected=null;gpsStartSelected=null;
  if(!audited){
    choiceLocked=false;
    missionEl.innerHTML="";
    const radiusText=(settings.distanceRange||"random")==="0-3"?"3–10 km od wybranego startu":"dla wybranych ustawień";
    statusEl.textContent="Nie udało się znaleźć pełnego zestawu misji "+radiusText+". Spróbuj innego miejsca startu, zakresu odległości lub ustawień misji.";
    movesEl.textContent="Gra nie została uruchomiona — nie znaleziono wymaganej liczby odpowiednich punktów.";
    document.getElementById("start").classList.remove("hidden");
    startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ";
    return;
  }
  current=audited.start;gameStart=audited.start;target=audited.target;gameDistance=distance(current,target);document.body.classList.add("gameplay-active");
  if(customStartMarker){try{map.removeLayer(customStartMarker)}catch(e){}customStartMarker=null}
  routePoints=[current];updateRoute();missionEl.innerHTML="";updateProgress();
  if(missionSearchFallback){
    statusEl.textContent="⚠️ W rejonie wybranego startu nie udało się znaleźć wszystkich misji w promieniu 3 km. Rozszerzyłem promień wyszukiwania do "+(audited.missionRadius/1000)+" km, dlatego część punktów może być dalej od startu.";
  }else{
    statusEl.textContent="Wybierz kierunek strzałką.";
  }
  startMarker=L.marker([current.lat,current.lon],{icon:icon("start-marker"),zIndexOffset:1100}).addTo(map);
  setCurrent(current,true);targetMarker=null;
  if(activeTasks.length===0){
    choiceLocked=false;
    statusEl.textContent="Nie udało się przygotować żadnej misji. Włącz co najmniej jedną kategorię misji w ustawieniach i rozpocznij nową grę.";
    document.getElementById("settings").classList.remove("hidden");
  }else{
    if(!missionSearchFallback)statusEl.textContent="Wybierz kierunek strzałką.";
    document.querySelector(".choice-title").textContent="Wybierz kierunek wycieczki";
    choiceEl.classList.add("direction-choice-empty");
    document.querySelector(".choice-buttons").style.display="none";
    document.getElementById("choiceA").textContent="";document.getElementById("choiceB").textContent="";
    choiceEl.classList.remove("hidden");updateMoveInfo(0);choiceLocked=false;
  }
  startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ";
}function startFooterCycle(){const footer=document.getElementById("map-footer");if(!footer)return;setTimeout(()=>footer.classList.add("footer-hidden"),5000);setInterval(()=>{footer.classList.remove("footer-hidden");setTimeout(()=>footer.classList.add("footer-hidden"),5000)},180000)}
async function init(){try{startFooterCycle();if(typeof L==="undefined")throw new Error("Leaflet nie został załadowany");const mapEl=document.getElementById("map");if(!mapEl)throw new Error("Brak elementu mapy");map=L.map(mapEl,{zoomControl:false}).setView([54.38,18.62],12);if(!map||typeof map.addLayer!=="function")throw new Error("Nie udało się utworzyć mapy Leaflet");L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);loadSettings();updateMoveInfo(0);document.getElementById("startBtn").onclick=start;document.getElementById("settingsBtn").onclick=openSettings;document.getElementById("duelStartBtn").onclick=duelConfirmSetup;
document.getElementById("startSettingsBtn").onclick=openSettings;
document.getElementById("randomCategories").addEventListener("change",syncCategoryMode);
document.getElementById("surrenderSettings").onclick=showSolution;movesEl.addEventListener("click",()=>{if(instructionTimer){clearTimeout(instructionTimer);instructionTimer=null}movesEl.classList.remove("instruction-visible");movesEl.classList.add("instruction-hidden")});const tagToggle=document.getElementById("tagToggle"),tagCloud=document.getElementById("tagCloud");if(tagToggle&&tagCloud)tagToggle.onclick=()=>tagCloud.classList.toggle("closed");updateTagCloud();statusEl.addEventListener("click",()=>{if(!searchZone)return;searchZone.setStyle({fillOpacity:searchZone.options.fillOpacity>0?0:.14,opacity:searchZone.options.opacity>0?0:.9})});document.getElementById("saveSettings").onclick=async()=>{const btn=document.getElementById("saveSettings");btn.disabled=true;btn.textContent="ZAPISYWANIE…";statusEl.textContent="Trwa zapisywanie ustawień…";await new Promise(r=>setTimeout(r,350));saveSettings();document.getElementById("settings").classList.add("hidden");btn.disabled=false;btn.textContent="ZAPISZ";if(document.getElementById("start").classList.contains("hidden")){await start()}else statusEl.textContent="Ustawienia zapisane. Kliknij „ROZPOCZNIJ GRĘ”.";};document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>showCandidates(b.dataset.dir));document.addEventListener("keydown",e=>{const d={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[e.key];if(d){e.preventDefault();showCandidates(d)}});try{if(typeof Papa==="undefined")throw Error("Nie załadowano parsera CSV");const r=await fetch(DATA_URL,{cache:"no-store"});if(!r.ok)throw Error("Arkusz Google zwrócił HTTP "+r.status);const csv=await r.text();const parsed=Papa.parse(csv,{header:true,skipEmptyLines:true});if(parsed.errors?.length)console.warn("Ostrzeżenia CSV:",parsed.errors);points=parseSheetRows(parsed.data);updateCategoryCounts();if(points.length<20)throw Error("Za mało poprawnych punktów GPS w arkuszu");statusEl.textContent="Załadowano "+points.length+" punktów z Google Sheets (wierszy CSV: "+parsed.data.length+")."}catch(e){console.error("Błąd ładowania Google Sheets:",e);statusEl.textContent="Błąd danych: "+e.message}try{if(L.control&&L.control.scale) L.control.scale({imperial:false,metric:true,position:"bottomleft"}).addTo(map)}catch(e){console.warn("Kontrolka skali pominięta:",e)} }catch(e){console.error("Błąd inicjalizacji gry:",e);statusEl.textContent="BŁĄD MAPY: "+e.message;statusEl.title=e.stack||"";document.getElementById("start").classList.remove("hidden")}}
/* V65 — TRYB 2 GRACZY: wspólna misja, osobne trasy, naprzemienne tury */
let duel=null, duelNamesPending=false, duelPrepared=false, duelConfig=null;
const singleStartOriginal=singleStartBase, singleShowCandidatesOriginal=singleShowCandidatesBase, singleChooseOriginal=singleChooseBase;
const singleLoadSettingsOriginal=singleLoadSettingsBase, singleSaveSettingsOriginal=singleSaveSettingsBase, singleOpenSettingsOriginal=singleOpenSettingsBase;

function duelIsActive(){return !!duel?.active}
function duelPlayer(){return duel?.players?.[duel.activePlayer]||null}
function duelSetStatus(html){statusEl.innerHTML=html||""}
function duelRouteStyle(p){return {color:p.color,weight:5,opacity:.95,dashArray:"8 8",lineCap:"round",lineJoin:"round"}}
function duelMarkerIcon(p,type){
  if(type==="start")return L.divIcon({className:"duel-start-marker",html:"<div style='color:"+p.color+"'>⚑</div>",iconSize:[30,30],iconAnchor:[15,15]});
  return L.divIcon({className:"duel-current-marker",html:"<div style='background:"+p.color+"'></div>",iconSize:[22,22],iconAnchor:[11,11]});
}
function duelRemoveLayer(layer){if(layer){try{map.removeLayer(layer)}catch(e){}}}
function duelRenderPlayer(p){
  duelRemoveLayer(p.routeLine);
  p.routeLine=L.polyline(p.routePoints.map(x=>[x.lat,x.lon]),duelRouteStyle(p)).addTo(map);
  (p.routePointMarkers||[]).forEach(duelRemoveLayer);p.routePointMarkers=[];
  p.routePoints.forEach((x,i)=>{
    const m=L.circleMarker([x.lat,x.lon],{radius:3.5,color:"#fff",weight:1.5,fillColor:p.color,fillOpacity:.95,interactive:false,zIndexOffset:300+i}).addTo(map);
    p.routePointMarkers.push(m);
  });
  duelRemoveLayer(p.currentMarker);
  p.currentMarker=L.marker([p.current.lat,p.current.lon],{icon:duelMarkerIcon(p,"current"),zIndexOffset:1200}).addTo(map);
  const samePlace=duel.players.some(other=>other!==p&&other.current&&distance(other.current,p.current)<2);
  const labelDirection=samePlace?(p===duel.players[0]?"top":"bottom"):"top";
  p.currentMarker.bindTooltip(p.name+" • "+(p===duelPlayer()?"TU JESTEŚ":"pozycja"),{permanent:true,direction:labelDirection,offset:labelDirection==="bottom"?[0,8]:[0,-8],className:"duel-current-label"});
}
function duelRenderMap(){
  if(!duel)return;
  duel.players.forEach(duelRenderPlayer);
  const all=duel.players.flatMap(p=>[...p.routePoints,p.current]).filter(Boolean);
  if(all.length>1)requestAnimationFrame(()=>{
    map.invalidateSize({pan:false});
    const mr=map.getContainer().getBoundingClientRect();
    const missionPanel=document.querySelector(".mission"),choicePanel=document.getElementById("choice");
    const top=Math.max(35,missionPanel?Math.round(missionPanel.getBoundingClientRect().bottom-mr.top+18):35);
    const bottom=Math.max(35,choicePanel?Math.round(mr.bottom-choicePanel.getBoundingClientRect().top+18):35);
    map.fitBounds(L.latLngBounds(all.map(x=>[x.lat,x.lon])),{paddingTopLeft:[24,top],paddingBottomRight:[24,bottom],maxZoom:16,animate:true,duration:.35});
  });
}
function duelRemoveSingleLayers(){
  [routeLine,currentMarker,startMarker,targetMarker].forEach(duelRemoveLayer);
  routeLine=null;currentMarker=null;startMarker=null;targetMarker=null;
  candidateMarkers.forEach(duelRemoveLayer);candidateMarkers=[];
  clearSearchZone();visitedMarkers.forEach(duelRemoveLayer);visitedMarkers=[];
}
function duelMissionDistanceInfo(){
  const p=duelPlayer(),m=duel?.mission;
  if(!p||!m)return "";
  const targets=points.filter(x=>x.id!==p.current.id&&!p.visited.has(x.id)&&m.test(x));
  if(!targets.length)return '<span class="duel-mission-distance"><span class="duel-mission-distance-icon">❄️</span><span>brak dostępnego punktu</span></span>';
  const nearest=Math.min(...targets.map(x=>distance(p.current,x)));
  let icon="❄️",label="ponad 3 km";
  if(nearest<=200){icon="🔥";label="do 200 m";}
  else if(nearest<=700){icon="🔥";label="200–700 m";}
  else if(nearest<=1000){icon="🔥";label="700 m–1 km";}
  else if(nearest<=2000){label="1–2 km";}
  else if(nearest<=3000){icon="❄️";label="2–3 km";}
  return '<span class="duel-mission-distance"><span class="duel-mission-distance-icon">'+icon+'</span><span>najbliższy pasujący punkt: '+label+'</span></span>';
}
function duelMissionHtml(){
  const m=duel?.mission;if(!m)return "";
  const p=duelPlayer(),a=duel.players[0],b=duel.players[1];
  return "<div class='duel-round'>RUNDA "+duel.round+" / "+duel.totalRounds+"</div>"+
    "<div class='duel-score'><span style='color:#2e7d32'>"+esc(a.name)+" "+a.score+"</span><b> : </b><span style='color:#c62828'>"+esc(b.name)+" "+b.score+"</span></div>"+
    "<div class='duel-turn' style='color:"+p.color+"'>TERAZ GRA: "+esc(p.name)+"</div>"+
    "<div class='duel-mission-text'>"+esc(m.text)+"</div>"+
    duelMissionDistanceInfo();
}
function duelUpdatePanel(){
  if(!duel)return;
  missionEl.innerHTML=duelMissionHtml();
  tasksEl.innerHTML="<div class='duel-help'>Ta runda ma jedną wspólną misję. Znajdź dowolny obiekt spełniający zadanie.</div>";
  progressEl.textContent="Punkty: "+duel.players[0].score+" : "+duel.players[1].score;
  movesEl.textContent="Tura: "+duelPlayer().name+" • ruchy: "+duelPlayer().moves;
}
function duelZoom(){
  if(!duel)return;
  const all=duel.players.flatMap(p=>p.routePoints).filter(Boolean);
  if(all.length<2)return;
  requestAnimationFrame(()=>map.fitBounds(L.latLngBounds(all.map(x=>[x.lat,x.lon])),{padding:[90,90],maxZoom:16,animate:true,duration:.35}));
}
function duelPassScreen(){
  const p=duelPlayer();
  revealEl.innerHTML="<div class='duel-pass'><div class='duel-pass-kicker'>TERAZ RUCH WYKONUJE "+esc(p.name).toUpperCase()+"</div><h2 style='color:"+p.color+"'>"+esc(p.name)+"</h2><p>Wybierz za pomocą strzałek kierunek trasy a następnie wybierz punkt, który przybliży Cię do celu</p><button id='duelContinue'>OK. IDĘ DALEJ</button></div>";
  revealEl.className="reveal duel-reveal";revealEl.classList.remove("hidden");
  document.getElementById("duelContinue").onclick=()=>{
    revealEl.classList.add("hidden");revealEl.className="reveal hidden";
    choiceLocked=false;duelUpdatePanel();
  };
}
function duelBeginRound(index,startPlayer,startPoint=null){
  duel.round=index+1;
  duel.mission=duel.missions[index];
  duel.roundStarter=Number.isInteger(startPlayer)?startPlayer:(index%2);
  duel.activePlayer=duel.roundStarter;
  if(startPoint){
    duel.players.forEach(p=>{
      p.start=startPoint;
      p.current=startPoint;
      p.visited=new Set([startPoint.id]);
      p.visitedHistory=[startPoint];
      p.routePoints=[startPoint];
      p.roundMoves=0;
    });
    current=startPoint;
    visited=new Set([startPoint.id]);
    visitedHistory=[startPoint];
    moves=0;
  }else{
    duel.players.forEach(p=>{p.roundMoves=0});
  }
  duelUpdatePanel();duelRenderMap();
  choiceEl.classList.add("hidden");
  document.querySelector(".controls").classList.remove("direction-hidden");
  document.querySelector(".choice-buttons").style.display="none";
  document.querySelector(".choice-title").textContent="Wybierz kierunek wycieczki";
  choiceLocked=false;duelPassScreen();
}
function duelFindExtraMission(){
  const used=new Set(duel.missions.map(m=>m.type));
  const pool=shuffleArray(taskPoolForGame().filter(t=>!used.has(t.type)));
  for(const t of pool){
    const has=duel.players.some(p=>points.some(x=>x.id!==p.current.id&&!p.visited.has(x.id)&&t.test(x)));
    if(has)return t;
  }
  return null;
}
function duelStartFromSingle(){
  const base=gameStart;
  const cfg=duelConfig;
  const total=Number(cfg?.totalRounds)||5;
  const missions=activeTasks.slice(0,total);
  if(!base||missions.length<total){
    settings.count=total;settings.countRandom=false;
    duelSetStatus("Nie udało się przygotować "+total+" misji. Spróbuj ponownie.");
    document.getElementById("start").classList.remove("hidden");
    choiceLocked=false;duelConfig=null;return;
  }
  duelRemoveSingleLayers();
  duel={
    active:true,totalRounds:total,round:1,mission:missions[0],missions,
    activePlayer:0,roundStarter:0,
    players:[
      {name:cfg.names[0],color:"#2e7d32",start:base,current:base,routePoints:[base],visited:new Set([base.id]),visitedHistory:[base],moves:0,roundMoves:0,score:0,routeLine:null,currentMarker:null,routePointMarkers:[]},
      {name:cfg.names[1],color:"#c62828",start:base,current:base,routePoints:[base],visited:new Set([base.id]),visitedHistory:[base],moves:0,roundMoves:0,score:0,routeLine:null,currentMarker:null,routePointMarkers:[]}
    ],
    names:cfg.names,tieBreak:false
  };
  duelConfig=null;
  gameStart=base;current=base;visited=new Set([base.id]);visitedHistory=[base];moves=0;
  activeTasks=missions;
  duelUpdatePanel();duelRenderMap();duelPassScreen();
  statusEl.textContent="Pojedynek gotowy.";
}
function duelShowSetup(){
  const box=document.getElementById("duelSetup");
  if(!box)return;
  duelNamesPending=true;
  document.getElementById("duelName1").value=settings.player1Name||"Gracz 1";
  document.getElementById("duelName2").value=settings.player2Name||"Gracz 2";
  box.classList.remove("hidden");
  setTimeout(()=>document.getElementById("duelName1")?.focus(),50);
}
function duelConfirmSetup(){
  const n1=(document.getElementById("duelName1").value||"Gracz 1").trim().slice(0,24)||"Gracz 1";
  const n2=(document.getElementById("duelName2").value||"Gracz 2").trim().slice(0,24)||"Gracz 2";
  const rounds=[3,5,7,10].includes(Number(settings.duelRounds))?Number(settings.duelRounds):5;
  settings.player1Name=n1;settings.player2Name=n2;
  duelNamesPending=false;duelPrepared=true;
  duelConfig={totalRounds:rounds,names:[n1,n2]};
  document.getElementById("duelSetup").classList.add("hidden");
  settings.count=rounds;settings.countRandom=false;
  singleStartOriginal().then(()=>{
    duelPrepared=false;
    if(gameStart&&activeTasks.length)duelStartFromSingle();
  }).catch(e=>{
    console.error(e);duelPrepared=false;duelConfig=null;choiceLocked=false;
    duelSetStatus("Błąd przygotowania pojedynku: "+esc(e.message||e));
  });
}
function start(){
  const modeEl=document.getElementById("gameMode");
  if(modeEl)settings.gameMode=modeEl.value==="duel"?"duel":"single";
  if(settings.gameMode!=="duel")return singleStartOriginal();
  if(duelIsActive())return;
  if(duelPrepared)return singleStartOriginal();
  duelShowSetup();
}
function loadSettings(){
  singleLoadSettingsOriginal();
  settings.gameMode=settings.gameMode==="duel"?"duel":"single";
  settings.duelRounds=[3,5,7,10].includes(Number(settings.duelRounds))?Number(settings.duelRounds):5;
  settings.player1Name=settings.player1Name||"Gracz 1";
  settings.player2Name=settings.player2Name||"Gracz 2";
}
function saveSettings(){
  const restart=singleSaveSettingsOriginal();
  const mode=document.getElementById("gameMode"),rounds=document.getElementById("duelRounds");
  if(mode)settings.gameMode=mode.value==="duel"?"duel":"single";
  if(rounds)settings.duelRounds=[3,5,7,10].includes(Number(rounds.value))?Number(rounds.value):5;
  localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));
  return restart;
}
function openSettings(){
  singleOpenSettingsOriginal();
  const mode=document.getElementById("gameMode"),rounds=document.getElementById("duelRounds");
  if(mode)mode.value=settings.gameMode||"single";
  if(rounds)rounds.value=String(settings.duelRounds||5);
}
function duelDirectionCandidates(from,seen,dir){
  return directionCandidates(from,seen,dir);
}
function showCandidates(dir){
  if(!duelIsActive())return singleShowCandidatesOriginal(dir);
  if(choiceLocked)return;
  const p=duelPlayer();
  candidateMarkers.forEach(duelRemoveLayer);candidateMarkers=[];clearSearchZone();
  const a=dirAngle(dir);
  const c=duelDirectionCandidates(p.current,p.visited,dir);
  const solutions=points.filter(x=>x.id!==p.current.id&&!p.visited.has(x.id)&&duel.mission.test(x))
    .map(x=>({...x,d:distance(p.current,x),bd:bearing(p.current,x),ad:angleDiff(bearing(p.current,x),a)}))
    .filter(x=>x.d<=500&&x.ad<=45).sort((x,y)=>x.d-y.d);
  let chosen;
  if(solutions.length){
    const alternatives=c.filter(x=>x.id!==solutions[0].id).sort((x,y)=>x.d-y.d);
    chosen=[solutions[0],alternatives[0]].filter(Boolean);
  }else chosen=chooseBestPair(c);
  if(chosen.length<2){duelSetStatus("W tym kierunku nie ma dwóch dostępnych punktów — wybierz inną strzałkę.");return;}
  choiceLocked=true;
  document.querySelector(".controls").classList.add("direction-hidden");
  choiceEl.classList.remove("direction-choice-empty");
  document.querySelector(".choice-buttons").style.display="flex";
  document.querySelector(".choice-title").textContent="TURA: "+p.name+" — wybierz punkt";
  chosen.forEach((x,i)=>{
    const m=L.marker([x.lat,x.lon],{icon:icon(i?"candidate-b":"candidate-a")}).addTo(map);
    candidateMarkers.push(m);m.on("click",()=>choose(x));
    const btn=document.getElementById(i?"choiceB":"choiceA");
    btn.className=i?"choice-b":"choice-a";
    btn.innerHTML='<span class="letter">'+(i?"B":"A")+'</span> okolice '+esc(placeLabel(x));
    btn.onclick=()=>choose(x);
  });
  choiceEl.classList.remove("hidden");duelZoom();
}

function choose(p){
  if(!duelIsActive())return singleChooseOriginal(p);
  if(!choiceLocked)return;
  const pl=duelPlayer();
  choiceEl.classList.add("hidden");candidateMarkers.forEach(duelRemoveLayer);candidateMarkers=[];
  document.querySelector(".controls").classList.remove("direction-hidden");
  pl.current=p;pl.visited.add(p.id);pl.visitedHistory.push(p);pl.routePoints.push(p);pl.moves++;pl.roundMoves++;
  duelRenderMap();current=p;visited=pl.visited;visitedHistory=pl.visitedHistory;moves=pl.moves;
  if(duel.mission.test(p)){duelRoundWin(pl,p);return;}
  // W tej samej rundzie drugi gracz dostaje następną turę.
  duel.activePlayer=duel.activePlayer===0?1:0;
  choiceLocked=false;duelUpdatePanel();duelPassScreen();
}

function duelRoundWin(pl,p){
  pl.score++;
  duelRenderPlayer(pl);
  const nextIndex=duel.round;
  const nextMission=duel.missions[nextIndex];
  const nextInfo=nextMission
    ? "<p class='duel-next-mission'>Następny cel misji:<br><b>"+esc(nextMission.text)+"</b></p>"
    : "";
  missionEl.innerHTML="<div class='duel-win' style='border-color:"+pl.color+"'><div class='duel-win-kicker'>PUNKT DLA</div><h2 style='color:"+pl.color+"'>"+esc(pl.name)+"</h2><p>"+esc(p.name)+" spełnia misję:</p><b>"+esc(duel.mission.text)+"</b>"+nextInfo+"<div class='duel-score-big'>"+duel.players[0].score+" : "+duel.players[1].score+"</div></div>";
  tasksEl.innerHTML="<div class='duel-help'>Runda zakończona. Następna runda otrzyma nową, pojedynczą misję.</div>";
  progressEl.textContent="Runda "+duel.round+" zakończona";
  choiceLocked=true;
  setTimeout(()=>{
    if(duel.round>=duel.totalRounds){duelEnd();return;}
    duelBeginRound(duel.round,1-duel.roundStarter,p);
  },2200);
}

function duelEnd(){
  choiceLocked=true;
  const a=duel.players[0],b=duel.players[1],tied=a.score===b.score;
  if(tied&&!duel.tieBreak){
    const extra=duelFindExtraMission();
    if(extra){
      duel.tieBreak=true;duel.totalRounds++;duel.missions.push(extra);
      duelBeginRound(duel.round,1-duel.roundStarter);
      missionEl.innerHTML="<div class='duel-round'>RUNDA ROZSTRZYGAJĄCA</div>"+
        "<div class='duel-score'>"+esc(a.name)+" "+a.score+" : "+esc(b.name)+" "+b.score+"</div>"+
        "<div class='duel-turn' style='color:"+duelPlayer().color+"'>TERAZ GRA: "+esc(duelPlayer().name)+"</div>"+
        "<div class='duel-mission-text'>"+esc(extra.text)+"</div>";
      return;
    }
  }
  duelShowFinal(tied);
}

function duelShowFinal(tied){
  const a=duel.players[0],b=duel.players[1];
  duel.players.forEach(duelRenderPlayer);
  const all=duel.players.flatMap(p=>p.routePoints);
  if(all.length>1)map.fitBounds(L.latLngBounds(all.map(p=>[p.lat,p.lon])),{padding:[100,100],maxZoom:15});
  const headline=tied?"REMIS":"WYGRYWA";
  const winner=tied?"":(a.score>b.score?a.name:b.name);
  missionEl.innerHTML="<div class='duel-final'><div class='duel-final-kicker'>POJEDYNEK ZAKOŃCZONY</div><h2>"+headline+(winner?"<br><span style='color:"+(a.score>b.score?a.color:b.color)+"'>"+esc(winner)+"</span>":"")+"</h2><div class='duel-score-big'>"+a.score+" : "+b.score+"</div><p>"+esc(a.name)+" — "+a.moves+" ruchów<br>"+esc(b.name)+" — "+b.moves+" ruchów</p><button id='duelRestart' class='summary-restart-panel'>NOWA GRA</button></div>";
  tasksEl.innerHTML="<div class='duel-final-note'>Zielona i czerwona linia pokazują osobne trasy obu graczy. Przebieg całej gry pozostaje na mapie.</div>";
  progressEl.textContent="Koniec gry";
  choiceEl.classList.add("hidden");
  const c=document.querySelector(".controls");if(c)c.classList.add("direction-hidden");
  document.getElementById("duelRestart").onclick=()=>location.reload();
  duel.active=false;
  duelZoom();
}
function duelUpdateMapOnResize(){if(duelIsActive())duelRenderMap()}
window.addEventListener("resize",duelUpdateMapOnResize);

window.start=start;window.duelConfirmSetup=duelConfirmSetup;window.openSettings=openSettings;
init();