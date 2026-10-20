import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { confirmed } from "../src/core/index.js";
import {
  Button,
  Readout,
  Dialog,
  Field,
  TerminalProvider,
  TerminalScope,
  useTerminal,
} from "../src/react/index.js";
import { TerminalPanel } from "../src/panel/index.js";
import "../src/panel/panel.css";
import "./style.css";
const products = [
  {
    id: "notes",
    name: "Field Notes",
    tag: "NOTEBOOKS",
    detail: "A little room for your next big idea.",
    price: 12,
    icon: "▤",
    color: "sage",
  },
  {
    id: "pen",
    name: "Arc Pen",
    tag: "WRITING",
    detail: "Good thoughts deserve a good pen.",
    price: 8,
    icon: "╱",
    color: "clay",
  },
  {
    id: "tray",
    name: "Desk Tray",
    tag: "DESK ESSENTIALS",
    detail: "A place for all the little things.",
    price: 24,
    icon: "▱",
    color: "sand",
  },
  {
    id: "timer",
    name: "Focus Timer",
    tag: "DESK ESSENTIALS",
    detail: "Make a little space to concentrate.",
    price: 32,
    icon: "◴",
    color: "blue",
  },
  {
    id: "tote",
    name: "Canvas Tote",
    tag: "EVERYDAY",
    detail: "Bring your essentials, leave the rest.",
    price: 18,
    icon: "♧",
    color: "rose",
  },
  {
    id: "journal",
    name: "Grid Journal",
    tag: "NOTEBOOKS",
    detail: "For plans, sketches and possibilities.",
    price: 16,
    icon: "▦",
    color: "lavender",
  },
];
type Product = (typeof products)[number];
type Line = { id: string; product: Product; quantity: number };
function Playground({
  enabled,
  setEnabled,
}: {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
}) {
  const [screen, setScreen] = useState("playground");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [dialog, setDialog] = useState<"clear" | "rename" | "product" | null>(
    null,
  );
  const [selected, setSelected] = useState<Product | null>(null);
  const [name, setName] = useState("Untitled collection");
  const [newName, setNewName] = useState(name);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState("light");
  const { state } = useTerminal();
  const visible = useMemo(
    () =>
      products.filter((p) =>
        `${p.name} ${p.tag}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  const total = cart.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const add = (product: Product) => {
    setCart((current) =>
      current.some((line) => line.product.id === product.id)
        ? current.map((line) =>
            line.product.id === product.id
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [...current, { id: `line-${product.id}`, product, quantity: 1 }],
    );
    setNotice(`${product.name} added.`);
    return confirmed({
      persistence: "memory",
      message: `${product.name} added to the collection.`,
    });
  };
  const rename = () => {
    setNewName(name);
    setDialog("rename");
  };
  return (
    <div className={`lab ${theme === "dark" ? "dark" : ""}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="UI terminal home">
          <span>❯_</span> UI Terminal
        </a>
        <div className="workspace">
          <span className="workspace-icon">S</span>
          <div>
            Studio workspace<small>Local playground</small>
          </div>
          <span className="chevrons">
            ⌃<br />⌄
          </span>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <TerminalScope id="navigation" kind="navigation" className="navigation">
          <Button
            cli={{
              id: "playground",
              description: "Open the example catalogue and collection.",
            }}
            className={screen === "playground" ? "nav active" : "nav"}
            onClick={() => setScreen("playground")}
          >
            <span>▧</span> Playground <small>01</small>
          </Button>
          <Button
            cli={{
              id: "settings",
              description:
                "Open example settings; navigation stays separately discoverable.",
            }}
            className={screen === "settings" ? "nav active" : "nav"}
            onClick={() => setScreen("settings")}
          >
            <span>⚙</span> Settings
          </Button>
        </TerminalScope>
        <div className="sidebar-note">
          <span className="tiny-label">A SMALL EXPERIMENT</span>
          <p>
            The same interface.
            <br />A new way to use it.
          </p>
          <div className="local-pill">
            <i /> Runs on your machine
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">L</span>
          <div>
            Local session<small>No account needed</small>
          </div>
          <span>↗</span>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div>
            Workspace <span>/</span>{" "}
            <strong>
              {screen === "playground" ? "Playground" : "Settings"}
            </strong>
          </div>
          <span className="preview-pill">
            LOCAL PREVIEW <i />
          </span>
        </header>
        <main>
          <TerminalScope
            id="playground"
            kind="screen"
            active={screen === "playground"}
          >
            <div className="page-heading">
              <div>
                <div className="eyebrow">THE INTERACTIVE PLAYGROUND</div>
                <h1>A little less clicking.</h1>
                <p>Explore the interface. Then try it from the terminal.</p>
              </div>
              <span className="version">
                v0.1 <span> / </span> developer preview
              </span>
            </div>
            <div className="intro-strip">
              <span className="intro-symbol">⌘</span>
              <div>
                Start with a simple <code>ls</code>
                <span>
                  Discover what’s on this screen, then put it to work.
                </span>
              </div>
              <span className="intro-arrow">↙</span>
            </div>
            <div className="playground-grid">
              <section className="catalogue">
                <div className="section-title">
                  <h2>
                    The essentials <span>{products.length}</span>
                  </h2>
                  <span>A DEMO CATALOGUE</span>
                </div>
                <div className="search-wrap">
                  <span>⌕</span>
                  <Field
                    cli={{
                      id: "search",
                      description:
                        "Search the catalogue by name or category. Enter adds the first result.",
                      exposeValue: true,
                    }}
                    aria-label="Search catalogue"
                    placeholder="Find something good…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (visible[0]) {
                          add(visible[0]);
                          setQuery("");
                        }
                      }
                    }}
                  />
                  <kbd>↵</kbd>
                </div>
                <TerminalScope
                  id="products"
                  kind="list"
                  className="product-grid"
                >
                  {visible.map((product) => (
                    <TerminalScope id={product.id} kind="item" key={product.id}>
                      <Button
                        className="product-card"
                        cli={{
                          id: "add",
                          label: `Add ${product.name}`,
                          description: `Add one ${product.name} to the collection. Right-click or hold for details.`,
                        }}
                        onClick={() => add(product)}
                        onContextMenu={() => {
                          setSelected(product);
                          setDialog("product");
                        }}
                        onHold={() => {
                          setSelected(product);
                          setDialog("product");
                        }}
                      >
                        <span className={`product-art ${product.color}`}>
                          <span>{product.icon}</span>
                          <i>+</i>
                        </span>
                        <span className="product-tag">{product.tag}</span>
                        <span className="product-name">
                          {product.name}
                          <b>${product.price.toFixed(2)}</b>
                        </span>
                        <span className="product-description">
                          {product.detail}
                        </span>
                      </Button>
                    </TerminalScope>
                  ))}
                  {!visible.length && (
                    <div className="no-results">
                      Nothing here yet. Try another search.
                    </div>
                  )}
                </TerminalScope>
                <div className="catalogue-foot">
                  <span>◉</span> These are real UI controls. The terminal uses
                  their normal handlers.
                </div>
              </section>
              <TerminalScope id="cart" className="collection">
                <div className="collection-heading">
                  <span>YOUR COLLECTION</span>
                  <span className="count-badge">
                    {cart.reduce((sum, line) => sum + line.quantity, 0)}
                  </span>
                </div>
                <Button
                  className="collection-name"
                  cli={{
                    id: "name",
                    description:
                      "Rename this collection. Click, right-click or hold.",
                  }}
                  onClick={rename}
                  onContextMenu={rename}
                  onHold={rename}
                >
                  {name}
                  <span>⌄</span>
                </Button>
                <TerminalScope id="items" kind="list" className="cart-lines">
                  {cart.map((line) => (
                    <TerminalScope
                      id={line.id}
                      key={line.id}
                      kind="item"
                      className="cart-line"
                    >
                      <div className={`line-art ${line.product.color}`}>
                        {line.product.icon}
                      </div>
                      <div className="line-main">
                        <strong>{line.product.name}</strong>
                        <span>${line.product.price.toFixed(2)} each</span>
                        <div className="quantity">
                          <Button
                            cli={{
                              id: "decrease",
                              label: `Decrease ${line.product.name}`,
                            }}
                            disabled={line.quantity <= 1}
                            onClick={() =>
                              setCart((rows) =>
                                rows.map((row) =>
                                  row.id === line.id
                                    ? { ...row, quantity: row.quantity - 1 }
                                    : row,
                                ),
                              )
                            }
                          >
                            −
                          </Button>
                          <span>{line.quantity}</span>
                          <Button
                            cli={{
                              id: "increase",
                              label: `Increase ${line.product.name}`,
                            }}
                            onClick={() =>
                              setCart((rows) =>
                                rows.map((row) =>
                                  row.id === line.id
                                    ? { ...row, quantity: row.quantity + 1 }
                                    : row,
                                ),
                              )
                            }
                          >
                            +
                          </Button>
                        </div>
                      </div>
                      <div className="line-end">
                        <strong>
                          ${(line.product.price * line.quantity).toFixed(2)}
                        </strong>
                        <Button
                          cli={{
                            id: "remove",
                            label: `Remove ${line.product.name}`,
                            description: `Remove the ${line.product.name} line from this collection.`,
                          }}
                          onClick={() => {
                            setCart((rows) =>
                              rows.filter((row) => row.id !== line.id),
                            );
                            return confirmed({
                              persistence: "memory",
                              message: `${line.product.name} removed.`,
                            });
                          }}
                        >
                          ×
                        </Button>
                      </div>
                    </TerminalScope>
                  ))}
                </TerminalScope>
                {!cart.length && (
                  <div className="empty-cart">
                    <span>▱</span>
                    <strong>A blank canvas.</strong>
                    <p>
                      Add an essential to get started.
                      <br />
                      Click a card, or ask the terminal.
                    </p>
                  </div>
                )}
                <div className="collection-total">
                  <div>
                    <span>Subtotal</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                  <Readout className="total" cli={{id:"total",label:"Total",description:"Current displayed collection total"}} value={`$${total.toFixed(2)}`} detail={{amount:total,currency:"USD",state:"ready"}}>
                    <span>Total</span>
                    <strong data-testid="cart-total">
                      ${total.toFixed(2)}
                    </strong>
                  </Readout>
                  <Button
                    className="save-button"
                    cli={{
                      id: "save",
                      description:
                        "Save the demo collection to this browser, with an explicit local-persistence receipt.",
                    }}
                    disabled={!cart.length}
                    onClick={async () => {
                      await new Promise((resolve) => setTimeout(resolve, 250));
                      localStorage.setItem(
                        "ui-terminal-demo-collection",
                        JSON.stringify({ name, cart }),
                      );
                      setNotice("Collection saved to this browser.");
                      return confirmed({
                        persistence: "local",
                        message: "Collection saved to this browser.",
                      });
                    }}
                  >
                    Save collection <span>↗</span>
                  </Button>
                  <Button
                    className="clear-button"
                    cli={{
                      id: "clear",
                      description:
                        "Open the normal confirmation dialog before clearing the collection.",
                    }}
                    disabled={!cart.length}
                    onClick={() => setDialog("clear")}
                  >
                    Clear collection
                  </Button>
                </div>
              </TerminalScope>
            </div>
          </TerminalScope>
          <TerminalScope
            id="settings"
            kind="screen"
            active={screen === "settings"}
          >
            <div className="page-heading">
              <div>
                <div className="eyebrow">MAKE YOURSELF AT HOME</div>
                <h1>A few preferences.</h1>
                <p>These controls work through the same terminal, too.</p>
              </div>
            </div>
            <div className="settings-card">
              <h2>Appearance</h2>
              <p>Change the playground’s theme.</p>
              <Button
                cli={{
                  id: "theme",
                  description:
                    "Toggle the demo between light and dark appearance.",
                }}
                className="outline-button"
                onClick={() =>
                  setTheme((value) => (value === "light" ? "dark" : "light"))
                }
              >
                {theme === "light" ? "Switch to dark" : "Switch to light"}
              </Button>
            </div>
            <div className="settings-card">
              <h2>Terminal</h2>
              <p>
                The host owns the opt-in. Disabling this hides the panel and
                revokes commands.
              </p>
              <Button
                cli={{ id: "disable_terminal" }}
                className="outline-button"
                onClick={() => setEnabled(!enabled)}
              >
                {enabled ? "Disable terminal" : "Enable terminal"}
              </Button>
            </div>
            <div className="settings-card">
              <h2>A private field</h2>
              <p>
                This field is intentionally absent from terminal discovery and
                history.
              </p>
              <Field
                type="password"
                autoComplete="new-password"
                cli={{ id: "private_value" }}
                aria-label="Example private value"
                placeholder="Not exposed to the terminal"
              />
            </div>
          </TerminalScope>
          <footer className="workspace-footer">
            <span role="status">{notice || "Ready when you are."}</span>
            <span>
              <i />{" "}
              {state.attached
                ? "Input / output connected"
                : "Connecting terminal…"}
            </span>
          </footer>
          {!enabled && (
            <button
              className="reopen-terminal"
              onClick={() => setEnabled(true)}
            >
              Open terminal ↗
            </button>
          )}
        </main>
      </div>
      <Dialog
        id="collection-dialog"
        open={dialog !== null}
        title={
          dialog === "clear"
            ? "Clear this collection?"
            : dialog === "rename"
              ? "Name your collection"
              : (selected?.name ?? "Product")
        }
      >
        {dialog === "clear" && (
          <>
            <p>This removes the items in this local demo collection.</p>
            <div className="dialog-actions">
              <Button
                cli={{ id: "cancel" }}
                className="outline-button"
                onClick={() => setDialog(null)}
              >
                Keep items
              </Button>
              <Button
                cli={{ id: "confirm" }}
                className="primary-button"
                onClick={() => {
                  setCart([]);
                  setDialog(null);
                  setNotice("Collection cleared.");
                  return confirmed({
                    persistence: "memory",
                    message: "Collection cleared.",
                  });
                }}
              >
                Clear collection
              </Button>
            </div>
          </>
        )}
        {dialog === "rename" && (
          <>
            <Field
              cli={{ id: "name", exposeValue: true }}
              aria-label="Collection name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={60}
            />
            <div className="dialog-actions">
              <Button
                cli={{ id: "cancel" }}
                className="outline-button"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                cli={{ id: "save" }}
                className="primary-button"
                disabled={!newName.trim()}
                onClick={() => {
                  setName(newName.trim());
                  setDialog(null);
                  return confirmed({
                    persistence: "memory",
                    message: "Collection renamed.",
                  });
                }}
              >
                Save name
              </Button>
            </div>
          </>
        )}
        {dialog === "product" && (
          <>
            <p>{selected?.detail}</p>
            <p>
              ${selected?.price.toFixed(2)} · {selected?.tag}
            </p>
            <Button
              cli={{ id: "close" }}
              className="primary-button"
              onClick={() => setDialog(null)}
            >
              Back to playground
            </Button>
          </>
        )}
      </Dialog>
    </div>
  );
}
function App() {
  const [enabled, setEnabled] = useState(true);
  return (
    <TerminalProvider enabled={enabled} scope="independent-demo">
      <Playground enabled={enabled} setEnabled={setEnabled} />
      <TerminalPanel />
    </TerminalProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
