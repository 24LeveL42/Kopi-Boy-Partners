const cooks=[
{name:"Mak Cik Siti",type:"Nasi Lemak · Malay Food",rating:"4.9",reviews:"128",time:"25–35 min",distance:"1.2 km",avatar:"https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=180&q=85",foods:[
["Nasi Lemak Ayam",6.00,"https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=85"],
["Nasi Lemak Rendang",7.00,"https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=500&q=85"],
["Mee Siam",5.50,"https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=500&q=85"],
["Kuih Lapis",2.50,"https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=500&q=85"]]},
{name:"Ah Ma Kitchen",type:"Chinese · Home Cooked",rating:"4.8",reviews:"96",time:"30–40 min",distance:"1.5 km",avatar:"https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=180&q=85",foods:[["Home-style Chicken",7,"https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=500&q=85"]]},
{name:"Dapur Kak Leha",type:"Malay · Mixing Food",rating:"4.9",reviews:"74",time:"25–35 min",distance:"1.7 km",avatar:"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=180&q=85",foods:[["Ayam Penyet",6.50,"https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=500&q=85"]]},
{name:"Uncle Man's Kitchen",type:"Asian Favorites",rating:"4.7",reviews:"58",time:"30–45 min",distance:"2.0 km",avatar:"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=85",foods:[["Chicken Rice",6,"https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=500&q=85"]]}
];

let currentCook=cooks[0], cart=[];
let peer=null, customerConn=null, testOrder=null;
const $=id=>document.getElementById(id);

