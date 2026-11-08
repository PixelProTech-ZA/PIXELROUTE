
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const now=()=>new Date().toISOString().slice(0,16).replace("T"," ");
const ST={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
// RouteVault seed: geography only (coordinates approximate). No fares, no operators.
const CITIES={Pretoria:[-25.75,28.19,"Gauteng"],Johannesburg:[-26.2,28.05,"Gauteng"],Durban:[-29.86,31.02,"KwaZulu-Natal"],"Cape Town":[-33.92,18.42,"Western Cape"],Bloemfontein:[-29.12,26.21,"Free State"],Polokwane:[-23.9,29.45,"Limpopo"],Mbombela:[-25.47,30.97,"Mpumalanga"],Gqeberha:[-33.96,25.6,"Eastern Cape"],"East London":[-33.02,27.91,"Eastern Cape"],Pietermaritzburg:[-29.6,30.38,"KwaZulu-Natal"],Kimberley:[-28.74,24.77,"Northern Cape"]};
const ALIAS={pta:"Pretoria",tshwane:"Pretoria",jhb:"Johannesburg",joburg:"Johannesburg","jozi":"Johannesburg",jburg:"Johannesburg",dbn:"Durban",cpt:"Cape Town",capetown:"Cape Town",nelspruit:"Mbombela","port elizabeth":"Gqeberha",pe:"Gqeberha",pmb:"Pietermaritzburg",bloem:"Bloemfontein",durbin:"Durban",pretoia:"Pretoria",johanesburg:"Johannesburg"};
const AIRPORTS={Pretoria:"JNB (OR Tambo, via Johannesburg)",Johannesburg:"JNB",Durban:"DUR (King Shaka)","Cape Town":"CPT",Bloemfontein:"BFN",Polokwane:"PTG",Mbombela:"MQP",Gqeberha:"PLZ","East London":"ELS",Pietermaritzburg:"DUR (King Shaka)",Kimberley:"KIM"};
const CORR={"Pretoria|Durban":["N1","N3"],"Johannesburg|Durban":["N3"],"Cape Town|Johannesburg":["N1"],"Johannesburg|Pretoria":["N1"],"Bloemfontein|Johannesburg":["N1"],"Durban|Gqeberha":["N2"],"Cape Town|Gqeberha":["N2"]};
const BOOK={bus:[["Intercape","https://www.intercape.co.za"],["Greyhound","https://www.greyhound.co.za"],["City to City","https://www.citytocity.co.za"]],air:[["FlySafair","https://www.flysafair.co.za"],["Airlink","https://www.flyairlink.com"],["LIFT","https://www.lift.co.za"],["South African Airways","https://www.flysaa.com"]]};
const SOURCES=[["SANRAL / i-TRAFFIC","Traffic","Licence/API access to be established"],["Provincial & municipal traffic","Traffic","Access to be established"],["TomTom Traffic","Traffic","Commercial API key required"],["Verified user incident reports","Incidents","Intake form not yet built"],["Weather provider","Weather","Provider not chosen"],["Intercape / Greyhound / City to City","Bus fares","Check each operator’s data terms"],["Airline & flight-search APIs","Air fares","Partner/API agreements required"],["Minibus fare contributors","Taxi fares","Via FareWatch form below"],["JourneyGuard verified notices","Safety","No verified notices loaded"]];
let sources=ST.get("pr_src",SOURCES.map((s,i)=>({n:s[0],c:s[1],note:s[2],on:i==7,last:i==7?"on submission":null})));
let fares=ST.get("pr_fares",[]),saved=ST.get("pr_saved",[]),log=ST.get("pr_log",[]);
const save=()=>{ST.set("pr_src",sources);ST.set("pr_fares",fares);ST.set("pr_saved",saved);ST.set("pr_log",log)};
// NLU
function parse(t){const s=" "+t.toLowerCase().replace(/[^a-z ]/g," ")+" ";const hits=[];
const names=Object.keys(CITIES).map(c=>[c.toLowerCase(),c]).concat(Object.entries(ALIAS).map(([a,c])=>[a,c]));
for(const [k,c] of names){const i=s.indexOf(" "+k+" ");if(i>=0&&!hits.find(h=>h.c==c))hits.push({c,i})}
hits.sort((a,b)=>a.i-b.i);let from=null,to=null;
const m=s.match(/ from (.+?) to (.+?)( |$)/);
if(hits.length>=2){from=hits[0].c;to=hits[1].c;const ti=s.indexOf(" to ");if(ti>0){const afterTo=hits.filter(h=>h.i>ti);const before=hits.filter(h=>h.i<ti);if(afterTo.length&&before.length){from=before[0].c;to=afterTo[0].c}}if(/ from /.test(s)&&hits[0].i>s.indexOf(" from ")&&s.indexOf(" to ")>0&&hits[0].i>s.indexOf(" to ")){from=hits[1].c;to=hits[0].c}}
else if(hits.length==1)to=hits[0].c;
const modes=[];if(/taxi|minibus|kombi/.test(s))modes.push("minibus");if(/\bbus\b|intercape|greyhound|coach/.test(s))modes.push("bus");if(/flight|fly|air|plane|airline/.test(s))modes.push("air");
const f={cheap:/cheap|afford|budget|price|cost|fare/.test(s),road:/road|traffic|closure|n\d|delay/.test(s),safe:/safe|danger|night|walk|arriv/.test(s),offline:/offline|save/.test(s),nocar:/no car|don t have a car|without a car/.test(s)};
return{from,to,modes:modes.length?modes:["minibus","bus","air"],f,allModes:!modes.length}}
const tag=(s,l)=>`<span class="tag ${s}">${l||s}</span>`;
function distKm(a,b){const R=6371,r=x=>x*Math.PI/180,A=CITIES[a],B=CITIES[b];const d=Math.sin(r(B[0]-A[0])/2)**2+Math.cos(r(A[0]))*Math.cos(r(B[0]))*Math.sin(r(B[1]-A[1])/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(d)))}
function fareStatus(list){// conflict detection per operator
const by={};list.forEach(f=>(by[f.op.toLowerCase()]=by[f.op.toLowerCase()]||[]).push(f));return Object.values(by).map(g=>{const prices=[...new Set(g.map(x=>x.price))];return{op:g[0].op,recs:g,disputed:prices.length>1}})}
function fareBlock(mode,from,to){const l=FS().filter(f=>f.mode==mode&&f.from==from&&f.to==to);
if(!l.length)return`<p>${tag("UNAVAILABLE")}No fare record for this route in FareWatch.</p>`;
return fareStatus(l).map(g=>g.disputed?`<p>${tag("DISPUTED")}<b>${esc(g.op)}</b> — conflicting fares: ${g.recs.map(r=>`R${r.price} (${esc(r.src)}, ${r.ts}, ${r.status})`).join(" vs ")}. Not selecting one.</p>`:g.recs.slice(-1).map(r=>`<p>${tag(cls(r.status),r.status)}<b>${esc(g.op)}</b> R${r.price} — source: ${esc(r.src)}; recorded ${r.ts}. Not a booking price.</p>`).join("")).join("")}
function compose(raw){const p=parse(raw),{from,to}=p;let h=`<div class="sec"><h2>ROADPULSE ANSWER · ${now()} (device time)</h2>`;
if(!to){return h+`<div class="miss">I couldn’t find a destination I know. RouteVault currently holds: ${Object.keys(CITIES).join(", ")}. Try “Pretoria to Durban”.</div></div>`}
if(!from){return h+`<div class="miss">I understood the destination as <b>${to}</b> but not where you’re leaving from. Tell me your origin (e.g. “from Pretoria”).</div></div>`}
const km=distKm(from,to);h+=(apiNote?'<div class="miss">'+apiNote+'</div>':"")+`<p>Journey understood: <b>${from} → ${to}</b>${p.f.nocar?" · no private car":""}. Straight-line distance ${km} km ${tag("ESTIMATE","CALCULATED")}road distance and duration not verified.</p>`;
const miss=[];h+=`<div class="grid">`;
if(p.modes.includes("minibus")){const have=FS().some(f=>f.mode=="minibus"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>MINIBUS TAXI</h3>${fareBlock("minibus",from,to)}<dl><dt>Departure rank</dt><dd>${tag("UNAVAILABLE")}not in RouteVault</dd><dt>Direct / transfer</dt><dd>${tag("UNAVAILABLE")}unknown</dd><dt>Duration</dt><dd>${tag("UNAVAILABLE")}unknown</dd></dl><p class="note">No national taxi fare database exists; fares come from verified contributors and operators.</p></div>`;if(!have)miss.push("Minibus: departure rank, association, fare and transfer points for "+from+" → "+to)}
if(p.modes.includes("bus")){const have=FS().some(f=>f.mode=="bus"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>LONG-DISTANCE BUS</h3>${fareBlock("bus",from,to)}<dl><dt>Check operators</dt><dd>${BOOK.bus.map(b=>`<a style="color:var(--gold)" href="${b[1]}" target="_blank" rel="noopener">${b[0]}</a>`).join(" · ")}</dd><dt>Departure points</dt><dd>${tag("UNAVAILABLE")}confirm with operator</dd></dl><p class="note">Whether each operator serves this route is unconfirmed here. Confirm timetable and price on their site.</p></div>`;if(!have)miss.push("Bus: no connected operator fare feed; no fare record")}
if(p.modes.includes("air")){const have=FS().some(f=>f.mode=="air"&&f.from==from&&f.to==to);h+=`<div class="card"><h3>AIR TRAVEL</h3>${fareBlock("air",from,to)}<dl><dt>Airports</dt><dd>${AIRPORTS[from]} → ${AIRPORTS[to]} ${tag("ESTIMATE")}</dd><dt>Check airlines</dt><dd>${BOOK.air.map(b=>`<a style="color:var(--gold)" href="${b[1]}" target="_blank" rel="noopener">${b[0]}</a>`).join(" · ")}</dd></dl><p class="note">Airline coverage of this route is unconfirmed. Prices must be confirmed with the airline. Airport transfer costs are not recorded.</p></div>`;if(!have)miss.push("Air: no flight price source connected; no fare, baggage or schedule")}
const k=[from,to].join("|"),k2=[to,from].join("|"),road=CORR[k]||CORR[k2];
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
function ovTable(){return`<table><tr><th>SOURCE</th><th>CATEGORY</th><th>STATUS</th><th>LAST UPDATE</th><th>NOTE</th></tr>${sources.map(s=>`<tr><td>${esc(s.n)}</td><td>${s.c}</td><td>${s.on?tag("RECENT","ACTIVE"):tag("UNAVAILABLE","NOT CONNECTED")}</td><td>${s.last||"never"}</td><td>${esc(s.note)}</td></tr>`).join("")}</table>`}
async function showAnswer(q){$("#q").value=q;await loadRemote(q);$("#out").innerHTML=compose(q);const b=$("#sj");if(b)b.onclick=()=>{saved.unshift({q,ts:now(),html:$("#out").innerHTML.replace(/<p><button id="sj".*?<\/p>/,"")});save();b.textContent="SAVED ✓"};$("#out").scrollIntoView({behavior:"smooth"})}
function renderSaved(){$("#sv").innerHTML=saved.length?saved.map((s,i)=>`<div class="card" style="margin-bottom:14px"><div class="banner">OFFLINE SNAPSHOT — saved ${s.ts}. Not live. Re-check before travelling.</div><b>${esc(s.q)}</b>${s.html}<p><button class="ghost" data-del="${i}">DELETE</button></p></div>`).join(""):`<p class="note">Nothing saved yet. Ask a question, then choose “Save journey offline”.</p>`;document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{saved.splice(+b.dataset.del,1);save();renderSaved()})}
function renderCmd(){const stale=FS().filter(f=>f.status!="VERIFIED").length,act=sources.filter(s=>s.on).length;
$("#kp").innerHTML=[["PLACES IN ROUTEVAULT",Object.keys(CITIES).length],["REGISTERED ROUTES",0],["ACTIVE SOURCES",act+" / "+sources.length],["FAILED SOURCES",0],["FARE RECORDS",FS().length],["UNVERIFIED FARES",stale],["TRAFFIC INCIDENTS",0],["AI QUERIES",log.length],["OFFLINE PACKS",saved.length]].map(k=>`<div class="card kpi">${k[1]}<small>${k[0]}</small></div>`).join("");
$("#src").innerHTML=ovTable().replace(/<\/tr>/g,"</tr>").replace(/<tr><td>(.*?)<\/td>/g,(m,n)=>m);
$("#src").innerHTML=`<table><tr><th>SOURCE</th><th>CATEGORY</th><th>STATUS</th><th>LAST</th><th>REQUIREMENT</th><th></th></tr>${sources.map((s,i)=>`<tr><td>${esc(s.n)}</td><td>${s.c}</td><td>${s.on?tag("RECENT","ENABLED"):tag("UNAVAILABLE","DISABLED")}</td><td>${s.last||"never"}</td><td>${esc(s.note)}</td><td><button class="ghost" data-t="${i}">${s.on?"DISABLE":"ENABLE"}</button></td></tr>`).join("")}</table>`;
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
const API=((window.PR_CONFIG&&window.PR_CONFIG.API_BASE)||"").replace(/\/$/,"");
let remote=[],apiNote="";
const FS=()=>API?remote:fares;
const cls=s=>s=="VERIFIED"?"VERIFIED":s=="STALE"?"STALE":s=="DISPUTED"?"DISPUTED":s=="UNAVAILABLE"?"UNAVAILABLE":"RECENT";
const iso=t=>new Date(t*1000).toISOString().slice(0,16).replace("T"," ");
const tok=()=>{try{return sessionStorage.getItem("pr_tok")||""}catch(e){return ""}};
async function adm(path,body){
  try{const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok()},body:JSON.stringify(body||{})});
    if(r.status==401){alert("Admin token missing or invalid.");return null}
    if(!r.ok){alert("Request failed ("+r.status+").");return null}
    return await r.json()}catch(e){alert("Could not reach the RoadPulse API.");return null}}
