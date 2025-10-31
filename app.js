(() => {
  const cfg = window.PINGUE_SPLIT_CONFIG;
  if (!cfg) { alert("Falta config.js (renombrá config.template.js y completá Firebase)."); return; }

  firebase.initializeApp(cfg.firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  const NAME_A = cfg.users.A.name;
  const NAME_B = cfg.users.B.name;
  const NAME_MAP = { A: NAME_A, B: NAME_B };
  const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
  const formatMoney = (n) => money.format(round2(n));
  const formatDate = (ts) => ts.toDate().toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  const parseLocalDate = (value) => {
    if (!value) return new Date();
    const [yearStr, monthStr, dayStr] = value.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!year || !month || !day) { return new Date(value); }
    return new Date(year, month - 1, day);
  };

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
  const profileBtn = document.getElementById('profileBtn');
  const profilePhoto = document.getElementById('profilePhoto');
  const profileMenu = document.getElementById('profileMenu');
  const profileMenuPhoto = document.getElementById('profileMenuPhoto');
  const profileNameEl = document.getElementById('profileName');
  const profileEmailEl = document.getElementById('profileEmail');
  const signOutBtn = document.getElementById('signOutBtn');
  const addExpenseBtn = document.getElementById('addExpenseBtn');
  const openSettlementBtn = document.getElementById('openSettlementBtn');
  const expenseModal = document.getElementById('expenseModal');
  const settlementModal = document.getElementById('settlementModal');
  const expenseForm = document.getElementById('expenseForm');
  const expenseTitle = document.getElementById('expenseTitle');
  const expDateInput = document.getElementById('expDate');
  const expDescInput = document.getElementById('expDesc');
  const expAmtInput = document.getElementById('expAmt');
  const expPendingInput = document.getElementById('expPending');
  const expPayerSelect = document.getElementById('expPayer');
  const expCatInput = document.getElementById('expCat');
  const splitTypeSelect = document.getElementById('splitType');
  const percentFields = document.getElementById('percentFields');
  const amountFields = document.getElementById('amountFields');
  const splitPercentA = document.getElementById('splitPercentA');
  const splitPercentB = document.getElementById('splitPercentB');
  const splitAmountA = document.getElementById('splitAmountA');
  const splitAmountB = document.getElementById('splitAmountB');
  const percentLabelA = document.getElementById('percentLabelA');
  const percentLabelB = document.getElementById('percentLabelB');
  const amountLabelA = document.getElementById('amountLabelA');
  const amountLabelB = document.getElementById('amountLabelB');
  const expenseSubmitBtn = expenseForm.querySelector('button[type="submit"]');
  const listEl = document.getElementById('list');
  const summaryEl = document.getElementById('summary');
  const monthPicker = document.getElementById('monthPicker');
  const filterPayer = document.getElementById('filterPayer');
  const filterPayerA = document.getElementById('filterPayerA');
  const filterPayerB = document.getElementById('filterPayerB');
  const exportBtn = document.getElementById('exportBtn');
  const groupName = document.getElementById('groupName');
  const balanceBanner = document.getElementById('balanceBanner');
  const balanceText = document.getElementById('balanceText');
  const settleForm = document.getElementById('settleForm');
  const setDate = document.getElementById('setDate');
  const setDir = document.getElementById('setDir');
  const setAmt = document.getElementById('setAmt');
  const setNote = document.getElementById('setNote');

  groupName.textContent = cfg.groupId;

  const toastEl = document.createElement('div');
  toastEl.className = 'toast'; document.body.appendChild(toastEl);
  function toast(msg){ toastEl.textContent = msg; toastEl.style.display='block'; setTimeout(()=>toastEl.style.display='none', 2400); }

  function applyDynamicLabels(){
    expPayerSelect.innerHTML = `
      <option value="A">Pagó ${NAME_A}</option>
      <option value="B">Pagó ${NAME_B}</option>
    `;
    filterPayerA.textContent = `Pagó ${NAME_A}`;
    filterPayerB.textContent = `Pagó ${NAME_B}`;
    percentLabelA.textContent = `${NAME_A} (%)`;
    percentLabelB.textContent = `${NAME_B} (%)`;
    amountLabelA.textContent = `${NAME_A} ($)`;
    amountLabelB.textContent = `${NAME_B} ($)`;
    setDir.innerHTML = `
      <option value="A2B">${NAME_A} → ${NAME_B}</option>
      <option value="B2A">${NAME_B} → ${NAME_A}</option>
    `;
  }
  applyDynamicLabels();

  function openModal(modal){
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
  function closeModal(modal){
    modal.classList.add('hidden');
    if (![...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'))){
      document.body.classList.remove('modal-open');
    }
    if (modal === expenseModal) {
      resetExpenseForm();
    } else if (modal === settlementModal) {
      resetSettlementForm();
    }
  }
  function closeAllModals(){ document.querySelectorAll('.modal').forEach(closeModal); }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-close');
      const modal = document.getElementById(id);
      if (modal) closeModal(modal);
    });
  });
  [expenseModal, settlementModal].forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeAllModals(); hideProfileMenu(); }
  });

  let lastAmountEdited = 'A';
  let editingExpenseId = null;
  let pendingAmountSnapshot = '';
  const DEFAULT_EXPENSE_TITLE = 'Nuevo gasto';
  const DEFAULT_EXPENSE_SUBMIT = 'Guardar gasto';

  const setAmountInput = (input, value) => {
    const sanitized = Math.abs(value) < 0.005 ? 0 : value;
    input.value = round2(sanitized).toFixed(2);
  };

  const updateAmountComplement = (preferred = lastAmountEdited, fallbackToEven = false) => {
    const total = parseFloat(expAmtInput.value);
    if (isNaN(total) || total <= 0) return;
    const useB = preferred === 'B';
    const primary = useB ? splitAmountB : splitAmountA;
    const secondary = useB ? splitAmountA : splitAmountB;
    const primaryVal = parseFloat(primary.value);
    const secondaryVal = parseFloat(secondary.value);

    if (isNaN(primaryVal)) {
      if (fallbackToEven && isNaN(secondaryVal)) {
        normalizeAmountFields(preferred);
      } else if (!isNaN(secondaryVal)) {
        setAmountInput(secondary, clamp(secondaryVal, 0, total));
      }
      return;
    }

    const clamped = clamp(primaryVal, 0, total);
    const remainder = round2(total - clamped);
    setAmountInput(secondary, remainder);
  };

  const normalizeAmountFields = (preferred = lastAmountEdited) => {
    const total = parseFloat(expAmtInput.value);
    if (isNaN(total) || total <= 0) return;

    const useB = preferred === 'B';
    const primary = useB ? splitAmountB : splitAmountA;
    const secondary = useB ? splitAmountA : splitAmountB;

    let primaryVal = parseFloat(primary.value);
    let secondaryVal = parseFloat(secondary.value);

    if (isNaN(primaryVal) && isNaN(secondaryVal)) {
      const half = round2(total / 2);
      setAmountInput(splitAmountA, half);
      setAmountInput(splitAmountB, total - half);
      return;
    }

    if (isNaN(primaryVal)) {
      primaryVal = total - clamp(isNaN(secondaryVal) ? 0 : secondaryVal, 0, total);
    }

    primaryVal = clamp(primaryVal, 0, total);
    const remainder = round2(total - primaryVal);
    setAmountInput(primary, primaryVal);
    setAmountInput(secondary, remainder);
  };

  function setPendingMode(isPending){
    if (isPending) {
      pendingAmountSnapshot = expAmtInput.value;
      expAmtInput.value = '';
    } else if (!expAmtInput.value && pendingAmountSnapshot) {
      expAmtInput.value = pendingAmountSnapshot;
    }
    expPendingInput.checked = isPending;
    expAmtInput.disabled = isPending;
    expAmtInput.required = !isPending;
  }

  function resetExpenseForm(){
    expenseForm.reset();
    editingExpenseId = null;
    splitTypeSelect.value = 'even';
    splitPercentA.value = '50';
    splitPercentB.value = '50';
    splitAmountA.value = '';
    splitAmountB.value = '';
    lastAmountEdited = 'A';
    pendingAmountSnapshot = '';
    setPendingMode(false);
    updateSplitVisibility();
    expDateInput.value = new Date().toISOString().slice(0,10);
    expenseTitle.textContent = DEFAULT_EXPENSE_TITLE;
    expenseSubmitBtn.textContent = DEFAULT_EXPENSE_SUBMIT;
  }
  function captureSplitMeta(){
    const toNumber = (input) => {
      const val = parseFloat(input.value);
      return Number.isFinite(val) ? round2(val) : null;
    };
    return {
      type: splitTypeSelect.value,
      percentA: toNumber(splitPercentA),
      percentB: toNumber(splitPercentB),
      amountA: toNumber(splitAmountA),
      amountB: toNumber(splitAmountB)
    };
  }
  function inferSplitType(expense){
    if (expense.splitType) return expense.splitType;
    const amountVal = Number(expense.amount);
    const oweAVal = Number(expense.oweA);
    const oweBVal = Number(expense.oweB);
    const amount = Number.isFinite(amountVal) ? amountVal : null;
    const oweA = Number.isFinite(oweAVal) ? oweAVal : null;
    const oweB = Number.isFinite(oweBVal) ? oweBVal : null;
    if (amount && oweA != null && oweB != null) {
      if (Math.abs(oweA - oweB) < 0.01) return 'even';
      return 'amount';
    }
    return 'even';
  }
  function applySplitMetaToForm(expense){
    const type = inferSplitType(expense);
    splitTypeSelect.value = type;
    updateSplitVisibility();
    if (type === 'percent') {
      const baseAmountRaw = Number(expense.amount);
      const baseAmount = Number.isFinite(baseAmountRaw) ? baseAmountRaw : null;
      const percentA = expense.splitPercentA ?? (baseAmount ? round2(((expense.oweA ?? 0) / baseAmount) * 100) : null);
      const percentB = expense.splitPercentB ?? (percentA != null ? round2(100 - percentA) : null);
      splitPercentA.value = percentA != null ? percentA : '50';
      splitPercentB.value = percentB != null ? percentB : '50';
      splitAmountA.value = '';
      splitAmountB.value = '';
    } else if (type === 'amount') {
      const amountA = expense.splitAmountA ?? expense.oweA;
      const amountB = expense.splitAmountB ?? expense.oweB;
      splitAmountA.value = amountA != null ? round2(amountA).toFixed(2) : '';
      splitAmountB.value = amountB != null ? round2(amountB).toFixed(2) : '';
      splitPercentA.value = '';
      splitPercentB.value = '';
      lastAmountEdited = 'A';
      updateAmountComplement();
    } else {
      splitPercentA.value = '50';
      splitPercentB.value = '50';
      splitAmountA.value = '';
      splitAmountB.value = '';
    }
  }
  function formatInputDate(ts){
    if (!ts) return new Date().toISOString().slice(0,10);
    let date;
    if (ts instanceof Date) { date = ts; }
    else if (typeof ts?.toDate === 'function') { date = ts.toDate(); }
    else { date = new Date(ts); }
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return new Date().toISOString().slice(0,10);
    }
    return date.toISOString().slice(0,10);
  }
  function startEditExpense(expense){
    resetExpenseForm();
    editingExpenseId = expense.id;
    expenseTitle.textContent = 'Editar gasto';
    expenseSubmitBtn.textContent = 'Guardar cambios';
    expDateInput.value = formatInputDate(expense.date);
    expDescInput.value = expense.desc || '';
    expPayerSelect.value = expense.payer || 'A';
    expCatInput.value = expense.cat || '';
    const numericAmount = Number(expense.amount);
    if (Number.isFinite(numericAmount) && expense.amountPending !== true) {
      expAmtInput.value = round2(numericAmount).toFixed(2);
    } else {
      expAmtInput.value = '';
    }
    setPendingMode(expense.amountPending === true);
    applySplitMetaToForm(expense);
    openModal(expenseModal);
    setTimeout(() => expDescInput.focus(), 50);
  }
  function resetSettlementForm(){
    settleForm.reset();
    const today = new Date().toISOString().slice(0,10);
    setDate.value = today;
    const { balanceA } = computeBalances(allExpenses, allSettlements);
    const debt = Math.abs(balanceA);
    if (debt > 0.01) {
      const dir = balanceA > 0 ? 'B2A' : 'A2B';
      setDir.value = dir;
      setAmt.value = round2(debt).toFixed(2);
    } else {
      setDir.value = 'A2B';
      setAmt.value = '';
    }
  }

  function updateSplitVisibility(){
    const type = splitTypeSelect.value;
    percentFields.classList.toggle('hidden', type !== 'percent');
    amountFields.classList.toggle('hidden', type !== 'amount');
  }
  splitTypeSelect.addEventListener('change', () => {
    updateSplitVisibility();
    if (splitTypeSelect.value === 'amount') {
      normalizeAmountFields();
    }
  });
  splitPercentA.addEventListener('input', () => {
    const val = parseFloat(splitPercentA.value);
    if (!isNaN(val)) splitPercentB.value = Math.max(0, round2(100 - val));
  });
  splitPercentB.addEventListener('input', () => {
    const val = parseFloat(splitPercentB.value);
    if (!isNaN(val)) splitPercentA.value = Math.max(0, round2(100 - val));
  });
  splitAmountA.addEventListener('input', () => {
    lastAmountEdited = 'A';
    updateAmountComplement('A');
  });
  splitAmountB.addEventListener('input', () => {
    lastAmountEdited = 'B';
    updateAmountComplement('B');
  });
  expAmtInput.addEventListener('input', () => {
    if (splitTypeSelect.value === 'amount') {
      updateAmountComplement(undefined, true);
    }
  });
  expPendingInput.addEventListener('change', () => {
    setPendingMode(expPendingInput.checked);
  });

  googleBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => toast(err.message || 'No se pudo ingresar'));
  });
  emailForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('pass').value.trim();
    auth.signInWithEmailAndPassword(email, pass)
      .catch(async (err) => {
        if (err.code === 'auth/user-not-found') { await auth.createUserWithEmailAndPassword(email, pass); }
        else { toast(err.message); }
      });
  });

  function showProfileMenu(){
    profileMenu.hidden = false;
    profileBtn.setAttribute('aria-expanded','true');
  }
  function hideProfileMenu(){
    profileMenu.hidden = true;
    profileBtn.setAttribute('aria-expanded','false');
  }
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (profileMenu.hidden) showProfileMenu(); else hideProfileMenu();
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.hidden && !profileMenu.contains(e.target) && e.target !== profileBtn) {
      hideProfileMenu();
    }
  });
  signOutBtn.addEventListener('click', () => { hideProfileMenu(); closeAllModals(); auth.signOut(); });

  addExpenseBtn.addEventListener('click', () => {
    resetExpenseForm();
    openModal(expenseModal);
    setTimeout(() => expDescInput.focus(), 50);
  });
  openSettlementBtn.addEventListener('click', () => {
    resetSettlementForm();
    openModal(settlementModal);
  });

  let unsubscribe = null;
  let unsubscribeAll = null;
  let currentUser = null;
  let expenses = [];
  let settlements = [];
  let allExpenses = [];
  let allSettlements = [];

  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  monthPicker.value = ym;
  resetExpenseForm();
  resetSettlementForm();

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      const allowed = [cfg.users.A.email.toLowerCase(), cfg.users.B.email.toLowerCase()];
      const uEmail = (user.email || '').toLowerCase();
      if (!allowed.includes(uEmail)) { alert('Tu usuario no está autorizado.'); await auth.signOut(); return; }
      authSection.hidden = true; appSection.hidden = false; profileBtn.hidden = false;
      const photo = user.photoURL || 'icons/icon-192.png';
      profilePhoto.src = photo; profileMenuPhoto.src = photo;
      profileNameEl.textContent = user.displayName || user.email || 'Cuenta';
      profileEmailEl.textContent = user.email || '';
      subscribeAll();
      subscribe();
    } else {
      appSection.hidden = true; authSection.hidden = false; hideProfileMenu(); closeAllModals();
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (unsubscribeAll) { unsubscribeAll(); unsubscribeAll = null; }
    }
  });

  function monthRange(ym) {
    const [y,m] = ym.split('-').map(Number);
    const start = new Date(y, m-1, 1);
    const end = new Date(y, m, 1);
    return { start, end };
  }

  function subscribeAll() {
    if (unsubscribeAll) { unsubscribeAll(); }
    const ref = db.collection('groups').doc(cfg.groupId).collection('expenses')
      .orderBy('date','desc');

    unsubscribeAll = ref.onSnapshot(snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      allExpenses = all.filter(x => !x.settlement);
      allSettlements = all.filter(x => x.settlement === true);
      updateBalanceBanner(computeBalances(allExpenses, allSettlements).balanceA);
    }, (err) => console.error(err));
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

  function computeSplitValues(amount){
    const type = splitTypeSelect.value;
    if (type === 'percent') {
      const pA = parseFloat(splitPercentA.value);
      const pB = parseFloat(splitPercentB.value);
      if (isNaN(pA) || isNaN(pB) || Math.abs(pA + pB - 100) > 0.01) { throw new Error('Los porcentajes deben sumar 100%.'); }
      const oweA = round2(amount * (pA/100));
      const oweB = round2(amount - oweA);
      return { oweA, oweB, meta: { type, percentA: round2(pA), percentB: round2(pB), amountA: null, amountB: null } };
    }
    if (type === 'amount') {
      normalizeAmountFields();
      const total = round2(amount);
      const aA = parseFloat(splitAmountA.value);
      const aB = parseFloat(splitAmountB.value);
      if (isNaN(aA) || isNaN(aB)) { throw new Error('Completá los montos.'); }
      const sum = round2(aA + aB);
      if (Math.abs(sum - total) > 0.02) { throw new Error('Los montos deben sumar el total.'); }
      const oweA = round2(aA);
      const oweB = round2(aB);
      return { oweA, oweB, meta: { type, percentA: null, percentB: null, amountA: oweA, amountB: oweB } };
    }
    const half = round2(amount/2);
    const remainder = round2(amount - half);
    return { oweA: half, oweB: remainder, meta: { type: 'even', percentA: 50, percentB: 50, amountA: null, amountB: null } };
  }

  expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const date = expDateInput.value;
    const desc = expDescInput.value.trim();
    const payer = expPayerSelect.value;
    const cat = expCatInput.value.trim();
    const pending = expPendingInput.checked;
    const amt = pending ? null : parseFloat(expAmtInput.value);
    if (!date || !desc || (!pending && (isNaN(amt) || amt <= 0))) { toast('Completá los datos del gasto.'); return; }
    let split;
    let splitMeta;
    if (!pending) {
      try {
        split = computeSplitValues(amt);
        splitMeta = split.meta;
      } catch(err){ toast(err.message); return; }
    } else {
      splitMeta = captureSplitMeta();
    }
    const baseDoc = {
      date: firebase.firestore.Timestamp.fromDate(parseLocalDate(date)),
      desc,
      payer,
      cat: cat || null,
      amountPending: pending,
      amount: pending ? null : round2(amt),
      oweA: pending ? null : split.oweA,
      oweB: pending ? null : split.oweB,
      splitType: splitMeta.type,
      splitPercentA: splitMeta.percentA,
      splitPercentB: splitMeta.percentB,
      splitAmountA: splitMeta.amountA,
      splitAmountB: splitMeta.amountB
    };
    try {
      const ref = db.collection('groups').doc(cfg.groupId).collection('expenses');
      if (editingExpenseId) {
        await ref.doc(editingExpenseId).update({
          ...baseDoc,
          updatedBy: currentUser.uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('Gasto actualizado');
      } else {
        await ref.add({
          ...baseDoc,
          createdBy: currentUser.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        toast('Gasto agregado');
      }
      closeModal(expenseModal);
    } catch (e2) { toast(e2.message); }
  });

  exportBtn.addEventListener('click', () => {
    const rows = [["Fecha","Descripción","Monto","Pagó","Categoría","Tipo", NAME_A, NAME_B]];
    getFiltered().forEach(x => {
      const tipo = x.settlement ? 'settlement' : 'gasto';
      const desc = x.settlement ? (x.note || `Pago ${NAME_MAP[x.from]}→${NAME_MAP[x.to]}`) : x.desc;
      const payer = x.settlement ? `${NAME_MAP[x.from]}→${NAME_MAP[x.to]}` : NAME_MAP[x.payer] || x.payer;
      const isPending = x.amountPending === true;
      const amountCell = x.settlement ? round2(x.amount) : isPending ? 'PENDIENTE' : round2(x.amount);
      const owedA = (x.settlement || isPending) ? '' : round2(x.oweA ?? x.amount/2);
      const owedB = (x.settlement || isPending) ? '' : round2(x.oweB ?? x.amount/2);
      rows.push([
        x.date.toDate().toISOString().slice(0,10),
        desc,
        amountCell,
        payer,
        x.cat||'',
        tipo,
        owedA,
        owedB
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `gastos_${monthPicker.value}.csv`; a.click(); URL.revokeObjectURL(a.href);
  });

  function getFiltered() {
    const fp = filterPayer.value;
    const items = [...expenses, ...settlements].sort((a,b)=>b.date.seconds - a.date.seconds);
    if (fp === 'ALL') return items;
    if (fp === 'SETTLEMENT') return items.filter(x=>x.settlement);
    return items.filter(x => x.settlement ? (fp==='A' ? x.from==='A' : x.from==='B') : x.payer===fp);
  }

  function computeBalances(expList = expenses, setList = settlements){
    const totals = expList.reduce((acc,it)=>{
      if (it.amountPending === true) { return acc; }
      const amount = round2(it.amount);
      const oweA = round2(it.oweA ?? amount/2);
      const oweB = round2(it.oweB ?? amount/2);
      acc.total += amount;
      if (it.payer === 'A') acc.paidA += amount; else acc.paidB += amount;
      acc.oweA += oweA;
      acc.oweB += oweB;
      return acc;
    }, { paidA:0, paidB:0, oweA:0, oweB:0, total:0 });
    const sA2B = setList.filter(x=>x.from==='A'&&x.to==='B').reduce((a,b)=>a+round2(b.amount),0);
    const sB2A = setList.filter(x=>x.from==='B'&&x.to==='A').reduce((a,b)=>a+round2(b.amount),0);
    const balanceA = round2(totals.paidA - totals.oweA + sA2B - sB2A);
    const balanceB = round2(-(balanceA));
    return { ...totals, balanceA, balanceB };
  }

  async function del(id) {
    if (!confirm('¿Eliminar ítem?')) return;
    try { await db.collection('groups').doc(cfg.groupId).collection('expenses').doc(id).delete(); }
    catch (e) { toast(e.message); }
  }

  function render() {
    listEl.innerHTML = '';
    const items = getFiltered();
    if (!items.length){
      const empty = document.createElement('li');
      empty.className = 'item';
      empty.innerHTML = `
        <div class="item__row item__row--top">
          <div class="item__title"><strong>Sin movimientos</strong></div>
        </div>
        <div class="item__row item__row--middle">
          <span class="meta">Agregá un gasto con el botón “+”.</span>
        </div>
      `;
      listEl.appendChild(empty);
    } else {
      for (const it of items) {
        const li = document.createElement('li');
        const isSet = it.settlement === true;
        if (isSet){
          li.className = 'item settlement';
          const dir = `${NAME_MAP[it.from]} → ${NAME_MAP[it.to]}`;
          const note = it.note ? it.note : 'Ajuste de balance';
          li.innerHTML = `
            <div class="item__row item__row--top">
              <div class="item__title"><strong>Pago ${dir}</strong><span class="tag">Settlement</span></div>
              <div class="item__amount">${formatMoney(it.amount)}</div>
            </div>
            <div class="item__row item__row--middle">
              <span class="meta">${formatDate(it.date)}</span>
              <span class="meta">${note}</span>
            </div>
            <div class="item__row item__row--bottom">
              <span class="meta">Registrado por ${NAME_MAP[it.from]}</span>
              <button class="btn ghost small" type="button" data-delete-id="${it.id}">
                <span class="icon" aria-hidden="true">❌</span>
                <span class="label">Eliminar</span>
              </button>
            </div>
          `;
        } else {
          const isPending = it.amountPending === true;
          const payerClass = it.payer === 'A' ? 'payer-a' : it.payer === 'B' ? 'payer-b' : '';
          const classes = ['item'];
          if (payerClass) classes.push(payerClass);
          if (isPending) classes.push('pending');
          li.className = classes.join(' ');
          const payerLabel = NAME_MAP[it.payer] || it.payer || '—';
          let shareText;
          if (isPending) {
            shareText = 'Monto pendiente de definir';
          } else {
            const shareA = round2(it.oweA ?? it.amount/2);
            const shareB = round2(it.oweB ?? it.amount/2);
            shareText = `${NAME_A}: ${formatMoney(shareA)} · ${NAME_B}: ${formatMoney(shareB)}`;
          }
          const amountHtml = isPending
            ? '<div class="item__amount item__amount--pending">Monto a definir</div>'
            : `<div class="item__amount">${formatMoney(it.amount)}</div>`;
          li.innerHTML = `
            <div class="item__row item__row--top">
              <div class="item__title">
                <strong>${it.desc}</strong>
                ${it.cat ? `<span class="tag">${it.cat}</span>` : ''}
              </div>
              ${amountHtml}
            </div>
            <div class="item__row item__row--middle">
              <span class="meta">${formatDate(it.date)}</span>
              <span class="meta">Pagó ${payerLabel}</span>
            </div>
            <div class="item__row item__row--bottom">
              <span class="shares">${shareText}</span>
              <div class="item__actions">
                <button class="btn ghost small icon-only" type="button" data-edit-id="${it.id}" aria-label="Editar gasto"><span class="icon" aria-hidden="true">✏️</span></button>
                <button class="btn ghost small" type="button" data-delete-id="${it.id}">
                  <span class="icon" aria-hidden="true">❌</span>
                  <span class="label">Eliminar</span>
                </button>
              </div>
            </div>
          `;
        }
        const deleteBtn = li.querySelector('[data-delete-id]');
        if (deleteBtn) deleteBtn.addEventListener('click', () => del(it.id));
        const editBtn = li.querySelector('[data-edit-id]');
        if (editBtn) editBtn.addEventListener('click', () => startEditExpense(it));
        listEl.appendChild(li);
      }
    }

    const { paidA, paidB, oweA, oweB, total, balanceA, balanceB } = computeBalances();
    const { balanceA: overallBalanceA } = computeBalances(allExpenses, allSettlements);
    const summaryHtml = `
      <div class="box summary__total">
        <div class="kicker">Total período</div>
        <strong>${formatMoney(total)}</strong>
      </div>
      <div class="box summary__payer">
        <div class="kicker">Pagó ${NAME_A}</div>
        <strong>${formatMoney(paidA)}</strong>
        <div class="meta">Debe ${formatMoney(oweA)}</div>
      </div>
      <div class="box summary__payer">
        <div class="kicker">Pagó ${NAME_B}</div>
        <strong>${formatMoney(paidB)}</strong>
        <div class="meta">Debe ${formatMoney(oweB)}</div>
      </div>
      <div class="box summary__balance">
        <div class="kicker">Saldo actual</div>
        <strong>${balanceA > 0 ? `${NAME_B} debe ${formatMoney(balanceA)} a ${NAME_A}` : balanceA < 0 ? `${NAME_A} debe ${formatMoney(Math.abs(balanceA))} a ${NAME_B}` : 'Están a mano'}</strong>
      </div>`;
    summaryEl.innerHTML = summaryHtml;

    updateBalanceBanner(overallBalanceA);
  }

  function updateBalanceBanner(balanceAValue){
    let statusText = `😊 ${NAME_A} y ${NAME_B} están a mano`;
    balanceBanner.classList.remove('ok');
    if (balanceAValue > 0.01) {
      statusText = `${NAME_B} debe ${formatMoney(balanceAValue)} a ${NAME_A}`;
    } else if (balanceAValue < -0.01) {
      statusText = `${NAME_A} debe ${formatMoney(Math.abs(balanceAValue))} a ${NAME_B}`;
    } else {
      balanceBanner.classList.add('ok');
    }
    balanceText.textContent = statusText;
    balanceBanner.hidden = false;
  }

  settleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const dir = setDir.value;
    const amt = parseFloat(setAmt.value);
    if (isNaN(amt) || amt<=0) { toast('Ingresá un monto válido.'); return; }
    const when = parseLocalDate(setDate.value);
    const from = dir === 'A2B' ? 'A' : 'B';
    const to = dir === 'A2B' ? 'B' : 'A';
    const doc = {
      settlement: true, from, to,
      amount: round2(amt),
      date: firebase.firestore.Timestamp.fromDate(when),
      note: setNote.value || null,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try{
      await db.collection('groups').doc(cfg.groupId).collection('expenses').add(doc);
      toast('Pago registrado');
      closeModal(settlementModal);
      render();
    }catch(e2){ toast(e2.message); }
  });

})();
