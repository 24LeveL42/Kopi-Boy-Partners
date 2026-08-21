let currentRole=null,currentCook=null,currentRider=null,cookChannel=null,riderChannel=null,selectedPhoto="",currentLiveOrder=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function go(id){document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));if($(id))$(id).classList.add("active");}
function toast(m){const t=$("toast");t.textContent=m;t.style.display="block";clearTimeout(window.tt);window.tt=setTimeout(()=>t.style.display="none",1800);}
function statusLabel(s){return({placed:"Order Placed",accepted:"Cook Accepted",declined:"Declined",looking_for_rider:"Looking for Rider",rider_accepted:"Rider Accepted",cooking:"Cooking",ready:"Ready for Pickup",out_for_delivery:"Out for Delivery",delivered:"Delivered"})[s]||s;}
async function session(){
  if(!window.KOPI_SUPABASE_READY){
    toast("Kopi Boy database not connected");
    return null;
  }

  const {data:{session},error}=await supabase.auth.getSession();

  if(error){
    toast("Authentication check failed");
    return null;
  }

  return session||null;
}
async function choosePartner(role){
  currentRole=role;

  localStorage.setItem("kb_partner_pending_role",role);

  if(!kbAuthReady()){
    toast("Kopi Boy database is not connected");
    return;
  }

  const user=await kbGetUser();

  if(user){
    localStorage.removeItem("kb_partner_pending_role");

    if(role==="cook"){
      go("cookAccess");
      loadCookSelectors();
    }else{
      go("riderAccess");
      loadRiderSelectors();
    }

    return;
  }

  kbOpenAuth(
    role==="cook"
      ? "Sign in to register as a Cook"
      : "Sign in to register as a Rider"
  );
}
async function loadCookSelectors(){await session();const {data,error}=await supabase.from("merchants").select("id,name,status,active").eq("status","approved").eq("active",true).order("name");$("cookSelector").innerHTML="<option value=''>Select your name</option>"+(data||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");if(error)toast("Could not load approved cooks");}
async function enterCook(){const id=$("cookSelector").value;if(!id)return toast("Select your name");const {data,error}=await supabase.from("merchants").select("*").eq("id",id).single();if(error)return toast("Cook profile not found");currentCook=data;$("cookName").textContent=data.name+" · Cook";renderCookProfile();go("cookDashboard");initCook();loadMenu();}
function toggleSfaFields(){$('sfaFields').classList.toggle('hidden',!$('cookSfaLicensed').checked);}
async function submitCookApplication(){const ack=$('cookComplianceAck').checked;if(!ack)return toast('Please acknowledge the food-safety requirements');const p={full_name:$('cookFullName').value.trim(),display_name:$('cookDisplayName').value.trim(),phone:$('cookPhone').value.trim(),food_type:$('cookType').value.trim(),bio:$('cookBio').value.trim(),operating_start:$('cookOpen').value,operating_end:$('cookClose').value,daily_capacity:Number($('cookCapacity').value||20),service_area:$('cookArea').value.trim(),service_postal_codes:$('cookPostalCodes').value.trim(),sfa_licensed:$('cookSfaLicensed').checked,sfa_licence_type:$('cookSfaLicenceType').value.trim(),sfa_licence_number:$('cookSfaLicenceNumber').value.trim(),sfa_licence_expiry:$('cookSfaLicenceExpiry').value||null,sfa_document_name:$('cookSfaDocument').files?.[0]?.name||null,compliance_ack:true,compliance_ack_version:'2026-08-21',compliance_ack_at:new Date().toISOString(),status:'pending'};if(!p.full_name||!p.display_name||!p.phone)return toast('Name, kitchen name and phone required');if(p.sfa_licensed&&!p.sfa_licence_number)return toast('Enter the SFA licence number or untick the licence box');const {error}=await supabase.from('cook_applications').insert(p);if(error)return toast(error.message);$('cookAccessStatus').textContent='Application submitted. Waiting for management approval.';go('cookAccess');loadCookSelectors();toast('Application submitted ✓');}

function renderCookProfile(){$("cookProfileContent").innerHTML=`<div class="profile-card"><div class="profile-icon">👨‍🍳</div><h2>${esc(currentCook.name)}</h2><p>${esc(currentCook.type||"Local Food")}</p><div class="profile-grid"><span>Orders</span><b>${esc(currentCook.order_open||"--")}–${esc(currentCook.order_close||"--")}</b><span>Cooking</span><b>${esc(currentCook.operating_start||"--")}–${esc(currentCook.operating_end||"--")}</b><span>Capacity</span><b>${currentCook.daily_capacity||"--"} pax</b></div><p>${esc(currentCook.bio||"")}</p><button class="orange full" onclick="go('cookMenu')">MANAGE TODAY'S MENU</button></div>`;}
function timeline(o){return `<div class="timeline">${[["placed_at","Order placed"],["accepted_at","Cook accepted"],["rider_requested_at","Looking for rider"],["rider_accepted_at","Rider accepted"],["cooking_at","Cooking"],["ready_at","Food ready"],["picked_up_at","Collected"],["delivered_at","Delivered"]].map(([f,l])=>`<div class="timeline-row ${o[f]?"done":""}"><b>${l}</b><span>${o[f]?new Date(o[f]).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Waiting"}</span></div>`).join("")}</div>`;}
function cookAction(o){if(o.status==="placed")return `<button class="green full" onclick="cookStatus('${o.id}','accepted')">ACCEPT ORDER</button><button class="decline full" onclick="cookStatus('${o.id}','declined')">DECLINE</button>`;if(o.status==="accepted")return `<button class="orange full" onclick="cookStatus('${o.id}','looking_for_rider')">FIND RIDER</button>`;if(o.status==="rider_accepted")return `<button class="green full" onclick="cookStatus('${o.id}','cooking')">START COOKING</button>`;if(o.status==="cooking")return `<button class="green full" onclick="cookStatus('${o.id}','ready')">FOOD READY</button>`;return "";}
function renderCookOrder(o){$("incomingOrderArea").innerHTML=`<div class="incoming-order"><div style="display:flex;justify-content:space-between"><h3>🔔 ${statusLabel(o.status)}</h3><span class="status-pill ${o.status}">${o.status}</span></div><div>${o.order_number}</div><div class="incoming-items">${(o.items||[]).map(x=>`${esc(x.name)} <b style="float:right">x${x.qty||1} · $${Number(x.price).toFixed(2)}</b>`).join("<br>")}<hr><b>Total</b><b style="float:right">$${Number(o.total).toFixed(2)}</b></div>${o.rider_name?`<div class="job-line"><span>Rider</span><b>🛵 ${esc(o.rider_name)}</b></div>`:""}${timeline(o)}${cookAction(o)}</div>`;}
async function initCook(){await session();$("cookLiveStatus").textContent="LIVE · receiving orders";if(cookChannel)supabase.removeChannel(cookChannel);cookChannel=supabase.channel("cook-"+currentCook.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"orders",filter:`merchant_id=eq.${currentCook.id}`},p=>{renderCookOrder(p.new);toast("🔔 New order received");}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders",filter:`merchant_id=eq.${currentCook.id}`},p=>renderCookOrder(p.new)).subscribe();}
async function cookStatus(id,status){const patch={status};const now=new Date().toISOString();({accepted:()=>patch.accepted_at=now,declined:()=>patch.declined_at=now,looking_for_rider:()=>patch.rider_requested_at=now,cooking:()=>patch.cooking_at=now,ready:()=>patch.ready_at=now}[status]?.());const {data,error}=await supabase.from("orders").update(patch).eq("id",id).select().single();if(error)return toast(error.message);renderCookOrder(data);toast(statusLabel(status)+" ✓");}
async function loadMenu(){if(!currentCook)return;const {data}=await supabase.from("merchants").select("*").eq("id",currentCook.id).single();if(data)currentCook=data;$("menuNote").value=currentCook.menu_note||"";$("orderOpen").value=currentCook.order_open||"09:00";$("orderClose").value=currentCook.order_close||"14:00";$("cookStart").value=currentCook.operating_start||"10:00";$("cookEnd").value=currentCook.operating_end||"16:00";updateToggle();loadDishes();}
function updateToggle(){$("menuStatusTitle").textContent=currentCook.menu_live===false?"Menu is OFF":"Menu is live";$("menuToggle").textContent=currentCook.menu_live===false?"OFF":"ON";$("menuToggle").className="toggle "+(currentCook.menu_live===false?"off":"on");$("menuStatusText").textContent=currentCook.menu_live===false?"Customers cannot order":`Orders ${currentCook.order_open||"--"}–${currentCook.order_close||"--"}`;}
async function toggleMenu(){const {data,error}=await supabase.from("merchants").update({menu_live:currentCook.menu_live===false}).eq("id",currentCook.id).select().single();if(error)return toast(error.message);currentCook=data;updateToggle();toast(currentCook.menu_live?"Menu live ✓":"Menu cancelled");}
async function saveMenuSettings(){const patch={menu_note:$("menuNote").value.trim(),order_open:$("orderOpen").value,order_close:$("orderClose").value,operating_start:$("cookStart").value,operating_end:$("cookEnd").value};const {data,error}=await supabase.from("merchants").update(patch).eq("id",currentCook.id).select().single();if(error)return toast(error.message);currentCook=data;updateToggle();renderCookProfile();toast("Menu settings saved ✓");}
function previewPhoto(e){const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{selectedPhoto=r.result;$("photoPreview").innerHTML=`<img src="${selectedPhoto}">`;$("photoPreview").classList.remove("hidden")};r.readAsDataURL(f);}
async function addDish(){const name=$("dishName").value.trim(),price=Number($("dishPrice").value),pax=Number($("dishPax").value),desc=$("dishDesc").value.trim();if(!name||!Number.isFinite(price)||pax<1)return toast("Dish name, price and pax required");await session();let image_url="kopi-boy-logo.jpg";if(selectedPhoto){const path=`${currentCook.id}/${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.jpg`;const blob=await(await fetch(selectedPhoto)).blob();const up=await supabase.storage.from("kopi-boy-menu").upload(path,blob,{contentType:"image/jpeg",upsert:true});if(up.error)return toast("Photo upload failed");image_url=supabase.storage.from("kopi-boy-menu").getPublicUrl(path).data.publicUrl;}const {error}=await supabase.from("menu_items").insert({merchant_id:currentCook.id,name,description:desc,price,pax_available:pax,active:true,image_url});if(error)return toast(error.message);$("dishName").value="";$("dishPrice").value="";$("dishPax").value="";$("dishDesc").value="";$("dishPhoto").value="";selectedPhoto="";$("photoPreview").classList.add("hidden");loadDishes();toast("Dish added ✓");}
async function loadDishes(){const {data}=await supabase.from("menu_items").select("*").eq("merchant_id",currentCook.id).order("created_at",{ascending:false});$("dishCount").textContent=`${data?.length||0} dishes`;$("dishList").innerHTML=data?.length?data.map(d=>`<div class="manage-dish"><img src="${esc(d.image_url||"kopi-boy-logo.jpg")}"><div class="md-main"><b>${esc(d.name)} · $${Number(d.price).toFixed(2)}</b><small>${d.pax_available} pax · ${d.active?"Visible":"Hidden"}</small></div><div class="md-actions"><button class="pause" onclick="toggleDish('${d.id}',${!d.active})">${d.active?"Hide":"Show"}</button></div></div>`).join(""):"<div class='empty-state'>No dishes published today.</div>";$("cookMenuPreview").innerHTML=data?.filter(d=>d.active).map(d=>`<span class="menu-chip">${esc(d.name)} · $${Number(d.price).toFixed(2)}</span>`).join("")||"<span class='small-note'>No dishes published yet.</span>";}
async function toggleDish(id,active){await supabase.from("menu_items").update({active}).eq("id",id);loadDishes();}

async function loadRiderSelectors(){await session();const {data}=await supabase.from("riders").select("id,name,status,active").eq("status","approved").eq("active",true).order("name");$("riderSelector").innerHTML="<option value=''>Select your name</option>"+(data||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join("");}
async function enterRider(){const id=$("riderSelector").value;if(!id)return toast("Select your name");const {data,error}=await supabase.from("riders").select("*").eq("id",id).single();if(error)return toast("Rider profile not found");currentRider=data;$("riderName").textContent=data.name+" · Rider";renderRiderProfile();go("riderDashboard");initRider();loadJobs();}
async function submitRiderApplication(){const ack=$('riderComplianceAck').checked;if(!ack)return toast('Please acknowledge the rider requirements');const p={full_name:$('riderFullName').value.trim(),phone:$('riderPhone').value.trim(),vehicle_type:$('riderVehicle').value,operating_area:$('riderArea').value.trim(),compliance_ack:true,compliance_ack_version:'2026-08-21',compliance_ack_at:new Date().toISOString(),eligibility_ack:$('riderEligibilityAck').checked,eligibility_ack_at:$('riderEligibilityAck').checked?new Date().toISOString():null,status:'pending'};if(!p.full_name||!p.phone)return toast('Name and phone required');const {error}=await supabase.from('rider_applications').insert(p);if(error)return toast(error.message);$('riderAccessStatus').textContent='Application submitted. Waiting for management approval.';go('riderAccess');loadRiderSelectors();toast('Application submitted ✓');}
function renderRiderProfile(){$("riderProfileContent").innerHTML=`<div class="profile-card"><div class="profile-icon">🛵</div><h2>${esc(currentRider.name)}</h2><p>${esc(currentRider.vehicle_type||"")}</p><div class="profile-grid"><span>Area</span><b>${esc(currentRider.operating_area||"--")}</b><span>Status</span><b>Approved</b></div></div>`;}
async function initRider(){await session();$("riderLiveStatus").textContent="LIVE · looking for delivery jobs";if(riderChannel)supabase.removeChannel(riderChannel);riderChannel=supabase.channel("partner-rider-jobs").on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},()=>loadJobs()).on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders"},p=>{loadJobs();if(p.new.rider_id===currentRider.id)renderRiderJob(p.new)}).subscribe();}
async function loadJobs(){const {data,error}=await supabase.from("orders").select("*").in("status",["looking_for_rider","accepted"]).is("rider_id",null).order("created_at",{ascending:false});if(error)return;$("jobCount").textContent=data?.length||0;$("riderJobsArea").innerHTML=data?.length?data.map(o=>`<div class="rider-order-card"><h3>🛵 Delivery Request · ${o.order_number}</h3><small>Delivery fee $${Number(o.delivery_fee).toFixed(2)}</small><div class="job-line"><span>Pick up</span><b>Cook</b></div><div class="job-line"><span>Deliver to</span><b>Customer</b></div><button class="green full" onclick="acceptJob('${o.id}')">ACCEPT DELIVERY</button></div>`).join(""):"<div class='rider-order-card'><small>No delivery jobs available right now.</small></div>";}
async function acceptJob(id){const {data,error}=await supabase.from("orders").update({status:"rider_accepted",rider_id:currentRider.id,rider_name:currentRider.name,rider_accepted_at:new Date().toISOString()}).eq("id",id).is("rider_id",null).select().single();if(error)return toast("Job already taken");renderRiderJob(data);toast("Delivery accepted ✓");}
function renderRiderJob(o){$("riderJobTitle").textContent=o.order_number;$("riderJobContent").innerHTML=`<div class="rider-order-card"><span class="status-pill ${o.status}">${statusLabel(o.status).toUpperCase()}</span><h3>Delivery for ${esc(currentRider.name)}</h3><div class="job-line"><span>Delivery fee</span><b>$${Number(o.delivery_fee).toFixed(2)}</b></div>${timeline(o)}${o.status==="rider_accepted"?`<button class="green full" onclick="riderStatus('${o.id}','cooking')">CONFIRM — WAITING FOR FOOD</button>`:""}${o.status==="ready"?`<button class="green full" onclick="riderStatus('${o.id}','out_for_delivery')">I'VE COLLECTED THE FOOD</button>`:""}${o.status==="out_for_delivery"?`<button class="green full" onclick="riderStatus('${o.id}','delivered')">DELIVERED TO CUSTOMER</button>`:""}</div>`;go("riderJob");}
async function riderStatus(id,status){const p={status};if(status==="out_for_delivery")p.picked_up_at=new Date().toISOString();if(status==="delivered")p.delivered_at=new Date().toISOString();const {data,error}=await supabase.from("orders").update(p).eq("id",id).eq("rider_id",currentRider.id).select().single();if(error)return toast(error.message);renderRiderJob(data);toast(statusLabel(status)+" ✓");}
document.addEventListener("DOMContentLoaded",async()=>{
  const pendingRole=localStorage.getItem("kb_partner_pending_role");

  if(!pendingRole||!kbAuthReady()) return;

  const user=await kbGetUser();

  if(!user) return;

  currentRole=pendingRole;
  localStorage.removeItem("kb_partner_pending_role");

  kbCloseAuth();

  if(currentRole==="cook"){
    go("cookAccess");
    loadCookSelectors();
  }else{
    go("riderAccess");
    loadRiderSelectors();
  }

  toast("Google account verified ✓");
});


/* Kopi Boy authentication foundation */
window.KB_AUTH_CONFIG={appRole:document.body?.dataset?.app||"unknown",socialProviders:["google","facebook"],phoneOtpReady:false};
function kbAuthReady(){return window.KOPI_SUPABASE_READY&&typeof supabase!=="undefined";}
function kbOpenAuth(title){const o=document.getElementById("kbAuthOverlay");if(!o)return;document.getElementById("kbAuthTitle").textContent=title||"Sign in to Kopi Boy";o.classList.remove("hidden");}
function kbCloseAuth(){document.getElementById("kbAuthOverlay")?.classList.add("hidden");}
async function kbSignIn(provider){if(!kbAuthReady())return toast?.("Kopi Boy database is not connected");const redirectTo=window.location.origin+window.location.pathname;const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo}});if(error)toast?.(error.message);}
function kbPhoneStart(){document.getElementById("kbPhoneArea")?.classList.remove("hidden");}
async function kbSendOtp(){if(!KB_AUTH_CONFIG.phoneOtpReady)return toast?.("Phone OTP will be enabled before public launch.");const phone=document.getElementById("kbPhone")?.value?.trim();if(!phone)return toast?.("Enter your phone number");const {error}=await supabase.auth.signInWithOtp({phone});if(error)return toast?.(error.message);document.getElementById("kbOtp")?.classList.remove("hidden");document.getElementById("kbVerifyBtn")?.classList.remove("hidden");toast?.("OTP sent");}
async function kbVerifyOtp(){const phone=document.getElementById("kbPhone")?.value?.trim(),token=document.getElementById("kbOtp")?.value?.trim();if(!phone||!token)return toast?.("Enter the phone number and OTP");const {error}=await supabase.auth.verifyOtp({phone,token,type:"sms"});if(error)return toast?.(error.message);kbCloseAuth();toast?.("Verified ✓");}
async function kbGetUser(){if(!kbAuthReady())return null;const {data:{user}}=await supabase.auth.getUser();return user||null;}
