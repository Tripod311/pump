export type PipeListener<Input=unknown, Output=unknown> = (newOutput: Output, oldOutput: Output | null, newInput: Input, oldInput: Input | null) => void;

export class Pipe<Input=undefined, Output=undefined> {
	protected _fullPath: string[] = [];
	protected children: Record<string, Pipe> = {};
	protected listeners: PipeListener<Input, Output>[] = [];

	get nested (): string[] {
		return Object.keys(this.children);
	}

	addPipe (id: string, child: Pipe) {
		if (this.children[id] !== undefined) throw new Error(`Pipe ${JSON.stringify(this.fullPath.concat([id]))} already added`);

		this.children[id] = child;
		this.children[id].fullPath = this._fullPath.slice().concat([id]);
	}

	removePipe (id: string) {
		if (this.children[id] === undefined) throw new Error(`Pipe ${JSON.stringify(this.fullPath.concat([id]))} was not added`);

		delete this.children[id];
	}

	getPipe (id: string): Pipe | null {
		return this.children[id] || null;
	}

	get fullPath (): string[] {
		return this._fullPath;
	}

	set fullPath (val: string[]) {
		this._fullPath = val;
	}

	trigger () {
		for (const id in this.children) {
			this.children[id].trigger();
		}
	}

	on (listener: PipeListener<Input, Output>) {
		this.listeners.push(listener);
	}

	off (listener: PipeListener<Input, Output>) {
		this.listeners = this.listeners.filter(l => l !== listener);
	}
}

export class StoragePipe<T=unknown> extends Pipe<T,T> {
	protected _data: T | null = null;
	protected _oldData: T | null = null;

	get data (): T | null {
		return this._data;
	}

	set data (val: T) {
		this._oldData = this._data;
		this._data = val;

		this.trigger();
	}

	trigger () {
		for (const l of this.listeners) {
			l(this._data as T, this._oldData, this._data as T, this._oldData);
		}

		for (const id in this.children) {
			this.children[id].trigger();
		}
	}
}

export class DataPipe<Input=unknown, Output=unknown> extends Pipe<Input, Output> {
	protected _input: Input | null = null;
	protected _oldInput: Input | null = null;
	protected _output: Output | null = null;
	protected _oldOutput: Output | null = null;

	get input (): Input | null {
		return this._input;
	}

	set input (val: Input) {
		this._oldInput = this._input;
		this._oldOutput = this._output;
		this._input = val;

		this.process().then(this.trigger.bind(this));
	}

	get output (): Output | null {
		return this._output;
	}

	async process () {
		// calculate and set output here
	}

	trigger () {
		for (const l of this.listeners) {
			l(this._output as Output, this._oldOutput, this._input as Input, this._oldInput);
		}

		for (const id in this.children) {
			this.children[id].trigger();
		}
	}
}

export type SyncFunctionPipeProcessor<Input=unknown, Output=unknown> = (input: Input) => Output;
export type AsyncFunctionPipeProcessor<Input=unknown, Output=unknown> = (input: Input) => Promise<Output>;

export class SyncFunctionPipe<Input=unknown, Output=unknown> extends DataPipe<Input, Output> {
	protected processor: SyncFunctionPipeProcessor<Input, Output>;
	protected _input: Input | null = null;
	protected _oldInput: Input | null = null;
	protected _output: Output | null = null;
	protected _oldOutput: Output | null = null;
	public wipeInput: boolean = false;
	public wipeOutput: boolean = false;

	constructor (fn: SyncFunctionPipeProcessor<Input, Output>) {
		super();

		this.processor = fn;
	}

	run (input: Input) {
		this._oldInput = this._input;
		this._oldOutput = this._output;
		this._input = input;
		const output = this.processor(input);

		this._output = output;

		this.trigger();

		return output;
	}

	trigger () {
		for (const l of this.listeners) {
			l(this._output as Output, this._oldOutput, this._input as Input, this._oldInput);
		}

		for (const id in this.children) {
			this.children[id].trigger();
		}

		if (this.wipeInput) this._input = null;
		if (this.wipeOutput) this._output = null;
	}
}

export class AsyncFunctionPipe<Input=unknown, Output=unknown> extends DataPipe<Input, Output> {
	protected processor: AsyncFunctionPipeProcessor<Input, Output>;
	protected _input: Input | null = null;
	protected _oldInput: Input | null = null;
	protected _output: Output | null = null;
	protected _oldOutput: Output | null = null;
	public wipeInput: boolean = false;
	public wipeOutput: boolean = false;

	constructor (fn: AsyncFunctionPipeProcessor<Input, Output>) {
		super();

		this.processor = fn;
	}

	async run (input: Input) {
		this._oldInput = this._input;
		this._oldOutput = this._output;
		this._input = input;
		const output = await this.processor(input);

		this._output = output;

		this.trigger();

		return output;
	}

	trigger () {
		for (const l of this.listeners) {
			l(this._output as Output, this._oldOutput, this._input as Input, this._oldInput);
		}

		for (const id in this.children) {
			this.children[id].trigger();
		}

		if (this.wipeInput) this._input = null;
		if (this.wipeOutput) this._output = null;
	}
}

export class Pump {
	private pipes: Record<string, Pipe> = Object.create(null);

	get nested (): string[] {
		return Object.keys(this.pipes);
	}

	parsePath (path: string): string[] {
		if (typeof path !== "string") {
			throw new TypeError("Pipe path must be a string");
		}

		if (path.length === 0) {
			throw new Error("Pipe path cannot be empty");
		}

		const parts = path.split(".");

		if (parts.some(part => part.length === 0)) {
			throw new Error(`Invalid pipe path: "${path}"`);
		}

		return parts;
	}

	validateId (id: string) {
		const parts = this.parsePath(id);

		if (parts.length !== 1) {
			throw new Error(
				`Pipe ID cannot contain dots: "${id}"`
			);
		}
	}

	addPipe (id: string, pipe: Pipe) {
		this.validateId(id);

		if (this.pipes[id] !== undefined) {
			throw new Error(`Pipe ${id} already added`);
		}

		this.pipes[id] = pipe;
		pipe.fullPath = [id];
	}

	removePipe (id: string) {
		this.validateId(id);

		if (this.pipes[id] === undefined) {
			throw new Error(`Pipe ${id} was not added`);
		}

		delete this.pipes[id];
	}

	removePipeAt (path: string) {
		const parts = this.parsePath(path);
		const pipeName = parts.pop()!;

		if (parts.length === 0) {
			this.removePipe(pipeName);
			return;
		}

		const parent = this.getPipe(parts.join("."));

		if (parent === null) {
			throw new Error(`Parent pipe was not found: "${parts.join(".")}"`);
		}

		parent.removePipe(pipeName);
	}

	getPipe (path: string): Pipe | null {
		const parts = this.parsePath(path);
		const first = this.pipes[parts[0]];

		if (first === undefined) return null;

		let current: Pipe | null = first;

		for (let i = 1; i < parts.length; i++) {
			current = current.getPipe(parts[i]);

			if (current === null) return null;
		}

		return current;
	}
}