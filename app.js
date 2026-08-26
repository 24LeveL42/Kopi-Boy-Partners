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

// Strip everything but digits, then keep the last 8 (a Singapore mobile
// number without its country code), so "+65 9826 1234", "6598261234" and
// "98261234" all normalize to the same thing for matching.
function normPhone(p){
  const digits=String(p||"").replace(/\D/g,"");
  return digits.slice(-8);
}

// Find an approved partner (merchant or rider) belonging to this signed-in
// user, trying user_id first (fast path for return visits), then email,
// then phone (for OTP sign-ins, which have no email at all). Whichever
// fallback matches gets the user_id backfilled so future logins are instant.
async function findApprovedPartner(table,user){
  let {data:row}=await supabase.from(table)
    .select("*").eq("user_id",user.id).eq("status","approved").maybeSingle();
  if(row)return row;

  const email=(user.email||"").toLowerCase();
  if(email){
    const {data:byEmail}=await supabase.from(table)
      .select("*").ilike("email",email).eq("status","approved").maybeSingle();
    if(byEmail){
      await supabase.from(table).update({user_id:user.id}).eq("id",byEmail.id);
      return {...byEmail,user_id:user.id};
    }
  }

  const phone=normPhone(user.phone);
  if(phone){
    const {data:candidates}=await supabase.from(table)
      .select("*").eq("status","approved");
    const byPhone=(candidates||[]).find(r=>normPhone(r.phone)===phone);
    if(byPhone){
      await supabase.from(table).update({user_id:user.id}).eq("id",byPhone.id);
      return {...byPhone,user_id:user.id};
    }
  }

  return null;
}

// Same idea, but for the application tables (pending/rejected/approved).
async function findApplication(table,user){
  let {data:row}=await supabase.from(table)
    .select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(row)return row;

  const email=(user.email||"").toLowerCase();
  if(email){
    const {data:byEmail}=await supabase.from(table)
      .select("*").ilike("email",email).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(byEmail)return byEmail;
  }

  const phone=normPhone(user.phone);
  if(phone){
    const {data:candidates}=await supabase.from(table)
      .select("*").order("created_at",{ascending:false});
    const byPhone=(candidates||[]).find(r=>normPhone(r.phone)===phone);
    if(byPhone)return byPhone;
  }

  return null;
}

// "Sign In" — for already-approved partners returning to their dashboard.
// Requires Google/Facebook/Phone so we can match them to their record.
async function signInPartner(role){
  currentRole=role;
  localStorage.setItem("kb_partner_pending_role",role);

  if(!kbAuthReady()){
    toast("Kopi Boy database not connected");
    return;
  }

  kbOpenAuth(
    role==="cook"
      ? "Sign in to access your Cook dashboard"
      : "Sign in to access your Rider dashboard"
  );
}

// Route a signed-in user (Google, Facebook, or Phone OTP) to their
// dashboard, application status screen, or back to sign-up if no record
// matches at all.
async function routeSignedInPartner(user,role){
  const partnerTable=role==="cook"?"merchants":"riders";
  const appTable=role==="cook"?"cook_applications":"rider_applications";

  const record=await findApprovedPartner(partnerTable,user);
  if(record){
    role==="cook"?enterCookDashboard(record):enterRiderDashboard(record);
    return true;
  }

  const app=await findApplication(appTable,user);
  if(app){
    role==="cook"?showCookApplicationStatus(app):showRiderApplicationStatus(app);
    return true;
  }

  // No account and no application on file — instead of bouncing them back
  // with just a toast, take them straight into the application form with
  // their verified phone/email already filled in, so signing in with OTP
  // (or Google/Facebook) doubles as the start of registration.
  go(role==="cook"?"cookApply":"riderApply");
  prefillApplicationIdentity(role,user);
  toast("Let's get you registered ✓");
  return true;
}

function prefillApplicationIdentity(role,user){
  const emailField=$(role==="cook"?"cookEmail":"riderEmail");
  const phoneField=$(role==="cook"?"cookPhone":"riderPhone");
  if(emailField && user.email && !emailField.value)emailField.value=user.email;
  if(phoneField && user.phone && !phoneField.value)phoneField.value=user.phone;
}

