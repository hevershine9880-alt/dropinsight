"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ShoppingCart, Package, Truck, User, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";

interface SearchResult {
  type: "order" | "product" | "supplier" | "buyer";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const ICONS = { order: ShoppingCart, product: Package, supplier: Truck, buyer: User } as const;
const GROUP_LABELS = { order: "Orders", product: "Listings", supplier: "Suppliers", buyer: "Buyers" } as const;

/**
 * Command-K search over orders, SKUs, buyers and suppliers.
 * Fully keyboard-driven: ↑/↓ moves, Enter opens, Escape closes. The query is
 * debounced so typing does not fire a request per keystroke.
 */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setCursor(0); return; }
  }, [open]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
        setCursor(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => { controller.abort(); clearTimeout(timer); };
  }, [query]);

  const go = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && results[cursor]) { e.preventDefault(); go(results[cursor]); }
  };

  const grouped = React.useMemo(() => {
    const map = new Map<SearchResult["type"], SearchResult[]>();
    for (const r of results) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    return [...map.entries()];
  }, [results]);

  let flatIndex = -1;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <Search className="size-4.5" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-sunken px-3 py-1.5 text-left text-sm text-ink-subtle transition-colors hover:border-line-strong hover:bg-surface"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate">Search orders, SKUs, buyers…</span>
          <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-2xs text-ink-subtle sm:inline">⌘K</kbd>
        </button>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Search" size="lg">
        <div className="-mt-1">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
            <input
              ref={inputRef}
              data-autofocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Order number, buyer, SKU, product, supplier…"
              aria-label="Search query"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="search-results"
              className="h-10 flex-1 bg-transparent text-md outline-none"
            />
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin-slow text-ink-subtle" aria-hidden /> : null}
          </div>

          <div id="search-results" role="listbox" aria-label="Search results" className="mt-3 max-h-[50vh] overflow-y-auto">
            {query.trim().length < 2 ? (
              <p className="px-1 py-8 text-center text-sm text-ink-muted">
                Type at least two characters. Order numbers, buyer names, SKUs and suppliers all work.
              </p>
            ) : !loading && results.length === 0 ? (
              <p className="px-1 py-8 text-center text-sm text-ink-muted">
                Nothing matched “{query.trim()}”. Check the spelling, or try part of an order number.
              </p>
            ) : (
              <div className="space-y-3">
                {grouped.map(([type, items]) => {
                  const Icon = ICONS[type];
                  return (
                    <div key={type}>
                      <p className="px-1 pb-1 text-2xs font-semibold tracking-wider text-ink-subtle uppercase">
                        {GROUP_LABELS[type]}
                      </p>
                      <ul>
                        {items.map((result) => {
                          flatIndex += 1;
                          const active = flatIndex === cursor;
                          return (
                            <li key={`${result.type}-${result.id}`}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onMouseEnter={() => setCursor(results.indexOf(result))}
                                onClick={() => go(result)}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                  active ? "bg-brand-soft" : "hover:bg-surface-hover",
                                )}
                              >
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-muted">
                                  <Icon className="size-3.5" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-base font-medium text-ink">{result.title}</span>
                                  <span className="block truncate text-sm text-ink-muted">{result.subtitle}</span>
                                </span>
                                {active ? <CornerDownLeft className="size-3.5 shrink-0 text-ink-subtle" aria-hidden /> : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
