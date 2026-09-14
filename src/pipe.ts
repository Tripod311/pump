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

		this.children[id].onRemove();

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

	on (listener: PipeListener<Input, Output>, params: any) {
		this.listeners.push(listener);
	}

	off (listener: PipeListener<Input, Output>, params: any) {
		this.listeners = this.listeners.filter(l => l !== listener);
	}

	onRemove () {

	}
}