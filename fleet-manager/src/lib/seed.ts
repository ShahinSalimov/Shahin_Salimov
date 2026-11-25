import type { BusinessDef, Car, Customer, DB, Driver, Expense, Fine, LedgerEntry, Product, Purchase, Sale, Assignment } from './types';
import { addDays, today, uid } from './format';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const firstNames = ['Elvin', 'Rəşad', 'Orxan', 'Kamran', 'Tural', 'Ramil', 'Nicat', 'Fərid', 'Vüqar', 'Samir', 'Elnur', 'Ruslan', 'Emin', 'Anar', 'Murad', 'Cavid', 'Ilkin', 'Rauf', 'Zaur', 'Mahir', 'Səbuhi', 'Elşən', 'Natiq', 'Rövşən', 'Bəxtiyar', 'Ceyhun', 'Vasif', 'Ülvi', 'Şahin', 'Toğrul', 'Fuad', 'Əli', 'Hüseyn', 'Kənan', 'Pərviz', 'Arif'];
const lastNames = ['Məmmədov', 'Əliyev', 'Həsənov', 'Hüseynov', 'Quliyev', 'İsmayılov', 'Abbasov', 'Cəfərov', 'Rzayev', 'Nəsirov', 'Babayev', 'Kərimov', 'Süleymanov', 'Orucov', 'Novruzov', 'Bayramov', 'Mustafayev', 'Qasımov', 'Vəliyev', 'Sadıqov'];
const carModels: [string, string, number, number][] = [
  ['Toyota', 'Prius', 45, 24000],
  ['Hyundai', 'Sonata', 50, 26000],
  ['Kia', 'Optima', 45, 22000],
  ['Chevrolet', 'Cobalt', 40, 15000],
  ['Hyundai', 'Elantra', 45, 21000],
  ['Kia', 'K5', 50, 27000],
  ['Toyota', 'Camry', 50, 32000],
  ['Chevrolet', 'Malibu', 45, 20000],
];
const colors = ['Ağ', 'Qara', 'Gümüşü', 'Boz', 'Göy'];
const letters = ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'DH', 'FL', 'HN', 'KR', 'LM', 'MS', 'NP', 'OR', 'PT', 'RZ', 'SV', 'TK', 'UV', 'ZZ'];

export const defaultBusinesses = (): BusinessDef[] => [
  { id: 'taxi', name: 'Taksi parkı', builtin: true, color: '#eab308', incomeCategories: ['İcarə'], expenseCategories: [] },
  { id: 'phone', name: 'Telefon topdan', builtin: true, color: '#0ea5e9', incomeCategories: ['Satış'], expenseCategories: [] },
  { id: 'general', name: 'Ümumi', builtin: true, color: '#64748b', incomeCategories: [], expenseCategories: [] },
];

