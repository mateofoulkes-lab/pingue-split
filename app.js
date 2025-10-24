(() => {
  const cfg = window.PINGUE_SPLIT_CONFIG;
  if (!cfg) { alert("Falta config.js (renombrá config.template.js y completá Firebase)."); return; }

  firebase.initializeApp(cfg.firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
  });
  installBtn?.addEventListener('click', async () => {
    installBtn.hidden = true;
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
  });

  const authSection = document.getElementById('authSection');
  const appSection = document.getElementById('appSection');
  const googleBtn = document.getElementById('googleBtn');
  const emailForm = document.getElementById('emailForm');
  const signOutBtn = document.getElementById('signOutBtn');
  const expenseForm = document.getElementById('expenseForm');
  const listEl = document.getElementById('list');
  const summaryEl = document.getElementById('summary');
  const monthPicker = document.getElementById('monthPicker');
  const filterPayer = document.getElementById('filterPayer');
  const exportBtn = document.getElementById('exportBtn');
  const groupName = document.getElementById('groupName');
  // Balance banner
  const balanceBanner = document.getElementById('balanceBanner');
  const balanceText = document.getElementById('balanceText');


  const settleForm = document.getElementById('settleForm');
  const setDate = document.getElementById('setDate');
  const setDir = document.getElementById('setDir');
  const setAmt = document.getElementById('setAmt');
  const setNote = document.getElementById('setNote');
  const settleAllBtn = document.getElementById('settleAllBtn');

  groupName.textContent = cfg.groupId;

  googleBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(alert);
  });
  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('pass').value.trim();
    auth.signInWithEmailAndPassword(email, pass)
      .catch(async (err) => {
        if (err.code === 'auth/user-not-found') { await auth.createUserWithEmailAndPassword(email, pass); }
        else { alert(err.message); }
      });
  });
  signOutBtn.addEventListener('click', () => auth.signOut());

  let unsubscribe = null;
  let currentUser = null;
  let expenses = [];
  let settlements = [];

  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  monthPicker.value = ym;

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      const allowed = [cfg.users.A.email.toLowerCase(), cfg.users.B.email.toLowerCase()];
      const uEmail = (user.email || "").toLowerCase();
      if (!allowed.includes(uEmail)) { alert("Tu usuario no está autorizado."); await auth.signOut(); return; }
      authSection.hidden = true; appSection.hidden = false; subscribe();
    } else {
      appSection.hidden = true; authSection.hidden = false; if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    }
  });

  function monthRange(ym) {
    const [y,m] = ym.split('-').map(Number);
    const start = new Date(y, m-1, 1);
    const end = new Date(y, m, 1);
    return { start, end };
  }

  function subscribe() {
    if (unsubscribe) { unsubscribe(); }
    const ym = monthPicker.value;
    const { start, end } = monthRange(ym);

    const ref = db.collection('groups').doc(cfg.groupId).collection('expenses')
      .where('date', '>=', firebase.firestore.Timestamp.fromDate(start))
      .where('date', '<', firebase.firestore.Timestamp.fromDate(end))
      .orderBy('date','desc');

    unsubscribe = ref.onSnapshot(snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      expenses = all.filter(x => !x.settlement);
      settlements = all.filter(x => x.settlement === true);
      render();
    }, (err) => console.error(err));
  }

  monthPicker.addEventListener('change', subscribe);
  filterPayer.addEventListener('change', render);

  expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('expDate').value;
    const desc = document.getElementById('expDesc').value.trim();
    const amt = parseFloat(document.getElementById('expAmt').value);
    const payer = document.getElementById('expPayer').value;
    const cat = document.getElementById('expCat').value.trim();
    if (!date || !desc || isNaN(amt)) return;
    const doc = {
      date: firebase.firestore.Timestamp.fromDate(new Date(date)),
      desc, amount: Math.round(amt*100)/100, payer, cat: cat || null,
      createdBy: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try { await db.collection('groups').doc(cfg.groupId).collection('expenses').add(doc);
      expenseForm.reset(); document.getElementById('expDate').value = new Date().toISOString().slice(0,10);
    } catch (e2) { alert(e2.message); }
  });

  exportBtn.addEventListener('click', () => {
    const rows = [["Fecha","Descripción","Monto","Pagó","Categoría","Tipo"]];
    getFiltered().forEach(x => {
      const tipo = x.settlement ? "settlement" : "gasto";
      const desc = x.settlement ? (x.note||`Pago ${x.from}→${x.to}`) : x.desc;
      const payer = x.settlement ? `${x.from}→${x.to}` : x.payer;
      rows.push([x.date.toDate().toISOString().slice(0,10), desc, x.amount, payer, x.cat||"", tipo]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gastos_${monthPicker.value}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });

  function getFiltered() {
    const fp = filterPayer.value;
    const items = [...expenses, ...settlements].sort((a,b)=>b.date.seconds - a.date.seconds);
    if (fp === "ALL") return items;
    if (fp === "SETTLEMENT") return items.filter(x=>x.settlement);
    return items.filter(x => x.settlement ? (fp==="A" ? x.from==="A" : x.from==="B") : x.payer===fp);
  }

  function computeBalances(){
    const sumA = expenses.filter(x=>x.payer==='A').reduce((a,b)=>a+b.amount,0);
    const sumB = expenses.filter(x=>x.payer==='B').reduce((a,b)=>a+b.amount,0);
    const total = sumA + sumB;
    const shouldEachPay = total/2;
    const balanceA_raw = sumA - shouldEachPay;
    const sA2B = settlements.filter(x=>x.from==='A'&&x.to==='B').reduce((a,b)=>a+b.amount,0);
    const sB2A = settlements.filter(x=>x.from==='B'&&x.to==='A').reduce((a,b)=>a+b.amount,0);
    const balanceA = balanceA_raw - sA2B + sB2A;
    return {sumA,sumB,total,shouldEachPay,balanceA};
  }

  function render() {
    listEl.innerHTML = "";
    const items = getFiltered();
    for (const it of items) {
      const li = document.createElement('li');
      const isSet = it.settlement === true;
      li.className = "item" + (isSet ? " settlement" : "");
      if (isSet){
        const dir = `${it.from} → ${it.to}`;
        li.innerHTML = `
          <div>
            <div><strong>Settlement: ${dir}</strong> <span class="badge">pago</span></div>
            <div class="meta">${it.note ? it.note+" • " : ""}${it.date.toDate().toLocaleDateString()}</div>
          </div>
          <div class="meta">${dir}</div>
          <div class="amount">$ ${it.amount.toFixed(2)}</div>
          <button class="btn ghost small" data-id="${it.id}">Eliminar</button>
        `;
      } else {
        li.innerHTML = `
          <div>
            <div><strong>${it.desc}</strong></div>
            <div class="meta">${it.cat ? it.cat+" • " : ""}${it.date.toDate().toLocaleDateString()}</div>
          </div>
          <div class="meta">${it.payer==="A" ? cfg.users.A.name : cfg.users.B.name}<br/><span class="meta">${cfg.users.A.name}: $ ${(it.oweA ?? it.amount/2).toFixed(2)} • ${cfg.users.B.name}: $ ${(it.oweB ?? it.amount/2).toFixed(2)}</span></div>
          <div class="amount">$ ${it.amount.toFixed(2)}</div>
          <button class="btn ghost small" data-id="${it.id}">Eliminar</button>
        `;
      }
      li.querySelector('button').addEventListener('click', () => del(it.id));
      listEl.appendChild(li);
    }

    const {sumA,sumB,total,shouldEachPay,balanceA} = computeBalances();
    const whoOwes = balanceA>0 ? `B → A $ ${balanceA.toFixed(2)}` :
                     balanceA<0 ? `A → B $ ${(-balanceA).toFixed(2)}` : "Están a mano";
    summaryEl.innerHTML = `
      <div class="box"><div class="kicker">Total período</div><strong>$ ${total.toFixed(2)}</strong></div>
      <div class="box"><div class="kicker">Pagó A</div><strong>$ ${sumA.toFixed(2)}</strong></div>
      <div class="box"><div class="kicker">Pagó B</div><strong>$ ${sumB.toFixed(2)}</strong></div>
      <div class="box" style="grid-column: span 3"><div class="kicker">Saldo actual</div><strong>${whoOwes}</strong></div>
    `;

    // Update banner text
    let text = "¡A mano!";
    if (balanceA > 0.009) {
      // A debe recibir => B debe a A
      text = `${cfg.users.B.name} debe $${balanceA.toFixed(2)} a ${cfg.users.A.name}`;
    } else if (balanceA < -0.009) {
      // A debe pagar => A debe a B
      text = `${cfg.users.A.name} debe $${(-balanceA).toFixed(2)} a ${cfg.users.B.name}`;
    }
    balanceText.innerHTML = `<strong>${text}</strong>`;
    balanceBanner.hidden = false;


  }

  async function del(id) {
    if (!confirm("¿Eliminar ítem?")) return;
    try { await db.collection('groups').doc(cfg.groupId).collection('expenses').doc(id).delete(); }
    catch (e) { alert(e.message); }
  }

  // Settlements
  settleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dir = setDir.value; // A2B or B2A
    const amt = parseFloat(setAmt.value);
    if (isNaN(amt) || amt<=0) return;
    const when = new Date(setDate.value);
    const from = dir === 'A2B' ? 'A' : 'B';
    const to = dir === 'A2B' ? 'B' : 'A';
    const doc = {
      settlement: true, from, to,
      amount: Math.round(amt*100)/100,
      date: firebase.firestore.Timestamp.fromDate(when),
      note: setNote.value || null,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try{
      await db.collection('groups').doc(cfg.groupId).collection('expenses').add(doc);
      toast('Pago registrado'); settleForm.reset(); setDate.value = new Date().toISOString().slice(0,10); render();
    }catch(e2){ alert(e2.message); }
  });

  settleAllBtn.addEventListener('click', () => {
    const netA = computeBalances().balanceA;
    if (Math.abs(netA) < 0.01) { toast('Ya están a mano'); return; }
    const dir = netA > 0 ? 'B2A' : 'A2B'; // si A debe recibir, B paga A
    const amt = Math.abs(netA);
    setDir.value = dir; setAmt.value = amt.toFixed(2); setDate.value = new Date().toISOString().slice(0,10);
    toast('Completé el monto para saldar ahora. Confirmá con "Registrar pago".');
  });

  // Tiny toast
  const toastEl = document.createElement('div');
  toastEl.className = 'toast'; document.body.appendChild(toastEl);
  function toast(msg){ toastEl.textContent = msg; toastEl.style.display='block'; setTimeout(()=>toastEl.style.display='none', 2200); }

  // Defaults
  document.getElementById('expDate').value = new Date().toISOString().slice(0,10);
  setDate.value = new Date().toISOString().slice(0,10);
})();