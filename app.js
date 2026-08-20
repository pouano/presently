let currentUser = null;
let idToken = null;
let courses = [];
const $ = id => document.getElementById(id);
const cfg = window.PRESENTLY_CONFIG;
let deferredInstallPrompt = null;

function isInstalledPwa(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
function setupInstallPrompt(){
  const installPrompt=$('installPrompt'), signInPrompt=$('signInPrompt'), btn=$('installBtn'), text=$('installText');
  if(isInstalledPwa()){ installPrompt.classList.add('hidden'); signInPrompt.classList.remove('hidden'); return; }
  installPrompt.classList.remove('hidden'); signInPrompt.classList.add('hidden');
  if(isIOS()){
    text.textContent='Add Presently to your Home Screen to continue.';
    btn.textContent='Add to Home Screen';
    btn.onclick=()=>alert('In Safari, tap Share, then choose “Add to Home Screen”.');
    return;
  }
  text.textContent='Add Presently to your Home Screen to continue.';
  btn.textContent='Add to Home Screen';
  btn.onclick=async()=>{
    if(!deferredInstallPrompt){ alert('Use your browser menu to add Presently to your Home Screen.'); return; }
    deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; setupInstallPrompt();
  };
}
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; setupInstallPrompt(); });
window.addEventListener('appinstalled',()=>{ deferredInstallPrompt=null; setupInstallPrompt(); });