// On app load, if there's already a session, silently check both roles and
// jump straight to the right dashboard — no home screen, no role picking.
async function autoRouteReturningPartner(){
  if(!kbAuthReady())return false;
  const user=await kbGetUser();
  if(!user)return false;

  const merchant=await findApprovedPartner("merchants",user);
  if(merchant){enterCookDashboard(merchant);return true;}

  const rider=await findApprovedPartner("riders",user);
  if(rider){enterRiderDashboard(rider);return true;}

  const cookApp=await findApplication("cook_applications",user);
  if(cookApp){showCookApplicationStatus(cookApp);return true;}

  const riderApp=await findApplication("rider_applications",user);
  if(riderApp){showRiderApplicationStatus(riderApp);return true;}

  return false; // signed in, but no application/account tied to this account
}

function showCookApplicationStatus(app){
  go("cookAccess");
  const reapplyBtn=document.querySelector("#cookAccess .text-orange");
  if(app.status==="rejected"){
    $("cookAccessTitle").textContent="Application Not Approved";
    $("cookAccessStatus").textContent="Your Cook application was not approved. Contact Kopi Boy support, or you can submit a new application below.";
    reapplyBtn?.classList.remove("hidden");
  }else{
    $("cookAccessTitle").textContent="Application Pending";
    $("cookAccessStatus").textContent="Application submitted. Waiting for management approval — you'll be notified once it's reviewed.";
    reapplyBtn?.classList.add("hidden");
  }
}

function showRiderApplicationStatus(app){
  go("riderAccess");
  const reapplyBtn=document.querySelector("#riderAccess .text-orange");
  if(app.status==="rejected"){
    $("riderAccessTitle").textContent="Application Not Approved";
    $("riderAccessStatus").textContent="Your Rider application was not approved. Contact Kopi Boy support, or you can submit a new application below.";
    reapplyBtn?.classList.remove("hidden");
  }else{
    $("riderAccessTitle").textContent="Application Pending";
    $("riderAccessStatus").textContent="Application submitted. Waiting for management approval — you'll be notified once it's reviewed.";
    reapplyBtn?.classList.add("hidden");
  }
}

async function enterCookDashboard(data){
  currentCook=data;
  $("cookName").textContent=data.name+" · Cook";
  renderCookProfile();
  go("cookDashboard");
  initCook();
  loadMenu();
  await showPartnerNotifications();
}

function toggleSfaFields(){
  $("sfaFields").classList.toggle("hidden",!$("cookSfaLicensed").checked);
}

async function submitCookApplication(){
  const ack=$("cookComplianceAck").checked;
  if(!ack)return toast("Please acknowledge the food-safety requirements");

  const email=$("cookEmail").value.trim().toLowerCase();
  // Email is required only if they don't already have a verified phone on
  // file (e.g. via OTP sign-in) — someone registering with phone OTP has
  // no email to give, and shouldn't be blocked by this.
  const user=kbAuthReady()?await kbGetUser():null;
  if(!email && !user?.phone)return toast("A valid email address is required");
  if(email && !email.includes("@"))return toast("A valid email address is required");

  // Sign-up no longer requires an existing Google/Facebook session — the
  // typed email is what links this application to their account once they
  // sign in later, after approval.

  const p={
    user_id:user?.id||null,
    email:email||null,
    full_name:$("cookFullName").value.trim(),
    status:"pending",
    display_name:$("cookDisplayName").value.trim(),
    phone:$("cookPhone").value.trim(),
    food_type:$("cookType").value.trim(),
    bio:$("cookBio").value.trim(),
    operating_start:$("cookOpen").value,
    operating_end:$("cookClose").value,
    daily_capacity:Number($("cookCapacity").value||20),
    service_area:$("cookArea").value.trim(),
    service_postal_codes:$("cookPostalCodes").value.trim(),
    sfa_licensed:$("cookSfaLicensed").checked,
    sfa_licence_type:$("cookSfaLicenceType").value.trim(),
    sfa_licence_number:$("cookSfaLicenceNumber").value.trim(),
    sfa_licence_expiry:$("cookSfaLicenceExpiry").value||null,
    sfa_document_name:$("cookSfaDocument").files?.[0]?.name||null,
    compliance_ack:true,
    compliance_ack_version:"2026-08-21",
    compliance_ack_at:new Date().toISOString(),
    status:"pending"
  };

  if(!p.full_name||!p.display_name||!p.phone)return toast("Name, kitchen name and phone required");
  if(p.sfa_licensed&&!p.sfa_licence_number)return toast("Enter the SFA licence number or untick the licence box");

  const {data:saved,error}=await supabase.from("cook_applications").insert(p).select().single();
  if(error)return toast(error.message);

  showCookApplicationStatus(saved);
  toast("Application submitted ✓");
}