export function createSeed(empty = false): DB {
  const t = today();
  const base: DB = {
    version: 1,
    settings: {
      companyName: 'Park Pro',
      ownerName: 'Sahib',
      currentUser: 'Sahib',
      defaultDailyRate: 45,
    },
    businesses: defaultBusinesses(), entries: [],
    cars: [], drivers: [], assignments: [], ledger: [], fines: [], expenses: [],
    products: [], customers: [], sales: [], customerPayments: [], purchases: [], audit: [],
    lastAccrual: null,
  };
  if (empty) return { ...base, lastAccrual: t };

  const r = rng(20261124);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const HISTORY = 45;
  const start = addDays(t, -HISTORY);

  // --- Avtomobillər ---
  const cars: Car[] = [];
  const plates = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const [make, model, rate, price] = pick(carModels);
    let plate = '';
    do plate = `${pick(['10', '90', '77', '99'])}-${pick(letters)}-${String(int(100, 999))}`; while (plates.has(plate));
    plates.add(plate);
    const mileage = int(60000, 260000);
    const status = i < 90 ? 'active' : i < 96 ? 'service' : 'idle';
    let insuranceUntil = addDays(t, int(20, 330));
    let inspectionUntil = addDays(t, int(20, 300));
    if (i % 17 === 3) insuranceUntil = addDays(t, int(1, 6));
    if (i % 23 === 5) inspectionUntil = addDays(t, int(-4, 5));
    cars.push({
      id: uid(), plate, make, model, year: int(2015, 2023), color: pick(colors), status,
      dailyRate: rate, mileage, lastOilKm: mileage - (i % 11 === 0 ? int(9500, 12000) : int(500, 8000)), oilIntervalKm: 10000,
      insuranceUntil, inspectionUntil, purchasePrice: price,
    });
  }

  // --- Sürücülər + icarələr ---
  const drivers: Driver[] = [];
  const assignments: Assignment[] = [];
  const names = new Set<string>();
  for (let i = 0; i < 94; i++) {
    let name = '';
    do name = `${pick(firstNames)} ${pick(lastNames)}`; while (names.has(name));
    names.add(name);
    const assigned = i < 90;
    const from = assigned ? addDays(start, i % 9 === 0 ? int(5, 30) : 0) : addDays(t, -int(60, 200));
    drivers.push({
      id: uid(), name, phone: `+994${pick(['50', '51', '55', '70', '77', '99'])}${int(1000000, 9999999)}`,
      licenseNo: `AZ${int(100000, 999999)}`, deposit: pick([200, 300, 300, 500]), debtLimit: 150, active: assigned, startDate: from,
    });
    if (assigned) assignments.push({ id: uid(), carId: cars[i].id, driverId: drivers[i].id, from, to: null });
  }

  // --- Ödənişlər (icarə haqqı accrueRent ilə yaranır) ---
  const ledger: LedgerEntry[] = [];
  drivers.forEach((d, i) => {
    const a = assignments.find((x) => x.driverId === d.id);
    if (!a) return;
    const car = cars.find((c) => c.id === a.carId)!;
    const reliability = i % 13 === 0 ? 0.62 : i % 7 === 0 ? 0.8 : 0.97;
    for (let day = a.from; day < t; day = addDays(day, 1)) {
      const x = r();
      if (x < reliability) {
        ledger.push({ id: uid(), driverId: d.id, carId: car.id, date: day, type: 'payment', amount: -car.dailyRate, method: r() < 0.7 ? 'cash' : 'card' });
      } else if (x < reliability + 0.05) {
        ledger.push({ id: uid(), driverId: d.id, carId: car.id, date: day, type: 'payment', amount: -Math.round(car.dailyRate / 2), method: 'cash', note: 'Qismən' });
      }
    }
    // yaxşı sürücülər buraxdıqları günləri sonradan bağlayır
    if (reliability > 0.9 && r() < 0.85) {
      let charged = 0;
      for (let day = a.from; day < t; day = addDays(day, 1)) charged += car.dailyRate;
      const paidSum = ledger.filter((l) => l.driverId === d.id).reduce((s, l) => s - l.amount, 0);
      const gap = charged - paidSum;
      if (gap > 0) ledger.push({ id: uid(), driverId: d.id, carId: car.id, date: addDays(t, -int(1, 5)), type: 'payment', amount: -gap, method: 'cash', note: 'Borc ödənişi' });
    }
    // bu gün ödəyənlər (səhər saatları)
    if (r() < 0.55) ledger.push({ id: uid(), driverId: d.id, carId: car.id, date: t, type: 'payment', amount: -car.dailyRate, method: r() < 0.7 ? 'cash' : 'card' });
  });

  // --- Cərimələr ---
  const fines: Fine[] = [];
  const reasons = ['Sürət həddinin aşılması', 'Qırmızı işıq', 'Dayanma qaydası', 'Təhlükəsizlik kəməri', 'Zolaq pozuntusu'];
  for (let i = 0; i < 28; i++) {
    const a = pick(assignments);
    const day = addDays(t, -int(0, HISTORY - 1));
    if (day < a.from) continue;
    const amount = pick([20, 40, 50, 60, 100]);
    const charged = r() < 0.8;
    const fineId = uid();
    fines.push({ id: fineId, carId: a.carId, driverId: a.driverId, datetime: `${day}T${String(int(7, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`, amount, reason: pick(reasons), paid: r() < 0.6, chargedToDriver: charged });
    if (charged) ledger.push({ id: uid(), driverId: a.driverId, carId: a.carId, date: day, type: 'fine', amount, note: 'Cərimə', refId: fineId });
  }

  // --- Xərclər ---
  const expenses: Expense[] = [];
  for (let i = 0; i < 70; i++) {
    const car = pick(cars);
    const cat = pick(['oil', 'oil', 'repair', 'tire', 'wash'] as const);
    const amount = cat === 'oil' ? int(60, 90) : cat === 'repair' ? int(80, 700) : cat === 'tire' ? int(160, 480) : int(10, 20);
    expenses.push({ id: uid(), date: addDays(t, -int(0, HISTORY - 1)), business: 'taxi', category: cat, carId: car.id, amount });
  }
  for (let m = 0; m < 2; m++) {
    const d = addDays(t, -m * 30 - 1);
    expenses.push({ id: uid(), date: d, business: 'general', category: 'rent', amount: 1500, note: 'Ofis və anbar icarəsi' });
    expenses.push({ id: uid(), date: d, business: 'general', category: 'salary', amount: 2400, note: 'Menecer + kassir maaşı' });
    expenses.push({ id: uid(), date: d, business: 'phone', category: 'salary', amount: 1200, note: 'Satış meneceri' });
  }

  // --- Telefon / aksesuar məhsulları ---
  const prodDefs: [Product['category'], string, string, string, number, number, number][] = [
    ['phone', 'Apple', 'iPhone 16 Pro Max', '256GB', 2150, 2290, 14],
    ['phone', 'Apple', 'iPhone 16 Pro', '128GB', 1820, 1950, 9],
    ['phone', 'Apple', 'iPhone 16', '128GB', 1380, 1480, 22],
    ['phone', 'Apple', 'iPhone 15', '128GB', 1150, 1240, 3],
    ['phone', 'Apple', 'iPhone 13', '128GB', 780, 850, 11],
    ['phone', 'Samsung', 'Galaxy S25 Ultra', '256GB', 1950, 2090, 7],
    ['phone', 'Samsung', 'Galaxy S25', '128GB', 1300, 1400, 2],
    ['phone', 'Samsung', 'Galaxy A56', '128GB', 560, 620, 31],
    ['phone', 'Samsung', 'Galaxy A36', '128GB', 430, 480, 26],
    ['phone', 'Samsung', 'Galaxy A16', '128GB', 260, 295, 48],
    ['phone', 'Xiaomi', 'Redmi Note 14 Pro', '256GB', 470, 530, 19],
    ['phone', 'Xiaomi', 'Redmi 14C', '128GB', 190, 220, 40],
    ['phone', 'Xiaomi', 'Xiaomi 15', '256GB', 1250, 1350, 4],
    ['accessory', 'Generic', 'Adapter 20W USB-C', 'Ağ', 6, 11, 320],
    ['accessory', 'Generic', 'Kabel USB-C → Lightning 1m', 'Ağ', 3, 6.5, 540],
    ['accessory', 'Generic', 'Kabel USB-C → USB-C 1m', 'Qara', 2.5, 5.5, 610],
    ['accessory', 'Generic', 'Simsiz qulaqlıq TWS', 'Ağ', 14, 24, 85],
    ['accessory', 'Generic', 'Power bank 10000mAh', 'Qara', 15, 25, 60],
    ['accessory', 'Generic', 'Qoruyucu şüşə (iPhone)', 'Şəffaf', 0.8, 2.5, 1200],
    ['accessory', 'Generic', 'Silikon kabro (iPhone 16)', 'Mix', 1.5, 4, 25],
    ['accessory', 'Generic', 'Avtomobil tutacağı', 'Qara', 4, 8, 140],
    ['accessory', 'Generic', 'Avtomobil adapteri 2xUSB', 'Qara', 3.5, 7, 12],
  ];
  const products: Product[] = prodDefs.map(([category, brand, model, variant, cost, price, qty]) => ({
    id: uid(), category, brand, model, variant, cost, price, qty,
    minQty: category === 'phone' ? 5 : 50,
  }));

  // --- Müştərilər (mağazalar) ---
  const shops = [
    ['Mobil Dünya', 'Nərimanov'], ['Smart Zone', 'Gənclik'], ['Telefon Evi', '28 May'], ['iStore Plus', 'Nizami küç.'],
    ['Mega Mobile', 'Sumqayıt'], ['Gadget Point', 'Xətai'], ['Fon Market', 'Gəncə'], ['Mobile Line', 'Yasamal'],
    ['Click Store', 'Əhmədli'], ['Tech Bazar', 'Bakı Tini'], ['Ulduz Mobil', 'Xırdalan'], ['Planet Phone', 'Lənkəran'],
  ];
  const customers: Customer[] = shops.map(([shop, address]) => ({
    id: uid(), shop, address, name: `${pick(firstNames)} ${pick(lastNames)}`,
    phone: `+994${pick(['50', '55', '70', '99'])}${int(1000000, 9999999)}`,
  }));

  // --- Satışlar ---
  const sales: Sale[] = [];
  for (let i = 0; i < 64; i++) {
    const c = pick(customers);
    const items = Array.from({ length: int(1, 4) }, () => {
      const p = pick(products);
      const qty = p.category === 'phone' ? int(1, 4) : int(10, 60);
      return { productId: p.id, qty, price: p.price, cost: p.cost };
    });
    const total = Math.round(items.reduce((s, x) => s + x.qty * x.price, 0) * 100) / 100;
    const paid = r() < 0.65 ? total : Math.round(total * pick([0, 0.3, 0.5, 0.7]));
    sales.push({ id: uid(), no: 0, date: addDays(t, -int(0, HISTORY - 1)), customerId: c.id, items, total, paid });
  }
  sales.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => (s.no = 1001 + i));

  const purchases: Purchase[] = [
    { id: uid(), date: addDays(t, -30), supplier: 'Dubai Trade LLC', items: products.slice(0, 5).map((p) => ({ productId: p.id, qty: 10, cost: p.cost })), total: products.slice(0, 5).reduce((s, p) => s + p.cost * 10, 0) },
    { id: uid(), date: addDays(t, -12), supplier: 'Guangzhou Accessories', items: products.slice(13).map((p) => ({ productId: p.id, qty: 200, cost: p.cost })), total: products.slice(13).reduce((s, p) => s + p.cost * 200, 0) },
  ];

  const customerPayments = customers.slice(0, 5).map((c) => ({ id: uid(), customerId: c.id, date: addDays(t, -int(1, 10)), amount: int(200, 900), method: 'cash' as const }));

  return {
    ...base,
    settings: { ...base.settings, companyName: 'Park Pro Group' },
    cars, drivers, assignments, ledger, fines, expenses, products, customers, sales, customerPayments, purchases,
    audit: [{ id: uid(), ts: new Date().toISOString(), user: 'Sistem', action: 'Demo məlumatları yükləndi' }],
  };
}
