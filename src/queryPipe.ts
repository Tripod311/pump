import { Pipe, type PipeListener } from "./pipe.js"

export type QueryPipeFunction<
	Input = unknown,
	Output = unknown
> = (
	input: Input,
	signal: AbortSignal
) => Promise<Output>;

export interface QueryPipeOptions<
	Input = unknown,
	Output = unknown
> {
	queryFn: QueryPipeFunction<Input, Output>;
	staleTime?: number;
	requestTimeout?: number;
	compareFn?: (a: any, b: any) => boolean;
}

export interface QueryPipeOutput<T = unknown> {
	data?: T;
	error?: Error;
}

export interface SeparatedQueryOptions {
	timeout?: number;
}

class SingleQuery<
	Input = unknown,
	Output = unknown
> extends Pipe {
	public invalidated = false;
	public updated_at = -1;
	public readonly params: Input;
	public data: Output | undefined;
	public error: Error | null = null;

	private readonly queryFunction: QueryPipeFunction<Input, Output>;
	private pendingPromise: Promise<QueryPipeOutput<Output>> | null = null;
	private abortController: AbortController | null = null;

	constructor(
		fn: QueryPipeFunction<Input, Output>,
		input: Input
	) {
		super();

		this.queryFunction = fn;
		this.params = structuredClone(input);
	}

	get pending(): boolean {
		return this.pendingPromise !== null;
	}

	get result(): QueryPipeOutput<Output> {
		return {
			data: this.data,
			error: this.error ?? undefined
		};
	}

	run(timeout = 0): Promise<QueryPipeOutput<Output>> {
		if (this.pendingPromise !== null) {
			return this.pendingPromise;
		}

		const abortController = new AbortController();
		this.abortController = abortController;
		this.invalidated = false;

		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const promise = (async (): Promise<QueryPipeOutput<Output>> => {
			try {
				if (timeout > 0) {
					timeoutId = setTimeout(() => {
						if (this.abortController === abortController) {
							this.abort();
						}
					}, timeout);
				}

				const data = await this.queryFunction(
					this.params,
					abortController.signal
				);

				abortController.signal.throwIfAborted();

				this.data = data;
				this.error = null;
				this.updated_at = Date.now();

				return {
					data: this.data
				};
			} catch (err) {
				this.error = err instanceof Error
					? err
					: new Error(String(err));

				return {
					data: this.data,
					error: this.error
				};
			} finally {
				if (this.abortController === abortController) {
					this.abortController = null;
				}

				if (timeoutId !== null) {
					clearTimeout(timeoutId);
				}
			}
		})();

		this.pendingPromise = promise;

		promise.then(
			() => {
				if (this.pendingPromise === promise) {
					this.pendingPromise = null;
				}
			},
			() => {
				if (this.pendingPromise === promise) {
					this.pendingPromise = null;
				}
			}
		);

		return promise;
	}

	abort(): void {
		if (this.abortController !== null) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	onRemove(): void {
		this.abort();
	}
}

interface QueryListener<
	Input = unknown,
	Output = unknown
> {
	params: Input;
	listeners: PipeListener<
		Input,
		QueryPipeOutput<Output>
	>[];
}

export class QueryPipe<
	Input = unknown,
	Output = unknown
> extends Pipe<Input, QueryPipeOutput<Output>> {
	protected queryFunction: QueryPipeFunction<Input, Output>;
	protected staleTime = 0;
	protected requestTimeout = 0;
	protected compareFn: (a: Input, b: Input) => boolean;
	protected counter = 0;

	protected queryListeners: QueryListener<Input, Output>[] = [];

	constructor(options: QueryPipeOptions<Input, Output>) {
		super();

		this.queryFunction = options.queryFn;
		this.staleTime = options.staleTime ?? 0;
		this.requestTimeout = options.requestTimeout ?? 0;
		this.compareFn =
			options.compareFn ??
			QueryPipe.deepEqual;
	}

	on(
		listener: PipeListener<
			Input,
			QueryPipeOutput<Output>
		>,
		params: Input
	): void {
		for (const group of this.queryListeners) {
			if (this.compareFn(group.params, params)) {
				group.listeners.push(listener);
				return;
			}
		}

		this.queryListeners.push({
			params: structuredClone(params),
			listeners: [listener]
		});
	}

	off(
		listener: PipeListener<
			Input,
			QueryPipeOutput<Output>
		>,
		params: Input,
	): void {
		for (let i = 0; i < this.queryListeners.length; i++) {
			const group = this.queryListeners[i];

			if (!this.compareFn(group.params, params)) {
				continue;
			}

			group.listeners = group.listeners.filter(
				current => current !== listener
			);

			if (group.listeners.length === 0) {
				this.queryListeners.splice(i, 1);
			}

			return;
		}
	}

	protected trigger(
		params: Input,
		queryResult: QueryPipeOutput<Output>,
		oldResult: QueryPipeOutput<Output>
	): void {
		for (const group of this.queryListeners) {
			if (!this.compareFn(group.params, params)) {
				continue;
			}

			for (const listener of group.listeners) {
				listener(
					queryResult,
					oldResult,
					params,
					params
				);
			}

			return;
		}
	}

	getQuery(
		params: Input
	): SingleQuery<Input, Output> | undefined {
		for (const queryId of this.nested) {
			if (!queryId.startsWith("__query__")) {
				continue;
			}

			const query = this.getPipe(queryId) as SingleQuery<
				Input,
				Output
			>;

			if (this.compareFn(params, query.params)) {
				return query;
			}
		}

		return undefined;
	}

	protected executeQuery(
		query: SingleQuery<Input, Output>,
		timeout: number
	): Promise<QueryPipeOutput<Output>> {
		const alreadyPending = query.pending;
		const cached = query.result;
		const promise = query.run(timeout);

		/*
		 * Attach one notification only when this call actually
		 * started the request. Deduplicated callers receive the
		 * same promise without adding duplicate triggers.
		 */
		if (!alreadyPending) {
			promise.then(result => {
				this.trigger(
					query.params,
					result,
					cached
				);
			});
		}

		return promise;
	}

	run(
		input: Input,
		separationOptions?: SeparatedQueryOptions
	): Promise<QueryPipeOutput<Output>> {
		if (separationOptions !== undefined) {
			const query = new SingleQuery(
				this.queryFunction,
				input
			);

			return query.run(
				separationOptions.timeout ??
				this.requestTimeout
			);
		}

		let query = this.getQuery(input);

		if (query === undefined) {
			query = new SingleQuery(
				this.queryFunction,
				input
			);

			const queryId = "__query__" + (this.counter++).toString();

			this.addPipe(queryId, query);

			return this.executeQuery(
				query,
				this.requestTimeout
			);
		}

		const stale =
			query.updated_at < 0 ||
			query.invalidated ||
			query.error !== null ||
			Date.now() - query.updated_at >= this.staleTime;

		if (stale) {
			return this.executeQuery(
				query,
				this.requestTimeout
			);
		}

		return Promise.resolve({
			data: query.data
		});
	}

	clear(params: Input): void {
		const query = this.getQuery(params);

		if (query === undefined) {
			return;
		}

		const path = query.fullPath;
		const queryId = path[path.length - 1];

		if (
			queryId === undefined ||
			!queryId.startsWith("__query__")
		) {
			return;
		}

		this.removePipe(queryId);
	}

	clearAll(): void {
		for (const queryId of this.nested.slice()) {
			if (!queryId.startsWith("__query__")) {
				continue;
			}

			this.removePipe(queryId);
		}
	}

	clearOlderThan(age: number): void {
		const threshold = Date.now() - age;

		for (const queryId of this.nested.slice()) {
			if (!queryId.startsWith("__query__")) {
				continue;
			}

			const query = this.getPipe(queryId) as SingleQuery<
				Input,
				Output
			>;

			const remove =
				(
					query.updated_at >= 0 &&
					query.updated_at < threshold
				) ||
				(
					query.updated_at < 0 &&
					query.error !== null
				);

			if (remove) {
				this.removePipe(queryId);
			}
		}
	}

	invalidate(params: Input): void {
		const query = this.getQuery(params);

		if (query !== undefined) {
			query.invalidated = true;
		}
	}

	invalidateAll(): void {
		for (const queryId of this.nested.slice()) {
			if (!queryId.startsWith("__query__")) {
				continue;
			}

			const query = this.getPipe(queryId) as SingleQuery<
				Input,
				Output
			>;

			query.invalidated = true;
		}
	}

	onRemove(): void {
		this.clearAll();
		this.queryListeners = [];
	}

	static deepEqual(a: any, b: any): boolean {
		if (Object.is(a, b)) {
			return true;
		}

		if (a instanceof Date || b instanceof Date) {
			return (
				a instanceof Date &&
				b instanceof Date &&
				Object.is(a.getTime(), b.getTime())
			);
		}

		if (Array.isArray(a) || Array.isArray(b)) {
			if (!Array.isArray(a) || !Array.isArray(b)) {
				return false;
			}

			if (a.length !== b.length) {
				return false;
			}

			for (let i = 0; i < a.length; i++) {
				if (
					Object.hasOwn(a, i) !==
					Object.hasOwn(b, i)
				) {
					return false;
				}

				if (!QueryPipe.deepEqual(a[i], b[i])) {
					return false;
				}
			}

			return true;
		}

		if (
			a === null ||
			b === null ||
			typeof a !== "object" ||
			typeof b !== "object"
		) {
			return false;
		}

		const left = a as Record<string, unknown>;
		const right = b as Record<string, unknown>;
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);

		if (leftKeys.length !== rightKeys.length) {
			return false;
		}

		return leftKeys.every(key =>
			Object.hasOwn(right, key) &&
			QueryPipe.deepEqual(left[key], right[key])
		);
	}
}