function renderCookProfile(){
  $("cookProfileContent").innerHTML=`<div class="profile-card"><div class="profile-icon">👨‍🍳</div><h2>${esc(currentCook.name)}</h2><p>${esc(currentCook.type||"Local Food")}</p><div class="profile-grid"><span>Orders</span><b>${esc(currentCook.order_open||"--")}–${esc(currentCook.order_close||"--")}</b><span>Cooking</span><b>${esc(currentCook.operating_start||"--")}–${esc(currentCook.operating_end||"--")}</b><span>Capacity</span><b>${currentCook.daily_capacity||"--"} pax</b></div><p>${esc(currentCook.bio||"")}</p><button class="orange full" onclick="go('cookMenu')">MANAGE TODAY'S MENU</button></div>`;
}

function timeline(o){
  return `<div class="timeline">${[["placed_at","Order placed"],["accepted_at","Cook accepted"],["rider_requested_at","Looking for rider"],["rider_accepted_at","Rider accepted"],["cooking_at","Cooking"],["ready_at","Food ready"],["picked_up_at","Collected"],["delivered_at","Delivered"]].map(([f,l])=>`<div class="timeline-row ${o[f]?"done":""}"><b>${l}</b><span>${o[f]?new Date(o[f]).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"Waiting"}</span></div>`).join("")}</div>`;
}

function cookAction(o){
  if(o.status==="placed")return `<button class="green full" onclick="cookStatus('${o.id}','accepted')">ACCEPT ORDER</button><button class="decline full" onclick="cookStatus('${o.id}','declined')">DECLINE</button>`;
  if(o.status==="accepted")return `<button class="orange full" onclick="cookStatus('${o.id}','looking_for_rider')">FIND RIDER</button>`;
  if(o.status==="rider_accepted")return `<button class="green full" onclick="cookStatus('${o.id}','cooking')">START COOKING</button>`;
  if(o.status==="cooking")return `<button class="green full" onclick="cookStatus('${o.id}','ready')">FOOD READY</button>`;
  return "";
}

function renderCookOrder(o){
  $("incomingOrderArea").innerHTML=`<div class="incoming-order"><div style="display:flex;justify-content:space-between"><h3>🔔 ${statusLabel(o.status)}</h3><span class="status-pill ${o.status}">${o.status}</span></div><div>${o.order_number}</div><div class="incoming-items">${(o.items||[]).map(x=>`${esc(x.name)} <b style="float:right">x${x.qty||1} · $${Number(x.price).toFixed(2)}</b>`).join("<br>")}<hr><b>Total</b><b style="float:right">$${Number(o.total).toFixed(2)}</b></div>${o.rider_name?`<div class="job-line"><span>Rider</span><b>🛵 ${esc(o.rider_name)}</b></div>`:""}${timeline(o)}${cookAction(o)}</div>`;
}

async function initCook(){
  await session();
  $("cookLiveStatus").textContent="LIVE · receiving orders";
  if(cookChannel)supabase.removeChannel(cookChannel);
  cookChannel=supabase.channel("cook-"+currentCook.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders",filter:`merchant_id=eq.${currentCook.id}`},p=>{renderCookOrder(p.new);toast("🔔 New order received");})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders",filter:`merchant_id=eq.${currentCook.id}`},p=>renderCookOrder(p.new))
    .subscribe();
}

