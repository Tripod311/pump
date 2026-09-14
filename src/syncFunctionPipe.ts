import { DataPipe } from "./dataPipe.js"

export type SyncFunctionPipeProcessor<Input=unknown, Output=unknown> = (input: Input) => Output;

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

		if (this.wipeInput) this._input = null;
		if (this.wipeOutput) this._output = null;
	}
}