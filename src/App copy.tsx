import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

// ─── TYPY ────────────────────────────────────────────────────────────

type OrderItem = {
  productName?: string;
  quantity?: number;
  price?: string;
  currency?: string;
  externalOfferId?: string;
};

type Order = {
  id: number;
  externalOrderId: string;
  localStatus: string;
  externalOrderStatus?: string;
  externalFulfillmentStatus?: string;
  allegroAccountId: string;
  buyerLogin?: string;
  buyerFirstName?: string;
  buyerLastName?: string;
  deliveryMethodName?: string;
  deliveryMethodId?: string;
  deliveryFirstName?: string;
  deliveryLastName?: string;
  deliveryCity?: string;
  pickupPointName?: string;
  totalAmount?: string;
  totalToPay?: string;
  currency?: string;
  orderCreatedAt?: string;
  items: OrderItem[];
};

type Tab = {
  key: string;
  label: string;
  dot: string;
  filter: (o: Order) => boolean;
};

// ─── TABS & SEGMENTACJA ──────────────────────────────────────────────

const mn = (name?: string) => (name ?? "").toLowerCase();

const TABS: Tab[] = [
  {
    key: "inpost",
    label: "InPost",
    dot: "#f97316",
    filter: (o) =>
      o.localStatus === "NEW" &&
      (mn(o.deliveryMethodName).includes("inpost") ||
        mn(o.deliveryMethodName).includes("paczkomat")),
  },
  {
    key: "dpd",
    label: "DPD",
    dot: "#dc2626",
    filter: (o) =>
      o.localStatus === "NEW" && mn(o.deliveryMethodName).includes("dpd"),
  },
  {
    key: "dhl",
    label: "DHL",
    dot: "#eab308",
    filter: (o) =>
      o.localStatus === "NEW" && mn(o.deliveryMethodName).includes("dhl"),
  },
  {
    key: "ups",
    label: "UPS",
    dot: "#92400e",
    filter: (o) =>
      o.localStatus === "NEW" && mn(o.deliveryMethodName).includes("ups"),
  },
  {
    key: "other",
    label: "Inne",
    dot: "#9ca3af",
    filter: (o) =>
      o.localStatus === "NEW" &&
      !mn(o.deliveryMethodName).includes("inpost") &&
      !mn(o.deliveryMethodName).includes("paczkomat") &&
      !mn(o.deliveryMethodName).includes("dpd") &&
      !mn(o.deliveryMethodName).includes("dhl") &&
      !mn(o.deliveryMethodName).includes("ups"),
  },
  {
    key: "sent",
    label: "Wysłane",
    dot: "#16a34a",
    filter: (o) => o.localStatus === "SENT",
  },
  {
    key: "cancelled",
    label: "Anulowane",
    dot: "#f87171",
    filter: (o) => o.localStatus === "CANCELLED",
  },
  {
    key: "unpaid",
    label: "Nieopłacone",
    dot: "#ca8a04",
    filter: (o) => o.externalOrderStatus === "BOUGHT",
  },
];

// ─── HELPERY ─────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
  });
}

function formatAmount(amount?: string, currency?: string) {
  if (!amount) return "—";
  return `${Number(amount).toFixed(2)} ${currency ?? "PLN"}`;
}

function buyerName(o: Order) {
  if (o.deliveryFirstName && o.deliveryLastName)
    return `${o.deliveryFirstName} ${o.deliveryLastName}`;
  if (o.buyerFirstName) return o.buyerFirstName;
  return o.buyerLogin ?? "Nieznany";
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// ─── BADGE STATUSU ───────────────────────────────────────────────────

function StatusBadge({ order }: { order: Order }) {
  const s = order.localStatus;
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    NEW:       { label: "Nowe",       bg: "#eff6ff", color: "#1d4ed8" },
    PROCESSING:{ label: "W realizacji", bg: "#fefce8", color: "#854d0e" },
    SENT:      { label: "Wysłane",    bg: "#f0fdf4", color: "#15803d" },
    CANCELLED: { label: "Anulowane",  bg: "#fef2f2", color: "#b91c1c" },
  };
  const def = cfg[s] ?? { label: s, bg: "#f3f4f6", color: "#374151" };
  if (order.externalOrderStatus === "BOUGHT")
    return (
      <span style={{ background: "#fefce8", color: "#854d0e", fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600, letterSpacing: "0.02em" }}>
        Nieopłacone
      </span>
    );
  return (
    <span style={{ background: def.bg, color: def.color, fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600, letterSpacing: "0.02em" }}>
      {def.label}
    </span>
  );
}