async function cookStatus(id,status){
  const patch={status};
  const now=new Date().toISOString();
  ({accepted:()=>patch.accepted_at=now,declined:()=>patch.declined_at=now,looking_for_rider:()=>patch.rider_requested_at=now,cooking:()=>patch.cooking_at=now,ready:()=>patch.ready_at=now}[status]?.());
  const {data,error}=await supabase.from("orders").update(patch).eq("id",id).select().single();
  if(error)return toast(error.message);
  renderCookOrder(data);
  toast(statusLabel(status)+" ✓");
}

async function loadMenu(){
  if(!currentCook)return;
  const {data}=await supabase.from("merchants").select("*").eq("id",currentCook.id).single();
  if(data)currentCook=data;
  $("menuNote").value=currentCook.menu_note||"";
  $("orderOpen").value=currentCook.order_open||"09:00";
  $("orderClose").value=currentCook.order_close||"14:00";
  $("cookStart").value=currentCook.operating_start||"10:00";
  $("cookEnd").value=currentCook.operating_end||"16:00";
  updateToggle();
  loadDishes();
}

function updateToggle(){
  $("menuStatusTitle").textContent=currentCook.menu_live===false?"Menu is OFF":"Menu is live";
  $("menuToggle").textContent=currentCook.menu_live===false?"OFF":"ON";
  $("menuToggle").className="toggle "+(currentCook.menu_live===false?"off":"on");
  $("menuStatusText").textContent=currentCook.menu_live===false?"Customers cannot order":`Orders ${currentCook.order_open||"--"}–${currentCook.order_close||"--"}`;
}

async function toggleMenu(){
  const {data,error}=await supabase.from("merchants").update({menu_live:currentCook.menu_live===false}).eq("id",currentCook.id).select().single();
  if(error)return toast(error.message);
  currentCook=data;
  updateToggle();
  toast(currentCook.menu_live?"Menu live ✓":"Menu cancelled");
}

async function saveMenuSettings(){
  const patch={menu_note:$("menuNote").value.trim(),order_open:$("orderOpen").value,order_close:$("orderClose").value,operating_start:$("cookStart").value,operating_end:$("cookEnd").value};
  const {data,error}=await supabase.from("merchants").update(patch).eq("id",currentCook.id).select().single();
  if(error)return toast(error.message);
  currentCook=data;
  updateToggle();
  renderCookProfile();
  toast("Menu settings saved ✓");
}

function previewPhoto(e){
  const f=e.target.files?.[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    selectedPhoto=r.result;
    $("photoPreview").innerHTML=`<img src="${selectedPhoto}">`;
    $("photoPreview").classList.remove("hidden");
  };
  r.readAsDataURL(f);
}

async function addDish(){
  const name=$("dishName").value.trim(),price=Number($("dishPrice").value),pax=Number($("dishPax").value),desc=$("dishDesc").value.trim();
  if(!name||!Number.isFinite(price)||pax<1)return toast("Dish name, price and pax required");
  await session();
  let image_url="kopi-boy-logo.jpg";
  if(selectedPhoto){
    const path=`${currentCook.id}/${Date.now()}-${name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.jpg`;
    const blob=await(await fetch(selectedPhoto)).blob();
    const up=await supabase.storage.from("kopi-boy-menu").upload(path,blob,{contentType:"image/jpeg",upsert:true});
    if(up.error)return toast("Photo upload failed");
    image_url=supabase.storage.from("kopi-boy-menu").getPublicUrl(path).data.publicUrl;
  }
  const {error}=await supabase.from("menu_items").insert({merchant_id:currentCook.id,name,description:desc,price,pax_available:pax,active:true,image_url});
  if(error)return toast(error.message);
  $("dishName").value="";
  $("dishPrice").value="";
  $("dishPax").value="";
  $("dishDesc").value="";
  $("dishPhoto").value="";
  selectedPhoto="";
  $("photoPreview").classList.add("hidden");
  loadDishes();
  toast("Dish added ✓");
}

