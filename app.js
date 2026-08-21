let adminChannel=null,currentApplication=null,lastPendingTotal=0;

const $=id=>document.getElementById(id);
function toast(m){const t=$("toast");if(!t)return;t.textContent=m;t.style.display="block";clearTimeout(window.tt);window.tt=setTimeout(()=>t.style.display="none",2200)}
function go(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));$(id)?.classList.add("active")}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

window.KB_AUTH_CONFIG={appRole:"management",socialProviders:["google"],phoneOtpReady:false};

function kbAuthReady(){return window.KOPI_SUPABASE_READY&&typeof supabase!=="undefined";}
async function kbGetUser(){
  if(!kbAuthReady())return null;
  const {data:{user},error}=await supabase.auth.getUser();
  if(error)return null;
  return user||null;
}
function openManagementAuth(){
  const o=$("kbAuthOverlay");
  if(o)o.classList.remove("hidden");
}
function kbCloseAuth(){$("kbAuthOverlay")?.classList.add("hidden");}
async function kbSignIn(provider){
  if(provider!=="google")return toast("Google is the management login method.");
  if(!kbAuthReady())return toast("Database not connected");
  const redirectTo=window.location.origin+window.location.pathname;
  const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo}});
  if(error)toast(error.message);
}
async function session(){
  if(!kbAuthReady()){toast("Database not connected");return null;}
  const {data:{session},error}=await supabase.auth.getSession();
  if(error){toast("Authentication check failed");return null;}
  return session||null;
}

async function enterManagement(){
  const user=await kbGetUser();
  if(!user)return openManagementAuth();
  await enterDashboard(user);
}

async function enterDashboard(user){
  kbCloseAuth();
  $("login").classList.remove("active");
  $("dashboard").classList.add("active");
  $("adminName").value="";
  $("adminName")?.setAttribute("value",user.email||"");
  await refreshAll();
  subscribe();
}

function showTab(tab,btn){
  ["applications","orders","partners"].forEach(x=>$(x+"Tab")?.classList.toggle("hidden",x!==tab));
  document.querySelectorAll(".admin-tabs button").forEach(x=>x.classList.remove("active"));
  btn?.classList.add("active");
}

async function refreshAll(){
  if(!(await session()))return;
  await Promise.all([loadStats(),loadApplications(),loadOrders(),loadPartners()]);
}

async function loadStats(){
  const [ca,ra,c,r,o]=await Promise.all([
    supabase.from("cook_applications").select("id",{count:"exact",head:true}).eq("status","pending"),
    supabase.from("rider_applications").select("id",{count:"exact",head:true}).eq("status","pending"),
    supabase.from("merchants").select("id",{count:"exact",head:true}).eq("status","approved").eq("active",true),
    supabase.from("riders").select("id",{count:"exact",head:true}).eq("status","approved").eq("active",true),
    supabase.from("orders").select("id,status,created_at")
  ]);
  $("pendingCooks").textContent=ca.count||0;
  $("pendingRiders").textContent=ra.count||0;
  $("approvedCooks").textContent=c.count||0;
  $("approvedRiders").textContent=r.count||0;
  const orders=o.data||[],today=new Date().toISOString().slice(0,10);
  $("activeOrders").textContent=orders.filter(x=>!["delivered","cancelled","declined"].includes(x.status)).length;
  $("todayOrders").textContent=orders.filter(x=>x.created_at?.startsWith(today)).length;
}

function appCard(type,x){
  const cook=type==="cook";
  const title=cook?(x.display_name||x.full_name):x.full_name;
  const sub=cook?`${x.full_name} · ${x.phone}`:`${x.phone} · ${x.vehicle_type||"Rider"}`;
  const area=cook?`${x.food_type||"Cook"} · ${x.service_area||"--"}`:`Area: ${x.operating_area||"--"}`;
  return `<div class="admin-card">
    <b>${esc(title)}</b>
    <small>${esc(sub)}</small>
    <small>${esc(area)}</small>
    <div class="card-actions">
      <button class="orange" onclick="openApplication('${type}','${x.id}')">VIEW</button>
      <button class="green" onclick="approveApplication('${type}','${x.id}')">APPROVE</button>
      <button class="decline" onclick="rejectApp('${type}','${x.id}')">REJECT</button>
    </div>
  </div>`;
}

