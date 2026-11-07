// Public home → verified platform sign-in → three small choices → neighborhood explorer.
let session={user:null,hosted:false},wizardStep=0,wizardLocation=null,wizardInterests=new Set(),wizardResults=[],wizardAbort;
const route=new URL(location.href);let pageMode=route.pathname==='/onboarding'?'onboarding':['/explore','/preview'].includes(route.pathname)?'explore':'home';
if(route.pathname==='/preview'&&route.searchParams.get('wizard')==='1')pageMode='onboarding';
document.body.dataset.page=pageMode;const skip=$('.skip-link');skip.href=pageMode==='home'?'#experience':pageMode==='onboarding'?'#wizard-content':'#explorer-panel';skip.textContent=pageMode==='home'?'Skip to the experience':pageMode==='onboarding'?'Skip to onboarding':'Skip to results';
$('#home-view').hidden=pageMode!=='home';$('#onboarding-view').hidden=pageMode!=='onboarding';$('#explorer-view').hidden=pageMode!=='explore';
$('#home-credits').onclick=()=>$('#about-dialog').showModal();
async function begin(){
 try{session=await api('/api/session');}catch{}
 window.patriaUser=session.user;configureSaved(session.user);
 document.title=pageMode==='home'?'Patria — Find your kind of nearby':pageMode==='onboarding'?'Make it yours — Patria':'Explore your neighborhood — Patria';
 if(session.user)installAccountMenu();
 if(session.user){document.querySelectorAll('.signin-link,.hero-cta').forEach(a=>{a.href='/explore';if(a.classList.contains('signin-link'))a.textContent='My experience';});}
 const profileKey='patria-profile:'+(session.user?.id||'preview');
 if(pageMode==='onboarding'){
  if(!session.user&&route.pathname!=='/preview'){location.assign('/signin-with-chatgpt?return_to=%2Fonboarding');return;}
  try{const p=JSON.parse(localStorage.getItem(profileKey)||'null');if(p){wizardInterests=new Set((p.interests||[]).filter(i=>categoryNames[i]));if(p.areaId)wizardLocation={areaId:p.areaId,name:neighborhoods.find(a=>a.id===p.areaId)?.name||'Kensington Market'};else wizardLocation=profileLocation(p);}}catch{}
  renderWizard();
 }
 if(pageMode==='explore'){
  const area=neighborhoods.find(a=>a.id===route.searchParams.get('area'));if(area)await loadLocation(area);
  await initializeMap();
  
 }
 if(route.searchParams.get('signin')==='local')showLocalSignin();
}
function installAccountMenu(){const header=$('.header');header.insertAdjacentHTML('beforeend','<button class="profile-link" id="account-button" aria-label="Your account" aria-expanded="false">'+icon('compass')+'</button><div class="account-menu" id="account-menu" hidden><p>'+esc(session.user.name)+'</p><a href="/onboarding">Exploration preferences</a><a href="/signout-with-chatgpt?return_to=%2F" target="_top">Sign out</a></div>');const menu=$('#account-menu'),button=$('#account-button');button.onclick=()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));};document.addEventListener('click',e=>{if(!menu.contains(e.target)&&!button.contains(e.target)){menu.hidden=true;button.setAttribute('aria-expanded','false');}});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){menu.hidden=true;button.setAttribute('aria-expanded','false');button.focus();}});}
function showLocalSignin(){const dialog=$('#signin-dialog');$('#signin-info').textContent='Sign-in runs on the hosted site. This preview uses the event index on this device.';$('#platform-signin').textContent='Open the local event preview';$('#platform-signin').href='/preview?events=1';$('#platform-signin').removeAttribute('target');dialog.showModal();}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/signin-with-chatgpt"]');if(a&&!session.hosted){e.preventDefault();showLocalSignin();}});
function renderWizard(){
 $('#wizard-step-label').textContent=`Step ${wizardStep+1} of 2`;
 document.querySelectorAll('.wizard-progress>div>span').forEach((s,i)=>s.classList.toggle('active',i<=wizardStep));
 $('#wizard-back').hidden=wizardStep===0;$('#wizard-next').textContent=wizardStep===1?'Save starting point':'Continue';
 const content=$('#wizard-content');
 if(wizardStep===0){content.innerHTML=`<span class="eyebrow">A PLACE TO BEGIN</span><h1>Where would you<br>like to explore?</h1><p class="wizard-description">Start close to home, or somewhere entirely new. A neighborhood, city, or address is all you need.</p><form class="wizard-location-form" id="wizard-search-form"><span>${icon('search')}</span><label class="sr-only" for="wizard-location">Location to explore</label><input id="wizard-location" placeholder="Search a neighborhood or address" maxlength="180" required autocomplete="off"><button type="submit" aria-label="Search locations">${icon('search')}</button></form><p id="wizard-search-status" class="wizard-search-status" role="status"></p><div id="wizard-results"></div><div id="selected-location" class="selected-location" ${wizardLocation?'':'hidden'}>${icon('pin')}<span>${esc(wizardLocation?.name||'')}</span></div><div class="wizard-suggestions"><p>OR TRY A TORONTO STARTING POINT</p>${neighborhoods.map(a=>`<button class="wizard-area ${wizardLocation?.areaId===a.id?'selected':''}" data-wizard-area="${a.id}"><img src="assets/${a.image}" alt="${esc(a.alt)}"><span><strong>${esc(a.name)}</strong><small>${esc(a.vibe)}</small></span></button>`).join('')}</div>`;$('#wizard-next').disabled=!wizardLocation;
  $('#wizard-search-form').onsubmit=searchWizard;
 }else if(wizardStep===1){content.innerHTML=`<span class="eyebrow">FOLLOW WHAT YOU LOVE</span><h1>What makes a place<br>feel like your kind of place?</h1><p class="wizard-description">Pick the things you naturally gravitate toward. We’ll bring them a little closer.</p><div class="wizard-choice-list">${Object.entries(categoryNames).filter(([k])=>k!=='all').map(([k,v])=>`<label class="wizard-choice"><input type="checkbox" value="${k}" ${wizardInterests.has(k)?'checked':''}>${icon(k)}<span>${v}</span></label>`).join('')}</div><p class="wizard-description">Or leave these open and see what catches your eye.</p>`;$('#wizard-next').disabled=false;content.querySelectorAll('input').forEach(c=>c.onchange=()=>c.checked?wizardInterests.add(c.value):wizardInterests.delete(c.value));
 }
}
async function searchWizard(e){e.preventDefault();const q=$('#wizard-location').value.trim();if(!q)return;wizardAbort?.abort();const controller=new AbortController();wizardAbort=controller;const button=$('#wizard-search-form button');button.disabled=true;$('#wizard-search-status').textContent='Finding a place to start…';$('#wizard-results').innerHTML='';try{const d=await api('/api/search?country=CA&q='+encodeURIComponent(q),controller.signal);if(controller.signal.aborted)return;wizardResults=d.locations;$('#wizard-search-status').textContent=wizardResults.length?'Choose your starting point:':'No location found. Try a city name or a fuller address.';$('#wizard-results').innerHTML=wizardResults.map((p,i)=>`<button class="search-result" data-wizard-result="${i}">${esc(p.name)}<small>${esc(p.address)}</small></button>`).join('');}catch(error){if(error.name!=='AbortError')$('#wizard-search-status').textContent=error.message;}finally{if(!controller.signal.aborted)button.disabled=false;}}
document.addEventListener('click',e=>{const area=e.target.closest('[data-wizard-area]');if(area){wizardAbort?.abort();const a=neighborhoods.find(n=>n.id===area.dataset.wizardArea);wizardLocation={areaId:a.id,name:a.name};renderWizard();}const result=e.target.closest('[data-wizard-result]');if(result){const p=wizardResults[Number(result.dataset.wizardResult)];wizardLocation={name:p.name,center:[p.lat,p.lng]};renderWizard();}});
$('#wizard-back').onclick=()=>{wizardAbort?.abort();wizardStep=Math.max(0,wizardStep-1);renderWizard();};
$('#wizard-next').onclick=()=>{wizardAbort?.abort();if(wizardStep===0&&!wizardLocation)return;if(wizardStep<1){wizardStep++;renderWizard();return;}const profile={interests:[...wizardInterests],...(wizardLocation.areaId?{areaId:wizardLocation.areaId}:{location:wizardLocation})};try{localStorage.setItem('patria-profile:'+(session.user?.id||'preview'),JSON.stringify(profile));}catch{toast('Your browser could not save your preferences. This experience is still available.');}location.assign(session.user?'/explore':'/preview');};
icons();begin();