async function loadDishes(){
  const {data}=await supabase.from("menu_items").select("*").eq("merchant_id",currentCook.id).order("created_at",{ascending:false});
  $("dishCount").textContent=`${data?.length||0} dishes`;
  $("dishList").innerHTML=data?.length?data.map(d=>`<div class="manage-dish"><img src="${esc(d.image_url||"kopi-boy-logo.jpg")}"><div class="md-main"><b>${esc(d.name)} · $${Number(d.price).toFixed(2)}</b><small>${d.pax_available} pax · ${d.active?"Visible":"Hidden"}</small></div><div class="md-actions"><button class="pause" onclick="toggleDish('${d.id}',${!d.active})">${d.active?"Hide":"Show"}</button></div></div>`).join(""):"<div class='empty-state'>No dishes published today.</div>";
  $("cookMenuPreview").innerHTML=data?.filter(d=>d.active).map(d=>`<span class="menu-chip">${esc(d.name)} · $${Number(d.price).toFixed(2)}</span>`).join("")||"<span class='small-note'>No dishes published yet.</span>";
}

async function toggleDish(id,active){await supabase.from("menu_items").update({active}).eq("id",id);loadDishes();}

async function enterRiderDashboard(data){
  currentRider=data;
  $("riderName").textContent=data.name+" · Rider";
  renderRiderProfile();
  go("riderDashboard");
  initRider();
  loadJobs();
  await showPartnerNotifications();
}

async function submitRiderApplication(){
  const ack=$("riderComplianceAck").checked;
  if(!ack)return toast("Please acknowledge the rider requirements");

  const email=$("riderEmail").value.trim().toLowerCase();
  const user=kbAuthReady()?await kbGetUser():null;
  if(!email && !user?.phone)return toast("A valid email address is required");
  if(email && !email.includes("@"))return toast("A valid email address is required");

  const p={
    user_id:user?.id||null,
    email:email||null,
    full_name:$("riderFullName").value.trim(),
    status:"pending",
    phone:$("riderPhone").value.trim(),
    vehicle_type:$("riderVehicle").value,
    operating_area:$("riderArea").value.trim(),
    compliance_ack:true,
    compliance_ack_version:"2026-08-21",
    compliance_ack_at:new Date().toISOString(),
    eligibility_ack:$("riderEligibilityAck").checked,
    eligibility_ack_at:$("riderEligibilityAck").checked?new Date().toISOString():null,
    status:"pending"
  };
  if(!p.full_name||!p.phone)return toast("Name and phone required");
  const {data:saved,error}=await supabase.from("rider_applications").insert(p).select().single();
  if(error)return toast(error.message);
  showRiderApplicationStatus(saved);
  toast("Application submitted ✓");
}

function renderRiderProfile(){
  $("riderProfileContent").innerHTML=`<div class="profile-card"><div class="profile-icon">🛵</div><h2>${esc(currentRider.name)}</h2><p>${esc(currentRider.vehicle_type||"")}</p><div class="profile-grid"><span>Area</span><b>${esc(currentRider.operating_area||"--")}</b><span>Status</span><b>Approved</b></div></div>`;
}

async function initRider(){
  await session();
  $("riderLiveStatus").textContent="LIVE · looking for delivery jobs";
  if(riderChannel)supabase.removeChannel(riderChannel);
  riderChannel=supabase.channel("partner-rider-jobs")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"orders"},()=>loadJobs())
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"orders"},p=>{loadJobs();if(p.new.rider_id===currentRider.id)renderRiderJob(p.new)})
    .subscribe();
}

async function loadJobs(){
  const {data,error}=await supabase.from("orders").select("*").in("status",["looking_for_rider","accepted"]).is("rider_id",null).order("created_at",{ascending:false});
  if(error)return;
  $("jobCount").textContent=data?.length||0;
  $("riderJobsArea").innerHTML=data?.length?data.map(o=>`<div class="rider-order-card"><h3>🛵 Delivery Request · ${o.order_number}</h3><small>Delivery fee $${Number(o.delivery_fee).toFixed(2)}</small><div class="job-line"><span>Pick up</span><b>Cook</b></div><div class="job-line"><span>Deliver to</span><b>Customer</b></div><button class="green full" onclick="acceptJob('${o.id}')">ACCEPT DELIVERY</button></div>`).join(""):"<div class='rider-order-card'><small>No delivery jobs available right now.</small></div>";
}

