const API=((window.PR_CONFIG&&window.PR_CONFIG.API_BASE)||"").replace(/\/$/,"");

const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const now=()=>new Date().toISOString().slice(0,16).replace("T"," ");
const ST={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
// RouteVault seed: geography only (coordinates approximate). No fares, no operators.
const CITIES={Pretoria:[-25.75,28.19,"Gauteng"],Johannesburg:[-26.2,28.05,"Gauteng"],Durban:[-29.86,31.02,"KwaZulu-Natal"],"Cape Town":[-33.92,18.42,"Western Cape"],Bloemfontein:[-29.12,26.21,"Free State"],Polokwane:[-23.9,29.45,"Limpopo"],Mbombela:[-25.47,30.97,"Mpumalanga"],Gqeberha:[-33.96,25.6,"Eastern Cape"],"East London":[-33.02,27.91,"Eastern Cape"],Pietermaritzburg:[-29.6,30.38,"KwaZulu-Natal"],Kimberley:[-28.74,24.77,"Northern Cape"]};
const ALIAS={pta:"Pretoria",tshwane:"Pretoria",jhb:"Johannesburg",joburg:"Johannesburg","jozi":"Johannesburg",jburg:"Johannesburg",dbn:"Durban",cpt:"Cape Town",capetown:"Cape Town",nelspruit:"Mbombela","port elizabeth":"Gqeberha",pe:"Gqeberha",pmb:"Pietermaritzburg",bloem:"Bloemfontein",durbin:"Durban",pretoia:"Pretoria",johanesburg:"Johannesburg"};
const AIRPORTS={Pretoria:"JNB (OR Tambo, via Johannesburg)",Johannesburg:"JNB",Durban:"DUR (King Shaka)","Cape Town":"CPT",Bloemfontein:"BFN",Polokwane:"PTG",Mbombela:"MQP",Gqeberha:"PLZ","East London":"ELS",Pietermaritzburg:"DUR (King Shaka)",Kimberley:"KIM"};
const CORR={"Pretoria|Durban":["N1","N3"],"Johannesburg|Durban":["N3"],"Cape Town|Johannesburg":["N1"],"Cape Town|Pretoria":["N1"],"Johannesburg|Pretoria":["N1"],"Bloemfontein|Johannesburg":["N1"],"Durban|Gqeberha":["N2"],"Cape Town|Gqeberha":["N2"]};
const BOOK={bus:[["Intercape","https://www.intercape.co.za"],["Greyhound","https://www.greyhound.co.za"],["City to City","https://www.citytocity.co.za"]],air:[["FlySafair","https://www.flysafair.co.za"],["Airlink","https://www.flyairlink.com"],["LIFT","https://www.lift.co.za"],["South African Airways","https://www.flysaa.com"]]};
const SOURCES=[["SANRAL / i-TRAFFIC","Traffic","Licence/API access to be established"],["Provincial & municipal traffic","Traffic","Access to be established"],["TomTom Traffic","Traffic","Commercial API key required"],["Verified user incident reports","Incidents","Intake form not yet built"],["Weather provider","Weather","Provider not chosen"],["Intercape / Greyhound / City to City","Bus fares","Check each operator’s data terms"],["Airline & flight-search APIs","Air fares","Partner/API agreements required"],["Minibus fare contributors","Taxi fares","Via FareWatch form below"],["JourneyGuard verified notices","Safety","No verified notices loaded"]];
let sources=ST.get("pr_src",SOURCES.map((s,i)=>({n:s[0],c:s[1],note:s[2],on:i==7,last:i==7?"on submission":null})));
let fares=ST.get("pr_fares",[]),saved=ST.get("pr_saved",[]),log=ST.get("pr_log",[]);
const save=()=>{const r=[ST.set("pr_src",sources),ST.set("pr_fares",fares),ST.set("pr_saved",saved),ST.set("pr_log",log)];return r.every(Boolean)};
// NLU
const NAMES=Object.keys(CITIES).map(c=>[c.toLowerCase(),c]).concat(Object.entries(ALIAS)).sort((a,b)=>b[0].length-a[0].length);
const CITY_RE="("+NAMES.map(n=>n[0].replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")";
const canon=k=>(NAMES.find(n=>n[0]==k)||[])[1]||null;
function parse(t){
  const s=" "+String(t).toLowerCase().replace(/(→|->|=>|➔|➜|›|»)/g," to ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ")+" ";
  const C=CITY_RE+"(?= )";let from=null,to=null,m;
  if(m=s.match(new RegExp(" from "+C+".{0,60}? to "+C)))[from,to]=[canon(m[1]),canon(m[2])];
  else if(m=s.match(new RegExp(" to "+C+".{0,60}? from "+C)))[to,from]=[canon(m[1]),canon(m[2])];
  else if(m=s.match(new RegExp(" "+C.replace("(?= )","")+" to "+C)))[from,to]=[canon(m[1]),canon(m[2])];
  else{const o=s.match(new RegExp(" (?:from|leaving|out of) "+C)),d=s.match(new RegExp(" (?:to|towards|into) "+C));if(o)from=canon(o[1]);if(d)to=canon(d[1])}
  const mentions=[...new Set([...s.matchAll(new RegExp(" "+CITY_RE+"(?= )","g"))].map(x=>canon(x[1])))];
  const sameCity=!!(from&&to&&from==to);
  const ambiguous=!sameCity&&!from&&!to&&mentions.length>=2;
  const modes=[];if(/\b(taxi|taxis|minibus|kombi|kombis)\b/.test(s))modes.push("minibus");if(/\b(bus|buses|intercape|greyhound|coach)\b/.test(s))modes.push("bus");if(/\b(flight|flights|fly|flying|airline|airlines|plane|air)\b/.test(s))modes.push("air");
  const f={cheap:/\b(cheap|cheapest|afford|budget|price|cost|fare)/.test(s),road:/\b(road|roads|traffic|closure|closed|delay|delays|accident|roadworks)\b|\bn\d{1,2}\b/.test(s),safe:/\b(safe|safety|danger|night|walk|arrive|arriving|arrival)\b/.test(s),offline:/\b(offline|save)\b/.test(s),nocar:/no car|don t have a car|without a car/.test(s)};
  return{from,to,mentions,ambiguous,sameCity,modes:modes.length?modes:["minibus","bus","air"],f,allModes:!modes.length}}
const FARE_TTL={minibus:14*86400,bus:86400,air:3600},nowS=()=>Math.floor(Date.now()/1000);
function validateFare(d,existing){const op=String(d.op||"").trim(),src=String(d.src||"").trim(),price=Number(d.price);
 if(!["minibus","bus","air"].includes(d.mode))return"Invalid transport mode.";
 if(!CITIES[d.from]||!CITIES[d.to])return"Unknown place.";if(d.from==d.to)return"Origin and destination must differ.";
 if(op.length<2||op.length>80)return"Operator is required (2–80 characters).";if(src.length<3||src.length>200)return"Source is required (3–200 characters).";
 if(!Number.isFinite(price)||price<=0||price>100000)return"Fare must be a number above 0 and up to R100 000.";
 if((existing||[]).some(f=>f.mode==d.mode&&f.from==d.from&&f.to==d.to&&String(f.op).toLowerCase()==op.toLowerCase()&&f.price==price&&String(f.src).toLowerCase()==src.toLowerCase()))return"Duplicate: this exact report already exists.";return null}
const SBADGE={OPERATIONAL:"VERIFIED",CONNECTED:"RECENT",CONFIGURED:"RECENT",FAILED:"STALE",STALE:"STALE","NOT CONNECTED":"UNAVAILABLE"};
const stateOf=s=>API?(s.state||"NOT CONNECTED"):(/^Minibus fare/.test(s.n)&&s.on?"CONFIGURED":"NOT CONNECTED");
const stBadge=s=>tag(SBADGE[s]||"UNAVAILABLE",s);
const tag=(s,l)=>`<span class="tag ${s}">${l||s}</span>`;
function distKm(a,b){const R=6371,r=x=>x*Math.PI/180,A=CITIES[a],B=CITIES[b];const d=Math.sin(r(B[0]-A[0])/2)**2+Math.cos(r(A[0]))*Math.cos(r(B[0]))*Math.sin(r(B[1]-A[1])/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(d)))}
function fareStatus(list){// conflict detection per operator
const by={};list.forEach(f=>(by[f.op.toLowerCase()]=by[f.op.toLowerCase()]||[]).push(f));return Object.values(by).map(g=>{const prices=[...new Set(g.map(x=>x.price))];return{op:g[0].op,recs:g,disputed:prices.length>1}})}
function fareBlock(mode,from,to){const l=FS().filter(f=>f.mode==mode&&f.from==from&&f.to==to);
if(!l.length)return`<p>${tag("UNAVAILABLE")}No fare record for this route in FareWatch.</p>`;
return fareStatus(l).map(g=>g.disputed?`<p>${tag("DISPUTED")}<b>${esc(g.op)}</b> — conflicting fares: ${g.recs.map(r=>`R${r.price} (${esc(r.src)}, ${r.ts}, ${r.status})`).join(" vs ")}. Not selecting one.</p>`:g.recs.slice(-1).map(r=>`<p>${tag(cls(r.status),r.status)}<b>${esc(g.op)}</b> R${r.price} — source: ${esc(r.src)}; recorded ${r.ts}. Not a booking price.${API?"":" Entered on this device only; not shared fare intelligence."}</p>`).join("")).join("")}
function compose(raw){const p=parse(raw),{from,to}=p;let h=`<div class="sec"><h2>ROADPULSE ANSWER · ${now()} (device time)</h2>`;
if(p.sameCity)return h+`<div class="miss">Origin and destination are both <b>${from}</b>. Tell me where you are travelling to.</div></div>`;
if(p.ambiguous)return h+`<div class="miss">I found ${p.mentions.join(" and ")} but can’t tell which is your origin and which is your destination. I won’t guess the direction — try “from ${p.mentions[0]} to ${p.mentions[1]}” or “from ${p.mentions[1]} to ${p.mentions[0]}”.</div></div>`;
if(!to){return h+`<div class="miss">I couldn’t find a destination I know. RouteVault currently holds: ${Object.keys(CITIES).join(", ")}. Try “Pretoria to Durban”.</div></div>`}
if(!from){return h+`<div class="miss">I understood the destination as <b>${to}</b> but not where you’re leaving from. Tell me your origin (e.g. “from Pretoria”).</div></div>`}
const km=distKm(from,to);h+=(apiNote?'<div class="miss">'+apiNote+'</div>':"")+`<p>Journey understood: <b>${from} → ${to}</b>${p.f.nocar?" · no private car":""}. Straight-line distance ${km} km ${tag("ESTIMATE","CALCULATED")}road distance and duration not verified.</p>`;
const miss=[];h+=`<div class="grid">`;
if(p.modes.includes("minibus")){const have=FS().some(f=>f.mode=="minibus"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>MINIBUS TAXI</h3>${fareBlock("minibus",from,to)}<dl><dt>Departure rank</dt><dd>${tag("UNAVAILABLE")}not in RouteVault</dd><dt>Direct / transfer</dt><dd>${tag("UNAVAILABLE")}unknown</dd><dt>Duration</dt><dd>${tag("UNAVAILABLE")}unknown</dd></dl><p class="note">No national taxi fare database exists; fares come from verified contributors and operators.</p></div>`;if(!have)miss.push("Minibus: departure rank, association, fare and transfer points for "+from+" → "+to)}
if(p.modes.includes("bus")){const have=FS().some(f=>f.mode=="bus"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>LONG-DISTANCE BUS</h3>${fareBlock("bus",from,to)}<dl><dt>Check operators</dt><dd>${BOOK.bus.map(b=>`<a style="color:var(--gold)" href="${b[1]}" target="_blank" rel="noopener">${b[0]}</a>`).join(" · ")}</dd><dt>Departure points</dt><dd>${tag("UNAVAILABLE")}confirm with operator</dd></dl><p class="note">Whether each operator serves this route is unconfirmed here. Confirm timetable and price on their site.</p></div>`;if(!have)miss.push("Bus: no connected operator fare feed; no fare record")}
if(p.modes.includes("air")){const have=FS().some(f=>f.mode=="air"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>AIR TRAVEL</h3>${fareBlock("air",from,to)}<dl><dt>Airports</dt><dd>${AIRPORTS[from]} → ${AIRPORTS[to]} ${tag("ESTIMATE")}</dd><dt>Check airlines</dt><dd>${BOOK.air.map(b=>`<a style="color:var(--gold)" href="${b[1]}" target="_blank" rel="noopener">${b[0]}</a>`).join(" · ")}</dd></dl><p class="note">Airline coverage of this route is unconfirmed. Prices must be confirmed with the airline. Airport transfer costs are not recorded.</p></div>`;if(!have)miss.push("Air: no flight price source connected; no fare, baggage or schedule")}
const k=[from,to].join("|"),k2=[to,from].join("|"),road=CORR[k]||(CORR[k2]&&[...CORR[k2]].reverse());
h+=`<div class="card"><h3>ROAD CONDITIONS</h3>${road?`<p>Likely corridor: <b>${road.join(" → ")}</b> ${tag("ESTIMATE")}from RouteVault corridor table.</p>`:`<p>${tag("UNAVAILABLE")}Corridor for this pair not yet in RouteVault.</p>`}<p>${tag("UNAVAILABLE")}No live traffic or incident feed is connected. Last successful update: never.</p><p class="note">Do not read “no incidents shown” as “road is clear”.</p></div>`;miss.push("Road: live incidents, closures, congestion, weather (no connector active)");
h+=`<div class="card"><h3>JOURNEYGUARD</h3><p>${tag("UNAVAILABLE")}No verified safety notices for ${to} or its terminals.</p><p>${tag("ESTIMATE","GENERAL GUIDANCE")}Not location-specific:</p><ul class="note"><li>Avoid arriving after dark if you can; share your trip with someone.</li><li>Arrange onward transport before you land.</li><li>Emergency: 112 (mobile), SAPS 10111, ambulance 10177.</li></ul></div></div>`;
h+=`<div class="sec"><h2>WHAT I DON’T KNOW</h2>${miss.map(m=>`<div class="miss">${esc(m)}</div>`).join("")}</div>`;
h+=`<div class="sec"><h2>JOURNEY MAP</h2>${map([from,to])}</div>`;
h+=`<p><button id="sj" data-q="${esc(raw)}">SAVE JOURNEY OFFLINE</button></p></div>`;
log.unshift({t:now(),q:raw,from,to,modes:p.modes.join(","),engine:"rules-nlu v0",grounded:FS().filter(f=>f.from==from&&f.to==to).length+" fare records"});log=log.slice(0,50);save();return h}
function map(hl,all){const W=700,H=420,x=lo=>40+(lo-16)*((W-80)/18),y=la=>40+(-22-la)*((H-80)/13);
let s=`<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of places">`;
for(let i=0;i<=6;i++)s+=`<line x1="${40+i*100}" y1="20" x2="${40+i*100}" y2="${H-20}" stroke="var(--line)" stroke-width=".5"/>`;
if(hl&&hl.length==2){const a=CITIES[hl[0]],b=CITIES[hl[1]];s+=`<line x1="${x(a[1])}" y1="${y(a[0])}" x2="${x(b[1])}" y2="${y(b[0])}" stroke="var(--gold)" stroke-dasharray="5 4" stroke-width="1.6"/>`}
for(const [n,c] of Object.entries(CITIES)){const on=!hl||hl.includes(n);s+=`<circle cx="${x(c[1])}" cy="${y(c[0])}" r="${on&&hl?6:3.5}" fill="${on&&hl?"var(--gold)":"var(--mut)"}"/><text x="${x(c[1])+9}" y="${y(c[0])+4}" font-size="11" fill="var(--tx)" font-family="monospace">${n}</text>`}
return s+`</svg><p class="note">Straight line, not a road route. Places only; no road geometry loaded.</p>`}
function ovTable(){return`<table><tr><th>SOURCE</th><th>CATEGORY</th><th>STATUS</th><th>LAST UPDATE</th><th>NOTE</th></tr>${sources.map(s=>`<tr><td>${esc(s.n)}</td><td>${s.c}</td><td>${stBadge(stateOf(s))}</td><td>${s.last||"never"}</td><td>${esc(s.note)}</td></tr>`).join("")}</table>`}
async function showAnswer(q){$("#q").value=q;await loadRemote(q);$("#out").innerHTML=compose(q);const b=$("#sj");if(b)b.onclick=()=>{saved.unshift({q,ts:now(),html:$("#out").innerHTML.replace(/<p><button id="sj".*?<\/p>/,"")});b.textContent=save()?"SAVED ✓":"COULD NOT SAVE — browser storage is blocked or full"};$("#out").scrollIntoView({behavior:"smooth"})}
function renderSaved(){$("#sv").innerHTML=saved.length?saved.map((s,i)=>`<div class="card" style="margin-bottom:14px"><div class="banner">OFFLINE SNAPSHOT — saved ${s.ts}. Historical record, not live. Re-check before travelling.</div><b>${esc(s.q)}</b>${s.html}<p><button class="ghost" data-del="${i}">DELETE</button></p></div>`).join(""):`<p class="note">Nothing saved yet. Ask a question, then choose “Save journey offline”.</p>`;document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{saved.splice(+b.dataset.del,1);save();renderSaved()})}
function renderCmd(){const stale=FS().filter(f=>f.status!="VERIFIED").length,act=sources.filter(s=>stateOf(s)=="OPERATIONAL").length,failed=sources.filter(s=>["FAILED","STALE"].includes(stateOf(s))).length;
$("#kp").innerHTML=[["PLACES IN ROUTEVAULT",Object.keys(CITIES).length],["REGISTERED ROUTES",0],["OPERATIONAL SOURCES",act+" / "+sources.length],["FAILED / STALE",failed],["FARE RECORDS",FS().length],["UNVERIFIED FARES",stale],["TRAFFIC INCIDENTS",0],["AI QUERIES",log.length],["OFFLINE PACKS",saved.length]].map(k=>`<div class="card kpi">${k[1]}<small>${k[0]}</small></div>`).join("");
$("#src").innerHTML=ovTable().replace(/<\/tr>/g,"</tr>").replace(/<tr><td>(.*?)<\/td>/g,(m,n)=>m);
$("#src").innerHTML=`<table><tr><th>SOURCE</th><th>CATEGORY</th><th>STATUS</th><th>LAST</th><th>REQUIREMENT</th><th></th></tr>${sources.map((s,i)=>`<tr><td>${esc(s.n)}</td><td>${s.c}</td><td>${stBadge(stateOf(s))} <span class="note">${s.on?"enabled":"disabled"}</span></td><td>${s.last||"never"}</td><td>${esc(s.note)}</td><td>${(API||/^Minibus fare/.test(s.n))?`<button class="ghost" data-t="${i}">${s.on?"DISABLE":"ENABLE"}</button>`:"—"}</td></tr>`).join("")}</table>`;
document.querySelectorAll("[data-t]").forEach(b=>b.onclick=async()=>{const s=sources[+b.dataset.t];if(API){await adm("/api/sources/"+s.id+"/toggle");await loadSrc()}else{s.on=!s.on;save()}renderCmd()});
renderFares();
$("#ai").innerHTML=`<table><tr><th>CONNECTOR</th><th>TYPE</th><th>STATUS</th></tr><tr><td>RoadPulse rules NLU + RouteVault retrieval</td><td>Local, in-browser</td><td>${tag("RECENT","ACTIVE")}</td></tr><tr><td>WebLLM (WebGPU)</td><td>Browser inference</td><td>${tag("UNAVAILABLE","NOT CONNECTED")}</td></tr><tr><td>Ollama</td><td>Local server</td><td>${tag("UNAVAILABLE","NOT CONNECTED")}</td></tr><tr><td>Cloud model API</td><td>Server-side gateway</td><td>${tag("UNAVAILABLE","NOT CONNECTED")}</td></tr></table><p class="note">The composer only states facts it retrieved from RouteVault/FareWatch. A language model, when connected, would only phrase that retrieved context.</p>`;
$("#lg").innerHTML=log.length?`<table><tr><th>TIME</th><th>QUERY</th><th>PARSED</th><th>MODES</th><th>GROUNDING</th></tr>${log.map(l=>`<tr><td>${l.t}</td><td>${esc(l.q)}</td><td>${l.from||"?"} → ${l.to||"?"}</td><td>${l.modes}</td><td>${l.grounded}</td></tr>`).join("")}</table>`:`<p class="note">No queries yet.</p>`;
$("#cm").innerHTML=map()}
function route(){const h=(location.hash||"#traveller").slice(1);const v=["traveller","saved","command"].includes(h)?h:"traveller";
["traveller","saved","command"].forEach((n,i)=>{$("#v-"+n).classList.toggle("hide",n!=v);$("#n"+(i+1)).classList.toggle("on",n==v)});if(v=="saved")renderSaved();if(v=="command")renderCmd()}
document.querySelectorAll(".cs").forEach(s=>s.innerHTML=Object.keys(CITIES).map(c=>`<option>${c}</option>`).join(""));
document.querySelectorAll(".cs")[1].selectedIndex=2;
$("#go").onclick=()=>{const q=$("#q").value.trim();if(q)showAnswer(q)};
$("#q").onkeydown=e=>{if(e.key=="Enter")$("#go").click()};
document.querySelectorAll(".chips button").forEach(b=>b.onclick=()=>showAnswer(b.dataset.q));
$("#acc").onclick=()=>showAnswer("I need to get from Pretoria to Durban. I don't have a car. Show me my cheapest options, tell me where I catch transport, what it costs, what is happening on the road and what I should know when I arrive.");
$("#ov").innerHTML=ovTable();


// ================= API + PWA layer (config.js sets window.PR_CONFIG) =================

let remote=[],apiNote="";
const FS=()=>API?remote.map(f=>f.exp&&f.exp<nowS()&&f.status!="UNAVAILABLE"?{...f,status:"STALE"}:f):fares.map(f=>({...f,status:!(f.exp>nowS())?"STALE":"DEVICE ONLY"}));
const cls=s=>s=="VERIFIED"?"VERIFIED":s=="STALE"?"STALE":s=="DISPUTED"?"DISPUTED":s=="UNAVAILABLE"?"UNAVAILABLE":"RECENT";
const iso=t=>new Date(t*1000).toISOString().slice(0,16).replace("T"," ");
const tok=()=>{try{return sessionStorage.getItem("pr_tok")||""}catch(e){return ""}};
async function adm(path,body){
  try{const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok()},body:JSON.stringify(body||{})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){$("#fe").textContent=r.status==401?"Admin token missing or invalid.":(j.error||"Request failed ("+r.status+").");return null}
    $("#fe").textContent="";return j}catch(e){$("#fe").textContent="Could not reach the RoadPulse API.";return null}}
async function fetchFares(from,to){
  remote=[];apiNote="";if(!API)return;
  try{const r=await fetch(API+"/api/fares?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
    if(!r.ok)throw 0;const d=await r.json();if(d.error)throw 0;
    if(d.from_cache)apiNote="Offline: server fares below come from a cached copy as of "+iso(d.as_of)+". They are not live.";
    remote=d.fares.map(f=>({id:f.id,mode:f.mode,from:f.origin,to:f.destination,op:f.operator,price:f.price_zar,src:f.source,status:f.status,ts:iso(f.collected_at),exp:f.expires_at}))}
  catch(e){apiNote="RoadPulse API unreachable — no server fare data available right now."}}
async function loadRemote(q){const p=parse(q);if(p.from&&p.to)await fetchFares(p.from,p.to)}
async function loadSrc(){
  if(!API)return;
  try{const r=await fetch(API+"/api/sources");const d=await r.json();
    sources=d.sources.map(s=>({id:s.id,state:s.state,n:s.name,c:s.category,on:!!s.enabled,last:s.last_success?iso(s.last_success):null,note:s.last_error?("Last error: "+s.last_error):(s.note||"")}))}catch(e){}
  $("#ov").innerHTML=ovTable()}
function renderFares(){
  const L=FS(),el=$("#fl");
  el.innerHTML=L.length?`<table><tr><th>ID</th><th>MODE</th><th>ROUTE</th><th>OPERATOR</th><th>FARE</th><th>SOURCE</th><th>STATUS</th><th>TIME</th><th></th></tr>${L.map(f=>{
    const dis=L.some(g=>g.id!=f.id&&g.mode==f.mode&&g.from==f.from&&g.to==f.to&&g.op.toLowerCase()==f.op.toLowerCase()&&g.price!=f.price),st=dis?"DISPUTED":f.status;
    return`<tr><td>${esc(String(f.id).slice(0,8))}</td><td>${f.mode}</td><td>${f.from} → ${f.to}</td><td>${esc(f.op)}</td><td>R${f.price}</td><td>${esc(f.src)}</td><td>${tag(cls(st),st)}</td><td>${f.ts}</td><td>${API?`<button class="ghost" data-v="${esc(f.id)}">VERIFY</button>`:`<button class="ghost" data-x="${esc(f.id)}">DELETE</button>`}</td></tr>`}).join("")}</table>`
   :`<p class="note">${API?"No server fares for the selected route.":"No fare records. Nothing is pre-loaded; no prices are invented."}</p>`;
  el.querySelectorAll("[data-v]").forEach(b=>b.onclick=async()=>{
    if(API){await adm("/api/fares/"+b.dataset.v+"/verify");await loadRoute()}
    else{const f=fares.find(x=>x.id==b.dataset.v);if(f)f.status="VERIFIED";save()}renderCmd()});
  el.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{fares=fares.filter(x=>x.id!=b.dataset.x);save();renderCmd()})}
async function loadRoute(){const f=new FormData($("#ff"));await fetchFares(f.get("from"),f.get("to"))}
$("#ff").onsubmit=async e=>{
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
  const err=validateFare(d,API?remote:fares);if(err){$("#fe").textContent=err;return}
  if(API){const r=await adm("/api/fares",{mode:d.mode,origin:d.from,destination:d.to,operator:d.op.trim(),price_zar:Number(d.price),source:d.src.trim()});if(!r)return;await fetchFares(d.from,d.to)}
  else{fares.push({id:"F"+(fares.length+1)+"-"+Date.now().toString(36).slice(-4),mode:d.mode,from:d.from,to:d.to,op:d.op.trim(),price:Number(d.price),src:d.src.trim(),status:"DEVICE ONLY",ts:now(),exp:nowS()+FARE_TTL[d.mode]});sources[7].on=true;sources[7].last=now();if(!save()){$("#fe").textContent="Saved in memory only: browser storage is blocked or full.";}else $("#fe").textContent=""}
  e.target.reset();renderCmd()};
document.querySelectorAll(".cs").forEach(s=>s.addEventListener("change",async()=>{if(API){await loadRoute();renderCmd()}}));
// token + visibility of API-only controls
$("#tf").classList.toggle("hide",!API);$("#tf").addEventListener("submit",e=>e.preventDefault());$("#tok").value=tok();
$("#tok").onchange=e=>{try{sessionStorage.setItem("pr_tok",e.target.value)}catch(_){}};
// offline banner
const net=()=>$("#net").classList.toggle("hide",navigator.onLine);
addEventListener("online",()=>{net();loadSrc()});addEventListener("offline",net);net();
// service worker
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
addEventListener("hashchange",route);route();loadSrc();