async function loadApplications(){
  const [c,r]=await Promise.all([
    supabase.from("cook_applications").select("*").eq("status","pending").order("created_at",{ascending:false}),
    supabase.from("rider_applications").select("*").eq("status","pending").order("created_at",{ascending:false})
  ]);
  const cooks=c.data||[],riders=r.data||[],total=cooks.length+riders.length;
  $("cookApps").innerHTML=cooks.length?cooks.map(x=>appCard("cook",x)).join(""):"<div class='empty-state'>No pending cook applications.</div>";
  $("riderApps").innerHTML=riders.length?riders.map(x=>appCard("rider",x)).join(""):"<div class='empty-state'>No pending rider applications.</div>";
  $("newApplicationBanner").classList.toggle("hidden",total===0);
  $("newApplicationText").textContent=total?`${total} application${total===1?"":"s"} waiting for your review.`:"";
  if(total>lastPendingTotal&&lastPendingTotal>=0)toast("🔔 New partner application");
  lastPendingTotal=total;
}

async function fetchApplication(type,id){
  const table=type==="cook"?"cook_applications":"rider_applications";
  const {data,error}=await supabase.from(table).select("*").eq("id",id).single();
  if(error)return null;
  return data;
}

function openApplication(type,id){
  fetchApplication(type,id).then(a=>{
    if(!a)return toast("Application not found");
    currentApplication={type,id,data:a};
    $("modalTitle").textContent=type==="cook"?"Cook Application":"Rider Application";
    const rows=type==="cook"?[
      ["Full name",a.full_name],["Display / kitchen name",a.display_name],["Phone",a.phone],
      ["Food type",a.food_type],["Service area",a.service_area],["Postal codes",a.service_postal_codes],
      ["Operating hours",`${a.operating_start||"--"} – ${a.operating_end||"--"}`],
      ["Daily capacity",a.daily_capacity],["SFA licensed",a.sfa_licensed?"Yes":"No"],
      ["SFA licence number",a.sfa_licence_number||"Not provided"],["Bio",a.bio||"--"],
      ["Acknowledgement",a.compliance_ack?"Accepted":"Not accepted"]
    ]:[
      ["Full name",a.full_name],["Phone",a.phone],["Vehicle",a.vehicle_type],
      ["Operating area",a.operating_area],["Acknowledgement",a.compliance_ack?"Accepted":"Not accepted"],
      ["Eligibility acknowledgement",a.eligibility_ack?"Accepted":"Not accepted"]
    ];
    $("modalBody").innerHTML=rows.map(([k,v])=>`<div style="margin:.45rem 0"><small>${esc(k)}</small><br><b>${esc(v)}</b></div>`).join("");
    $("modalApprove").onclick=()=>approveApplication(type,id);
    $("modalReject").onclick=()=>rejectApp(type,id);
    $("applicationModal").classList.remove("hidden");
  });
}
function closeApplicationModal(){currentApplication=null;$("applicationModal").classList.add("hidden");}

async function approveApplication(type,id){
  const table=type==="cook"?"cook_applications":"rider_applications";
  const {data:a,error}=await supabase.from(table).select("*").eq("id",id).single();
  if(error)return toast(error.message);
  if(a.status!=="pending")return toast("Application is no longer pending");

  let createdId=null,createError=null;
  if(type==="cook"){
    const {data,e}=await supabase.from("merchants").insert({
      name:a.display_name||a.full_name,type:a.food_type||"Local Food",bio:a.bio||"",
      operating_start:a.operating_start,operating_end:a.operating_end,
      order_open:a.operating_start,order_close:a.operating_end,
      daily_capacity:a.daily_capacity||20,status:"approved",active:true,menu_live:true
    }).select("id").single();
    createdId=data?.id;createError=e;
  }else{
    const {data,e}=await supabase.from("riders").insert({
      name:a.full_name,phone:a.phone,vehicle_type:a.vehicle_type,
      operating_area:a.operating_area,status:"approved",active:true
    }).select("id").single();
    createdId=data?.id;createError=e;
  }
  if(createError)return toast(createError.message);

  const now=new Date().toISOString();
  const {error:updateError}=await supabase.from(table).update({
    status:"approved",approved_at:now,approved_partner_id:createdId
  }).eq("id",id);
  if(updateError){
    toast(updateError.message);
    return;
  }

  // Notification is written only when the optional notification table exists.
  // The Partner app can display it after we add the migration below.
  try{
    const recipient=a.user_id||a.auth_user_id||a.email||null;
    await supabase.from("partner_notifications").insert({
      application_id:id,partner_type:type,recipient_key:recipient,
      title:"🎉 Welcome to Kopi Boy!",
      message:type==="cook"
        ?"Your Cook Partner application has been approved. Your profile is now active and you're ready to prepare your menu and receive orders. Welcome to the Kopi Boy family! ❤️"
        :"Your Rider Partner application has been approved. Your account is now active and you're ready to accept delivery jobs. Welcome to the Kopi Boy family! ❤️",
      read:false,created_at:now
    });
  }catch(_){}

  closeApplicationModal();
  toast(type==="cook"?"🎉 Cook approved!":"🎉 Rider approved!");
  await refreshAll();
}

