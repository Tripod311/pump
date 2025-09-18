# Pump

**Pump** is a lightweight zero-dependency application-layer data storage.  
It provides a minimal set of building blocks for managing global and local state, API calls, and reactive dependencies without unnecessary logic or restrictions.

---

## Installation

```bash
npm install @tripod311/pump
```

---

## Core Concepts

### `Pipe<Input, Output>`
Base class for all pipes. Supports:
- hierarchical structure (child pipes),
- subscriptions (`on`, `off`),
- manual update trigger (`trigger`).

```ts
const root = new Pipe();
const child = new Pipe();
root.addPipe("child", child);

child.on((newOut, oldOut, newIn, oldIn) => {
  console.log("Triggered!");
});
child.trigger();
```

---

### `StoragePipe<T>`
Simple storage for global state (similar to `useState`, but global).  
Provides `data` property and notifies listeners on changes.

```ts
const lang = new StoragePipe<string>();
lang.data = "en";

lang.on((newVal, oldVal) => {
  console.log("Language changed:", oldVal, "→", newVal);
});

lang.data = "ru";
```

---

### `DataPipe<Input, Output>`
Pipe for computed values.  
When `input` is set, it runs `process()` and updates `output`.

```ts
class DoublePipe extends DataPipe<number, number> {
  async process() {
    this._output = (this.input ?? 0) * 2;
  }
}

const dp = new DoublePipe();
dp.on((out) => console.log("Output:", out));

dp.input = 5; // → Output: 10
```

---

### `SyncFunctionPipe<Input, Output>`
Synchronous processor.  
`run(input)` immediately returns a result and also notifies listeners.  
Optionally, you can enable `wipeInput` and `wipeOutput` to prevent storing sensitive values.

```ts
const tabPipe = new SyncFunctionPipe<string, string>((tab) => {
  return ["main", "settings"].includes(tab) ? tab : "main";
});
tabPipe.wipeInput = true;

tabPipe.on((out) => console.log("Tab set to:", out));
console.log(tabPipe.run("settings")); // "settings"
console.log(tabPipe.run("invalid"));  // "main"
```

---

### `AsyncFunctionPipe<Input, Output>`
Asynchronous processor (e.g., for API calls).  
`run(input)` returns a `Promise<Output>` and also notifies listeners.  
Supports `wipeInput` and `wipeOutput`.

```ts
interface Credentials { email: string; password: string; }

const loginPipe = new AsyncFunctionPipe<Credentials, { error: boolean }>(
  async (cred) => {
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify(cred),
    });
    return await res.json();
  }
);
loginPipe.wipeInput = true;

const response = await loginPipe.run({ email: "a@b.c", password: "secret" });
console.log(response);
```

---

### `Pump`
Global registry of pipes.  
Allows building a provider tree and accessing pipes by string paths.

```ts
const pump = new Pump();

const settings = new Pipe();
pump.addPipe("settings", settings);

const lang = new StoragePipe<string>();
settings.addPipe("language", lang);

(pump.getPipe("settings.language") as StoragePipe<string>).data = "en";
```

---

## When to Use

- **StoragePipe** — global variables (`language`, `theme`, `authToken`).  
- **DataPipe** — computed or dependent values.  
- **SyncFunctionPipe** — pure functions, validation, or transformations.  
- **AsyncFunctionPipe** — API calls or async operations.  
- **Pipe** — container/structural node in the tree.

---

## Example: Localization + Routing

```ts
// language
const lang = new StoragePipe<string>();
pump.addPipe("language", lang);
lang.data = "en";

// translation
const t = new SyncFunctionPipe<{ key: string; lang: string }, string>(
  ({ key, lang }) => translations[lang][key] ?? key
);
pump.addPipe("translate", t);

// router
const router = new SyncFunctionPipe<string, void>((path) => {
  history.pushState({}, "", path);
});
pump.addPipe("router", router);

// usage
lang.on((newLang) => {
  console.log("Current submit label:",
    t.run({ key: "submit", lang: newLang })
  );
});

router.run("/dashboard");
```

---

## Features

- Zero dependencies.  
- Minimal API (easy to extend or inherit).  
- Suitable for both global and local state.  
- Flexible provider tree (`api.login`, `settings.language`).  
- Built-in support for wiping input/output in `FunctionPipe` for sensitive data.  

---