async function acceptJob(id){
  const {data,error}=await supabase.from("orders").update({status:"rider_accepted",rider_id:currentRider.id,rider_name:currentRider.name,rider_accepted_at:new Date().toISOString()}).eq("id",id).is("rider_id",null).select().single();
  if(error)return toast("Job already taken");
  renderRiderJob(data);
  toast("Delivery accepted ✓");
}

function renderRiderJob(o){
  $("riderJobTitle").textContent=o.order_number;
  $("riderJobContent").innerHTML=`<div class="rider-order-card"><span class="status-pill ${o.status}">${statusLabel(o.status).toUpperCase()}</span><h3>Delivery for ${esc(currentRider.name)}</h3><div class="job-line"><span>Delivery fee</span><b>$${Number(o.delivery_fee).toFixed(2)}</b></div>${timeline(o)}${o.status==="rider_accepted"?`<button class="green full" onclick="riderStatus('${o.id}','cooking')">CONFIRM — WAITING FOR FOOD</button>`:""}${o.status==="ready"?`<button class="green full" onclick="riderStatus('${o.id}','out_for_delivery')">I'VE COLLECTED THE FOOD</button>`:""}${o.status==="out_for_delivery"?`<button class="green full" onclick="riderStatus('${o.id}','delivered')">DELIVERED TO CUSTOMER</button>`:""}</div>`;
  go("riderJob");
}

async function riderStatus(id,status){
  const p={status};
  if(status==="out_for_delivery")p.picked_up_at=new Date().toISOString();
  if(status==="delivered")p.delivered_at=new Date().toISOString();
  const {data,error}=await supabase.from("orders").update(p).eq("id",id).eq("rider_id",currentRider.id).select().single();
  if(error)return toast(error.message);
  renderRiderJob(data);
  toast(statusLabel(status)+" ✓");
}

/* Kopi Boy authentication foundation */
window.KB_AUTH_CONFIG={appRole:document.body?.dataset?.app||"unknown",socialProviders:["google","facebook"],phoneOtpReady:true};

function kbAuthReady(){
  return window.KOPI_SUPABASE_READY&&typeof supabase!=="undefined";
}

function kbOpenAuth(title){
  const o=document.getElementById("kbAuthOverlay");
  if(!o)return;
  document.getElementById("kbAuthTitle").textContent=title||"Sign in to Kopi Boy";
  o.classList.remove("hidden");
}

function kbCloseAuth(){
  document.getElementById("kbAuthOverlay")?.classList.add("hidden");
}

async function kbSignIn(provider){
  if(!kbAuthReady())return toast?.("Kopi Boy database is not connected");

  // Remember that this specific Cook/Rider choice started an OAuth flow.
  // This is what lets the app route the user to the correct registration page
  // after Google sends them back to GitHub Pages.
  sessionStorage.setItem("kb_partner_auth_started","1");

  const redirectTo=window.location.origin+window.location.pathname;
  const {error}=await supabase.auth.signInWithOAuth({
    provider,
    options:{redirectTo}
  });
  if(error){
    sessionStorage.removeItem("kb_partner_auth_started");
    toast?.(error.message);
  }
}

function kbPhoneStart(){
  document.getElementById("kbPhoneArea")?.classList.remove("hidden");
}

// Auto-format a Singapore number to E.164 (+65XXXXXXXX) so testers don't
// have to remember to type the country code themselves. If it already
// looks like an international number (starts with +), leave it as-is so
// other countries still work.
function kbNormalizeSgPhone(raw){
  let digits=String(raw||"").trim();
  if(digits.startsWith("+"))return digits.replace(/\s+/g,"");
  digits=digits.replace(/\D/g,"");
  if(digits.startsWith("65")&&digits.length===10)return "+"+digits;
  if(digits.length===8)return "+65"+digits;
  return "+"+digits; // fallback: assume they typed a country code without the +
}

