const SHEET_ID="1TmRHJDv6IMlGwg761JV50M8vS4zXTdWBtjDziAleSQI",DATA_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;let map,points=[],current=null,gameStart=null,target=null,visited=new Set(),moves=0,choiceLocked=false,premiumShown=false,candidateMarkers=[],currentMarker,startMarker,targetMarker,routeLine=null,routePoints=[],visitedHistory=[];const missionEl=document.getElementById("mission"),tasksEl=document.getElementById("tasks"),progressEl=document.getElementById("progress"),movesEl=document.getElementById("moves"),choiceEl=document.getElementById("choice"),revealEl=document.getElementById("reveal"),statusEl=document.getElementById("status");let activeTasks=[],completed=new Set(),missionHits=new Map(),gameDistance=0,searchZone=null,instructionTimer=null,settings={count:4,age:true,periods:true,architects:true,people:true,functions:true,names:true,history:true,institutions:true,creators:true,hints:true,revealAnswer:true,distanceRange:"random",startCity:"random"},pathGraph=null;
function getSheetVal(obj,searchStrings){const keys=Object.keys(obj||{});for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const exact=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"")===clean);if(exact&&String(obj[exact]??"").trim()!=="")return String(obj[exact]).trim()}for(const search of searchStrings){const clean=search.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"");const partial=keys.find(k=>k.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"").includes(clean));if(partial&&String(obj[partial]??"").trim()!=="")return String(obj[partial]).trim()}return""}
function parseSheetRows(data){return data.map((item,i)=>{const name=getSheetVal(item,["adres","nazwa","obiekt","name"])||"Nieznany",date=getSheetVal(item,["datawybudowania","rokbudowy","data","rok","czas","wiek"])||"",notes=getSheetVal(item,["uwagi","opis","informacje","info","inne"]),architect=getSheetVal(item,["architekt","projektant","autor"]),gps=getSheetVal(item,["pozycjagps","gps","wspolrzedne","współrzędne","lokalizacja"]);let lat,lng;if(gps){const matches=String(gps).replace(/;/g,",").match(/-?\d+[\.,]\d+/g)||[];if(matches.length>=2){lat=parseFloat(matches[0].replace(",","."));lng=parseFloat(matches[1].replace(",","."))}}if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;return{id:i,name,lat,lon:lng,raw:notes,date,architect,notes}}).filter(Boolean).filter(p=>p.lat>53.9&&p.lat<54.7&&p.lon>18.2&&p.lon<19.1)}
function year(p){const m=p.date.match(/(1[0-9]{3}|20[0-9]{2})/);return m?+m[1]:null}function distance(a,b){const R=6371000,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}function bearing(a,b){const y=Math.sin((b.lon-a.lon)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lon-a.lon)*Math.PI/180);return(Math.atan2(y,x)*180/Math.PI+360)%360}function dirAngle(d){return{up:0,right:90,down:180,left:270}[d]}function angleDiff(a,b){const d=Math.abs(a-b)%360;return d>180?360-d:d}function icon(cls){return L.divIcon({className:cls,iconSize:[28,28],iconAnchor:[14,14]})}
function setCurrent(p,showHere=true){if(currentMarker)map.removeLayer(currentMarker);currentMarker=L.marker([p.lat,p.lon],{icon:icon("current-marker"),zIndexOffset:1000}).addTo(map);if(showHere)currentMarker.bindTooltip("TU JESTEŚ",{permanent:true,direction:"top",className:"current-label"});map.panTo([p.lat,p.lon],{animate:true,duration:.5})}
function updateRoute(){if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(routePoints.map(p=>[p.lat,p.lon]),{color:"#2e7d32",weight:4,opacity:.9,dashArray:"2 8",lineCap:"round"}).addTo(map)}
function visitedLabelHtml(p,index){
  let html="<div class='visited-full'><h3>"+esc(p.name)+"</h3>";
  if(p.date)html+="<p><b>Data budowy:</b> "+esc(p.date)+"</p>";
  if(p.architect)html+="<p><b>Architekt / projektant:</b> "+esc(p.architect)+"</p>";
  if(p.notes)html+="<p><b>Informacje:</b><br>"+esc(p.notes).replace(/\n/g,"<br>")+"</p>";
  html+="</div>";
  return html;
}
function updateVisitedLabels(){
  document.querySelectorAll(".visited-point-marker").forEach(el=>el.remove());
  visitedHistory.forEach((p,i)=>{
    const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:"visited-point-marker",html:"<div>"+esc(p.date||"?")+"</div>",iconSize:[34,22],iconAnchor:[17,11]}),zIndexOffset:500+i}).addTo(map);
    marker.bindPopup(visitedLabelHtml(p,i),{closeButton:true,autoClose:true,maxWidth:340});
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
  missionEl.innerHTML="<div class='premium-title'>CZĘŚĆ PREMIUM</div><div class='premium-target'><b>Cel:</b> "+esc(target.name)+"</div><div class='premium-distance'><span class='premium-heat'>"+info.icon+"</span><span>"+info.label+"</span></div>"+suffix;
}
function revealTarget(){
  if(!target||targetMarker)return;
  targetMarker=L.marker([target.lat,target.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("META: "+esc(target.name),{permanent:true,direction:"top",className:"target-label"});
  statusEl.textContent="Jesteś nie dalej niż 500 m od mety — punkt mety został zaznaczony.";
}
function showCandidates(dir){
  if(choiceLocked)return;
  statusEl.textContent="";
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  let c=directionCandidates(current,visited,dir);
  const GOAL_UNLOCK=500;
  const goalDistance=distance(current,target),goalBearing=bearing(current,target),goalDiff=angleDiff(goalBearing,dirAngle(dir));
  if(goalDistance<=GOAL_UNLOCK&&goalDiff<=45&&!visited.has(target.id)&&!c.some(p=>p.id===target.id))
    c.push({...target,d:goalDistance,bd:goalBearing,ad:goalDiff,isTarget:true});
  const chosen=chooseBestPair(c);
  if(chosen.length<2){
    const msg="W tym kierunku nie ma dwóch dostępnych punktów — wybierz inną strzałkę.";
    statusEl.textContent=msg;
    setTimeout(()=>{if(!choiceLocked&&statusEl.textContent===msg)statusEl.textContent="Wybierz inny kierunek."},3000);
    return;
  }
  choiceLocked=true;
  document.querySelector(".choice-buttons").classList.remove("direction-choice-empty");
  // Podczas wyboru punktu ukrywamy sterowanie kierunkowe — aktywne są tylko dwa punkty A/B.
  document.querySelector(".controls").classList.add("direction-hidden");
  document.querySelector(".choice-title").textContent="Wybierz punkt";
  chosen.forEach((p,i)=>{
    const m=L.marker([p.lat,p.lon],{icon:icon(i?"candidate-b":"candidate-a")}).addTo(map);
    candidateMarkers.push(m);
    m.on("click",()=>choose(p));
    const btn=document.getElementById(i?"choiceB":"choiceA");
    btn.className=i?"choice-b":"choice-a";
    btn.innerHTML='<span class="letter">'+(i?"B":"A")+'</span> '+(p.isTarget?"META":"okolice "+esc(placeLabel(p)));
  });
  choiceEl.classList.remove("hidden");
  // Instrukcja wyboru punktu jest w dolnym panelu; nie pokazujemy dodatkowego komunikatu na środku.
  if(instructionTimer){clearTimeout(instructionTimer);instructionTimer=null}
  movesEl.classList.remove("instruction-visible");
  movesEl.classList.add("instruction-hidden");
  // Automatycznie dopasuj widok do bieżącego punktu i dwóch wariantów.
  const bounds=L.latLngBounds([[current.lat,current.lon],[chosen[0].lat,chosen[0].lon],[chosen[1].lat,chosen[1].lon]]);
  map.fitBounds(bounds,{paddingTopLeft:[20,150],paddingBottomRight:[20,115],maxZoom:16});
  document.getElementById("choiceA").onclick=()=>choose(chosen[0]);
  document.getElementById("choiceB").onclick=()=>choose(chosen[1]);
}
function loadSettings(){try{const x=JSON.parse(localStorage.getItem("trojmiastoGameSettings")||"null");if(x)settings={...settings,...x};if(!["random","0-3","3-5","5-10","10-20","20+"].includes(settings.distanceRange))settings.distanceRange="random"}catch(e){}}
function saveSettings(){const oldRange=settings.distanceRange,oldCity=settings.startCity;settings.count=+document.getElementById("missionCount").value;settings.age=document.getElementById("catAge").checked;settings.periods=document.getElementById("catPeriods").checked;settings.architects=document.getElementById("catArchitects").checked;settings.people=document.getElementById("catPeople").checked;settings.functions=document.getElementById("catFunctions").checked;settings.names=document.getElementById("catNames").checked;settings.history=document.getElementById("catHistory").checked;settings.institutions=document.getElementById("catInstitutions").checked;settings.creators=document.getElementById("catCreators").checked;settings.hints=document.getElementById("allowHints").checked;settings.revealAnswer=document.getElementById("allowReveal").checked;settings.distanceRange=document.getElementById("distanceRange").value;settings.startCity=document.getElementById("startCity").value;localStorage.setItem("trojmiastoGameSettings",JSON.stringify(settings));return oldRange!==settings.distanceRange||oldCity!==settings.startCity}
function openSettings(){document.getElementById("missionCount").value=settings.count;document.getElementById("catAge").checked=settings.age;document.getElementById("catPeriods").checked=settings.periods;document.getElementById("catArchitects").checked=settings.architects;document.getElementById("catPeople").checked=settings.people;document.getElementById("catFunctions").checked=settings.functions;document.getElementById("catNames").checked=settings.names;document.getElementById("catHistory").checked=settings.history;document.getElementById("catInstitutions").checked=settings.institutions;document.getElementById("catCreators").checked=settings.creators;document.getElementById("allowHints").checked=settings.hints;document.getElementById("allowReveal").checked=settings.revealAnswer;document.getElementById("distanceRange").value=settings.distanceRange||"random";document.getElementById("startCity").value=settings.startCity||"random";document.getElementById("settings").classList.remove("hidden")}
function missionPoints(){
  if(!gameStart||!target)return points;
  const local=points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&distance(p,gameStart)<=5000&&distance(p,target)<=5000);
  return local.length>=8?local:points.filter(p=>p.id!==gameStart.id&&p.id!==target.id&&(distance(p,gameStart)<=8000||distance(p,target)<=8000));
}
function personNames(p){
  const text=String(p.architect||"").replace(/\s+/g," ").trim();
  if(!text)return [];
  const names=[];
  text.split(/\s*(?:,|;|\/|\\|\s+i\s+|\s+oraz\s+)\s*/i).forEach(part=>{
    const name=part.replace(/^(architekt|projektant|autor|architekci|projektanci)\s*[:\\-]?\s*/i,"").trim();
    const words=name.split(/\s+/).filter(Boolean);
    if(words.length>=2 && words.every(w=>/^[A-ZĄĆĘŁŃÓŚŹŻ][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż'-]*$/.test(w))) names.push(name);
  });
  return [...new Set(names)];
}
function cleanNote(p){return String(p.notes||"").replace(/\s+/g," ").trim()}
function noteHas(p,re){return re.test(cleanNote(p))}
function missionData(p){
  const n=cleanNote(p), a=String(p.architect||"").trim();
  return {
    architects:a?personNames(p):[],
    people:n.match(/(?:mieszkał(?:a)?(?: tu)?|dla rodziny|dla [A-ZĄĆĘŁŃÓŚŹŻ][A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż'-]+|właściciel(?:a|ka)?|fundator(?:a|em)?|dla pracowników|dla [^,;]+)[^.;]*/i)?.[0]||"",
    functions:noteHas(p,/\\b(dawna|dawny|dawne|była tu|był tu|wcześniej|potem|później|przebudowana? w .*na|zajezdnia|łaźnia|szpital|hotel|kotłownia|gazownia|biurowiec|hala|ujężdżalnia|ujeżdżalnia|więzienie|policja|straż pożarna|biblioteka|dworzec|instytut|dom handlowy|dom technika|internat|schron|hangar|taksi|kino|pensjonat|dom wczasowy|zespół szkół)/i),
    names:noteHas(p,/\\b(kolonia|osiedle|falkhof|meeresstern|bratniak|zieleniec|ochota|berg|praca|jordana|schichau|przybyszewskiego|lieblingsruh|nowych szkoców|żniwne|dożynki|rzeszy|fińskich domków|słomianych wdów)/i),
    history:noteHas(p,/\\b(odbudow|oryginał|średniowie|gotyck|renesans|zniszcz|fundacj|z 1[0-9]{2}|z 14[0-9]{2}|z 15[0-9]{2}|z 16[0-9]{2}|przebudow|rozbudow|najstarsz|dawniej|wcześniej|właściwie|poprzedniczk|pierwotn)/i),
    institutions:noteHas(p,/\\b(spółdzielnia|fundacja|przedsiębiorstwo|instytut|uniwersytet|szkoła|stoczni|telekomunikacja|orange|nauczyciel|gdyńska spółdzielnia|gemeinnützige|koga|fort|centromor|pzu|nfz|ppts|poczt|zakład|zakładów|depot|kombinat|policji|marynarki|związek zawodowy)/i),
    creators:noteHas(p,/\\b(pomnik|mural|sgraffito|autor(?:zy)?|twórca|rzeźb|artysta|wykonanie|dzieło|maszty|tablicę stworzył)/i)
  };
}
function personMatch(p,name){return personNames(p).some(n=>n.toLowerCase()===name.toLowerCase())}
function missionLabel(p,category){
  const d=missionData(p),n=cleanNote(p);
  if(category==="architects"&&d.architects.length)return d.architects.join(", ");
  return n;
}
function categoryTasks(all,category,title,matcher){
  const groups=[];
  all.filter(matcher).forEach(p=>{
    const label=missionLabel(p,category); if(!label)return;
    const id=category+":"+p.id;
    groups.push({type:id,category,text:title+": "+label,test:q=>q.id===p.id});
  });
  return groups;
}
function taskForGame(){
  const all=missionPoints(),dated=all.filter(p=>p.date),pool=[];
  if(settings.age)dated.length&&pool.push(
    {type:"19",category:"age",text:"Odwiedź obiekt z XIX wieku",test:p=>{const y=year(p);return y>=1800&&y<=1899}},
    {type:"20",category:"age",text:"Odwiedź obiekt z XX wieku",test:p=>{const y=year(p);return y>=1900&&y<=1999}},
    {type:"21",category:"age",text:"Odwiedź obiekt z XXI wieku",test:p=>{const y=year(p);return y>=2000&&y<=2099}}
  );
  if(settings.periods)dated.length&&pool.push(
    {type:"1900-14",category:"periods",text:"Odwiedź obiekt z lat 1900–1914",test:p=>{const y=year(p);return y>=1900&&y<=1914}},
    {type:"1918-39",category:"periods",text:"Odwiedź obiekt z lat 1918–1939",test:p=>{const y=year(p);return y>=1918&&y<=1939}},
    {type:"1945-89",category:"periods",text:"Odwiedź obiekt z lat 1945–1989",test:p=>{const y=year(p);return y>=1945&&y<=1989}},
    {type:"1990-99",category:"periods",text:"Odwiedź obiekt z lat 1990–1999",test:p=>{const y=year(p);return y>=1990&&y<=1999}},
    {type:"2000+",category:"periods",text:"Odwiedź obiekt wybudowany po 2000 roku",test:p=>{const y=year(p);return y>=2001&&y<=2099}}
  );
  if(settings.architects)pool.push(...categoryTasks(all,"architects","Znajdź obiekt zaprojektowany przez",p=>missionData(p).architects.length));
  if(settings.people)pool.push(...categoryTasks(all,"people","Znajdź obiekt związany z osobą lub rodziną",p=>missionData(p).people));
  if(settings.functions)pool.push(...categoryTasks(all,"functions","Znajdź obiekt o dawnej funkcji",p=>missionData(p).functions));
  if(settings.names)pool.push(...categoryTasks(all,"names","Znajdź obiekt związany z dawną nazwą lub osiedlem",p=>missionData(p).names));
  if(settings.history)pool.push(...categoryTasks(all,"history","Znajdź obiekt z ciekawym epizodem historycznym",p=>missionData(p).history));
  if(settings.institutions)pool.push(...categoryTasks(all,"institutions","Znajdź obiekt związany z instytucją lub grupą",p=>missionData(p).institutions));
  if(settings.creators)pool.push(...categoryTasks(all,"creators","Znajdź dzieło, którego twórca jest opisany w danych",p=>missionData(p).creators));
  const usable=pool.filter(t=>all.some(t.test));
  for(let i=usable.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[usable[i],usable[j]]=[usable[j],usable[i]]}
  return usable.slice(0,Math.min(settings.count,usable.length));
}
function taskHint(t){
  const targets=points.filter(p=>p.id!==current.id&&!visited.has(p.id)&&t.test(p));
  if(!targets.length)return "Brak jeszcze dostępnego punktu spełniającego tę misję.";
  const p=targets.reduce((a,b)=>distance(current,a)<distance(current,b)?a:b),d=distance(current,p),dir=bearing(current,p);
  const dirs=[["północ",337.5,360],["północ",0,22.5],["północny wschód",22.5,67.5],["wschód",67.5,112.5],["południowy wschód",112.5,157.5],["południe",157.5,202.5],["południowy zachód",202.5,247.5],["zachód",247.5,292.5],["północny zachód",292.5,337.5]];
  const label=dirs.find(x=>dir>=x[1]&&dir<x[2])?.[0]||"";
  return "Najbliższy pasujący obiekt jest około "+(d<1000?Math.round(d)+" m":(d/1000).toFixed(1)+" km")+" stąd, w kierunku: "+label+".";
}
function revealAnswerForTask(t){
  const targets=points.filter(p=>p.id!==current.id&&!visited.has(p.id)&&t.test(p));
  if(!targets.length){statusEl.textContent="Nie ma obecnie dostępnej odpowiedzi dla tej misji.";return}
  const p=targets.reduce((a,b)=>distance(current,a)<distance(current,b)?a:b);
  if(targetMarker)map.removeLayer(targetMarker);
  targetMarker=L.marker([p.lat,p.lon],{icon:icon("target-marker")}).addTo(map).bindTooltip("ODPOWIEDŹ: "+esc(p.name),{permanent:true,direction:"top",className:"target-label"});
  map.panTo([p.lat,p.lon],{animate:true,duration:.7});
  revealEl.innerHTML="<h2>Odpowiedź</h2><p><b>"+esc(t.text)+"</b></p><p>Pasujący obiekt: <b>"+esc(p.name)+"</b></p><p>Gra została zakończona na Twoje życzenie.</p><button id='answerRestart' class='summary-restart'>NOWA GRA</button>";
  revealEl.className="reveal";revealEl.classList.remove("hidden");
  document.getElementById("answerRestart").onclick=()=>location.reload();choiceLocked=true;
}
function taskActions(t){
  let h="";
  if(settings.hints)h+=" <button class='task-action task-hint' data-task='"+esc(t.type)+"'>PODPOWIEDŹ</button>";
  if(settings.revealAnswer)h+=" <button class='task-action task-answer' data-task='"+esc(t.type)+"'>POKAŻ ODPOWIEDŹ</button>";
  return h;
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
    if(completed.size===activeTasks.length&&!premiumShown){
      premiumShown=true;
      updatePremiumHint();
      const premiumText="<b>Teraz część premium.</b><br>Możesz swobodnie eksplorować mapę. Znasz już adres celu, ale jego punkt pojawi się na mapie dopiero, gdy znajdziesz się w odległości 500 m.<br><b>Twój nowy cel: "+esc(target.name)+"</b>";
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
function choose(p){choiceEl.classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];clearSearchZone();document.querySelector(".controls").classList.remove("direction-hidden");statusEl.style.cursor="";statusEl.title="";current=p;visited.add(p.id);moves++;routePoints.push(p);updateVisitedLabels();updateRoute();setCurrent(p);document.querySelector(".choice-title").textContent="Wybierz kierunek wycieczki";document.querySelector(".choice-buttons").classList.add("direction-choice-empty");choiceEl.classList.remove("hidden");reveal(p);updatePremiumHint()}
function finish(){
  document.querySelectorAll(".summary-overlay,.summary-card").forEach(el=>el.remove());
  document.querySelectorAll(".summary-overlay,.summary-card").forEach(el=>{el.removeAttribute("style");});
  choiceEl.classList.add("hidden");
  candidateMarkers.forEach(m=>map.removeLayer(m));
  candidateMarkers=[];
  if(routePoints.length>1)map.fitBounds(routePoints.map(p=>[p.lat,p.lon]),{padding:[70,70],maxZoom:15});
  const travelledDistance=routePoints.reduce((sum,p,i)=>i?sum+distance(routePoints[i-1],p):0,0);
  const distanceKm=travelledDistance/1000;
  const missionMoves=Math.max(0,moves-1);const finishComment=distanceKm>7?"Ta trasa nadaje się na wycieczkę rowerową. Znam jednego przewodnika, który robi tego typu trasy.":distanceKm>4?"To już dłuższa miejska wyprawa — po drodze można było zobaczyć sporo różnych miejsc.":distanceKm>2?"Całkiem przyjemna trasa miejska — dobra długość, żeby po drodze zwracać uwagę na mijane obiekty.":"Krótka trasa, ale każda taka wyprawa dokłada kolejne miejsca do poznania Trójmiasta.";
  revealEl.innerHTML="<div class='finish-message'><div class='finish-kicker'>GRA ZALICZONA</div><h2>"+moves+" "+(moves===1?"ruch":"ruchów")+"</h2><p>W "+missionMoves+" "+(missionMoves===1?"ruchu":"ruchach")+" zaliczyłeś wszystkie misje. Łączny dystans od startu do mety: <b>"+distanceKm.toFixed(1)+" km</b>.</p><p class='finish-comment'>"+esc(finishComment)+"</p><div class='finish-actions'><button id='hideSummary' class='summary-hide'>UKRYJ PODSUMOWANIE</button><button id='restart' class='summary-restart'>NOWA GRA</button></div></div>";
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
  const targets=points.filter(p=>p.id!==current.id&&!visited.has(p.id)&&t.test(p));
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
  progressEl.textContent="Zadania: "+done+"/"+activeTasks.length+" • Odwiedzone: "+visited.size;
  tasksEl.innerHTML=activeTasks.map(t=>{
    const doneTask=completed.has(t.type);
    return "<div class=\""+(doneTask?"task-done":"")+"\">"+(doneTask?"✓":"▸")+" "+esc(t.text)+(doneTask?"":missionHeat(t))+"</div>";
  }).join("");
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
async function start(){if(choiceLocked)return;choiceLocked=true;const startBtn=document.getElementById("startBtn");startBtn.disabled=true;startBtn.textContent="PRZYGOTOWYWANIE…";statusEl.textContent="Trwa przygotowanie gry i wyszukiwanie możliwej trasy. To może potrwać około 10 sekund — proszę chwilę poczekać.";movesEl.textContent="Przygotowanie gry — może potrwać około 10 sekund…";await new Promise(r=>setTimeout(r,40));document.getElementById("start").classList.add("hidden");candidateMarkers.forEach(m=>map.removeLayer(m));candidateMarkers=[];clearSearchZone();document.querySelectorAll(".visited-label-marker").forEach(el=>el.remove());if(routeLine){map.removeLayer(routeLine);routeLine=null}if(targetMarker){map.removeLayer(targetMarker);targetMarker=null}if(startMarker){map.removeLayer(startMarker);startMarker=null}moves=0;visited=new Set();visitedHistory=[];completed=new Set();missionHits=new Map();activeTasks=[];const audited=chooseStartAndTarget();
  if(!audited){choiceLocked=false;statusEl.textContent="Nie udało się znaleźć gry dla wybranych ustawień. Wybierz inny zakres odległości lub miejsce startu.";document.getElementById("start").classList.remove("hidden");startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ";return}
  current=audited.start;gameStart=audited.start;target=audited.target;gameDistance=distance(current,target);activeTasks=taskForGame();routePoints=[current];updateRoute();missionEl.innerHTML="";updateProgress();startMarker=L.marker([current.lat,current.lon],{icon:icon("start-marker"),zIndexOffset:1100}).addTo(map);setCurrent(current,true);targetMarker=null;
  if(activeTasks.length===0){
    choiceLocked=false;
    statusEl.textContent="Nie udało się przygotować żadnej misji. Włącz co najmniej jedną kategorię misji w ustawieniach i rozpocznij nową grę.";
    document.getElementById("settings").classList.remove("hidden");
  }else{statusEl.textContent="Wybierz kierunek strzałką.";document.querySelector(".choice-title").textContent="Wybierz kierunek wycieczki";document.querySelector(".choice-buttons").classList.add("direction-choice-empty");choiceEl.classList.remove("hidden");updateMoveInfo(0);choiceLocked=false}
  startBtn.disabled=false;startBtn.textContent="ROZPOCZNIJ GRĘ"}
async function init(){try{if(typeof L==="undefined")throw new Error("Leaflet nie został załadowany");const mapEl=document.getElementById("map");if(!mapEl)throw new Error("Brak elementu mapy");map=L.map(mapEl,{zoomControl:false}).setView([54.38,18.62],12);if(!map||typeof map.addLayer!=="function")throw new Error("Nie udało się utworzyć mapy Leaflet");L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);loadSettings();updateMoveInfo(0);document.getElementById("startBtn").onclick=start;document.getElementById("settingsBtn").onclick=openSettings;movesEl.addEventListener("click",()=>{if(instructionTimer){clearTimeout(instructionTimer);instructionTimer=null}movesEl.classList.remove("instruction-visible");movesEl.classList.add("instruction-hidden")});document.getElementById("newGameSettings").onclick=async()=>{document.getElementById("settings").classList.add("hidden");choiceLocked=false;await start()};const tagToggle=document.getElementById("tagToggle"),tagCloud=document.getElementById("tagCloud");if(tagToggle&&tagCloud)tagToggle.onclick=()=>tagCloud.classList.toggle("closed");updateTagCloud();statusEl.addEventListener("click",()=>{if(!searchZone)return;searchZone.setStyle({fillOpacity:searchZone.options.fillOpacity>0?0:.14,opacity:searchZone.options.opacity>0?0:.9})});document.getElementById("saveSettings").onclick=async()=>{const btn=document.getElementById("saveSettings");btn.disabled=true;btn.textContent="ZAPISYWANIE…";statusEl.textContent="Trwa zapisywanie ustawień…";await new Promise(r=>setTimeout(r,350));saveSettings();document.getElementById("settings").classList.add("hidden");btn.disabled=false;btn.textContent="ZAPISZ";if(document.getElementById("start").classList.contains("hidden")){await start()}else statusEl.textContent="Ustawienia zapisane. Kliknij „ROZPOCZNIJ GRĘ”.";};document.querySelectorAll("[data-dir]").forEach(b=>b.onclick=()=>showCandidates(b.dataset.dir));document.addEventListener("keydown",e=>{const d={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"}[e.key];if(d){e.preventDefault();showCandidates(d)}});try{if(typeof Papa==="undefined")throw Error("Nie załadowano parsera CSV");const r=await fetch(DATA_URL,{cache:"no-store"});if(!r.ok)throw Error("Arkusz Google zwrócił HTTP "+r.status);const csv=await r.text();const parsed=Papa.parse(csv,{header:true,skipEmptyLines:true});if(parsed.errors?.length)console.warn("Ostrzeżenia CSV:",parsed.errors);points=parseSheetRows(parsed.data);if(points.length<20)throw Error("Za mało poprawnych punktów GPS w arkuszu");statusEl.textContent="Załadowano "+points.length+" punktów z Google Sheets (wierszy CSV: "+parsed.data.length+")."}catch(e){console.error("Błąd ładowania Google Sheets:",e);statusEl.textContent="Błąd danych: "+e.message}try{if(L.control&&L.control.scale) L.control.scale({imperial:false,metric:true,position:"bottomleft"}).addTo(map)}catch(e){console.warn("Kontrolka skali pominięta:",e)} }catch(e){console.error("Błąd inicjalizacji gry:",e);statusEl.textContent="BŁĄD MAPY: "+e.message;statusEl.title=e.stack||"";document.getElementById("start").classList.remove("hidden")}}init();