# Pump

**Pump** is a lightweight zero-dependency experiment in representing application state, derived values and effects through one addressable data-flow abstraction.
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

### `QueryPipe<Input, Output>`

Asynchronous query processor with parameter-based caching and request deduplication.
Calls with equal parameters share the same pending request. Successful results are reused until `staleTime` expires or the query is invalidated.

`QueryPipe` is intended primarily for reading data. For mutations and other operations that must execute every time, use `AsyncFunctionPipe`.

```ts
interface UserQuery {
  id: number;
}

interface User {
  id: number;
  name: string;
}

const userPipe = new QueryPipe<UserQuery, User>({
  queryFn: async ({ id }, signal) => {
    const response = await fetch(`/api/users/${id}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return await response.json();
  },

  staleTime: 60_000,
  requestTimeout: 10_000,
});
```

Unlike most pipes, `QueryPipe` does not return the raw `Output` value directly. Both `run()` and query listeners receive a result object:

```ts
interface QueryPipeOutput<Output> {
  data?: Output;
  error?: Error;
}
```

A successful query returns `{ data }`. If the query fails, it returns `{ data, error }` instead of rejecting the promise. `data` may contain the last successfully cached value when a refresh fails.

```ts
const result = await userPipe.run({ id: 42 });

if (result.error) {
  console.error(result.error);
} else {
  console.log(result.data);
}
```


Running a query returns cached data while it is fresh:

```ts
const first = await userPipe.run({ id: 42 });
const second = await userPipe.run({ id: 42 });

// The second call uses the cached result.
console.log(second.data);
```

Concurrent calls with equal parameters receive the same pending request:

```ts
const firstRequest = userPipe.run({ id: 42 });
const secondRequest = userPipe.run({ id: 42 });

const [first, second] = await Promise.all([
  firstRequest,
  secondRequest,
]);
```

Queries can be invalidated without immediately requesting new data:

```ts
userPipe.invalidate({ id: 42 });

// The next call executes queryFn again.
const refreshed = await userPipe.run({ id: 42 });
```

Use `staleTime: Infinity` to keep successful results fresh until they are explicitly invalidated or cleared:

```ts
const configPipe = new QueryPipe<void, AppConfig>({
  queryFn: async (_, signal) => {
    const response = await fetch("/api/config", { signal });
    return await response.json();
  },

  staleTime: Infinity,
});
```

Listeners are associated with a particular set of query parameters:

```ts
const listener = (
  result: QueryPipeOutput<User>
) => {
  if (result.error) {
    console.error(result.error);
    return;
  }

  console.log(result.data);
};

userPipe.on(listener, { id: 42 });
await userPipe.run({ id: 42 });

userPipe.off(listener, { id: 42 });
```

Listeners are notified only when the query function is actually executed. Returning a fresh cached result does not produce another notification.

A separated query bypasses the shared cache and request deduplication:

```ts
const result = await userPipe.run(
  { id: 42 },
  {
    timeout: 5_000,
  }
);
```

Cached queries can be managed explicitly:

```ts
userPipe.clear({ id: 42 });
userPipe.clearAll();

userPipe.invalidate({ id: 42 });
userPipe.invalidateAll();

userPipe.clearOlderThan(60 * 60 * 1000);
```

`clearOlderThan(age)` removes successful queries whose cached result is older than `age`. Queries that failed before receiving their first successful result are also removed.

By default, parameters are compared recursively by value. The default comparison supports JSON-like data, `undefined`, `Infinity`, and `Date`. Parameters are copied with `structuredClone()` when stored.

A custom comparison function can be provided when different equality semantics are required:

```ts
const userPipe = new QueryPipe<UserQuery, User>({
  queryFn: fetchUser,
  compareFn: (a, b) => a.id === b.id,
});
```

Request timeouts use `AbortSignal`. The query function must pass the signal to the underlying asynchronous operation for cancellation to stop it:

```ts
queryFn: async (input, signal) => {
  const response = await fetch("/api/data", {
    signal,
  });

  return await response.json();
}
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