async function kbSendOtp(){
  if(!KB_AUTH_CONFIG.phoneOtpReady)return toast?.("Phone OTP will be enabled before public launch.");
  const raw=document.getElementById("kbPhone")?.value?.trim();
  if(!raw)return toast?.("Enter your phone number");
  const phone=kbNormalizeSgPhone(raw);
  const {error}=await supabase.auth.signInWithOtp({phone});
  if(error)return toast?.(error.message);
  document.getElementById("kbOtp")?.classList.remove("hidden");
  document.getElementById("kbVerifyBtn")?.classList.remove("hidden");
  toast?.("OTP sent to "+phone);
}

async function kbVerifyOtp(){
  const raw=document.getElementById("kbPhone")?.value?.trim(),token=document.getElementById("kbOtp")?.value?.trim();
  if(!raw||!token)return toast?.("Enter the phone number and OTP");
  const phone=kbNormalizeSgPhone(raw);
  const {error}=await supabase.auth.verifyOtp({phone,token,type:"sms"});
  if(error)return toast?.(error.message);
  kbCloseAuth();
  toast?.("Verified ✓");

  // Same as Google/Facebook sign-in: once verified, route straight to the
  // right dashboard/status screen using whichever role was pending.
  const pendingRole=localStorage.getItem("kb_partner_pending_role");
  if(pendingRole && typeof routeSignedInPartner==="function"){
    const user=await kbGetUser();
    if(user){
      localStorage.removeItem("kb_partner_pending_role");
      await routeSignedInPartner(user,pendingRole);
    }
  }
}

async function kbGetUser(){
  if(!kbAuthReady())return null;
  const {data:{user}}=await supabase.auth.getUser();
  return user||null;
}

async function finishPartnerOAuth(){
  const pendingRole=localStorage.getItem("kb_partner_pending_role");
  const authStarted=sessionStorage.getItem("kb_partner_auth_started")==="1";

  if(!pendingRole || !authStarted || !kbAuthReady()) return false;

  const user=await kbGetUser();
  if(!user) return false;

  currentRole=pendingRole;
  localStorage.removeItem("kb_partner_pending_role");
  sessionStorage.removeItem("kb_partner_auth_started");

  kbCloseAuth();

  // Remove OAuth callback parameters without reloading the app.
  if(window.location.search || window.location.hash){
    history.replaceState({},document.title,window.location.pathname);
  }

  // Now that we're signed in, check if this Google account is already an
  // approved partner or has a pending/rejected application on file, and
  // route straight there instead of always dropping into the apply form.
  await routeSignedInPartner(user,currentRole);

  toast("Google account verified ✓");
  return true;
}

// Show any unread "approved"/"rejected" notifications for this partner the
// moment they land on their dashboard, then mark them as read.
async function showPartnerNotifications(){
  const user=await kbGetUser();
  if(!user)return;
  const {data,error}=await supabase.from("partner_notifications")
    .select("*").eq("recipient_user_id",user.id).eq("read",false).order("created_at",{ascending:true});
  if(error||!data?.length)return;
  for(const n of data){
    toast(n.title+" — "+n.message);
  }
  const ids=data.map(n=>n.id);
  await supabase.from("partner_notifications").update({read:true}).in("id",ids);
}

// Supabase may finish the OAuth callback AFTER DOMContentLoaded.
// Listen for the authentication event so the selected role is never lost.
function setupPartnerAuthListener(){
  if(!kbAuthReady()) return;

  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(event==="SIGNED_IN" && session){
      // Let Supabase finish updating its session before reading the user.
      setTimeout(()=>finishPartnerOAuth(),0);
    }
  });
}

document.addEventListener("DOMContentLoaded",async()=>{
  setupPartnerAuthListener();

  // If we just came back from an OAuth redirect with a pending role, let
  // that flow own the routing.
  const cameFromOAuth=await finishPartnerOAuth();
  if(cameFromOAuth)return;

  // Covers providers/configurations where the session is already available
  // by the time the page finishes loading (delayed OAuth completion).
  setTimeout(async()=>{
    const handled=await finishPartnerOAuth();
    if(handled)return;
    // No pending OAuth flow — if there's already a session (returning
    // partner), skip the home screen and go straight to their dashboard.
    await autoRouteReturningPartner();
  },150);
});
