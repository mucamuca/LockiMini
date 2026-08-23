export type Role = 'CUSTOMER' | 'ADMIN';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  addresses?: Address[];
};

export type Address = {
  id: string;
  label: string;
  recipient: string;
  line1: string;
  line2?: string | null;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
  isDefault: boolean;
};

export type StockInfo = { available: number; lowStock: boolean; outOfStock: boolean };

/** Uma combinacao vendavel: "Preto / M". O preco ja vem resolvido pelo servidor. */
export type ProductVariant = {
  id: string;
  sku: string;
  label: string;
  colorName: string | null;
  colorHex: string | null;
  sizeName: string | null;
  priceCents: number;
  imageUrl: string | null;
  stock: StockInfo & { quantity: number; reserved: number };
};

/** Os eixos que o produto usa — a tela monta um seletor por eixo presente. */
export type ProductOptions = {
  colors: { name: string; hex: string | null }[];
  sizes: string[];
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  images: string[];
  featured: boolean;
  active: boolean;
  category: { id: string; name: string; slug: string } | null;
  stock: StockInfo;
  /** Vazio quando o produto nao tem variacoes. */
  variants: ProductVariant[];
  options: ProductOptions;
  /** Menor preco entre as variacoes — o "a partir de" da vitrine. */
  fromPriceCents: number;
  createdAt: string;
};

export type AdminProduct = Product & {
  inventory: {
    quantity: number;
    reserved: number;
    available: number;
    lowStockThreshold: number;
    updatedAt: string | null;
  };
  weightGrams: number;
  categoryId: string | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
};

export type CartItem = {
  id: string;
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  stock: { available: number; unavailable: boolean; overBooked: boolean };
  issue: string | null;
};

export type Cart = {
  id: string;
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  freeShippingThresholdCents: number;
  missingForFreeShippingCents: number;
  hasIssues: boolean;
};

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentMethod = 'credit_card' | 'pix' | 'boleto';

export type Payment = {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED';
  amountCents: number;
  payload: Record<string, unknown> | null;
  failureCode: string | null;
};

export type Order = {
  id: string;
  number: string;
  status: OrderStatus;
  email: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: {
    recipient: string;
    line1: string;
    line2?: string;
    district: string;
    city: string;
    state: string;
    postalCode: string;
    phone?: string;
  } | null;
  notes: string | null;
  createdAt: string;
  items: {
    id: string;
    productId: string | null;
    name: string;
    sku: string;
    variantId: string | null;
    variantLabel: string | null;
    imageUrl: string | null;
    unitPriceCents: number;
    quantity: number;
    totalCents: number;
  }[];
  payment: Payment | null;
};

export type StockEvent = {
  productId: string;
  /** "" = evento agregado do produto; preenchido = uma combinacao especifica. */
  variantId: string;
  variantLabel: string | null;
  sku: string;
  available: number;
  quantity: number;
  reserved: number;
  lowStock: boolean;
  outOfStock: boolean;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages?: number;
};

export type DashboardData = {
  rangeDays: number;
  kpis: {
    revenueCents: number;
    revenueChangePercent: number | null;
    orders: number;
    averageTicketCents: number;
    unitsSold: number;
    customers: number;
    pendingPayment: number;
    toShip: number;
  };
  statusBreakdown: { status: OrderStatus; count: number }[];
  salesSeries: { date: string; revenueCents: number; orders: number }[];
  topProducts: { productId: string; name: string; units: number; revenueCents: number }[];
  lowStock: {
    productId: string;
    name: string;
    sku: string;
    imageUrl: string | null;
    available: number;
    reserved: number;
    threshold: number;
  }[];
  recentOrders: Order[];
};

export type StockRow = {
  productId: string;
  variantId: string | null;
  variantLabel: string | null;
  colorHex: string | null;
  name: string;
  sku: string;
  imageUrl: string | null;
  active: boolean;
  priceCents: number;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  updatedAt: string;
};

export type StockMovement = {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  createdAt: string;
  product?: { name: string; sku: string };
  actor?: { name: string } | null;
};

export type Coupon = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  orderCount: number;
  lifetimeValueCents: number;
};
