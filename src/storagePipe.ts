import { Pipe } from "./pipe.js"

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
	}
}