// ─── WIERSZ ZAMÓWIENIA ───────────────────────────────────────────────

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);

  const allItems = useMemo(() => {
    const map = new Map<string, OrderItem & { quantity: number }>();
    for (const i of order.items) {
      const key = i.externalOfferId ?? i.productName ?? Math.random().toString();
      const ex = map.get(key);
      if (ex) ex.quantity += Number(i.quantity ?? 1);
      else map.set(key, { ...i, quantity: Number(i.quantity ?? 1) });
    }
    return Array.from(map.values());
  }, [order.items]);

  const delivery = order.pickupPointName
    ? `📦 ${order.pickupPointName}`
    : order.deliveryMethodName ?? "—";

  return (
    <div
      style={{
        borderBottom: "1px solid #f1f5f9",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8faff")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {/* Główny wiersz */}
      <div
        onClick={() => setExpanded((x) => !x)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          cursor: "pointer",
        }}
      >
        {/* Chevron */}
        <span style={{ color: "#94a3b8", fontSize: 11, width: 14, flexShrink: 0, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>

        {/* Kupujący */}
        <div style={{ flex: "0 0 180px", minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {buyerName(order)}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
            #{shortId(order.externalOrderId)}
          </div>
        </div>

        {/* Produkty (skrócone) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {allItems.slice(0, 2).map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ fontWeight: 600, color: "#0f172a" }}>{item.quantity}×</span>{" "}
              {item.productName ?? "—"}
            </div>
          ))}
          {allItems.length > 2 && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              +{allItems.length - 2} więcej
            </div>
          )}
        </div>

        {/* Dostawa */}
        <div style={{ flex: "0 0 160px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {delivery}
        </div>

        {/* Miasto */}
        <div style={{ flex: "0 0 100px", fontSize: 11, color: "#64748b" }}>
          {order.deliveryCity ?? "—"}
        </div>

        {/* Kwota */}
        <div style={{ flex: "0 0 90px", textAlign: "right", fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
          {formatAmount(order.totalAmount, order.currency)}
        </div>

        {/* Data */}
        <div style={{ flex: "0 0 56px", textAlign: "right", fontSize: 11, color: "#94a3b8" }}>
          {formatDate(order.orderCreatedAt)}
        </div>

        {/* Badge */}
        <div style={{ flex: "0 0 90px", textAlign: "right" }}>
          <StatusBadge order={order} />
        </div>
      </div>

      {/* Rozwinięcie */}
      {expanded && (
        <div style={{ background: "#f8faff", borderTop: "1px solid #e2e8f0", padding: "12px 16px 12px 42px" }}>
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Produkty</div>
              {allItems.map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: "#334155", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700 }}>{item.quantity}×</span> {item.productName} —{" "}
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>
                    {formatAmount(item.price, item.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Konto</div>
              <div style={{ fontSize: 12, color: "#334155" }}>{order.allegroAccountId}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>Pełne ID</div>
              <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{order.externalOrderId}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GŁÓWNA APLIKACJA ────────────────────────────────────────────────

type View = "orders" | "connect";

export default function App() {
  const [view, setView] = useState<View>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState("inpost");
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");

  async function loadOrders() {
    try {
      const res = await invoke<{ orders: Order[] }>("get_orders");
      setOrders(res.orders);
    } catch (e) {
      console.error("get_orders error", e);
    }
  }

  useEffect(() => {
    loadOrders().finally(() => setLoading(false));
  }, []);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await invoke<{ accountsSynced: number; totalFetched: number; totalSaved: number }>(
        "sync_allegro_orders"
      );
      setSyncMsg({ text: `Zsync: ${r.accountsSynced} kont, ${r.totalFetched} zamówień`, ok: true });
      await loadOrders();
    } catch (e) {
      setSyncMsg({ text: `Błąd: ${e}`, ok: false });
    } finally {
      setSyncing(false);
    }
  }

  async function connectAllegro() {
    setConnectLoading(true);
    setConnectMsg("");
    try {
      const login = await invoke<string>("start_allegro_auth");
      setConnectMsg(`✓ Połączono konto: ${login}`);
    } catch (e) {
      setConnectMsg(`Błąd: ${e}`);
    } finally {
      setConnectLoading(false);
    }
  }

  // Segmentacja
  const currentTab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const visibleOrders = useMemo(
    () => orders.filter(currentTab.filter),
    [orders, activeTab]
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(TABS.map((t) => [t.key, orders.filter(t.filter).length])),
    [orders]
  );

  const totalNew = orders.filter((o) => o.localStatus === "NEW").length;

  // ── NAV ──────────────────────────────────────────────────────────────
  const navItems = [
    { key: "orders", label: "Zamówienia", icon: "📦" },
    { key: "connect", label: "Konta", icon: "🔗" },
  ];

  //edit
  const [accounts, setAccounts] = useState<{ allegroId: string; login: string }[]>([]);

  async function loadAccounts() {
    try {
      const res = await invoke<{ accounts: { allegroId: string; login: string }[] }>("get_allegro_accounts");
      setAccounts(res.accounts);
    } catch (e) {
      console.error("get_allegro_accounts error", e);
    }
  }

  useEffect(() => {
    loadAccounts();
    loadOrders().finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Geist', 'DM Sans', system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>

      {/* Sidebar */}
      <aside style={{ width: 200, background: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", padding: "20px 0" }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>Propacker</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Panel wysyłek</div>
        </div>

        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {navItems.map((n) => (
            <button
              key={n.key}
              onClick={() => setView(n.key as View)}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: view === n.key ? "#eff6ff" : "transparent",
                color: view === n.key ? "#1d4ed8" : "#475569",
                fontWeight: view === n.key ? 600 : 400,
                fontSize: 13, marginBottom: 2, textAlign: "left",
                transition: "all 0.1s",
              }}
            >
              <span>{n.icon}</span>
              {n.label}
              {n.key === "orders" && totalNew > 0 && (
                <span style={{ marginLeft: "auto", background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99 }}>
                  {totalNew}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>

        {/* ── WIDOK ZAMÓWIEŃ ── */}
        {view === "orders" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <h1 style={{ fontWeight: 700, fontSize: 18, margin: 0, letterSpacing: "-0.02em" }}>Zamówienia</h1>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  {orders.length} łącznie
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {syncMsg && (
                  <span style={{ fontSize: 12, color: syncMsg.ok ? "#15803d" : "#b91c1c" }}>
                    {syncMsg.text}
                  </span>
                )}
                <button
                  onClick={sync}
                  disabled={syncing}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: syncing ? "#e2e8f0" : "#2563eb",
                    color: syncing ? "#94a3b8" : "#fff",
                    border: "none", borderRadius: 8, padding: "8px 16px",
                    fontSize: 13, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>↻</span>
                  {syncing ? "Synchronizuję..." : "Synchronizuj Allegro"}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, padding: "10px 24px", background: "#fff", borderBottom: "1px solid #e2e8f0", overflowX: "auto" }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8, border: activeTab === t.key ? "1px solid #bfdbfe" : "1px solid transparent",
                    background: activeTab === t.key ? "#fff" : "transparent",
                    cursor: "pointer", whiteSpace: "nowrap", fontSize: 13,
                    fontWeight: activeTab === t.key ? 600 : 400,
                    color: activeTab === t.key ? "#0f172a" : "#64748b",
                    boxShadow: activeTab === t.key ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.1s",
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
                  {t.label}
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    padding: "1px 6px", borderRadius: 99,
                    background: activeTab === t.key ? "#eff6ff" : "#f1f5f9",
                    color: activeTab === t.key ? "#2563eb" : "#64748b",
                  }}>
                    {counts[t.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Nagłówki kolumn */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 16px 7px 42px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>
              <div style={{ flex: "0 0 180px" }}>Kupujący</div>
              <div style={{ flex: 1 }}>Produkty</div>
              <div style={{ flex: "0 0 160px" }}>Dostawa</div>
              <div style={{ flex: "0 0 100px" }}>Miasto</div>
              <div style={{ flex: "0 0 90px", textAlign: "right" }}>Kwota</div>
              <div style={{ flex: "0 0 56px", textAlign: "right" }}>Data</div>
              <div style={{ flex: "0 0 90px", textAlign: "right" }}>Status</div>
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
                  <div style={{ width: 24, height: 24, border: "3px solid #2563eb", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : visibleOrders.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#94a3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13 }}>Brak zamówień w tej kategorii</div>
                </div>
              ) : (
                visibleOrders.map((o) => <OrderRow key={o.id} order={o} />)
              )}
            </div>
          </div>
        )}

        {/* ── WIDOK KONT ── */}
        {accounts.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>
              Połączone konta
            </div>
            {accounts.map((a) => (
              <div key={a.allegroId} style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                ✓ {a.login}
              </div>
            ))}
          </div>
        )}
        {view === "connect" && (
          <div style={{ padding: 32, maxWidth: 480 }}>
            <h1 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, letterSpacing: "-0.02em" }}>Konta Allegro</h1>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
              Połącz konto Allegro przez OAuth — zostaniesz przekierowany do przeglądarki.
            </p>

            <button
              onClick={connectAllegro}
              disabled={connectLoading}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: connectLoading ? "#e2e8f0" : "#ff6b00",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "12px 24px", fontSize: 14, fontWeight: 700,
                cursor: connectLoading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px rgba(255,107,0,0.25)",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 18 }}>🛒</span>
              {connectLoading ? "Oczekuję na autoryzację..." : "Połącz konto Allegro"}
            </button>

            {connectMsg && (
              <div style={{
                marginTop: 16, padding: "10px 14px", borderRadius: 8,
                background: connectMsg.startsWith("✓") ? "#f0fdf4" : "#fef2f2",
                color: connectMsg.startsWith("✓") ? "#15803d" : "#b91c1c",
                fontSize: 13, fontWeight: 500,
              }}>
                {connectMsg}
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
      `}</style>
    </div>
  );
}