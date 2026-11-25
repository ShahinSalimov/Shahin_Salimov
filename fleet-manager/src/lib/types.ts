export type ID = string;
export type ISODate = string; // YYYY-MM-DD

export type CarStatus = 'active' | 'service' | 'idle';

export interface Car {
  id: ID;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  status: CarStatus;
  dailyRate: number;
  mileage: number;
  lastOilKm: number;
  oilIntervalKm: number;
  insuranceUntil: ISODate;
  inspectionUntil: ISODate;
  purchasePrice: number;
  notes?: string;
}

export interface Driver {
  id: ID;
  name: string;
  phone: string;
  licenseNo: string;
  deposit: number;
  debtLimit: number;
  active: boolean;
  startDate: ISODate;
  notes?: string;
}

/** Hansı maşın hansı tarixlər arasında hansı sürücüdə olub. */
export interface Assignment {
  id: ID;
  carId: ID;
  driverId: ID;
  from: ISODate;
  to: ISODate | null;
}

export type LedgerType = 'rent' | 'payment' | 'fine' | 'damage' | 'deposit' | 'adjust';
export type PayMethod = 'cash' | 'card';

/** Sürücü hesabı: müsbət məbləğ = borc yaranır, mənfi = ödəniş. */
export interface LedgerEntry {
  id: ID;
  driverId: ID;
  carId?: ID;
  date: ISODate;
  type: LedgerType;
  amount: number;
  method?: PayMethod;
  note?: string;
  /** əlaqəli qeyd (məs. cərimənin id-si) */
  refId?: ID;
}

export interface Fine {
  id: ID;
  carId: ID;
  driverId: ID | null;
  datetime: string; // YYYY-MM-DDTHH:mm
  amount: number;
  reason: string;
  paid: boolean;
  chargedToDriver: boolean;
}

export type ExpenseCategory =
  | 'oil' | 'repair' | 'tire' | 'insurance' | 'inspection' | 'wash' | 'salary' | 'rent' | 'logistics' | 'other';
/** 'taxi' | 'phone' | 'general' və ya istifadəçinin yaratdığı biznesin id-si */
export type Business = string;

export interface BusinessDef {
  id: ID;
  name: string;
  builtin: boolean; // taxi/phone/general silinə bilməz
  color: string;
  incomeCategories: string[];
  expenseCategories: string[];
}

/** Əlavə bizneslər üçün universal gəlir/xərc qeydi. */
export interface BizEntry {
  id: ID;
  businessId: ID;
  date: ISODate;
  kind: 'income' | 'expense';
  category: string;
  amount: number;
  method: PayMethod;
  note?: string;
}

export interface Expense {
  id: ID;
  date: ISODate;
  business: Business;
  category: ExpenseCategory | string;
  carId?: ID;
  amount: number;
  note?: string;
}

export type ProductCategory = 'phone' | 'accessory';

export interface Product {
  id: ID;
  category: ProductCategory;
  brand: string;
  model: string;
  variant: string; // yaddaş / rəng
  qty: number;
  cost: number; // orta maya dəyəri
  price: number; // topdan satış qiyməti
  minQty: number;
}

export interface Customer {
  id: ID;
  name: string;
  shop: string;
  phone: string;
  address?: string;
}

export interface SaleItem {
  productId: ID;
  qty: number;
  price: number;
  cost: number;
  imei?: string;
}

export interface Sale {
  id: ID;
  no: number;
  date: ISODate;
  customerId: ID;
  items: SaleItem[];
  total: number;
  paid: number;
  note?: string;
}

export interface CustomerPayment {
  id: ID;
  customerId: ID;
  date: ISODate;
  amount: number;
  method: PayMethod;
}

export interface Purchase {
  id: ID;
  date: ISODate;
  supplier: string;
  items: { productId: ID; qty: number; cost: number }[];
  total: number;
}

export interface AuditEntry {
  id: ID;
  ts: string;
  user: string;
  action: string;
}

export interface Settings {
  companyName: string;
  ownerName: string;
  logo?: string; // data URL
  currentUser: string;
  telegramToken?: string;
  telegramChatId?: string;
  defaultDailyRate: number;
}

export interface DB {
  version: number;
  settings: Settings;
  businesses: BusinessDef[];
  entries: BizEntry[];
  cars: Car[];
  drivers: Driver[];
  assignments: Assignment[];
  ledger: LedgerEntry[];
  fines: Fine[];
  expenses: Expense[];
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  customerPayments: CustomerPayment[];
  purchases: Purchase[];
  audit: AuditEntry[];
  lastAccrual: ISODate | null;
}
