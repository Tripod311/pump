import { Pipe } from "./pipe.js"

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

	addPipe (id: string, pipe: Pipe<any, any>) {
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