function roleApp(id){
  document.querySelectorAll(".app").forEach(a=>a.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll(".role-switch button").forEach((b,i)=>b.classList.toggle("active",["customerApp","cookApp","riderApp"][i]===id));
}
function setRole(id){
  roleApp(id);
  if(id==="customerApp") go("customerHome");
  if(id==="cookApp") go("cookDashboard");
  if(id==="riderApp") go("riderDashboard");
}
function go(id){
  document.querySelectorAll(".app:not(.hidden) .screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0,0);
}
function back(){ toast("Use the screen back button in this prototype"); }
function toast(msg){
  const t=$("toast");t.textContent=msg;t.style.display="block";
  clearTimeout(window._toast);window._toast=setTimeout(()=>t.style.display="none",1600);
}
function cookRow(c){
 return `<div class="cook-row" onclick="openCook(${cooks.indexOf(c)})">
  <img src="${c.avatar}">
  <div class="cook-info"><h3>${c.name}<span class="online">● Online</span></h3>
  <p>${c.type}</p><p><span class="rating">★ ${c.rating}</span> (${c.reviews})</p>
  <p>◷ ${c.time}<span style="float:right">⌖ ${c.distance}</span></p></div></div>`;
}

function startCookConnection(){
 if(typeof Peer==="undefined"){toast("Connection library did not load");return;}
 if(peer){try{peer.destroy();}catch(e){}}
 const code=String(Math.floor(100000+Math.random()*900000));
 $("cookRoomCode").textContent=code;$("cookConnectionStatus").textContent="STARTING…";
 peer=new Peer("kopiboy-cook-"+code,{host:"0.peerjs.com",port:443,secure:true,path:"/"});
 peer.on("open",()=>{$("cookConnectionStatus").textContent="ONLINE";$("cookConnectionStatus").className="connection-dot online";toast("Cook online — share code "+code);});
 peer.on("connection",conn=>{customerConn=conn;customerConn.on("open",()=>toast("Customer connected ✓"));customerConn.on("data",handleCookData);});
 peer.on("error",()=>{toast("Could not start Cook test");$("cookConnectionStatus").textContent="ERROR";});
}
function connectCustomer(){
 if(typeof Peer==="undefined"){toast("Connection library did not load");return;}
 const code=$("customerRoomCode").value.trim();if(!/^\d{6}$/.test(code)){toast("Enter the 6-digit Cook Test Code");return;}
 if(peer){try{peer.destroy();}catch(e){}}
 peer=new Peer();$("customerConnectionStatus").textContent="Connecting…";
 customerConn=peer.connect("kopiboy-cook-"+code,{reliable:true});
 customerConn.on("open",()=>{$("customerConnectionStatus").textContent="CONNECTED ✓";$("customerConnectionStatus").className="conn-status connected";toast("Connected to Cook");});
 customerConn.on("data",handleCustomerData);customerConn.on("error",()=>toast("Customer connection failed"));
}
function handleCookData(msg){if(msg?.type==="new_order"){testOrder=msg.order;renderIncomingOrder();toast("🔔 NEW ORDER "+msg.order.id);}}
function handleCustomerData(msg){if(msg?.type==="order_status"){testOrder=testOrder||{id:msg.id};testOrder.status=msg.status;renderCustomerOrderBanner();if(msg.status==="accepted")toast("Your order was accepted ✓");if(msg.status==="declined")toast("Cook declined the order");}}
function renderIncomingOrder(){
 if(!$("incomingOrderArea")||!testOrder)return;
 $("incomingOrderArea").innerHTML=`<div class="incoming-order"><h3>🔔 New Order</h3><div class="incoming-meta">${testOrder.id}</div><div class="incoming-items">${testOrder.items.map(x=>`${x.name} <b style="float:right">$${x.price.toFixed(2)}</b>`).join("<br>")}<br><b>Total</b><b style="float:right">$${testOrder.total.toFixed(2)}</b></div><div class="incoming-actions"><button class="green" onclick="acceptTestOrder()">ACCEPT ORDER</button><button class="decline" onclick="declineTestOrder()">DECLINE</button></div></div>`;
}
function acceptTestOrder(){if(!testOrder||!customerConn?.open)return;testOrder.status="accepted";customerConn.send({type:"order_status",id:testOrder.id,status:"accepted"});renderIncomingOrder();toast("Order accepted ✓");}
function declineTestOrder(){if(!testOrder||!customerConn?.open)return;testOrder.status="declined";customerConn.send({type:"order_status",id:testOrder.id,status:"declined"});renderIncomingOrder();toast("Order declined");}
function renderCustomerOrderBanner(){const b=$("customerOrderBanner");if(!b||!testOrder)return;b.innerHTML=`<b>${testOrder.status==="accepted"?"✓ Order Accepted":testOrder.status==="declined"?"Order Declined":"Order Placed"}</b><small>${testOrder.id} · ${testOrder.status==="accepted"?"Cook has accepted your order.":"Waiting for cook confirmation."}</small><button onclick="showCustomerLiveOrder()">VIEW ORDER</button>`;b.classList.remove("hidden");}
function showCustomerLiveOrder(){const s=testOrder?.status||"placed";$("customerLiveOrderContent").innerHTML=`<div class="live-order-card"><span class="status-pill ${s}">${s.toUpperCase()}</span><h2>${s==="accepted"?"Order accepted!":s==="declined"?"Order declined":"Order placed"}</h2><p>${testOrder?.id||""}</p><div class="status-steps"><div class="status-step on"><i>✓</i>Order Placed</div><div class="status-step ${s==="accepted"?"on":""}"><i>${s==="accepted"?"✓":"•"}</i>Cook Accepted</div><div class="status-step"><i>•</i>Cooking</div><div class="status-step"><i>•</i>Ready for Rider</div></div></div>`;go("customerLiveOrder");}

function renderHome(){
  $("popularGrid").innerHTML=cooks.slice(0,2).map((c,i)=>`<div class="popular-card" onclick="openCook(${i})">
    <img src="${c.foods[0][2]}"><div class="pcopy"><b>${c.name}</b><br>${c.foods[0][0]}<br><span class="rating">★ ${c.rating}</span> · ${c.time}</div></div>`).join("");
}
function renderCooks(list=cooks){$("cookListItems").innerHTML=list.map(cookRow).join("");}
function filterCooks(){
 const q=$("search").value.toLowerCase();
 renderCooks(cooks.filter(c=>(c.name+c.type).toLowerCase().includes(q)));
 go("cookList");
}
function openCook(i){
 currentCook=cooks[i];
 $("menuContent").innerHTML=`<div class="screen-title"><button class="back-small" onclick="go('cookList')">‹</button><b>${currentCook.name}</b><button>⋯</button></div>
 <div class="menu-top"><img src="${currentCook.avatar}"><div><h2>${currentCook.name} <span class="rating">★ ${currentCook.rating}</span></h2><p>${currentCook.type}</p><p>◷ ${currentCook.time} · $2.50 Delivery</p></div></div>
 <div class="menu-tabs"><button class="active">Menu</button><button>Reviews</button><button>Info</button></div>
 ${currentCook.foods.map((f,idx)=>`<div class="dish"><img src="${f[2]}"><div class="dish-main"><h3>${f[0]} <strong>$${f[1].toFixed(2)}</strong></h3><p>Fragrant, freshly prepared home-style food made with care, served with classic sides.</p></div><button class="plus" onclick="addFood(${idx})">+</button></div>`).join("")}
 ${cart.length?`<div class="cartbar"><span>🛒 ${cart.length} items · $${cartTotal().toFixed(2)}</span><button onclick="renderSummary()">View Cart</button></div>`:""}`;
 go("menuScreen");
}
function addFood(idx){const f=currentCook.foods[idx];cart.push({name:f[0],price:f[1],img:f[2]});toast(f[0]+" added");openCook(cooks.indexOf(currentCook));}
function cartTotal(){return cart.reduce((a,x)=>a+x.price,0);}
function renderSummary(){
 $("summaryContent").innerHTML=`<div class="summary-card">
 ${cart.map(x=>`<div class="sum-row"><img src="${x.img}"><div><b>${x.name}</b><small style="display:block;color:#888;margin-top:3px">x1 · $${x.price.toFixed(2)}</small></div><b>$${x.price.toFixed(2)}</b></div>`).join("")}
 <div class="sum"><span>Subtotal</span><b>$${cartTotal().toFixed(2)}</b></div>
 <div class="sum"><span>Delivery Fee</span><b>$2.50</b></div>
 <div class="sum total"><span>Total</span><b>$${(cartTotal()+2.5).toFixed(2)}</b></div>
 <div class="pay-box">▣ &nbsp; PayNow / Bank Transfer <b>Change</b><br><small>You will pay directly to the cook.</small></div>
 <button class="orange full" onclick="placeOrder()">Place Order</button>
 <button class="text-orange full" onclick="go('menuScreen')">Cancel</button></div>`;
 go("orderSummary");
}
function placeOrder(){if(!customerConn?.open){toast("Connect to the Cook first");return;}const order={id:"KB"+Math.floor(10000+Math.random()*89999),createdAt:Date.now(),items:cart.map(x=>({name:x.name,price:x.price})),total:cartTotal()+2.5,status:"placed"};testOrder=order;$("orderNumber").textContent="Order #"+order.id;customerConn.send({type:"new_order",order});renderCustomerOrderBanner();cart=[];go("orderConfirmed");toast("Order sent to Cook ✓");}
function setupCook(){
 $("newOrderCard").innerHTML=`<div class="job-top"><b>Order #KB12345</b><span>10:05 AM</span></div>
 <p style="font-size:9px"><b>Mak Cik Siti</b> · 1.2 km</p>
 <div class="order-items">Nasi Lemak Ayam <b style="float:right">x1&nbsp; $6.00</b><br>Mee Siam <b style="float:right">x1&nbsp; $5.50</b><br><b>Total</b><b style="float:right">$14.00</b></div>
 <div class="accept-row"><button class="green" onclick="go('findRider')">Accept Order</button><button class="decline" onclick="toast('Order declined')">Decline</button></div>`;
}
function findRider(){toast("Searching riders within 3 km…");setTimeout(()=>go("riderFound"),650);}
renderHome();renderCooks();setupCook();