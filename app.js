let currentUser = null;
let idToken = null;
let courses = [];
const $ = id => document.getElementById(id);
const cfg = window.PRESENTLY_CONFIG;

let deferredInstallPrompt = null;

function isInstalledPwa(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function setupInstallPrompt(){
  const installPrompt = $('installPrompt');
  const signInPrompt = $('signInPrompt');
  const installBtn = $('installBtn');
  const installTitle = $('installTitle');
  const installText = $('installText');

  if(isInstalledPwa()){
    installPrompt.classList.add('hidden');
    signInPrompt.classList.remove('hidden');
    return;
  }

  installPrompt.classList.remove('hidden');
  signInPrompt.classList.add('hidden');

  if(isIOS()){
    installTitle.textContent = 'Add Presently to Home Screen';
    installText.textContent = 'Tap Share in Safari, then choose “Add to Home Screen”.';
    installBtn.textContent = 'Add Presently to Home Screen';
    installBtn.onclick = () => alert('In Safari, tap Share, then choose “Add to Home Screen”.');
    return;
  }

  installTitle.textContent = 'Install Presently';
  installText.textContent = 'Add Presently to your Home Screen to continue.';
  installBtn.textContent = 'Install Presently';
  installBtn.onclick = async () => {
    if(!deferredInstallPrompt){
      alert('Use your browser menu to install Presently or add it to your Home Screen.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    setupInstallPrompt();
  };
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  setupInstallPrompt();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setupInstallPrompt();
});

function showMessage(text, type='') { const el=$('message'); el.textContent=text; el.className='card '+(type==='error'?'error':''); el.classList.remove('hidden'); }
function clearMessage(){ $('message').classList.add('hidden'); }
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
async function api(action, extra={}) {
  if(!idToken) throw new Error('Please sign in with Google.');
  const body={action, credential:idToken, ...extra};
  const res=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body)});
  const data=await res.json(); if(!data.ok) throw new Error(data.error||'Something went wrong.'); return data;
}
function handleCredentialResponse(response){
  idToken = response.credential;
  const payload=decodeJwt(response.credential);
  currentUser={email:payload.email,name:payload.name};
  boot();
}
function decodeJwt(token){const b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(atob(b).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));}
async function boot(){
  try{const data=await api('bootstrap'); courses=data.courses||[]; $('login').classList.add('hidden'); $('app').classList.remove('hidden'); $('logout').classList.remove('hidden'); $('userCard').innerHTML=`<div class="row"><div><strong>${esc(currentUser.name)}</strong><div class="small muted">${esc(currentUser.email)}</div></div><span class="pill">${esc(data.user.role)}</span></div>`; render(data.user.role);}
  catch(e){showMessage(e.message,'error');}
}
function render(role){
  if(role==='trainee') { $('trainerView').classList.add('hidden'); $('traineeView').classList.remove('hidden'); loadActive(); }
  else { $('traineeView').classList.add('hidden'); $('trainerView').classList.remove('hidden'); loadTrainer(); }
}
async function loadActive(){
  try{const data=await api('activeTrainings'); const list=data.trainings||[]; $('traineeView').innerHTML=`<div class="card"><h2>Attendance</h2>${list.length?list.map(t=>`<div class="card attendance"><div class="big">${esc(t.title)}</div><div class="muted">${esc(t.locationName||'')}</div><p class="small">Attendance is open now.</p><button class="btn" onclick="attend('${t.trainingId}')">I'm Present</button></div>`).join(''):'<p class="muted">No attendance is currently open.</p>'}</div>`;}
  catch(e){showMessage(e.message,'error');}
}
async function attend(id){
  if(!navigator.geolocation){showMessage('Location is not available in this browser.','error');return;}
  showMessage('Getting your location…');
  navigator.geolocation.getCurrentPosition(async pos=>{try{const d=await api('markAttendance',{trainingId:id,latitude:pos.coords.latitude,longitude:pos.coords.longitude});showMessage(d.alreadyPresent?`You are already marked present. (${d.distanceMeters} m away)`:`Attendance recorded. (${d.distanceMeters} m away)`);loadActive();}catch(e){showMessage(e.message,'error');}},err=>showMessage('Location permission is required to mark attendance.','error'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
}
async function loadTrainer(){
  try{const data=await api('listTrainings'); $('trainerView').innerHTML=`<div class="card"><h2>Trainer</h2><div class="row"><span class="muted">Courses: ${courses.length}</span><button class="btn" onclick="newCourse()">New course</button></div></div><div class="card"><h2>Trainings</h2>${(data.trainings||[]).map(t=>`<div class="card"><div class="row"><div><strong>${esc(t.title)}</strong><div class="small muted">${esc(t.locationName||'')} · ${esc(t.status)}</div></div>${t.status==='open'?`<button class="btn danger" onclick="closeT('${t.trainingId}')">Close</button>`:`<button class="btn" onclick="startT('${t.trainingId}')">Start</button>`}</div><button class="btn secondary" style="margin-top:10px" onclick="viewAttendance('${t.trainingId}')">View attendance</button></div>`).join('')||'<p class="muted">No trainings yet.</p>'}</div>`;}
  catch(e){showMessage(e.message,'error');}
}
async function newCourse(){const name=prompt('Course name:');if(!name)return;try{await api('createCourse',{name});const d=await api('listCourses');courses=d.courses;loadTrainer();}catch(e){showMessage(e.message,'error');}}
async function startT(id){try{await api('startTraining',{trainingId:id});loadTrainer();}catch(e){showMessage(e.message,'error');}}
async function closeT(id){try{await api('closeTraining',{trainingId:id});loadTrainer();}catch(e){showMessage(e.message,'error');}}
async function viewAttendance(id){try{const d=await api('attendanceForTraining',{trainingId:id});alert((d.attendance||[]).map(x=>`${x.name} — ${x.email}`).join('\n')||'No attendance yet.');}catch(e){showMessage(e.message,'error');}}
function logout(){currentUser=null;idToken=null;location.reload();}
$('logout').onclick=logout;
function renderGoogleButton(){if(window.google && !currentUser){google.accounts.id.initialize({client_id:cfg.GOOGLE_CLIENT_ID,callback:handleCredentialResponse});google.accounts.id.renderButton($('googleBtn'),{theme:'outline',size:'large',width:280});}}
window.onload=()=>{ setupInstallPrompt(); renderGoogleButton(); };
window.addEventListener('load',()=>setTimeout(()=>{ setupInstallPrompt(); renderGoogleButton(); },800));
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