async function rejectApp(type,id){
  if(!confirm("Reject this application?"))return;
  const table=type==="cook"?"cook_applications":"rider_applications";
  const {error}=await supabase.from(table).update({status:"rejected",rejected_at:new Date().toISOString()}).eq("id",id);
  if(error)return toast(error.message);
  closeApplicationModal();
  toast("Application rejected");
  await refreshAll();
}

async function loadOrders(){
  const {data}=await supabase.from("orders").select("*").order("created_at",{ascending:false}).limit(50);
  $("orders").innerHTML=data?.length?data.map(o=>`<div class="admin-card"><b>${esc(o.order_number)}</b><span class="status-pill ${o.status}">${esc(o.status)}</span><small>Cook: ${esc(o.merchant_name||o.merchant_id||"--")}</small><small>Rider: ${esc(o.rider_name||"Not assigned")}</small><small>Total: S$${Number(o.total||0).toFixed(2)}</small><small>${o.created_at?new Date(o.created_at).toLocaleString():""}</small></div>`).join(""):"<div class='empty-state'>No orders yet.</div>";
}

async function loadPartners(){
  const [c,r]=await Promise.all([
    supabase.from("merchants").select("*").eq("status","approved").order("name"),
    supabase.from("riders").select("*").eq("status","approved").order("name")
  ]);
  $("cookPartners").innerHTML=c.data?.length?c.data.map(x=>`<div class="partner-row"><span>👨‍🍳</span><div><b>${esc(x.name)}</b><small>${esc(x.type||"Cook")} · ${x.active?"Active":"Inactive"}</small></div><button class="pause" onclick="togglePartner('merchants','${x.id}',${!x.active})">${x.active?"Disable":"Enable"}</button></div>`).join(""):"<div class='empty-state'>No approved cooks.</div>";
  $("riderPartners").innerHTML=r.data?.length?r.data.map(x=>`<div class="partner-row"><span>🛵</span><div><b>${esc(x.name)}</b><small>${esc(x.vehicle_type||"Rider")} · ${esc(x.operating_area||"--")}</small></div><button class="pause" onclick="togglePartner('riders','${x.id}',${!x.active})">${x.active?"Disable":"Enable"}</button></div>`).join(""):"<div class='empty-state'>No approved riders.</div>";
}
async function togglePartner(table,id,active){
  const {error}=await supabase.from(table).update({active}).eq("id",id);
  if(error)return toast(error.message);
  await refreshAll();toast(active?"Partner enabled":"Partner disabled");
}
function subscribe(){
  if(adminChannel)supabase.removeChannel(adminChannel);
  adminChannel=supabase.channel("management-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"cook_applications"},refreshAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"rider_applications"},refreshAll)
    .on("postgres_changes",{event:"*",schema:"public",table:"orders"},refreshAll)
    .subscribe();
}

document.addEventListener("DOMContentLoaded",async()=>{
  if(!kbAuthReady())return;
  const user=await kbGetUser();
  if(user)enterDashboard(user);
  supabase.auth.onAuthStateChange((event,session)=>{
    if(event==="SIGNED_IN"&&session?.user)enterDashboard(session.user);
    if(event==="SIGNED_OUT")go("login");
  });
});
