import { Pipe } from "./pipe.js"

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
	}
}