async function fetchFares(from,to){
  remote=[];apiNote="";if(!API)return;
  try{const r=await fetch(API+"/api/fares?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
    if(!r.ok)throw 0;const d=await r.json();if(d.error)throw 0;
    if(d.from_cache)apiNote="Offline: server fares below come from a cached copy as of "+iso(d.as_of)+". They are not live.";
    remote=d.fares.map(f=>({id:f.id,mode:f.mode,from:f.origin,to:f.destination,op:f.operator,price:f.price_zar,src:f.source,status:f.status,ts:iso(f.collected_at)}))}
  catch(e){apiNote="RoadPulse API unreachable — no server fare data available right now."}}
async function loadRemote(q){const p=parse(q);if(p.from&&p.to)await fetchFares(p.from,p.to)}
async function loadSrc(){
  if(!API)return;
  try{const r=await fetch(API+"/api/sources");const d=await r.json();
    sources=d.sources.map(s=>({id:s.id,n:s.name,c:s.category,on:!!s.enabled,last:s.last_success?iso(s.last_success):null,note:s.last_error?("Last error: "+s.last_error):(s.note||"")}))}catch(e){}
  $("#ov").innerHTML=ovTable()}
function renderFares(){
  const L=FS(),el=$("#fl");
  el.innerHTML=L.length?`<table><tr><th>ID</th><th>MODE</th><th>ROUTE</th><th>OPERATOR</th><th>FARE</th><th>SOURCE</th><th>STATUS</th><th>TIME</th><th></th></tr>${L.map(f=>{
    const dis=L.some(g=>g.id!=f.id&&g.mode==f.mode&&g.from==f.from&&g.to==f.to&&g.op.toLowerCase()==f.op.toLowerCase()&&g.price!=f.price),st=dis?"DISPUTED":f.status;
    return`<tr><td>${esc(String(f.id).slice(0,8))}</td><td>${f.mode}</td><td>${f.from} → ${f.to}</td><td>${esc(f.op)}</td><td>R${f.price}</td><td>${esc(f.src)}</td><td>${tag(cls(st),st)}</td><td>${f.ts}</td><td><button class="ghost" data-v="${esc(f.id)}">VERIFY</button>${API?"":` <button class="ghost" data-x="${esc(f.id)}">DELETE</button>`}</td></tr>`}).join("")}</table>`
   :`<p class="note">${API?"No server fares for the selected route.":"No fare records. Nothing is pre-loaded; no prices are invented."}</p>`;
  el.querySelectorAll("[data-v]").forEach(b=>b.onclick=async()=>{
    if(API){await adm("/api/fares/"+b.dataset.v+"/verify");await loadRoute()}
    else{const f=fares.find(x=>x.id==b.dataset.v);if(f)f.status="VERIFIED";save()}renderCmd()});
  el.querySelectorAll("[data-x]").forEach(b=>b.onclick=()=>{fares=fares.filter(x=>x.id!=b.dataset.x);save();renderCmd()})}
async function loadRoute(){const f=new FormData($("#ff"));await fetchFares(f.get("from"),f.get("to"))}
$("#ff").onsubmit=async e=>{
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.from==d.to)return;
  if(API){const r=await adm("/api/fares",{mode:d.mode,origin:d.from,destination:d.to,operator:d.op.trim(),price_zar:+d.price,source:d.src.trim()});if(r)await fetchFares(d.from,d.to)}
  else{fares.push({id:"F"+(fares.length+1)+"-"+Date.now().toString(36).slice(-4),mode:d.mode,from:d.from,to:d.to,op:d.op.trim(),price:+d.price,src:d.src.trim(),status:"RECENT REPORT",ts:now()});sources[7].on=true;sources[7].last=now();save()}
  e.target.reset();renderCmd()};
document.querySelectorAll(".cs").forEach(s=>s.addEventListener("change",async()=>{if(API){await loadRoute();renderCmd()}}));
// token + visibility of API-only controls
$("#tf").classList.toggle("hide",!API);$("#tok").value=tok();
$("#tok").onchange=e=>{try{sessionStorage.setItem("pr_tok",e.target.value)}catch(_){}};
// offline banner
const net=()=>$("#net").classList.toggle("hide",navigator.onLine);
addEventListener("online",()=>{net();loadSrc()});addEventListener("offline",net);net();
// service worker
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
addEventListener("hashchange",route);route();loadSrc();