function showMessage(text,type=''){ const el=$('message'); el.textContent=text; el.className='card '+(type==='error'?'error':''); el.classList.remove('hidden'); }
function clearMessage(){ $('message').classList.add('hidden'); }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function fmtDate(value){ if(!value) return ''; const d=new Date(value); if(Number.isNaN(d.getTime())) return String(value); return d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'}); }
function fmtDatetimeLocal(value){ const d=value?new Date(value):new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
async function api(action,extra={}){
  if(!idToken) throw new Error('Please sign in with Google.');
  const res=await fetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,credential:idToken,...extra})});
  const data=await res.json(); if(!data.ok) throw new Error(data.error||'Something went wrong.'); return data;
}
function decodeJwt(token){ const b=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(decodeURIComponent(atob(b).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''))); }
function handleCredentialResponse(response){ idToken=response.credential; const p=decodeJwt(response.credential); currentUser={email:p.email,name:p.name}; boot(); }
async function boot(){
  try{
    const data=await api('bootstrap'); currentUser=data.user; courses=data.courses||[];
    $('login').classList.add('hidden'); $('app').classList.remove('hidden'); $('logout').classList.remove('hidden');
    $('userCard').innerHTML=`<div><div class="big">${esc(currentUser.name)}</div><div class="small muted">${esc(currentUser.email)} · ${esc(data.user.role)}</div></div>`;
    if(data.user.role==='trainee') { $('trainerView').classList.add('hidden'); $('traineeView').classList.remove('hidden'); loadActive(); }
    else { $('traineeView').classList.add('hidden'); $('trainerView').classList.remove('hidden'); loadTrainer(); }
  }catch(e){ showMessage(e.message,'error'); }
}
async function loadActive(){
  try{
    const data=await api('activeTrainings'); const list=data.trainings||[];
    $('traineeView').innerHTML=`<div class="section-head"><div><h2>Attendance</h2><div class="muted">Trainings currently accepting attendance</div></div><button class="btn secondary" onclick="loadActive()">Refresh</button></div>`+
      (list.length?list.map(t=>`<div class="card attendance"><div class="row"><div><div class="big">${esc(t.title)}</div><div class="small muted">${esc(t.courseName||'')} · ${esc(t.locationName||'')}</div></div><span class="pill">OPEN</span></div><p class="small">${fmtDate(t.startAt)} – ${fmtDate(t.endAt)}</p><button class="btn" onclick="attend('${esc(t.trainingId)}')">I'm Present</button></div>`).join(''):'<div class="card"><p class="muted">No attendance is currently open.</p></div>');
  }catch(e){showMessage(e.message,'error');}
}
async function attend(id){
  if(!navigator.geolocation){showMessage('Location is not available in this browser.','error');return;}
  showMessage('Getting your location…');
  navigator.geolocation.getCurrentPosition(async pos=>{ try{ const d=await api('markAttendance',{trainingId:id,latitude:pos.coords.latitude,longitude:pos.coords.longitude}); showMessage(d.alreadyPresent?`You are already marked present. (${d.distanceMeters} m away)`:`Attendance recorded. (${d.distanceMeters} m away)`); loadActive(); }catch(e){showMessage(e.message,'error');} },()=>showMessage('Location permission is required to mark attendance.','error'),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
}

async function loadTrainer(){
  try{
    const [cdata,tdata]=await Promise.all([api('listCourses'),api('listTrainings')]);
    courses=cdata.courses||[]; const trainings=tdata.trainings||[];
    const byCourse={}; trainings.forEach(t=>(byCourse[t.courseId]??=[]).push(t));
    const ownerSelect=currentUser.role==='admin';
    $('trainerView').innerHTML=`
      <div class="section-head"><div><h2>Courses</h2><div class="muted">Create courses and manage their trainings.</div></div><button class="btn" onclick="showCourseForm()">+ Create Course</button></div>
      <div id="courseForm" class="card hidden"></div>
      <div id="courseList">${courses.length?courses.map(c=>courseCard(c,byCourse[c.courseId]||[])).join(''):'<div class="card"><p class="muted">No courses yet. Create your first course.</p></div>'}</div>`;
  }catch(e){showMessage(e.message,'error');}
}
function courseCard(c,trainings){
  return `<div class="card"><div class="row"><div><div class="big">${esc(c.name)}</div><div class="small muted">${esc(c.description||'')}${currentUser.role==='admin'?` · ${esc(c.trainerEmail)}`:''}</div></div><button class="btn" onclick="showTrainingForm('${esc(c.courseId)}')">+ Training</button></div>
  <div class="training-list">${trainings.length?trainings.map(trainingCard).join(''):'<div class="small muted" style="margin-top:14px">No trainings yet.</div>'}</div>
  <div id="training-form-${esc(c.courseId)}" class="hidden"></div></div>`;
}
function trainingCard(t){
  const action=t.status==='open'?`<button class="btn danger" onclick="closeT('${esc(t.trainingId)}')">Close Attendance</button>`:t.status==='closed'?`<span class="pill">CLOSED</span>`:`<button class="btn" onclick="startT('${esc(t.trainingId)}')">Start Attendance</button>`;
  return `<div class="training-item"><div><strong>${esc(t.title)}</strong><div class="small muted">${fmtDate(t.startAt)} – ${fmtDate(t.endAt)}</div><div class="small muted">${esc(t.locationName||'')} · ${Math.round(t.radiusMeters)} m radius</div></div><div class="actions">${action}<button class="btn secondary" onclick="viewAttendance('${esc(t.trainingId)}')">Attendance</button></div></div>`;
}
function showCourseForm(){
  const el=$('courseForm'); el.classList.remove('hidden');
  el.innerHTML=`<h3>Create Course</h3><div class="grid"> <div class="field"><label>Course name</label><input id="courseName" placeholder="e.g. IT Laws"></div><div class="field"><label>Description <span class="muted">(optional)</span></label><input id="courseDescription" placeholder="e.g. 2026 Semester 1"></div>${currentUser.role==='admin'?`<div class="field"><label>Trainer</label><select id="courseTrainer"><option value="${esc(currentUser.email)}">Myself (${esc(currentUser.email)})</option></select></div>`:''}</div><div class="row" style="margin-top:14px"><button class="btn secondary" onclick="hideCourseForm()">Cancel</button><button class="btn" onclick="createCourseFromForm()">Create Course</button></div>`;
  if(currentUser.role==='admin') loadAuthorizedTrainerOptions();
}
async function loadAuthorizedTrainerOptions(){
  try{const d=await api('authorizedTrainers'); const s=$('courseTrainer'); if(!s)return; s.innerHTML=`<option value="${esc(currentUser.email)}">Myself (${esc(currentUser.email)})</option>`+(d.trainers||[]).map(t=>`<option value="${esc(t.email)}">${esc(t.name||t.email)} (${esc(t.email)})</option>`).join('');}catch(e){showMessage(e.message,'error');}
}
function hideCourseForm(){ $('courseForm').classList.add('hidden'); }
async function createCourseFromForm(){
  try{ const name=$('courseName').value.trim(); const description=$('courseDescription').value.trim(); const trainerEmail=currentUser.role==='admin'?$('courseTrainer').value:currentUser.email; if(!name) throw new Error('Course name is required.'); await api('createCourse',{name,description,trainerEmail}); hideCourseForm(); loadTrainer(); }catch(e){showMessage(e.message,'error');}
}
function showTrainingForm(courseId){
  const el=$(`training-form-${courseId}`); el.classList.remove('hidden');
  const now=new Date(), start=new Date(now.getTime()+10*60000), end=new Date(now.getTime()+70*60000);
  el.innerHTML=`<div class="form-divider"></div><h3>Create Training</h3><div class="grid"><div class="field"><label>Training title</label><input id="tt-${courseId}" placeholder="e.g. Week 1 / Training #1"></div><div class="field"><label>Location name</label><input id="loc-${courseId}" placeholder="e.g. USC Law Classroom 3"></div><div class="grid two"><div class="field"><label>Start</label><input type="datetime-local" id="start-${courseId}" value="${fmtDatetimeLocal(start)}"></div><div class="field"><label>End</label><input type="datetime-local" id="end-${courseId}" value="${fmtDatetimeLocal(end)}"></div></div><div class="grid two"><div class="field"><label>Attendance radius (meters)</label><input type="number" min="10" step="10" id="rad-${courseId}" value="100"></div><div class="field"><label>Location coordinates</label><div class="row-inline"><input id="coord-${courseId}" readonly placeholder="Not captured"><button class="btn secondary" onclick="captureTrainingLocation('${courseId}')">Use my location</button></div></div></div></div><div class="row" style="margin-top:14px"><button class="btn secondary" onclick="cancelTrainingForm('${courseId}')">Cancel</button><button class="btn" onclick="createTrainingFromForm('${courseId}')">Create Training</button></div>`;
}
function cancelTrainingForm(courseId){$(`training-form-${courseId}`).classList.add('hidden');}
async function captureTrainingLocation(courseId){
  if(!navigator.geolocation){showMessage('Location is not available in this browser.','error');return;}
  showMessage('Getting the training location…');
  navigator.geolocation.getCurrentPosition(pos=>{ const lat=pos.coords.latitude,lng=pos.coords.longitude; $(`coord-${courseId}`).value=`${lat.toFixed(6)}, ${lng.toFixed(6)}`; $(`coord-${courseId}`).dataset.lat=lat; $(`coord-${courseId}`).dataset.lng=lng; clearMessage(); },()=>showMessage('Location permission is required to set the training location.','error'),{enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
async function createTrainingFromForm(courseId){
  try{
    const coord=$(`coord-${courseId}`); const lat=Number(coord.dataset.lat),lng=Number(coord.dataset.lng); if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error('Click “Use my location” to set the training location.');
    const title=$(`tt-${courseId}`).value.trim(); const locationName=$(`loc-${courseId}`).value.trim(); const startAt=$(`start-${courseId}`).value; const endAt=$(`end-${courseId}`).value; const radius=Number($(`rad-${courseId}`).value||100);
    if(!title) throw new Error('Training title is required.'); if(!startAt||!endAt) throw new Error('Start and end times are required.'); if(new Date(endAt)<=new Date(startAt)) throw new Error('End time must be after start time.'); if(radius<10) throw new Error('Radius must be at least 10 meters.');
    await api('createTraining',{courseId,title,locationName,latitude:lat,longitude:lng,radiusMeters:radius,startAt,endAt}); loadTrainer();
  }catch(e){showMessage(e.message,'error');}
}
async function startT(id){try{await api('startTraining',{trainingId:id});loadTrainer();}catch(e){showMessage(e.message,'error');}}
async function closeT(id){try{await api('closeTraining',{trainingId:id});loadTrainer();}catch(e){showMessage(e.message,'error');}}
async function viewAttendance(id){try{const d=await api('attendanceForTraining',{trainingId:id}); const rows=d.attendance||[]; alert(rows.length?rows.map((x,i)=>`${i+1}. ${x.name} — ${x.email} — ${fmtDate(x.timestamp)}`).join('\n'):'No attendance yet.');}catch(e){showMessage(e.message,'error');}}
function logout(){currentUser=null;idToken=null;location.reload();}
$('logout').onclick=logout;
function renderGoogleButton(){if(window.google&&!currentUser){google.accounts.id.initialize({client_id:cfg.GOOGLE_CLIENT_ID,callback:handleCredentialResponse});google.accounts.id.renderButton($('googleBtn'),{theme:'outline',size:'large',width:280});}}
window.onload=()=>{setupInstallPrompt();renderGoogleButton();};
window.addEventListener('load',()=>setTimeout(()=>{setupInstallPrompt();renderGoogleButton();},800));
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
